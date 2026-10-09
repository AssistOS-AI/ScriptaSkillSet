import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// TrueType family name, used to keep a translated edition's monospace role.
function readFamilyName(buffer){
  try{
    const num=buffer.readUInt16BE(4);let nameOff=null;
    for(let i=0;i<num;i++){const o=12+i*16;if(buffer.toString('ascii',o,o+4)==='name'){nameOff=buffer.readUInt32BE(o+8);break;}}
    if(nameOff==null)return null;const count=buffer.readUInt16BE(nameOff+2),strOff=nameOff+buffer.readUInt16BE(nameOff+4);
    for(let i=0;i<count;i++){const r=nameOff+6+i*12,nid=buffer.readUInt16BE(r+6),len=buffer.readUInt16BE(r+8),o=buffer.readUInt16BE(r+10);if(nid===1){let s='';for(let k=0;k<len;k+=2){const c=buffer.readUInt16BE(strOff+o+k);if(c)s+=String.fromCharCode(c);}return s;}}
  }catch{}
  return null;
}
// Native evidence: post.isFixedPitch, OS/2 panose proportion, or a monospace name.
export function isMonospaceFont(buffer){
  try{
    const num=buffer.readUInt16BE(4);const tables={};
    for(let i=0;i<num;i++){const o=12+i*16;tables[buffer.toString('ascii',o,o+4)]=buffer.readUInt32BE(o+8);}
    if('post' in tables&&buffer.readUInt32BE(tables.post+12)!==0)return true;
    if('OS/2' in tables&&buffer[tables['OS/2']+32+3]===9)return true;
    const name=readFamilyName(buffer);if(name&&/mono|courier|consol|menlo|typewriter/i.test(name))return true;
  }catch{}
  return false;
}

// File stylesheets have opaque browser origins; read their local font rules
// through the native runtime, never by relaxing browser origin checks.
export async function resolveTemplateFonts(template) {
  const faces=[],seen=new Set(),sheets=[];
  const visit=async(css,base)=>{
    for(const match of css.matchAll(/@font-face\s*\{[^}]*\}/g))faces.push(match[0].replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g,(_,url)=>'url("'+new URL(url.trim(),base).href+'")'));
    for(const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g))await read(new URL(match[1],base).href);
  };
  const read=async href=>{
    if(seen.has(href))return;seen.add(href);
    const url=new URL(href);if(url.protocol!=='file:')throw Error('English template stylesheet must be local: '+href);
    const css=await fs.readFile(fileURLToPath(url),'utf8');sheets.push({css,base:href});await visit(css,href);
  };
  for(const source of template.stylesheets||[])if(source.href)await read(source.href);else{sheets.push({css:source.css,base:template.sourceUrl});await visit(source.css,template.sourceUrl);}
  template.fontFaces=[...new Set(faces)];template.sourceSheets=sheets;
  const monospaceFamilies=[];
  for(const face of template.fontFaces){
    const family=/font-family\s*:\s*["']?([^"';]+)["']?/.exec(face)?.[1]?.trim();
    const url=/url\(\s*["']?([^"')]+)["']?\s*\)/.exec(face)?.[1];
    if(!family||!url)continue;
    try{const buffer=await fs.readFile(fileURLToPath(new URL(url)));if(isMonospaceFont(buffer))monospaceFamilies.push(family);}catch{}
  }
  template.monospaceFamilies=[...new Set(monospaceFamilies)];
  return template;
}

// This function runs in Chromium in both audit and correction modes. The source
// snapshot contains presentation and slot identities, never translated prose.
export function semanticTemplate({ template = null, language = 'en', apply = false, translations = {}, fontBase = 'assets/fonts' } = {}) {
  const root = document.querySelector('[data-reader-content],main,article') || document.body;
  const cleanText = value => String(value).replace(/\s+/gu, ' ').trim();
  const skip = 'script,style,template,noscript';
  const atomic = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,pre,code,svg,math,a';
  // Elements whose presence inside a block means the block is not a single leaf.
  // A link does not split a paragraph, but it is itself a leaf slot.
  const nested = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,pre,code,svg,math';
  const properties = ['font-family','font-size','font-weight','font-style','line-height','color','background-color','text-align','text-indent','letter-spacing','word-spacing','text-decoration-line','vertical-align','list-style-type','list-style-position','border-collapse','table-layout','object-fit','object-position','justify-content','align-items','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','gap','border-radius','box-shadow',...['top','right','bottom','left'].flatMap(side => ['margin-'+side,'padding-'+side,'border-'+side+'-width','border-'+side+'-style','border-'+side+'-color'])];
  const text = node => { const copy=node.cloneNode(true);copy.querySelectorAll?.(skip).forEach(n=>n.remove());return cleanText(copy.textContent); };
  const sentenceCount = value => [...new Intl.Segmenter(language,{granularity:'sentence'}).segment(value)].filter(part=>/[\p{L}\p{N}]/u.test(part.segment)).length;
  // Language-independent line-break identity: a <br> is stored as the number of
  // sentences that precede it, so a translation receives the same logical line
  // structure after its own sentence boundaries instead of the English widths.
  const sentenceBreakCounts = node => {
    const breaks=[];let accumulated='';
    for(const child of node.childNodes){
      if(child.nodeType===1&&child.tagName==='BR'){breaks.push(sentenceCount(accumulated));continue;}
      accumulated+=' '+(child.textContent||'');
    }
    return breaks;
  };
  const key = node => node.getAttribute('data-source-id') || node.getAttribute('data-semantic-slot') || (node.id && !/^page_\d+$/.test(node.id) ? node.id : null);
  const slots=[],nodes=[],pages=[];
  const presentation = (node,isRoot) => {
    const computed=getComputedStyle(node),style={};
    for(const name of properties)style[name]=computed.getPropertyValue(name);
    const parent=node.parentElement, parentStyle=parent&&getComputedStyle(parent);
    const parentWidth=parent ? parent.clientWidth-parseFloat(parentStyle.paddingLeft)-parseFloat(parentStyle.paddingRight) : 0;
    const width=node.getBoundingClientRect().width;
    if(parentWidth>0&&width>0&&!['inline','contents','table-row','table-row-group','table-header-group'].includes(computed.display))style.width=Math.min(100,width/parentWidth*100).toFixed(6)+'%';
    style.display=computed.display;
    if(['absolute','fixed'].includes(computed.position))style.display='block';
    style.position='static';style.transform='none';style.height='auto';style['max-height']='none';style['min-height']='0';style['box-sizing']='border-box';
    // The host reader or the managed root rule owns the outer box. Never bake a
    // transient viewport width or the browser's default body margin into it.
    if(isRoot)for(const name of Object.keys(style))if(/^(width|margin-|padding-)/.test(name)||name==='height')delete style[name];
    if(node.tagName==='IMG'&&node.getBoundingClientRect().height>0)style['aspect-ratio']=width+'/'+node.getBoundingClientRect().height;
    return style;
  };
  const snapshot = (node, page) => {
    if(node.nodeType===3){if(!node.textContent.trim())return {text:node.textContent};const index=slots.length;slots.push({index,key:null,tag:'#text',page,text:node.textContent,sentences:sentenceCount(node.textContent)});nodes.push(node);return {slot:index,tag:'#text'};}
    if(node.nodeType!==1||node.matches(skip))return null;
    const tag=node.tagName.toLowerCase();
    if(node.matches('.pdf-source-page,.source-page[data-source-page]')){
      page=String(node.dataset.semanticPage||node.dataset.sourcePage||node.dataset.readerPage||pages.length+1);
      pages.push(page);
    }
    const attrs=Object.fromEntries([...node.attributes].filter(a=>!['style','data-vb-style'].includes(a.name)&&!a.name.startsWith('on')).map(a=>[a.name,a.value]));
    const item={tag,attrs,style:presentation(node,node===root),vb:node.getAttribute('data-vb-style'),page};
    if(node.matches('.pdf-source-page,.source-page[data-source-page]')){item.semanticPage=true;item.style['min-height']=node.getBoundingClientRect().height+'px';}
    if(tag==='img'||(node.matches(atomic)&&!node.querySelector(nested+',img'))){
      const index=slots.length,value=text(node);
      const cell=node.closest('td,th'),table=cell?.closest('table'),row=cell?.parentElement;
      const grid=cell ? [...table.rows].map(r=>[...r.cells].map(c=>[c.rowSpan,c.colSpan])) : null;
      const context=cell ? JSON.stringify({grid,row:[...table.rows].indexOf(row),column:[...row.cells].indexOf(cell)}) : node.closest('ol,ul')?.tagName||null;
      slots.push({index,key:key(node),tag,page,text:value,sentences:sentenceCount(value),breaks:sentenceBreakCounts(node),context});
      nodes.push(node);item.slot=index;
    }else item.children=[...node.childNodes].map(child=>snapshot(child,page)).filter(Boolean);
    return item;
  };
  const tree=snapshot(root,null),snapshotText=text(root);
  const issues=[];
  // Shared identities can be absent in older editions. Derive anchors from the
  // chapter/part/appendix numbering, which is language-independent, so ordered
  // intervals can align even when no id is shared across the editions.
  // Normalise spacing around numbering so "1 . Title" and "1. Titlu" share one
  // language-independent anchor. English PDF extractions often insert a space
  // before the ordinal dot that translations do not.
  const normaliseHeading=value=>cleanText(value).replace(/(\d)\s+([.)])/gu,'$1$2');
  const markerKey=value=>{
    const line=normaliseHeading(value);
    let match;
    if((match=/^(?:chapter|capitolul)\s+(\d+)/i.exec(line)))return 'chapter-'+match[1];
    if((match=/^(?:volume|volumul)\s+([ivxlcdm]+|\d+)/i.exec(line)))return 'volume-'+match[1].toLowerCase();
    if((match=/^(?:part|partea)\s+([ivxlcdm]+|\d+)/i.exec(line)))return 'part-'+match[1].toLowerCase();
    if((match=/^(?:appendix|anexa)\s+([a-z])/i.exec(line)))return 'appendix-'+match[1].toLowerCase();
    // Language-independent section codes such as LATTICE-2307, MERCY-2305 or
    // NOEMA 2119 survive translation and anchor the same section in both editions.
    if((match=/^([A-Za-z]+[-\s]\d{2,4})\b/.exec(line)))return 'code-'+match[1].toLowerCase().replace(/\s+/g,'-');
    if((match=/^(\d{1,3})[.)]?\s+\p{L}/u.exec(line)))return 'numbered-'+match[1];
    return null;
  };
  const assignChapterAnchors=list=>{
    // Chapter numbers restart per volume, so make each marker unique by its
    // occurrence in document order. Both editions expose the same ordering, so
    // "chapter 3" of the second cycle still matches across languages without a
    // shared id or a translated word.
    const counts=new Map();
    for(const slot of list){
      if(!/^h[1-6]$/.test(slot.tag))continue;
      const value=markerKey(slot.text);if(!value)continue;
      const occurrence=(counts.get(value)||0)+1;counts.set(value,occurrence);
      slot.key=value+'#'+occurrence;
    }
    // The book title is the first heading after the cover image in both
    // editions. Anchor it so the title maps to the title even when the target
    // inserts an extra folio paragraph or uses a different heading level.
    let seenImage=false,title=null;
    for(const slot of list){
      if(slot.tag==='img'){seenImage=true;continue;}
      if(seenImage&&/^h[1-6]$/.test(slot.tag)){title=slot;break;}
    }
    if(title&&!title.key)title.key='front:title';
  };
  if(!template){
    assignChapterAnchors(slots);
    const stylesheets=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.tagName==='LINK'?{href:node.href}:{css:node.textContent});
    return {tree,slots,pages,text:snapshotText,sourceUrl:location.href,rootWidth:root.getBoundingClientRect().width,stylesheets};
  }
  assignChapterAnchors(slots);
  const add=(code,details={},severity)=>issues.push({code,severity:severity||details.severity||'error',...details});
  if(!template.pages.length)add('translation_template_unpaged',{detail:'English needs explicit semantic page containers.'});
  const tableContext=slot=>slot.context&&slot.context.startsWith('{')?slot.context:null;
  const flowTags=new Set(['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption']);
  // Inline formatting is owned by the translated node, so English emphasis
  // wrappers that decomposition exposed are unwrapped instead of leaking their
  // tag onto translated content.
  const inlineFormatter=new Set(['strong','b','em','i','u','s','small','sub','sup','code','mark','abbr','cite','q','time']);
  // Text blocks are the same semantic unit across an export's element choice:
  // a translated prose paragraph may be stored as <p> while the source uses a
  // <pre><code> monospace line, or vice versa. They must still align one to one
  // instead of merging or dropping translations.
  const blockRole=tag=>['p','pre','code','blockquote','figcaption','li'].includes(tag)?'text':tag;
  const tagCost=(a,b)=>{
    if(blockRole(a.tag)!==blockRole(b.tag))return Infinity;
    const ca=tableContext(a),cb=tableContext(b);
    return ca!==null||cb!==null?(ca===cb?0:Infinity):0;
  };
  // Order-preserving weighted alignment. It never rewrites prose: shared
  // anchors delimit intervals; inside one it matches 1:1 where possible, keeps
  // translated-only blocks in place and reports source-only or regrouped units.
  const alignInterval=(source,target,page)=>{
    const n=source.length,m=target.length;
    if(!n&&!m)return {ops:[]};
    // A very large interval is mapped positionally instead of by weighted
    // alignment: the translated order is preserved and every unit is reported,
    // never rewritten or dropped.
    const byOrder=()=>{const ops=[];const paired=Math.min(n,m);for(let k=0;k<paired;k++)ops.push({kind:'match',source:k,target:k});for(let k=paired;k<n;k++)ops.push({kind:'missing',source:k});for(let k=paired;k<m;k++)ops.push({kind:'extra',target:k});return {ops};};
    if(n*m>20000000){add('translation_alignment_limit',{page,detail:'Interval too large for weighted alignment ('+n+'x'+m+'); mapped by document order without rewriting.',blocking:false});return byOrder();}
    const width=m+1,at=(i,j)=>i*width+j;
    const cost=new Float64Array((n+1)*width).fill(Infinity),op=new Uint8Array((n+1)*width),span=new Uint8Array((n+1)*width);
    cost[0]=0;
    const skip=1.5,splitStep=.15,mergeStep=.6,maxGroup=4;
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
      const base=cost[at(i,j)];if(!Number.isFinite(base))continue;
      if(i<n){const v=base+skip;if(v<cost[at(i+1,j)]){cost[at(i+1,j)]=v;op[at(i+1,j)]=1;span[at(i+1,j)]=1;}}
      if(j<m){const v=base+skip;if(v<cost[at(i,j+1)]){cost[at(i,j+1)]=v;op[at(i,j+1)]=2;span[at(i,j+1)]=1;}}
      if(i<n&&j<m){
        const t=tagCost(source[i],target[j]);
        if(Number.isFinite(t)){const v=base+t+Math.abs(source[i].sentences-target[j].sentences);if(v<cost[at(i+1,j+1)]){cost[at(i+1,j+1)]=v;op[at(i+1,j+1)]=3;span[at(i+1,j+1)]=1;}}
        let total=0;
        for(let k=1;k<=maxGroup&&j+k<=m;k++){const tk=tagCost(source[i],target[j+k-1]);if(!Number.isFinite(tk))break;total+=target[j+k-1].sentences;const v=base+tk+Math.abs(source[i].sentences-total)+splitStep*(k-1);if(v<cost[at(i+1,j+k)]){cost[at(i+1,j+k)]=v;op[at(i+1,j+k)]=4;span[at(i+1,j+k)]=k;}}
        let totalS=0;
        for(let k=1;k<=maxGroup&&i+k<=n;k++){const tk=tagCost(source[i+k-1],target[j]);if(!Number.isFinite(tk))break;totalS+=source[i+k-1].sentences;const v=base+tk+Math.abs(totalS-target[j].sentences)+mergeStep*(k-1);if(v<cost[at(i+k,j+1)]){cost[at(i+k,j+1)]=v;op[at(i+k,j+1)]=5;span[at(i+k,j+1)]=k;}}
      }
    }
    const ops=[];let i=n,j=m;
    while(i>0||j>0){
      const o=op[at(i,j)],k=span[at(i,j)]||1;
      if(o===1){ops.push({kind:'missing',source:i-1});i--;}
      else if(o===2){ops.push({kind:'extra',target:j-1});j--;}
      else if(o===3){ops.push({kind:'match',source:i-1,target:j-1});i--;j--;}
      else if(o===4){const targets=[];for(let x=j-k;x<j;x++)targets.push(x);ops.push({kind:'merge',source:i-1,targets});i--;j-=k;}
      else if(o===5){const sources=[];for(let x=i-k;x<i;x++)sources.push(x);ops.push({kind:'split',sources,target:j-1});i-=k;j--;}
      else break;
    }
    return {ops};
  };
  // Shared identities are mandatory boundaries. Equal shapes are accepted only
  // inside an interval whose entire ordered slot sequence agrees.
  const sourceKeys=new Map(),targetKeys=new Map();
  for(const [list,map] of [[template.slots,sourceKeys],[slots,targetKeys]])for(const slot of list)if(slot.key){if(map.has(slot.key))add('translation_duplicate_identity',{key:slot.key});else map.set(slot.key,slot.index);}
  const strongKey=key=>!/^front:/.test(key);
  const anchors=[{a:-1,b:-1,strong:false}];
  for(const source of template.slots)if(source.key&&targetKeys.has(source.key))anchors.push({a:source.index,b:targetKeys.get(source.key),strong:strongKey(source.key)});
  anchors.push({a:template.slots.length,b:slots.length,strong:false});
  const splitSentences=value=>[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(value||'')].map(part=>part.segment.trim()).filter(part=>/[\p{L}\p{N}]/u.test(part));
  const mapping=new Map(),fills=new Map(),missingSources=new Set();
  let sentenceDifferences=0,missingUnits=0,extraUnits=0,regrouped=0;
  const distributeText=(text,weights)=>{
    const sentences=[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text||'')].map(part=>part.segment).filter(part=>/[\p{L}\p{N}]/u.test(part));
    if(!sentences.length)return weights.map(()=>'');
    const total=weights.reduce((sum,value)=>sum+value,0)||weights.length;
    const out=[];let index=0;
    for(let s=0;s<weights.length;s++){
      const take=s===weights.length-1?sentences.length-index:Math.max(1,Math.round(sentences.length*weights[s]/total));
      out.push(sentences.slice(index,index+take).join(' ').trim());index+=take;
    }
    if(index<sentences.length)out[out.length-1]=(out[out.length-1]+' '+sentences.slice(index).join(' ')).trim();
    return out;
  };
  for(let i=1;i<anchors.length;i++){
    const a=anchors[i-1].a,b=anchors[i-1].b,c=anchors[i].a,d=anchors[i].b;
    if(d<=b){add('translation_alignment_ambiguous',{sourceIndex:c,targetIndex:d,detail:'Shared identities are reordered.'});continue;}
    const source=template.slots.slice(a+1,c),target=slots.slice(b+1,d);
    const sourceTables=source.filter(slot=>tableContext(slot)!==null),targetTables=target.filter(slot=>tableContext(slot)!==null);
    if(sourceTables.length||targetTables.length){
      const gridMatches=sourceTables.length===targetTables.length&&sourceTables.every((slot,index)=>tableContext(slot)===tableContext(targetTables[index])&&slot.tag===targetTables[index].tag);
      if(!gridMatches)add('translation_alignment_ambiguous',{page:source[0]?.page||target[0]?.page,detail:'Translated table grid or cell structure differs from English; reported without rewriting.',blocking:false});
    }
    const aligned=alignInterval(source,target,source[0]?.page||target[0]?.page);
    // Reuse the translation only between two strong anchors (chapter/volume/part
    // number or section code), where document order is reliable. The front matter
    // before the first strong anchor is translated from the blueprint; blocks
    // with no counterpart are translated, translated-only blocks are dropped.
    const reusable=anchors[i-1].strong;
    if(aligned&&reusable)for(const operation of aligned.ops){
      if(operation.kind==='match'){const s=source[operation.source],t=target[operation.target];if(blockRole(s.tag)===blockRole(t.tag)&&s.context===t.context)mapping.set(s.index,t.index);else fills.set(s.index,{text:t.text||''});}
      else if(operation.kind==='merge'){const s=source[operation.source];fills.set(s.index,{text:operation.targets.map(ti=>target[ti].text||'').join(' ').trim()});regrouped++;}
      else if(operation.kind==='split'){const t=target[operation.target],srcs=operation.sources.map(si=>source[si]),parts=distributeText(t.text||'',srcs.map(s=>s.sentences||1));operation.sources.forEach((si,k)=>fills.set(source[si].index,{text:parts[k]||''}));regrouped++;}
      else if(operation.kind==='missing'){missingSources.add(source[operation.source].index);missingUnits++;}
      else if(operation.kind==='extra'){extraUnits++;}
    }
    else {const images=target.filter(slot=>slot.tag==='img');let image=0;for(const slot of source){if(slot.tag==='img'&&image<images.length)mapping.set(slot.index,images[image++].index);else{missingSources.add(slot.index);missingUnits++;}}}
    if(c<template.slots.length){
      if(mapping.has(c)&&mapping.get(c)!==d)add('translation_alignment_ambiguous',{page:template.slots[c].page,key:template.slots[c].key,detail:'Shared anchor slot does not map one-to-one.'});
      else mapping.set(c,d);
    }
  }
  if(sentenceDifferences)add('translation_sentence_count_difference',{page:'document',detail:sentenceDifferences+' translated unit(s) keep their own sentence grouping; text preserved.',blocking:false});
  if(missingUnits)add('translation_missing_unit',{page:'document',detail:missingUnits+' English unit(s) have no translated counterpart; reported, never generated.',blocking:false});
  if(extraUnits)add('extra_translation_block',{page:'document',detail:extraUnits+' translated unit(s) have no English counterpart; preserved in place.',blocking:false});
  const result={issues,pages:template.pages.length,slots:slots.length,mapped:mapping.size,changed:false,semanticMeaningVerified:false};
  // Capture target inline emphasis before removing its old stylesheet. Keep
  // target markup/links/IDs and never distribute text over English inline runs.
  const targetContent=nodes.map(node=>{
    const copy=node.cloneNode(true);
    if(node.nodeType!==1)return copy;
    const originals=[node,...node.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')];
    originals.forEach((element,index)=>{
      const clone=copies[index],style=getComputedStyle(element);
      clone.removeAttribute('style');clone.removeAttribute('class');clone.removeAttribute('data-vb-style');
      if(index){
        const parent=getComputedStyle(element.parentElement);
        if(style.fontWeight!==parent.fontWeight)clone.style.fontWeight=style.fontWeight;
        if(style.fontStyle!==parent.fontStyle)clone.style.fontStyle=style.fontStyle;
      }
    });
    return copy;
  });
  const rules=new Map();
  const styled=(node,style)=>{
    const signature=JSON.stringify(style);let id=rules.get(signature);
    if(!id){id='t'+(rules.size+1);rules.set(signature,id);}
    node.setAttribute('data-vb-style',id);
  };
  const cloneTarget=index=>targetContent[index].cloneNode(true);
  // English assets (fonts, images) are referenced relatively from the target.
  const localUrl=url=>{const asset=new URL(url,template.sourceUrl),base=new URL('.',location.href);if(asset.protocol!==base.protocol||asset.host!==base.host)return asset.href;const from=base.pathname.split('/').filter(Boolean),to=asset.pathname.split('/').filter(Boolean);while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}return '../'.repeat(from.length)+to.join('/')+asset.search+asset.hash;};
  const englishText=index=>{const slot=template.slots[index];return slot&&slot.text?slot.text:'';};
  const translatedText=index=>{const slot=template.slots[index];if(!slot)return undefined;if(translations[slot.text]!==undefined)return translations[slot.text];for(const key of [slot.key,index,'slot-'+index])if(key!==null&&key!==undefined&&translations[key]!==undefined)return translations[key];return undefined;};
  // The English DOM is the blueprint. Every element, class, id, data attribute
  // and image is kept; visible text is the existing translation when it matches
  // confidently, otherwise the translation supplied for that English unit. A
  // translated-only block is dropped and reported.
  // Re-insert the source line breaks after the same sentence index in the
  // translated text, so a translation shares the source's logical line
  // structure regardless of its own character widths. Existing target breaks
  // are removed first so repeated runs stay stable.
  const applySentenceBreaks=(node,breaks)=>{
    if(!breaks?.length)return;
    node.querySelectorAll('br').forEach(mark=>mark.remove());
    if(!node.textContent.trim())return;
    const endings=[];let cursor=0;
    for(const part of new Intl.Segmenter(language,{granularity:'sentence'}).segment(node.textContent)){cursor+=part.segment.length;if(/[\p{L}\p{N}]/u.test(part.segment))endings.push(cursor);}
    const offsets=[...new Set(breaks.map(count=>endings[Math.min(Math.max(count,1),endings.length)-1]).filter(value=>value>0))].sort((a,b)=>b-a);
    for(const offset of offsets){
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let textNode,position=0,point=null;
      while((textNode=walker.nextNode())){if(position+textNode.length>=offset){point={textNode,offset:offset-position};break;}position+=textNode.length;}
      if(!point)continue;
      const mark=document.createElement('br');
      if(point.offset<=0)point.textNode.parentNode.insertBefore(mark,point.textNode);
      else if(point.offset>=point.textNode.length)point.textNode.parentNode.insertBefore(mark,point.textNode.nextSibling);
      else point.textNode.parentNode.insertBefore(mark,point.textNode.splitText(point.offset));
    }
  };
  const buildElement=item=>{
    if('text'in item)return document.createTextNode(item.text);
    if(item.tag==='#text'){
      const mapped=mapping.get(item.slot),provided=translatedText(item.slot);
      if(mapped!==undefined)return document.createTextNode(targetContent[mapped].textContent||'');
      if(fills.has(item.slot))return document.createTextNode(fills.get(item.slot).text||'');
      return document.createTextNode(provided!==undefined?provided:englishText(item.slot));
    }
    const node=document.createElement(item.tag);
    for(const [name,value] of Object.entries(item.attrs))if(name!=='data-vb-style'&&!name.startsWith('on'))node.setAttribute(name,value);
    if(item.tag==='img'){
      const src=node.getAttribute('src');if(src)node.setAttribute('src',localUrl(src));
      const srcset=node.getAttribute('srcset');if(srcset)node.setAttribute('srcset',srcset.split(',').map(part=>{const [url,...rest]=part.trim().split(/\s+/);return [localUrl(url),...rest].join(' ');}).join(', '));
    }
    if(item.semanticPage){node.classList.add('pdf-source-page');node.dataset.semanticPage=item.page;node.dataset.readerPage=item.page;node.dataset.pageOrigin='translation';}
    if(item.vb)node.setAttribute('data-vb-style',item.vb);else styled(node,item.style);
    if(item.slot!==undefined){
      const mapped=mapping.get(item.slot);
      if(mapped!==undefined){
        const source=targetContent[mapped];
        if(item.tag==='img'){
          // Keep the English (canonical, correctly sized) image asset via the
          // rewritten relative URL; a localized thumbnail must not change the
          // blueprint cover geometry.
        }else for(const child of source.childNodes)node.append(child.cloneNode(true));
        node.setAttribute('data-semantic-slot',template.slots[item.slot].key||'slot-'+item.slot);
      }else if(fills.has(item.slot)){
        node.textContent=fills.get(item.slot).text||'';
      }else{
        const provided=translatedText(item.slot);
        if(provided!==undefined)node.textContent=provided;
        else{node.textContent=englishText(item.slot);node.setAttribute('data-validatebook-untranslated','');}
      }
      if(item.tag!=='img')applySentenceBreaks(node,template.slots[item.slot]?.breaks);
    }else{
      for(const child of item.children||[])node.append(buildElement(child));
    }
    return node;
  };
  const candidate=buildElement(template.tree);
  // English units that neither reused a confident translation nor had one
  // supplied: the active LLM translates these and re-runs, replacing the marker.
  result.untranslated=template.slots.filter(slot=>!mapping.has(slot.index)&&!fills.has(slot.index)&&translatedText(slot.index)===undefined&&slot.text&&slot.text.trim()).map(slot=>({id:slot.index,key:slot.key||'slot-'+slot.index,tag:slot.tag,page:slot.page,text:slot.text}));
  const usedTargets=new Set(mapping.values());
  const droppedTargets=slots.filter(slot=>!usedTargets.has(slot.index));
  if(droppedTargets.length)add('extra_translation_block',{page:'document',detail:droppedTargets.length+' translated block(s) have no English counterpart and were dropped.',blocking:false});
  if(root.id)candidate.id=root.id;
  const sourceForTarget=new Map([...mapping].map(([source,target])=>[target,source]));
  for(const anchor of root.querySelectorAll('[id]')){
    if([...candidate.querySelectorAll('[id]')].some(node=>node.id===anchor.id))continue;
    const targetIndex=nodes.findIndex(node=>anchor===node||anchor.contains(node));
    if(targetIndex<0){add('translation_anchor_unmapped',{key:anchor.id,detail:'An existing anchor has no mapped content.',blocking:false});continue;}
    const sourceIndex=sourceForTarget.get(targetIndex);
    if(sourceIndex===undefined){add('translation_anchor_unmapped',{key:anchor.id,detail:'An existing anchor has no mapped English counterpart.',blocking:false});continue;}
    const slot=template.slots[sourceIndex];
    const destination=[...candidate.querySelectorAll('[data-semantic-slot]')].find(node=>node.dataset.semanticSlot===(slot.key||'slot-'+sourceIndex));
    if(!destination){add('translation_anchor_unmapped',{key:anchor.id});continue;}
    const alias=document.createElement('span');alias.id=anchor.id;destination.prepend(alias);
  }
  candidate.setAttribute('data-validatebook-root','');candidate.setAttribute('data-pdf-fidelity','semantic-template');candidate.setAttribute('data-reader-content','');
  const faces=(template.fontFaces||[]).map(face=>face.replace(/url\("([^"]+)"\)/g,(_,url)=>'url("'+localUrl(url)+'")')).join('\n');
  // Inherit the English managed stylesheet so the translation keeps the exact
  // cover, contents, page geometry and responsive typography. Asset URLs are
  // rewritten relative to the translated location. Fall back to generated rules.
  const rewriteCss=raw=>String(raw).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g,(full,quote,url)=>/^(data:|#|https?:|file:)/i.test(url.trim())?full:'url("'+localUrl(url.trim())+'")');
  // The English PDF subset faces cover only the English glyphs, so a translated
  // edition would substitute diacritics from a heavier fallback (Georgia). Reuse
  // one complete OFL typeface (EB Garamond, same family as the source) for all
  // translated text so every glyph keeps the original weight and metrics.
  const bundledFamily='validatebook-garamond';
  const bundledBase=String(fontBase||'assets/fonts').replace(/\/+$/,'');
  const bundledFaces='@font-face{font-family:"'+bundledFamily+'";src:url("'+bundledBase+'/EBGaramond-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;}\n@font-face{font-family:"'+bundledFamily+'";src:url("'+bundledBase+'/EBGaramond-Italic.ttf") format("truetype");font-weight:400;font-style:italic;font-display:block;}\n';
  const glyphSafe=css=>{
    const monoFamilies=new Set(template.monospaceFamilies||[]);
    const monoStack='"Courier New", "Liberation Mono", "DejaVu Sans Mono", ui-monospace, monospace';
    return css.replace(/@font-face\s*\{[^}]*pdf-font-[^}]*\}/gi,'').replace(/font-family\s*:\s*([^;}]+)/gi,(m,val)=>{
      if(!/pdf-font-/i.test(val))return m;
      const mono=[...val.matchAll(/(pdf-font-[\w.-]+)/gi)].some(tag=>monoFamilies.has(tag[1]));
      return 'font-family: '+(mono?monoStack:'"'+bundledFamily+'", Georgia, serif');
    });
  };
  const inheritedCss=bundledFaces+(template.sourceSheets||[]).map(sheet=>glyphSafe(rewriteCss(sheet.css))).join('\n');
  const generatedCss='/* validateBook managed presentation; semantic English template */\n'+faces+'\n'+[...rules].map(([signature,id])=>`[data-validatebook-root][data-vb-style="${id}"]:not(.reader-html-content), [data-validatebook-root] [data-vb-style="${id}"] {${Object.entries(JSON.parse(signature)).map(([name,value])=>`${name}:${value}`).join(';')}}`).join('\n')+`\n[data-validatebook-root]:not(.reader-html-content){width:100%;margin:0 auto;padding:0} [data-validatebook-root] .pdf-source-page{max-width:100%;overflow:visible;break-inside:auto} [data-validatebook-root] :is(img,table,pre,code){max-width:100%} [data-validatebook-root] :is(pre,code){white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word} [data-validatebook-root] img{height:auto} [data-validatebook-root] :is(h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,figcaption,dd,dt,div,span,a){overflow-wrap:anywhere;word-break:break-word;max-width:100%} @media print{[data-validatebook-root] .pdf-source-page{min-height:0;break-after:page}}`;
  const css=inheritedCss?('/* validateBook managed presentation; inherited English template */\n'+inheritedCss):generatedCss;
  const existing=document.querySelector('link[data-validatebook-presentation]');
  // Audit checks structure and the canonical declaration contract without writes.
  result.expectedCss=css;
  result.presentationDifferences=[];
  const alreadyTemplated=root.getAttribute('data-pdf-fidelity')==='semantic-template';
  if(alreadyTemplated){
    const inspect=item=>{
      const current=item.slot!==undefined&&item.tag!=='#text'?nodes[mapping.get(item.slot)]:null;
      if(current&&item.slot!==undefined&&item.tag!=='#text'){
        const computed=getComputedStyle(current);
        for(const property of properties){
          const expected=item.style[property],actual=computed.getPropertyValue(property);
          if(actual===expected)continue;
          if(actual.endsWith('px')&&expected.endsWith('px')&&Math.abs(parseFloat(actual)-parseFloat(expected))<.05)continue;
          result.presentationDifferences.push({slot:item.slot,property,expected,actual});
        }
      }
      for(const child of item.children||[])inspect(child);
    };inspect(template.tree);
  }
  // Presentation drift on an already-templated document is reported, not a
  // reason to rebuild: the managed stylesheet is compared separately and the
  // content, assets and delivery were already verified.
  result.changed=!alreadyTemplated&&(candidate.outerHTML!==root.outerHTML||!existing||result.presentationDifferences.length>0);
  if(apply){
    document.querySelectorAll('style,link[rel="stylesheet"]').forEach(node=>node.remove());
    document.body.removeAttribute('style');document.body.removeAttribute('class');
    if(root===document.body){document.body.replaceChildren(...candidate.childNodes);for(const attr of [...candidate.attributes])document.body.setAttribute(attr.name,attr.value);}
    else root.replaceWith(candidate);
    const link=document.createElement('link');link.rel='stylesheet';link.href='validatebook-layout.css';link.dataset.validatebookPresentation='';document.head.append(link);
    document.documentElement.lang=language;
    result.html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  }
  return result;
}
