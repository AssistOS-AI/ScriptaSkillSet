import fs from 'node:fs';
import path from 'node:path';
import {run,xml,all} from './runtime.mjs';
export const limits={fidelity:.002,balanced:.035,compact:.075};
const tokenize=s=>s.toLowerCase().match(/[\p{L}\p{N}_]+/gu)||[];
export function coverage(source,output){if(!source.length)return 1;const counts=new Map();for(const t of output)counts.set(t,(counts.get(t)||0)+1);let n=0;for(const t of source)if(counts.get(t)){n++;counts.set(t,counts.get(t)-1);}return n/source.length;}
const pairs=a=>a.slice(1).map((v,i)=>JSON.stringify([a[i],v]));
export function ppm(buffer){let i=0;const token=()=>{while(i<buffer.length){if(buffer[i]===35){while(i<buffer.length&&buffer[i]!==10)i++;}else if(buffer[i]<=32)i++;else break;}let start=i;while(i<buffer.length&&buffer[i]>32)i++;return buffer.subarray(start,i).toString();};if(token()!=='P6')throw new Error('Expected RGB PPM raster.');const width=Number(token()),height=Number(token()),max=Number(token());if(max!==255||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('Invalid PPM dimensions or channel range.');if(buffer[i]===13&&buffer[i+1]===10)i+=2;else i++;const pixels=buffer.subarray(i);if(pixels.length!==width*height*3)throw new Error('Truncated PPM raster.');return {width,height,pixels};}
export function difference(a,b){if(a.width!==b.width||a.height!==b.height)return 1;let sum=0;for(let i=0;i<a.pixels.length;i++)sum+=Math.abs(a.pixels[i]-b.pixels[i]);return sum/(255*a.pixels.length);}
export const qjson=file=>JSON.parse(run('qpdf',['--json',file],{allowed:[0,3]}));
const objects=j=>j.qpdf?.[1]||{};
const deref=(j,obj)=>typeof obj==='string'&&/^\d+ \d+ R$/.test(obj)?objects(j)[`obj:${obj}`]?.value:obj;
const outlineCount=items=>(items||[]).reduce((n,v)=>n+1+outlineCount(v.kids),0);
export function pageBox(j,ref) {
 const page=deref(j,ref); let obj=page, crop, media, rotation; const seen=new Set();
 while(obj&&!seen.has(obj)) {
  seen.add(obj); crop??=obj['/CropBox']; media??=obj['/MediaBox']; rotation??=obj['/Rotate'];
  obj=deref(j,obj['/Parent']);
 }
 const box=deref(j,crop??media),scale=page?.['/UserUnit']??1;
 if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||!Number.isFinite(scale)||scale<=0)throw new Error('PDF page has no usable box.');
 const dims=[Math.abs(box[2]-box[0])*scale,Math.abs(box[3]-box[1])*scale];
 return Math.abs(rotation||0)%180?dims.reverse():dims;
}
export function inspect(file,dir,prefix){const json=qjson(file),bbox=run('pdftotext',['-bbox-layout','-enc','UTF-8',file,'-']);const parsed=xml(bbox.replace(/<!DOCTYPE[^>]*>/i,''));const pages=all(parsed,'page'),tokens=[],sizes=[],blank=[],outside=[],rasters=[];let links=0;
 const fontOutput=run('pdffonts',[file]),fonts=[],unembedded=[];for(const row of fontOutput.split('\n').slice(2)){const parts=row.trim().split(/\s+/);if(parts.length<8)continue;const embedded=parts.at(-5);if(!['yes','no'].includes(embedded))continue;fonts.push(parts[0]);if(embedded==='no')unembedded.push(parts[0]);}
 fs.mkdirSync(dir,{recursive:true});
 for(let index=0;index<json.pages.length;index++){const page=json.pages[index],pageDoc=pages[index];if(!pageDoc)throw new Error('PDF text inventory page count differs.');const dims=pageBox(json,page.object);sizes.push(dims.map(n=>Number(n.toFixed(3))));const words=all(pageDoc,'word'),pageTokens=tokenize(words.map(n=>n.textContent).join(' '));tokens.push(...pageTokens);
 for(const word of words){const b=['xMin','yMin','xMax','yMax'].map(k=>Number(word.getAttribute(k)));if(b[0]<-1||b[1]<-1||b[2]>dims[0]+1||b[3]>dims[1]+1)outside.push([index+1,b]);}
 const pageObj=deref(json,page.object);const annots=deref(json,pageObj?.['/Annots'])||[];links+=annots.filter(a=>deref(json,a)?.['/Subtype']==='/Link').length;
 const out=path.join(dir,`${prefix}-${String(index+1).padStart(4,'0')}`);run('pdftoppm',['-f',String(index+1),'-l',String(index+1),'-singlefile','-r','96',file,out]);const raster=ppm(fs.readFileSync(out+'.ppm'));rasters.push(out+'.ppm');
 if(!pageTokens.length){let dark=0;for(let i=0;i<raster.pixels.length;i+=3)if(.299*raster.pixels[i]+.587*raster.pixels[i+1]+.114*raster.pixels[i+2]<245)dark++;if(dark/(raster.width*raster.height)<.0001)blank.push(index+1);}
 }
 return {pages:json.pages.length,sizes,tokens,links,outlines:outlineCount(json.outlines),fonts:[...new Set(fonts)].sort(),unembedded:[...new Set(unembedded)].sort(),blank,outside,rasters};}
const fontName=s=>s.replace(/^[A-Z]{6}\+/,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function validateReference(reference,candidate,{profile='fidelity',requestedFonts=[],sourceLinks=null,renderDir}={}){if(!(profile in limits))throw new Error('Unknown PDF profile.');const findings=[];let before,after;try{before=inspect(reference,renderDir,'reference');after=inspect(candidate,renderDir,'candidate');}catch(e){return {status:'failed',findings:[{severity:'error',code:'invalid-pdf',message:e.message}],metrics:{}};}
 const add=(severity,code,message,details)=>findings.push({severity,code,message,...(details?{details}:{})});const cov=coverage(before.tokens,after.tokens),order=coverage(pairs(before.tokens),pairs(after.tokens));const differences=before.rasters.map((file,i)=>after.rasters[i]?difference(ppm(fs.readFileSync(file)),ppm(fs.readFileSync(after.rasters[i]))):1);const maximum=Math.max(0,...differences);
 if(before.pages!==after.pages)add('error','page-count','Optimization changed the page count.');if(JSON.stringify(before.sizes)!==JSON.stringify(after.sizes))add('error','page-size','Optimization changed page sizes.');if(cov<.999)add('error','text-coverage','Text coverage is below 99.9%.');if(order<.995)add('error','text-order','Token order is below 99.5%.');if(after.links<before.links)add('error','links-removed','Optimization removed PDF links.');if(sourceLinks!==null&&after.links<sourceLinks)add('warning','source-links-not-exported','LibreOffice exported fewer links than the source.',{source:sourceLinks,pdf:after.links});if(after.outlines<before.outlines)add('error','outlines-removed','Optimization removed outlines.');if(JSON.stringify(after.blank)!==JSON.stringify(before.blank))add('error','blank-pages','Optimization changed blank pages.');if(after.outside.length)add('error','page-overflow','Text extends outside a page.',{blocks:after.outside.slice(0,20)});if(after.unembedded.length)add('error','fonts-not-embedded','PDF fonts are not embedded.',{fonts:after.unembedded});if(maximum>limits[profile])add('error','visual-difference',`Rendered-page difference ${maximum.toFixed(5)} exceeds ${limits[profile]}.`);
 const rendered=new Set(after.fonts.map(fontName)),unmatched=requestedFonts.filter(f=>!rendered.has(fontName(f)));if(unmatched.length)add('warning','font-substitution-possible','Requested font names were not found verbatim; aliases or substitutions may be present.',{requested:unmatched});
 return {status:findings.some(f=>f.severity==='error')?'failed':findings.length?'passed_with_warnings':'passed',findings,metrics:{pages:after.pages,textCoverage:Number(cov.toFixed(6)),textOrder:Number(order.toFixed(6)),links:after.links,outlines:after.outlines,fonts:after.fonts,unembeddedFonts:after.unembedded,blankPages:after.blank,maxVisualDifference:Number(maximum.toFixed(8)),pageVisualDifferences:differences.map(v=>Number(v.toFixed(8))),visualLimit:limits[profile],visualValidation:true}};
}
