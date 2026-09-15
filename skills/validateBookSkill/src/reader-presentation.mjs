import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {exists,fileHash} from './storage.mjs';

// Read the host's explicit settings contract as data; never execute book or host scripts.
export function frameScale(script, pathname, fidelity) {
  if(/const sourceScale = [^\n]*state\.htmlFrame\.contentDocument\?\.body\?\.hasAttribute\('data-pdf-fidelity'\) \? 1 : 1\.24/.test(script))return fidelity?1:1.24;
  const m=script.match(/const sourceScale = \/(.+)\/\.test\(new URL\(state\.htmlFrame\.src\)\.pathname\) \? ([\d.]+) : ([\d.]+);/);
  if(!m)throw Error('Reader default scaling contract not recognized; cannot certify delivered typography');
  return new RegExp(m[1]).test(pathname)?Number(m[2]):Number(m[3]);
}
export async function readerPresentation(document,file) {
  const standalone=document.resources.find(r=>r.tag==='script'&&/\/reader\/standalone\.js(?:\?|$)/.test(r.url));
  if(!standalone)return {kind:'standalone',defaultSizePx:document.presentation?.bodyFontSize,inputs:[]};
  const scriptUrl=new URL(standalone.url);if(scriptUrl.protocol!=='file:')throw Error('Local reader contract required');
  const directory=path.dirname(fileURLToPath(scriptUrl)),reader=path.join(directory,'reader.js'),css=path.join(directory,'reader.css');
  if(!await exists(reader)||!await exists(css))throw Error('Reader integration files missing');
  const script=await fs.readFile(reader,'utf8'),styles=await fs.readFile(css,'utf8');
  const value=styles.match(/--reader-font-size:\s*([\d.]+)rem/);if(!value)throw Error('Reader default font size is not explicit');
  const defaultSizePx=Number(value[1])*document.presentation.rootFontSize;
  const scale=frameScale(script,file,document.presentation.fidelity);
  const routeScaling=script.match(/const sourceScale = \/(.+)\/\.test\(new URL\(state\.htmlFrame\.src\)\.pathname\) \? ([\d.]+) : ([\d.]+);/);
  const replacement="const sourceScale = (() => { try { return state.htmlFrame.contentDocument?.body?.hasAttribute('data-pdf-fidelity') ? 1 : 1.24; } catch { return 1.24; } })();";
  const repair=routeScaling&&document.presentation.fidelity?{file:reader,sha256:await fileHash(reader),before:routeScaling[0],after:replacement,content:script.replace(routeScaling[0],replacement)}:null;
  let importedArticle;
  if(script.includes('function cleanReadableDocument(')){
    const marker=document.presentation.fidelityMarker;
    const generic=script.includes('const booksRoot = new URL(')&&script.includes('stylesheetUrl.pathname.startsWith(booksRoot.pathname)');
    const entry=[...script.matchAll(/marker: '([^']+)', route: \/(.+)\/, stylesheet: '([^']+)'/g)].find(m=>m[1]===marker&&new RegExp(m[2]).test(file));
    // Older books can legitimately expose only standalone.js and no
    // source-fidelity marker. Audit their standalone document fully and report
    // the unsupported imported-article path instead of aborting before audit.
    if(!entry&&!generic)return {kind:'reader-default',defaultSizePx,scale,standaloneSizeRem:Number(value[1])*scale,articleContract:null,inputs:await Promise.all([reader,css].map(async file=>({file,sha256:await fileHash(file)}))),limitation:'Standalone reader verified; imported article source-style contract is not configured.'};
    const rootRule=styles.match(/:root\s*\{([^}]+)\}/)?.[1]||'';
    const rootSize=rootRule.match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)px\s*;/);
    if(/(?:^|;)\s*font-size\s*:/.test(rootRule)&&!rootSize)throw Error('Reader root font size must have a supported explicit CSS-pixel contract');
    const readerRootPx=rootSize?Number(rootSize[1]):document.presentation.rootFontSize;
    importedArticle={readerCss:pathToFileURL(css).href,sourceCss:entry?new URL(entry[3],pathToFileURL(file)).href:null,generic,booksRoot:new URL('../books/',pathToFileURL(reader)).href,defaultRem:Number(value[1]),fontRatio:document.presentation.rootFontSize*scale/readerRootPx,managed:generic||(script.includes("sourceDocument.querySelector('link[data-validatebook-presentation]')")&&script.includes("content.setAttribute('data-validatebook-root', '')"))};
  }
  return {kind:'reader-default',repair,defaultSizePx,scale,standaloneSizeRem:Number(value[1])*scale,articleContract:importedArticle,inputs:await Promise.all([reader,css].map(async file=>({file,sha256:await fileHash(file)}))),limitation:'Measures default iframe and supported imported-article presentation, not controls or user-saved preferences.'};
}
