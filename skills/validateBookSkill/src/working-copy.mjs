import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {exists,fileHash,verifyInputs} from './storage.mjs';

export async function inventory(root) {
  const result=[];
  async function visit(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      if(entry.name.startsWith('.')||/^RAPORT-/.test(entry.name))continue;
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())await visit(file);
      else result.push({file,sha256:await fileHash(file)});
    }
  }
  await visit(root);return result;
}

export async function workingCopy(root,directory) {
  let host=null;
  for(let p=path.dirname(root);p!==path.dirname(p);p=path.dirname(p)){
    if(await exists(path.join(p,'reader','reader.js'))){host=p;break;}
  }
  const tree=path.join(directory,'working');
  const stagedRoot=host?path.join(tree,path.relative(host,root)):path.join(tree,'book');
  const original=await inventory(root);
  await fs.mkdir(stagedRoot,{recursive:true});
  for(const entry of await fs.readdir(root)){
    if(entry.startsWith('.')||/^RAPORT-/.test(entry))continue;
    await fs.cp(path.join(root,entry),path.join(stagedRoot,entry),{recursive:true,dereference:true,filter:file=>!path.basename(file).startsWith('.')});
  }
  const hostInputs=[];
  if(host)for(const name of ['reader','assets']){
    const from=path.join(host,name);
    if(await exists(from)){hostInputs.push(...await inventory(from));await fs.cp(from,path.join(tree,name),{recursive:true,dereference:true});}
  }
  return {root,stagedRoot,original,host,hostInputs,tree};
}

// Validate all original hashes before the first replacement. Keep recovery
// copies and roll back earlier replacements if any later write fails.
export async function installWorkingCopy(copy,directory,validation) {
  if(!validation||!['passed','passed_with_warnings'].includes(validation.status)||validation.failure||validation.findings.some(f=>f.severity==='error'))throw Error('Unverified candidate cannot be installed');
  await verifyInputs(copy.hostInputs||[]);
  for(const input of copy.hostInputs||[]){
    const staged=path.join(copy.tree,path.relative(copy.host,input.file));
    if(await fileHash(staged)!==input.sha256)throw Error('Candidate changed the host reader; book-only installation cannot certify delivery: '+input.file);
  }
  await verifyInputs(copy.original);
  const known=new Map(copy.original.map(x=>[x.file,x.sha256]));
  const plans=[];
  for(const source of await inventory(copy.stagedRoot)){
    const relative=path.relative(copy.stagedRoot,source.file),file=path.join(copy.root,relative);
    if(known.get(file)===source.sha256)continue;
    if(!known.has(file)&&await exists(file))throw Error('Concurrent new file: '+file);
    const backup=known.has(file)?path.join(directory,'recovery',relative):null;
    if(backup){await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(file,backup,fs.constants.COPYFILE_EXCL);}
    plans.push({file,source:source.file,sha256:source.sha256,backup,originalSha256:known.get(file)||null});
  }
  await verifyInputs(copy.original);
  const installed=[];
  try {
    for(const plan of plans){
      if(plan.originalSha256){if(await fileHash(plan.file)!==plan.originalSha256)throw Error('Concurrent source change: '+plan.file);}
      else if(await exists(plan.file))throw Error('Concurrent new file: '+plan.file);
      await fs.mkdir(path.dirname(plan.file),{recursive:true});
      const temporary=plan.file+'.validatebook-'+randomUUID()+'.tmp';
      try{await fs.copyFile(plan.source,temporary,fs.constants.COPYFILE_EXCL);await fs.rename(temporary,plan.file);}
      finally{await fs.rm(temporary,{force:true});}
      installed.push(plan);
    }
    for(const plan of installed)if(await fileHash(plan.file)!==plan.sha256)throw Error('Installed file verification failed: '+plan.file);
    return plans;
  } catch(error){
    for(const plan of installed.reverse()){
      if(await fileHash(plan.file)!==plan.sha256)throw Error('Concurrent change prevents rollback: '+plan.file,{cause:error});
      if(plan.backup)await fs.copyFile(plan.backup,plan.file);else await fs.unlink(plan.file);
    }
    throw error;
  }
}
