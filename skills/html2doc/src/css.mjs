import fs from 'node:fs';
import path from 'node:path';
import { html, css, select } from './runtime.mjs';
export function localAsset(source,value) {
 if (/^[a-z][\w+.-]*:|^\/\//i.test(value)) throw new Error(`Remote resources are not supported: ${value}`);
 const root=fs.realpathSync(path.dirname(source)), candidate=fs.realpathSync(path.resolve(root,decodeURIComponent(value.split(/[?#]/)[0])));
 if (path.relative(root,candidate).startsWith('..') || path.isAbsolute(path.relative(root,candidate))) throw new Error(`Resource escapes the Scripta book directory: ${value}`);
 if(!fs.statSync(candidate).isFile()) throw new Error(`Local resource is missing: ${value}`);
 return candidate;
}
export function declarations(text) {
 const out={}; const ast=css.parse(text,{context:'declarationList'});
 ast.children.forEach(n=>{if(n.type==='Declaration')out[n.property.toLowerCase()]=css.generate(n.value);});
 for(const name of ['margin','padding']) if(out[name]) {
 const p=out[name].split(/\s+/),v=p.length===1?[p[0],p[0],p[0],p[0]]:p.length===2?[p[0],p[1],p[0],p[1]]:p.length===3?[p[0],p[1],p[2],p[1]]:p;
 if(v.length===4)for(const [i,s] of ['top','right','bottom','left'].entries())out[`${name}-${s}`]??=v[i];
 }
 if(out.background&&!out['background-color'])out['background-color']=out.background.split(/\s+/)[0];
 return out;
}
const inherited=['color','font-family','font-size','font-style','font-weight','line-height','text-align'];
export class StyleResolver {
 constructor(doc,source){this.rules=[];this.cache=new Map();this.warnings=[];
 const chunks=select.selectAll('style',doc).map(n=>html.DomUtils.textContent(n));
 for(const link of select.selectAll('link[rel~=stylesheet]',doc))chunks.push(fs.readFileSync(localAsset(source,link.attribs.href),'utf8'));
 for(const chunk of chunks)css.parse(chunk).children.forEach(rule=>{if(rule.type!=='Rule'||rule.prelude?.type!=='SelectorList')return;
 const decl=declarations(css.generate(rule.block).slice(1,-1));
 rule.prelude.children.forEach(selector=>{const s=css.generate(selector);let specificity=0;css.walk(selector,n=>{specificity+=n.type==='IdSelector'?10000:['ClassSelector','AttributeSelector'].includes(n.type)?100:n.type==='PseudoClassSelector'&&!['not','is','where'].includes(n.name)?100:n.type==='TypeSelector'&&n.name!=='*'?1:0;});
 try{const match=select.compile(s);this.rules.push({match,specificity,decl});}catch{this.warnings.push({severity:'warning',code:'css-selector-unsupported',message:`CSS selector was ignored: ${s}`});}});});
 }
 style(node){if(!node?.name)return {};if(this.cache.has(node))return this.cache.get(node);
 const parent=this.style(node.parent),result=Object.fromEntries(Object.entries(parent).filter(([k])=>k.startsWith('--')||inherited.includes(k)));
 for(const rule of this.rules.filter(r=>r.match(node)).sort((a,b)=>a.specificity-b.specificity))Object.assign(result,rule.decl);
 Object.assign(result,declarations(node.attribs.style||''));this.cache.set(node,result);return result;}
 resolve(node,name){const style=this.style(node);let value=style[name];if(!value)return value;
 for(let i=0;i<32&&value.includes('var(');i++){const next=value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,(_,key,fallback)=>style[key]??fallback??'0');if(next===value)break;value=next;}
 return value;}
}
export function points(value,base=11,page=612){if(!value)return null;value=value.trim().toLowerCase();const calc=value.match(/^calc\((.+?)\s*\*\s*([\d.]+)\)$/);if(calc){const v=points(calc[1],base,page);return v===null?null:v*Number(calc[2]);}const m=value.match(/^(-?\d*\.?\d+)(pt|px|rem|em|in|cm|mm|%)?$/);if(!m)return null;return Number(m[1])*({pt:1,px:.75,rem:base,em:base,in:72,cm:72/2.54,mm:72/25.4,'%':page/100}[m[2]||'pt']);}
export function color(value){if(!value)return null;const v=value.trim().toLowerCase(),names={black:'000000',white:'FFFFFF',red:'FF0000',blue:'0000FF',gray:'808080',grey:'808080'};if(names[v])return names[v];if(/^#[\da-f]{6}$/.test(v))return v.slice(1).toUpperCase();if(/^#[\da-f]{3}$/.test(v))return [...v.slice(1)].map(c=>c+c).join('').toUpperCase();const rgb=v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);return rgb?rgb.slice(1).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('').toUpperCase():null;}
