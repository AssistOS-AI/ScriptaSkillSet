import { stat, readdir, realpath, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { exists, ensureBookTarget, installBook, publish } from './publication.mjs';
import { convertPdf, qaDestination } from './converter.mjs';
const languages=new Set(['en','fr','de','es','pt','it','ro','pl']);
export function inferLanguage(path,fallback) {
  const suffix=basename(path,extname(path)).match(/[_. -]([a-z]{2})$/i)?.[1]?.toLowerCase(),parent=basename(dirname(path)).toLowerCase();
  return languages.has(suffix)?suffix:languages.has(parent)?parent:fallback?.toLowerCase()||'und';
}
export async function expandInputs(inputs,invocationDir) {
  if(!inputs.length) inputs=await exists(join(invocationDir,'book.pdf'))?[join(invocationDir,'book.pdf')]:(await readdir(invocationDir)).filter(name=>name.endsWith('.pdf')).sort().map(name=>join(invocationDir,name));
  const result=[];
  async function visit(input) {
    const path=await realpath(resolve(invocationDir,input)),info=await stat(path);
    if(info.isDirectory()) {
      const files=await readdir(path,{recursive:true,withFileTypes:true});
      for(const file of files.filter(item=>item.isFile() && extname(item.name).toLowerCase()==='.pdf').map(item=>join(item.parentPath,item.name)).sort()) result.push(await realpath(file));
    } else if(info.isFile() && extname(path).toLowerCase()==='.pdf') result.push(path);
    else throw new Error(`Input is not a PDF file: ${path}`);
  }
  for(const input of inputs) await visit(input);
  if(!result.length) throw new Error(`No PDF files were found. Put book.pdf in ${invocationDir} or pass PDF paths.`);
  return [...new Set(result)];
}
export async function convertMany(inputs,{invocationDir=process.cwd(),defaultLanguage,title,imageScale=2,overwrite=false,keepQaArtifacts=false}={}) {
  const pdfs=await expandInputs(inputs,invocationDir),destinations=pdfs.map(dirname);
  if(title && pdfs.length>1) throw new Error('--title can be used only when converting one PDF.');
  if(new Set(destinations).size!==destinations.length) throw new Error('Multiple PDFs cannot write index.html into the same folder. Place each edition in its own folder.');
  for(const destination of destinations) await ensureBookTarget(destination,overwrite);
  const books=[];
  for(const pdf of pdfs) {
    const destination=dirname(pdf),temporary=await mkdtemp(join(dirname(destination),`.${basename(destination)}.pdf2html-stage-`)),staged=join(temporary,'book');
    let retained=false;
    try {
      const result=await convertPdf(pdf,staged,{language:inferLanguage(pdf,defaultLanguage),title,imageScale,keepQaArtifacts});
      await installBook(staged,destination,overwrite);
      result.artifact=join(destination,'index.html');result.output=destination;
      if(keepQaArtifacts) {const qa=join(destination,'.pdf2html-qa');await publish(qaDestination(staged),qa);result.validation.report=join(qa,'report.json');}
      books.push(result);
    } catch(error) {if(error.diagnosticOutput) retained=true;throw error;}
    finally {if(!retained) await rm(temporary,{recursive:true,force:true});}
  }
  return {count:books.length,books};
}
