import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function insideRun(value, { directory = false } = {}) {
  const root = await fs.realpath(process.cwd());
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) throw new Error('Use a path relative to this run');
  const target = path.resolve(root,value);
  if (!target.startsWith(root + path.sep)) throw new Error('Path leaves this run');
  let current = root;
  for (const part of path.relative(root,target).split(path.sep)) {
    current = path.join(current,part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Run paths must not contain symlinks');
  }
  const stat = await fs.stat(target);
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error('Unexpected artifact type');
  return target;
}
async function jsonArtifact(value) {
  const filename = await insideRun(value);
  if ((await fs.stat(filename)).size > 16*1024*1024) throw new Error('JSON artifact is too large');
  return JSON.parse(await fs.readFile(filename,'utf8'));
}
async function atomicJson(relative, value) {
  const root = await fs.realpath(process.cwd());
  const parts = relative.split('/'); let current = root;
  for (const part of parts.slice(0,-1)) {
    current = path.join(current,part); await fs.mkdir(current,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    if (!(await fs.lstat(current)).isDirectory()) throw new Error('Output parent is not a real directory');
  }
  const target = path.join(root,relative), temp = target+'.'+crypto.randomUUID()+'.tmp';
  const bytes = Buffer.from(JSON.stringify(value,null,2)+'\n');
  try { await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});await fs.rename(temp,target); }
  finally {await fs.rm(temp,{force:true});}
  return {path:relative,sha256:hash(bytes)};
}
export async function writeHandoff(input) {
  const steps = ['prepare-manuscript','process-content','review-correct','validate-final','publish-result'];
  if (!steps.includes(input.step) || !input.context || typeof input.context !== 'object' || Array.isArray(input.context)) throw new Error('Provide the step and a context object');
  for (const key of ['executionId','runId','taskId','bookId']) if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.context[key] || '')) throw new Error('Invalid handoff identity: '+key);
  let old = null;
  try { old = await jsonArtifact('run-state/handoff.json'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const key of ['executionId','runId','taskId','bookId']) if (old && old.context[key] !== input.context[key]) throw new Error('Handoff belongs to another execution');
  const text = JSON.stringify(input.context);
  if (Buffer.byteLength(text)>24000) throw new Error('Keep handoff context under 24 KB; reference large inventories and reports by path');
  const rejectSecrets = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) {
      if (/^(token|accessToken|password|secret|secretKey|authorization|cookie|credential)$/i.test(key)) throw new Error('Secrets must not enter a handoff');
      rejectSecrets(child);
    }
  };
  rejectSecrets(input.context);
  return atomicJson('run-state/handoff.json',{step:input.step,context:input.context,updatedAt:new Date().toISOString()});
}
async function executable(name) {
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const file = path.join(directory,name);
    try {await fs.access(file,constants.X_OK);if((await fs.stat(file)).isFile())return file;} catch {}
  }
  throw new Error('Required executable not available on PATH: '+name);
}
export async function preflight() {
  const skills = path.resolve(path.dirname(await fs.realpath(fileURLToPath(import.meta.url))),'../..');
  const checks = [], tools = {};
  for (const name of ['pdftotext','pdffonts','pdfimages','pdftohtml']) {
    try { tools[name] = await executable(name); }
    catch (error) { checks.push({skill:name,status:'failed',error:error.message}); }
  }
  let chromium;
  try {
    chromium = process.env.VALIDATEBOOK_CHROMIUM || await executable('chromium-browser');
    await fs.access(chromium, constants.X_OK);
  } catch (error) { checks.push({skill:'chromium',status:'failed',error:error.message}); }
  const pdfRuntime = process.env.PDF2HTML_RUNTIME_ROOT || path.join(os.homedir(),'.cache','roboteam-runtimes','pdf2html');
  const env = {...process.env,PDF2HTML_RUNTIME_ROOT:pdfRuntime};
  // These flags match the operator-prepared root container's Chromium launcher.
  if (process.getuid?.() === 0 && !env.CHROMIUM_USER_FLAGS) env.CHROMIUM_USER_FLAGS='--no-sandbox';
  const entries = [
    ['comprehensive-summary','comprehensivesummary',[]],['marketing-summary','marketingsummary',[]],
    ['short-description','shortdescription',[]],['relevant-keywords','relevantkeywords',[]],
    ['translate-html','translatehtml',[]],['doc2pdf','doc2pdf',[]],
    ['pdf2html','pdf2html',[]],['validate-book','validatebook',[...(chromium ? ['--chromium',chromium] : []),...Object.entries(tools).flatMap(([name,file])=>['--'+name,file])]]];
  for (const [skill,launcher,args] of entries) {
    const entry = path.join(skills,skill,'scripts',launcher);
    try {
      const {stdout} = await execute('/bin/sh',[entry,'doctor',...args],{env,timeout:60000,maxBuffer:1024*1024});
      const result=JSON.parse(stdout);
      if (!(result.ok===true || ['ok','passed'].includes(result.status))) throw new Error('Doctor did not pass');
      checks.push({skill,status:'passed'});
    } catch(error) {checks.push({skill,status:'failed',error:String(error.stderr||error.message).slice(0,1600)});}
  }
  const report={ok:checks.every(check=>check.status==='passed'),checks,tools:{...tools,chromium},pdfRuntime,checkedAt:new Date().toISOString()};
  await atomicJson('run-state/preflight.json',report);
  if(!report.ok) throw new Error('Runtime preflight failed: '+checks.filter(c=>c.status==='failed').map(c=>c.skill+': '+c.error).join('; '));
  return report;
}
export async function verifyPackage(input) {
  const root=await insideRun(input.packageRoot,{directory:true}), inventory=await jsonArtifact(input.inventory);
  if(inventory.executionId!==input.executionId || !Array.isArray(inventory.files) || !inventory.files.length)throw new Error('Inventory belongs to another execution or has no files');
  const names=new Set();let bytes=0;
  for(const entry of inventory.files){
    if(typeof entry.path!=='string'||/[\\\0]/.test(entry.path)||entry.path.startsWith('/')||entry.path.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git')||names.has(entry.path))throw new Error('Unsafe or duplicate inventory path');
    names.add(entry.path);
    const file=await insideRun(path.relative(process.cwd(),path.join(root,entry.path)));
    const value=await fs.readFile(file);
    if(value.length!==entry.size||hash(value)!==entry.sha256)throw new Error('Inventory differs from package: '+entry.path);
    bytes+=value.length;
  }
  const runGit=async args=>(await execute('git',['-c','core.hooksPath=/dev/null','-c','credential.helper=',...args],{cwd:root,timeout:30000,maxBuffer:8*1024*1024,env:{PATH:process.env.PATH,HOME:os.homedir(),GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'https',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}})).stdout.trim();
  if(inventory.baseCommit){
    if(!/^[a-f0-9]{40}$/.test(inventory.baseCommit))throw new Error('Invalid base commit');
    if(await runGit(['rev-parse','HEAD'])!==inventory.baseCommit)throw new Error('Package checkout baseline changed');
  }
  // Remote reads remain credential-free and restricted to the actual configured catalogue.
  const catalogue=new URL(input.catalogue);
  if(catalogue.protocol!=='https:'||catalogue.username||catalogue.password||catalogue.port||catalogue.search||catalogue.hash)throw new Error('Invalid catalogue destination');
  const match=/^\/([\w.-]+)\/([\w.-]+)\/(?:blob\/)?(.+)$/.exec(catalogue.pathname);
  if(!['github.com','raw.githubusercontent.com'].includes(catalogue.hostname)||!match||!input.branch||!match[3].startsWith(input.branch+'/')||!/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test('refs/heads/'+input.branch))throw new Error('Catalogue/branch mismatch');
  const collectionPath=match[3].slice(input.branch.length+1);
  if(!names.has(collectionPath))throw new Error('Inventory must contain the catalogue update');
  const collection=JSON.parse(await fs.readFile(path.join(root,collectionPath),'utf8'));
  if(![1,2].includes(collection.schemaVersion)||!Array.isArray(collection.books)||collection.bookCount!==collection.books.length||new Set(collection.books.map(b=>b.id)).size!==collection.books.length||!collection.books.some(b=>b.id===input.bookId))throw new Error('Catalogue structure or task identity is invalid');
  const remote=`https://github.com/${match[1]}/${match[2]}.git`;
  const refs=await runGit(['ls-remote',remote]);
  const head=refs.split('\n').find(line=>line.split('\t')[1]==='refs/heads/'+input.branch)?.split('\t')[0]||null;
  if(head!==inventory.baseCommit||(!head&&refs))throw new Error('Publication baseline changed; do not merge or overwrite');
  const report={ok:true,executionId:input.executionId,bookId:input.bookId,fileCount:names.size,bytes,baseCommit:head,checkedAt:new Date().toISOString()};
  if(input.audit){
    const audit=await jsonArtifact(input.audit);
    if(audit.scope!=='layout_and_structure'||!['passed','passed_with_warnings'].includes(audit.status)||!Array.isArray(audit.findings)||audit.findings.some(f=>f.severity==='error'))throw new Error('Independent book audit has not passed');
    if(!Array.isArray(audit.documents)||!audit.documents.length||audit.documents.some(doc=>!names.has(path.relative(root,doc.file).split(path.sep).join('/'))))throw new Error('Audit documents are outside the verified package');
    report.audit={status:audit.status,errorFindings:0,warningFindings:audit.findings.length};
  }
  await atomicJson('run-state/package-check.json',report);
  return report;
}

export async function requirePreflight(now = Date.now()) {
  let report;
  try { report = await jsonArtifact('run-state/preflight.json'); }
  catch { throw new Error('Run preflight successfully before claiming a manuscript'); }
  const age = now - Date.parse(report.checkedAt);
  if (report.ok !== true || !Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000
      || !Array.isArray(report.checks) || report.checks.length < 8 || report.checks.some(check => check.status !== 'passed')) {
    throw new Error('Run preflight successfully before claiming a manuscript');
  }
}
