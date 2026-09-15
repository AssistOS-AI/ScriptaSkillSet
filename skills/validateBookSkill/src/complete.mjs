import path from 'node:path';
import fs from 'node:fs/promises';
import { discover, prepare, report } from './audit.mjs';
import { exists, hash, readJson, writeJson } from './storage.mjs';
import { textReport } from './layout-report.mjs';
import {workingCopy,installWorkingCopy} from './working-copy.mjs';

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
    if (seen.has(state)) return { passes, result:pass.result, failure: {
      code:'unchanged_installed_files',
      detail:'Correction handlers left unresolved findings with an already verified installed file state.',
      findings:pass.result.findings.filter(f=>f.severity==='error')
    } };
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
    const aggregate={...verified,
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
    Object.assign(state,{status:execution.failure?'failed':verified.status,failure:execution.failure,reportText:reportFile,reportSha256:hash(content)});
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
  const transaction=await fs.mkdtemp(path.join(directory,'transaction-'));
  try{
    const copy=await workingCopy(selection.root,transaction);
    await writeJson(path.join(transaction,'input-snapshot.json'),{root:selection.root,inputs:copy.original,hostInputs:copy.hostInputs||[]});
    let result;
    try{result=await completeCandidate(copy.stagedRoot,{...options,jobDir:path.join(transaction,'audit')});}
    catch(error){
      const reportText=path.join(selection.root,'RAPORT-CORECTII.txt');
      await fs.writeFile(reportText,'Status: failed\nInstalled: false\nOriginal files preserved.\n'+error.message+'\nEvidence: '+transaction+'\n');
      throw error;
    }
    const accepted=!result.findings.some(f=>f.severity==='error')&&!result.failure;
    const installation=accepted?await installWorkingCopy(copy,transaction,result):[];
    const reportText=path.join(selection.root,'RAPORT-CORECTII.txt');
    const reportBody=(await fs.readFile(result.reportText,'utf8')).replaceAll(copy.stagedRoot,selection.root);
    await fs.writeFile(reportText,`Installed: ${accepted}\n${accepted?'Verified candidate installed.':'Candidate rejected; original files preserved.'}\nEvidence: ${transaction}\n\n`+reportBody);
    await writeJson(path.join(transaction,'transaction.json'),{accepted,installation,root:selection.root,stagedRoot:copy.stagedRoot,reportText});
    return {...result,installed:accepted,installation,reportText};
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
  return { scope: 'layout_and_structure', status: state.status==='failed'?'failed':audit?.status || 'incomplete', failure:state.failure, root: state.root, auditDirectory: state.auditDirectory,
    stages: ['local English PDF/HTML checks', 'English layout repairs', 'inherit English presentation in existing languages', 'local translated structure/display checks', 'text correction report'],
    reportText: audit?.reportText, findings: audit?.findings || [], corrections: audit?.corrections || [],
    instruction: available ? 'Reuse current local evidence by rerunning the native complete command after correcting an implementation defect.' : `Run complete on the book root with --job-dir ${path.dirname(state.auditDirectory)}.`,
    executionPolicy: { reuseExistingTaskAuthorization: true, intermediateConfirmations: false, platformPermissionsRequired: true } };
}
