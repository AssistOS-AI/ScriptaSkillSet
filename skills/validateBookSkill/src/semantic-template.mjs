import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// File stylesheets have opaque browser origins; read their local font rules
// through the native runtime, never by relaxing browser origin checks.
export async function resolveTemplateFonts(template) {
  const faces=[],seen=new Set();
  const visit=async(css,base)=>{
    for(const match of css.matchAll(/@font-face\s*\{[^}]*\}/g))faces.push(match[0].replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g,(_,url)=>'url("'+new URL(url.trim(),base).href+'")'));
    for(const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g))await read(new URL(match[1],base).href);
  };
  const read=async href=>{
    if(seen.has(href))return;seen.add(href);
    const url=new URL(href);if(url.protocol!=='file:')throw Error('English template stylesheet must be local: '+href);
    await visit(await fs.readFile(fileURLToPath(url),'utf8'),href);
  };
  for(const source of template.stylesheets||[])if(source.href)await read(source.href);else await visit(source.css,template.sourceUrl);
  template.fontFaces=[...new Set(faces)];return template;
}

// This function runs in Chromium in both audit and correction modes. The source
// snapshot contains presentation and slot identities, never translated prose.
export function semanticTemplate({ template = null, language = 'en', apply = false } = {}) {
  const root = document.querySelector('[data-reader-content],main,article') || document.body;
  const cleanText = value => String(value).replace(/\s+/gu, ' ').trim();
  const skip = 'script,style,template,noscript';
  const atomic = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,caption,td,th,pre,code,svg,math';
  const properties = ['font-family','font-size','font-weight','font-style','line-height','color','background-color','text-align','text-indent','letter-spacing','word-spacing','text-decoration-line','vertical-align','list-style-type','list-style-position','border-collapse','table-layout','object-fit','object-position','justify-content','align-items','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','gap','border-radius','box-shadow',...['top','right','bottom','left'].flatMap(side => ['margin-'+side,'padding-'+side,'border-'+side+'-width','border-'+side+'-style','border-'+side+'-color'])];
  const text = node => { const copy=node.cloneNode(true);copy.querySelectorAll?.(skip).forEach(n=>n.remove());return cleanText(copy.textContent); };
  const sentenceCount = value => [...new Intl.Segmenter(language,{granularity:'sentence'}).segment(value)].filter(part=>/[\p{L}\p{N}]/u.test(part.segment)).length;
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
    const attrs=Object.fromEntries([...node.attributes].filter(a=>!['style','class','data-vb-style'].includes(a.name)&&!a.name.startsWith('on')).map(a=>[a.name,a.value]));
    const item={tag,attrs,style:presentation(node,node===root),page};
    if(node.matches('.pdf-source-page,.source-page[data-source-page]')){item.semanticPage=true;item.style['min-height']=node.getBoundingClientRect().height+'px';}
    if(tag==='img'||(node.matches(atomic)&&!node.querySelector(atomic+',img'))){
      const index=slots.length,value=text(node);
      const cell=node.closest('td,th'),table=cell?.closest('table'),row=cell?.parentElement;
      const grid=cell ? [...table.rows].map(r=>[...r.cells].map(c=>[c.rowSpan,c.colSpan])) : null;
      const context=cell ? JSON.stringify({grid,row:[...table.rows].indexOf(row),column:[...row.cells].indexOf(cell)}) : node.closest('ol,ul')?.tagName||null;
      slots.push({index,key:key(node),tag,page,text:value,sentences:sentenceCount(value),context});
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
  const tagCost=(a,b)=>{
    if(a.tag===b.tag){const ca=tableContext(a),cb=tableContext(b);return ca!==null||cb!==null?(ca===cb?0:Infinity):0;}
    if(a.tag==='#text'&&b.tag==='#text')return 0;
    return flowTags.has(a.tag)&&flowTags.has(b.tag)?1:Infinity;
  };
  // Order-preserving weighted alignment. It never rewrites prose: shared
  // anchors delimit intervals; inside one it matches 1:1 where possible, keeps
  // translated-only blocks in place and reports source-only or regrouped units.
  const alignInterval=(source,target,page)=>{
    const n=source.length,m=target.length;
    if(!n&&!m)return {matches:[],missing:[],placements:[]};
    // A very large interval is mapped positionally instead of by weighted
    // alignment: the translated order is preserved and every unit is reported,
    // never rewritten or dropped.
    const byOrder=()=>{const matches=[],missing=[],placements=[];const paired=Math.min(n,m);for(let k=0;k<paired;k++)matches.push([k,k]);for(let k=paired;k<n;k++)missing.push(k);for(let k=paired;k<m;k++)placements.push({target:k,after:n-1});return {matches,missing,placements};};
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
    const matches=[],missing=[],placements=[];
    let i=n,j=m;
    while(i>0||j>0){
      const o=op[at(i,j)],k=span[at(i,j)]||1;
      if(o===1){missing.push(i-1);i--;}
      else if(o===2){placements.push({target:j-1,after:i-1});j--;}
      else if(o===3){matches.push([i-1,j-1]);i--;j--;}
      else if(o===4){matches.push([i-1,j-k]);for(let x=j-1;x>=j-k+1;x--)placements.push({target:x,after:i-1});i--;j-=k;}
      else if(o===5){for(let x=i-k+1;x<i;x++)missing.push(x);matches.push([i-k,j-1]);i-=k;j--;}
      else break;
    }
    placements.sort((a,b)=>a.target-b.target);
    return {matches,missing,placements};
  };
  // Shared identities are mandatory boundaries. Equal shapes are accepted only
  // inside an interval whose entire ordered slot sequence agrees.
  const sourceKeys=new Map(),targetKeys=new Map();
  for(const [list,map] of [[template.slots,sourceKeys],[slots,targetKeys]])for(const slot of list)if(slot.key){if(map.has(slot.key))add('translation_duplicate_identity',{key:slot.key});else map.set(slot.key,slot.index);}
  const anchors=[[-1,-1]];
  for(const source of template.slots)if(source.key&&targetKeys.has(source.key))anchors.push([source.index,targetKeys.get(source.key)]);
  anchors.push([template.slots.length,slots.length]);
  const mapping=new Map(),extraAfter=new Map(),missingSources=new Set();
  let sentenceDifferences=0,missingUnits=0,extraUnits=0;
  for(let i=1;i<anchors.length;i++){
    const [a,b]=anchors[i-1],[c,d]=anchors[i];
    if(d<=b){add('translation_alignment_ambiguous',{sourceIndex:c,targetIndex:d,detail:'Shared identities are reordered.'});continue;}
    const source=template.slots.slice(a+1,c),target=slots.slice(b+1,d);
    const sourceTables=source.filter(slot=>tableContext(slot)!==null),targetTables=target.filter(slot=>tableContext(slot)!==null);
    if(sourceTables.length||targetTables.length){
      const gridMatches=sourceTables.length===targetTables.length&&sourceTables.every((slot,index)=>tableContext(slot)===tableContext(targetTables[index])&&slot.tag===targetTables[index].tag);
      if(!gridMatches)add('translation_alignment_ambiguous',{page:source[0]?.page||target[0]?.page,detail:'Translated table grid or cell structure differs from English; reported without rewriting.',blocking:false});
    }
    const aligned=alignInterval(source,target,source[0]?.page||target[0]?.page);
    if(aligned){
      for(const [si,ti] of aligned.matches){const s=source[si],t=target[ti];mapping.set(s.index,t.index);if(s.sentences!==t.sentences)sentenceDifferences++;}
      for(const si of aligned.missing){missingSources.add(source[si].index);missingUnits++;}
      for(const placement of aligned.placements){const after=placement.after<0?(a>=0?a:-1):source[placement.after].index;if(!extraAfter.has(after))extraAfter.set(after,[]);extraAfter.get(after).push(target[placement.target].index);extraUnits++;}
    }
    if(c<template.slots.length){
      if(mapping.has(c)){if(mapping.get(c)!==d)add('translation_alignment_ambiguous',{page:template.slots[c].page,key:template.slots[c].key,detail:'Shared anchor slot does not map one-to-one.'});}
      else if(tagCost(template.slots[c],slots[d])===Infinity)add('translation_structure_difference',{page:template.slots[c].page,key:template.slots[c].key,source:template.slots[c],target:slots[d],blocking:false});
      else {mapping.set(c,d);if(template.slots[c].sentences!==slots[d].sentences)sentenceDifferences++;}
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
  const excludedAttr=name=>['id','data-source-page','data-reader-page','data-pdf-box','data-pdf-layout'].includes(name);
  const cloneTarget=index=>targetContent[index].cloneNode(true);
  const buildNodes=item=>{
    if('text'in item)return [document.createTextNode(item.text)];
    if(item.tag==='#text'){
      const out=[];const mappedIndex=mapping.get(item.slot);
      if(mappedIndex!==undefined)out.push(cloneTarget(mappedIndex));
      for(const extra of extraAfter.get(item.slot)||[]){const node=cloneTarget(extra);styled(node,item.style);out.push(node);}
      return out;
    }
    let node;
    if(item.slot!==undefined){
      const mappedIndex=mapping.get(item.slot);
      if(mappedIndex!==undefined){
        node=cloneTarget(mappedIndex);
        node.setAttribute('data-semantic-slot',template.slots[item.slot].key||'slot-'+item.slot);
      }else{
        // A source unit with no translated counterpart is reported and omitted
        // instead of leaving an empty English element in the reader.
        const out=[];for(const extra of extraAfter.get(item.slot)||[]){const extraNode=cloneTarget(extra);styled(extraNode,item.style);out.push(extraNode);}return out;
      }
    }else if(inlineFormatter.has(item.tag)){
      const out=[];for(const child of item.children||[])out.push(...buildNodes(child));return out;
    }else{
      node=document.createElement(item.tag);
      for(const [name,value] of Object.entries(item.attrs))if(!excludedAttr(name))node.setAttribute(name,value);
      for(const child of item.children||[])for(const builtChild of buildNodes(child))node.append(builtChild);
    }
    if(item.semanticPage){node.className='pdf-source-page';node.dataset.semanticPage=item.page;node.dataset.readerPage=item.page;node.dataset.pageOrigin='translation';}
    styled(node,item.style);
    const out=[node];
    for(const extra of extraAfter.get(item.slot)||[]){const extraNode=cloneTarget(extra);styled(extraNode,item.style);out.push(extraNode);}
    return out;
  };
  const rootNodes=buildNodes(template.tree);
  const candidate=rootNodes.shift();
  for(const node of rootNodes)candidate.append(node);
  const leading=extraAfter.get(-1)||[];
  if(leading.length)candidate.prepend(...leading.map(extra=>{const node=cloneTarget(extra);styled(node,template.tree.style);return node;}));
  // Safety net: any translated slot not consumed by alignment is kept so no text
  // is ever dropped; the ordered-text guard below still decides acceptance.
  const usedTargets=new Set(mapping.values());
  for(const list of extraAfter.values())for(const target of list)usedTargets.add(target);
  for(const slot of slots)if(!usedTargets.has(slot.index))candidate.append(cloneTarget(slot.index));
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
  if(text(candidate).replace(/\s/gu,'')!==snapshotText.replace(/\s/gu,'')){
    const rebuilt=text(candidate).replace(/\s/gu,''),original=snapshotText.replace(/\s/gu,'');
    let at=0;while(at<rebuilt.length&&at<original.length&&rebuilt[at]===original[at])at++;
    add('translation_content_changed',{detail:'Candidate does not preserve the complete ordered translation text.',at,expectedLength:original.length,actualLength:rebuilt.length,expected:original.slice(at,at+80),actual:rebuilt.slice(at,at+80)});
    return result;
  }
  const inventory = node => ({images:[...node.querySelectorAll('img')].map(n=>[n.getAttribute('src'),n.getAttribute('srcset'),n.getAttribute('alt')]),links:[...node.querySelectorAll('a')].map(n=>[n.getAttribute('href'),n.textContent]),marks:[...node.querySelectorAll('strong,b,em,i,sup,sub,code')].map(n=>[n.tagName,n.textContent])});
  const inventoryBefore=inventory(root),inventoryAfter=inventory(candidate);
  if(JSON.stringify(inventoryAfter)!==JSON.stringify(inventoryBefore)){
    const diff={};for(const key of ['images','links','marks']){if(JSON.stringify(inventoryBefore[key])!==JSON.stringify(inventoryAfter[key]))diff[key]={before:inventoryBefore[key].length,after:inventoryAfter[key].length,beforeSample:inventoryBefore[key].slice(0,8),afterSample:inventoryAfter[key].slice(0,8)};}
    add('translation_content_changed',{detail:'Candidate changes translated assets, links or semantic markers.',diff});return result;
  }
  const localUrl=url=>{const asset=new URL(url,template.sourceUrl),base=new URL('.',location.href);if(asset.protocol!==base.protocol||asset.host!==base.host)return asset.href;const from=base.pathname.split('/').filter(Boolean),to=asset.pathname.split('/').filter(Boolean);while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}return '../'.repeat(from.length)+to.join('/')+asset.search+asset.hash;};
  const faces=(template.fontFaces||[]).map(face=>face.replace(/url\("([^"]+)"\)/g,(_,url)=>'url("'+localUrl(url)+'")')).join('\n');
  const css='/* validateBook managed presentation; semantic English template */\n'+faces+'\n'+[...rules].map(([signature,id])=>`[data-validatebook-root][data-vb-style="${id}"]:not(.reader-html-content), [data-validatebook-root] [data-vb-style="${id}"] {${Object.entries(JSON.parse(signature)).map(([name,value])=>`${name}:${value}`).join(';')}}`).join('\n')+`\n[data-validatebook-root]:not(.reader-html-content){width:100%;margin:0 auto;padding:0} [data-validatebook-root] .pdf-source-page{max-width:100%;overflow:visible;break-inside:auto} [data-validatebook-root] :is(img,table,pre){max-width:100%} [data-validatebook-root] img{height:auto} [data-validatebook-root] :is(h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,figcaption,dd,dt,div,span,a){overflow-wrap:anywhere;word-break:break-word;max-width:100%} @media print{[data-validatebook-root] .pdf-source-page{min-height:0;break-after:page}}`;
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
