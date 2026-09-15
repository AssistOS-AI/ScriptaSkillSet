import path from 'node:path';
import fs from 'node:fs/promises';
import { discover, prepare, report } from './audit.mjs';
import { exists, hash, readJson, writeJson } from './storage.mjs';
import { textReport } from './layout-report.mjs';
import {workingCopy,installWorkingCopy} from './working-copy.mjs';

export async function resetPreviousResults(root, ownLock) {
  const directories=['.validatebook-jobs','.validatebook-layout','.validatebook-layout-jobs'].map(n=>path.join(root,n));
  const ownDirectory=ownLock&&path.dirname(ownLock);
  if(ownDirectory&&!directories.includes(ownDirectory))directories.push(ownDirectory);
  async function inspect(directory) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())await inspect(file);
      else if(entry.name.endsWith('.lock')&&file!==ownLock)throw Error('Previous results are locked: '+file);
    }
  }
  for(const directory of directories)await inspect(directory);
  for(const directory of directories) {
    if(ownLock&&ownDirectory===directory) {
      for(const name of await fs.readdir(directory))if(path.join(directory,name)!==ownLock)await fs.rm(path.join(directory,name),{recursive:true,force:true});
    } else await fs.rm(directory,{recursive:true,force:true});
  }
  for(const name of ['RAPORT-CORECTII.txt','RAPORT-VERIFICARE.txt'])await fs.rm(path.join(root,name),{force:true});
}

export function isDisposableJobDirectory(directory, bookRoot) {
  const job = path.resolve(directory);
  const book = path.resolve(bookRoot);
  if (!job || job === book || job === path.parse(job).root) return false;
  const fromBook = path.relative(book, job);
  const fromJob = path.relative(job, book);
  if (fromBook && !fromBook.startsWith('..') && !path.isAbsolute(fromBook)) return false;
  if (fromJob && !fromJob.startsWith('..') && !path.isAbsolute(fromJob)) return false;
  return true;
}

export async function discardTemporaryWork(directory, bookRoot) {
  const removed = [];
  const drop = async file => { await fs.rm(file, { recursive: true, force: true }); removed.push(file); };
  if (directory && isDisposableJobDirectory(directory, bookRoot)) await drop(path.resolve(directory));
  if (!bookRoot) return removed;
  const root = path.resolve(bookRoot);
  for (const name of ['.validatebook-layout', '.validatebook-layout-jobs']) await drop(path.join(root, name));
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isFile() && /\.validatebook-[0-9a-f]+\.tmp$/i.test(entry.name)) await drop(file);
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    for (const child of await fs.readdir(file).catch(() => [])) {
      if (/\.validatebook-[0-9a-f]+\.tmp$/i.test(child)) await drop(path.join(file, child));
    }
  }
  return removed;
}

export async function cleanupCompletedWork(root,transaction,result) {
  if(!result.installed||result.failure)return [];
  if(!['passed','passed_with_warnings','completed_with_errors'].includes(result.status))return [];
  const relative=path.relative(transaction,root);
  if(!relative||(!relative.startsWith('..')&&!path.isAbsolute(relative)))throw Error('Refusing to clean the book or its ancestor');
  // A durable report and verified installation must precede cleanup.
  await fs.access(path.join(root,'RAPORT-CORECTII.txt'));
  const directories=['.validatebook-jobs','.validatebook-layout','.validatebook-layout-jobs'].map(n=>path.join(root,n));
  if(!directories.some(d=>transaction===d||transaction.startsWith(d+path.sep)))directories.push(transaction);
  const locks=[];
  async function inspect(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())await inspect(file);
      else if(entry.name.endsWith('.lock')&&file!==path.join(path.dirname(transaction),'transaction.lock'))locks.push(file);
    }
  }
  for(const directory of directories)await inspect(directory);
  if(locks.length)throw Error('Cleanup deferred: another or interrupted job has lock files: '+locks.join(', '));
  for(const directory of directories)await fs.rm(directory,{recursive:true,force:true});
  return directories;
}

// Progress is a change in installed bytes, not the number of findings or
// presentation actions. Keep all immutable passes and their recovery files.
export function installedState(inputs) {
  return hash(JSON.stringify(inputs.map(({file,sha256})=>[file,sha256]).sort((a,b)=>a[0].localeCompare(b[0]))));
}

export async function runCorrections(runPass, onPass = async () => {}) {
  const seen = new Set(), passes = [];
  for (;;) {
    const pass = await runPass(passes.length);
    passes.push(pass);
    await onPass(pass, passes);
    if (!pass.result.findings.some(f=>f.severity==='error')) return { passes, result:pass.result };
    const state = installedState(pass.inputs);
    if (seen.has(state)) return { passes, result:pass.result, exhausted:true };
    seen.add(state);
  }
}

async function completeCandidate(root, options = {}) {
  const selection = await discover(root,options);
  const sourceHtml=await fs.readFile(selection.documents[0].file,'utf8');
  const paginate=options.paginate??/\bid=["']page_\d+["']/.test(sourceHtml);
  const directory = path.resolve(options.jobDir || path.join(selection.root,'.validatebook-layout'));
  await fs.mkdir(directory,{recursive:true});
  const lockFile=path.join(directory,'complete.lock');
  const lock=await fs.open(lockFile,'wx');
  const stateFile=path.join(directory,'complete.json');
  try {
    const runDirectory=await fs.mkdtemp(path.join(directory,'run-'));
    const state={scope:'layout_and_structure',root:selection.root,documents:selection.documents,identity:hash(selection.root),auditDirectory:runDirectory,passes:[],status:'running'};
    await writeJson(stateFile,state);
    const execution=await runCorrections(async index=>{
      const jobDir=path.join(runDirectory,'pass-'+(index+1));
      const result=await prepare(selection.root,{...options,paginate,autoCorrect:true,jobDir});
      const job=await readJson(path.join(jobDir,'job.json'));
      return {result,inputs:job.inputs};
    },async pass=>{
      state.auditDirectory=pass.result.job;
      state.passes.push(pass.result.job);
      await writeJson(stateFile,state);
    });
    const verified=await report(execution.result.job);
    const aggregate={...verified,status:execution.exhausted?'completed_with_errors':verified.status,
      initialFindings:[...new Map(execution.passes.flatMap(p=>p.result.initialFindings).map(f=>[f.id,f])).values()],
      corrections:execution.passes.flatMap(p=>p.result.corrections),
      backups:execution.passes.flatMap(p=>p.result.backups)};
    const reportFile=path.join(selection.root,'RAPORT-CORECTII.txt');
    const content=textReport({...aggregate,backups:[]})+(execution.failure?'\nExecution failure: '+execution.failure.detail+'\n':'');
    if(await exists(reportFile)) {
      const previous=await fs.readFile(reportFile,'utf8');
      if(previous!==content)await fs.writeFile(path.join(runDirectory,'previous-RAPORT-CORECTII.txt'),previous,{flag:'wx'});
    }
    const temporary=path.join(runDirectory,'RAPORT-CORECTII.txt');
    await fs.writeFile(temporary,content);
    await fs.copyFile(temporary,reportFile);
    Object.assign(state,{status:aggregate.status,failure:execution.failure,reportText:reportFile,reportSha256:hash(content)});
    await writeJson(stateFile,state);
    // Recovery and rejection evidence are part of the result, including failures.
    // Never delete the only originals after changing a book.
    return {...aggregate,status:state.status,failure:state.failure,reportText:reportFile,job:execution.result.job,stateFile};
  } finally {await lock.close().catch(()=>{});await fs.unlink(lockFile).catch(()=>{});}
}

export async function complete(root,options={}) {
  const selection=await discover(root,options);
  if(options.pdf||options.english)throw Error('Transactional completion requires source files declared inside the book; external overrides are audit-only.');
  const directory=path.resolve(options.jobDir||path.join(selection.root,'.validatebook-layout'));
  await fs.mkdir(directory,{recursive:true});
  const lockFile=path.join(directory,'transaction.lock');
  const lock=await fs.open(lockFile,'wx');
  try{
    await resetPreviousResults(selection.root,lockFile);
    const transaction=await fs.mkdtemp(path.join(directory,'transaction-'));
    const copy=await workingCopy(selection.root,transaction);
    await writeJson(path.join(transaction,'input-snapshot.json'),{root:selection.root,inputs:copy.original,hostInputs:copy.hostInputs||[]});
    let result;
    try{result=await completeCandidate(copy.stagedRoot,{...options,jobDir:path.join(transaction,'audit')});}
    catch(error){
      const reportText=path.join(selection.root,'RAPORT-CORECTII.txt');
      await fs.writeFile(reportText,'Status: failed\nInstalled: false\nOriginal files preserved.\n'+error.message+'\nEvidence: '+transaction+'\n');
      throw error;
    }
    const accepted=!result.failure&&['passed','passed_with_warnings','completed_with_errors'].includes(result.status);
    const installation=accepted?await installWorkingCopy(copy,transaction,result):[];
    const reportText=path.join(selection.root,'RAPORT-CORECTII.txt');
    const reportBody=(await fs.readFile(result.reportText,'utf8')).replaceAll(copy.stagedRoot,selection.root);
    await fs.writeFile(reportText,`Installed: ${accepted}\n${accepted?'Verified candidate installed.':'Candidate rejected; original files preserved.'}\nEvidence: ${transaction}\n\n`+reportBody);
    await writeJson(path.join(transaction,'transaction.json'),{accepted,installation,root:selection.root,stagedRoot:copy.stagedRoot,reportText});
    if(accepted){
      const retainedReport=(await fs.readFile(reportText,'utf8'))+'\nTemporary job paths above are historical after successful cleanup; see cleanup status below.\n';
      await fs.writeFile(reportText,retainedReport);
      try{
        const removed=await cleanupCompletedWork(selection.root,transaction,{...result,installed:true});
        await fs.appendFile(reportText,'Cleanup completed: '+removed.join(', ')+'\n');
        return {...result,installed:true,installation,reportText,job:null,stateFile:null,cleanup:{status:'completed',removed}};
      }catch(error){
        await fs.appendFile(reportText,'Cleanup incomplete: '+error.message+'\n');
        return {...result,installed:true,installation,reportText,cleanup:{status:'incomplete',error:error.message}};
      }
    }
    return {...result,installed:false,installation,reportText};
  }finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
}

export async function planComplete(root, options = {}) {
  const selection = await discover(root);
  const directory = path.resolve(options.jobDir || path.join(selection.root, '.validatebook-layout'));
  const stateFile = path.join(directory, 'complete.json');
  if (!await exists(stateFile)) {
    await fs.mkdir(directory, { recursive: true });
    await writeJson(stateFile, { scope: 'layout_and_structure', root: selection.root, documents: selection.documents, auditDirectory: path.join(directory, 'audit'), identity: hash(selection.root) });
  }
  const stored=await readJson(stateFile);
  if(stored.root!==selection.root)throw Error('Coordinator directory belongs to another book');
  return { ...await completeStatus(stateFile), stateFile };
}
export async function completeStatus(file) {
  const state = await readJson(path.resolve(file));
  if (state.scope !== 'layout_and_structure' || typeof state.root !== 'string' || typeof state.auditDirectory !== 'string' || !Array.isArray(state.documents) || state.identity !== hash(state.root)) throw Error('Invalid layout coordinator contract; prepare a fresh coordinator in a separate directory.');
  const available = await exists(path.join(state.auditDirectory, 'job.json'));
  const audit = available ? await report(state.auditDirectory) : null;
  return { scope: 'layout_and_structure', status:['failed','completed_with_errors'].includes(state.status)?state.status:audit?.status || 'incomplete', failure:state.failure, root: state.root, auditDirectory: state.auditDirectory,
    stages: ['local English PDF/HTML checks', 'English layout repairs', 'inherit English presentation in existing languages', 'local translated structure/display checks', 'text correction report'],
    reportText: audit?.reportText, findings: audit?.findings || [], corrections: audit?.corrections || [],
    instruction: available ? 'The final report retains unresolved findings; a new complete invocation starts with fresh evidence and retries all supported corrections.' : `Run complete on the book root with --job-dir ${path.dirname(state.auditDirectory)}.`,
    executionPolicy: { reuseExistingTaskAuthorization: true, intermediateConfirmations: false, platformPermissionsRequired: true } };
}
