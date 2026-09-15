import { stat, lstat, readFile, writeFile, readdir, mkdir, rename, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { parseHtml } from './dom.mjs';
export async function exists(path) { try { await lstat(path); return true; } catch(error) { if(error.code==='ENOENT') return false; throw error; } }
export async function isOwnedOutput(destination, incomplete = false) {
  const index=join(destination,'index.html');
  if(await exists(index)) {
    if((await lstat(index)).isSymbolicLink()) return false;
    try { return parseHtml(await readFile(index,'utf8'))('head meta[name="generator"]').first().attr('content')==='pdf2html-skill'; } catch {return false;}
  }
  const assets=join(destination,'assets');
  if(await exists(assets) && (await lstat(assets)).isSymbolicLink()) return false;
  try { if((await readFile(join(assets,'.pdf2html-skill'),'utf8')).trim()==='pdf2html-skill') return true; } catch {}
  if(incomplete && await exists(join(destination,'.pdf2html-qa/report.json'))) {
    try {const css=await readFile(join(assets,'styles.css'),'utf8'); return css.includes('--pdf-page-aspect:') && css.includes('main.pdf-document');} catch {}
  }
  return false;
}
export async function writeMarker(destination) { await mkdir(join(destination,'assets'),{recursive:true}); await writeFile(join(destination,'assets/.pdf2html-skill'),'pdf2html-skill\n'); }
export async function prepareDestination(destination, overwrite) {
  if(!await exists(destination)) return;
  if((await lstat(destination)).isSymbolicLink()) throw new Error('Refusing to replace a symbolic-link output directory.');
  if(!(await readdir(destination)).length) return;
  if(!overwrite) throw new Error(`Output directory is not empty: ${destination}. Use --overwrite for a generated output.`);
  if(await isOwnedOutput(destination)) return;
  try {if(JSON.parse(await readFile(join(destination,'manifest.json'),'utf8')).generator==='pdf2html-skill') return;} catch {}
  throw new Error('Refusing to overwrite a directory not identified as pdf2html-skill output.');
}
async function emptyTree(path) {
  if(!await exists(path) || !(await lstat(path)).isDirectory()) return false;
  for(const item of await readdir(path,{withFileTypes:true})) if(!item.isDirectory() || !await emptyTree(join(path,item.name))) return false;
  return true;
}
export async function ensureBookTarget(destination,overwrite) {
  const index=join(destination,'index.html'), assets=join(destination,'assets'), collisions=await exists(index)||await exists(assets);
  if(collisions && !overwrite) throw new Error(`Generated book files already exist in ${destination}. Use --overwrite to rebuild them.`);
  if(collisions && !await isOwnedOutput(destination,true) && !( !await exists(index) && await emptyTree(assets))) throw new Error(`Refusing to replace index.html or assets in ${destination}; they are not owned by pdf2html-skill.`);
  if(await exists(assets) && (await lstat(assets)).isSymbolicLink()) throw new Error('Refusing to replace symbolic-link assets.');
}
export async function publish(staging,destination) {
  let backup;
  try {
    if(await exists(destination)) {backup=await mkdtemp(join(dirname(destination),`.${basename(destination)}.backup-`)); await rm(backup,{recursive:true});await rename(destination,backup);}
    await rename(staging,destination);
  } catch(error) {if(backup && !await exists(destination)) await rename(backup,destination); throw error;}
  if(backup) await rm(backup,{recursive:true,force:true});
}
export async function installBook(source,destination,overwrite) {
  await ensureBookTarget(destination,overwrite);
  const backup=await mkdtemp(join(dirname(destination),`.${basename(destination)}.pdf2html-backup-`)), moved=[],installed=[];
  try {
    for(const name of ['index.html','assets']) {const target=join(destination,name); if(await exists(target)) {await rename(target,join(backup,name));moved.push(name);}}
    for(const name of ['index.html','assets']) {await rename(join(source,name),join(destination,name));installed.push(name);}
  } catch(error) {
    for(const name of installed.reverse()) await rm(join(destination,name),{recursive:true,force:true});
    for(const name of moved) await rename(join(backup,name),join(destination,name));
    throw error;
  } finally {await rm(backup,{recursive:true,force:true});}
}
