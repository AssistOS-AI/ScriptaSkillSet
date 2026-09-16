// Runs inside the audit browser. Split containers at existing page anchors without rewriting prose.
export function paginateDocument({blankPages=[],origin='source',expectedPages=null,repaginateExisting=false}={}) {
  const root=document.querySelector('[data-validatebook-root]')||document.body;
  const narrative=()=>{const copy=root.cloneNode(true);copy.querySelectorAll('script,style,template,noscript').forEach(n=>n.remove());return copy.textContent;};
  const before=narrative();
  // A reader imports the first matching root. Pagination must never clone that
  // entry point into page-local fragments.
  root.setAttribute('data-reader-content','true');
  root.querySelectorAll('[data-reader-content]').forEach(n=>n.removeAttribute('data-reader-content'));
  const existing=[...root.querySelectorAll(':scope > .pdf-source-page')];
  if(existing.length&&!repaginateExisting){
    const pages=existing.map(n=>Number(n.getAttribute('data-reader-page')));
    if(expectedPages&&(pages.length!==expectedPages||pages.some((n,i)=>n!==i+1)))throw Error('Existing source pagination is incomplete');
    if(pages.some((n,i)=>!Number.isInteger(n)||n<1||(i&&n<=pages[i-1])))throw Error('Existing page order is invalid');
    return {html:(document.doctype?'<!DOCTYPE html>\n':'')+document.documentElement.outerHTML,pages,blankPages:existing.filter(n=>n.hasAttribute('data-blank-page')).map(n=>Number(n.getAttribute('data-reader-page'))),origin,textPreserved:true};
  }
  if(existing.length&&repaginateExisting){
    const nodes=[];
    for(const section of existing)nodes.push(...section.childNodes);
    const trailing=[...root.childNodes].filter(n=>!(n.nodeType===Node.ELEMENT_NODE&&n.matches('.pdf-source-page')));
    root.replaceChildren(...nodes,...trailing);
  }
  const markers=[...root.querySelectorAll('[id]')].filter(n=>/^page_\d+$/.test(n.id));
  if(!markers.length)throw Error('No page anchors; source boundary evidence is required');
  const numbers=markers.map(n=>Number(n.id.slice(5)));
  if(numbers[0]!==1||numbers.some((n,i)=>i&&n<=numbers[i-1]))throw Error('Page anchors must start at 1 and increase without duplicates');
  if(blankPages.some(n=>!Number.isInteger(n)||n<1||numbers.includes(n)))throw Error('Invalid or duplicate source-confirmed blank page');
  const all=[...numbers,...blankPages].sort((a,b)=>a-b);
  if(expectedPages&&(all.length!==expectedPages||all.some((n,i)=>n!==i+1)))throw Error('Source page coverage is incomplete');
  const starts=new Map(markers.map((node,i)=>[node,numbers[i]]));
  for(const marker of markers){let n=marker.previousSibling;while(n){if(n.nodeType===Node.TEXT_NODE&&!n.textContent.trim()){n=n.previousSibling;continue;}if(n.nodeType===Node.ELEMENT_NODE&&n.matches('span.source-anchor')&&!n.textContent.trim()){starts.set(n,Number(marker.id.slice(5)));n=n.previousSibling;continue;}break;}}
  let current=1;
  function split(node){
    if(starts.has(node))current=starts.get(node);
    if(node.nodeType!==Node.ELEMENT_NODE||!node.childNodes.length)return [{page:current,node:node.cloneNode(true)}];
    const parts=[];let group;
    for(const child of node.childNodes)for(const part of split(child)){
      if(!group||group.page!==part.page){const clone=node.cloneNode(false);if(parts.length){clone.removeAttribute('id');if(node.tagName==='P')clone.setAttribute('data-page-continuation','');if(node.tagName==='OL'){const count=parts.reduce((sum,p)=>sum+p.node.children.length,0);clone.setAttribute('start',String((Number(node.getAttribute('start'))||(node.reversed?node.children.length:1))+(node.reversed?-count:count)));}}group={page:part.page,node:clone};parts.push(group);}
      group.node.append(part.node);
    }
    return parts;
  }
  const grouped=new Map(all.map(page=>[page,[]])),runtime=[];
  for(const node of [...root.childNodes]){
    if(node.nodeType===Node.ELEMENT_NODE&&node.matches('script,style,template,noscript')){runtime.push(node);continue;}
    for(const part of split(node))grouped.get(part.page).push(part.node);
  }
  const pages=[];
  for(const [page,nodes] of grouped){const section=document.createElement('section');section.className='pdf-source-page';section.setAttribute('data-reader-page',String(page));section.setAttribute('data-page-origin',origin);if(origin==='source')section.setAttribute('data-source-page',String(page));
    if(blankPages.includes(page)){section.id='page_'+page;section.setAttribute('data-blank-page','');}
    section.append(...nodes);pages.push(section);
  }
  root.replaceChildren(...pages,...runtime);
  if(narrative()!==before)throw Error('Pagination changed narrative text');
  const ids=[...root.querySelectorAll('[id]')].map(n=>n.id);if(new Set(ids).size!==ids.length)throw Error('Pagination created duplicate anchors');
  return {html:(document.doctype?'<!DOCTYPE html>\n':'')+document.documentElement.outerHTML,pages:all,blankPages,origin,textPreserved:true};
}

export function sourceBlankPages(pages, anchors=[]) {
  const anchored=new Set(anchors);
  const lineKey=line=>line.normalize('NFKC').replace(/\s+/g,' ').trim();
  const pageLines=pages.map(page=>({page:page.page,lines:String(page.text||'').split(/\r?\n/).map(lineKey).filter(Boolean)}));
  const counts=new Map();
  for(const page of pageLines)for(const line of new Set(page.lines))counts.set(line,(counts.get(line)||0)+1);
  const repeated=new Set([...counts].filter(([line,count])=>count>=3&&!/^\d+$/.test(line)).map(([line])=>line));
  return pageLines
    .filter(page=>!anchored.has(page.page)&&page.lines.every(line=>/^\d+$/.test(line)||repeated.has(line)))
    .map(page=>page.page);
}

export function sourceImagePresentation(inventory) {
  const counts=new Map();
  return String(inventory).split(/\r?\n/).flatMap(line=>{
    const fields=line.trim().split(/\s+/);
    if(fields.length<14||fields[2]!=='image')return [];
    const page=Number(fields[0]),pixelWidth=Number(fields[3]),pixelHeight=Number(fields[4]),xPpi=Number(fields[12]),yPpi=Number(fields[13]);
    if(!Number.isInteger(page)||![pixelWidth,pixelHeight,xPpi,yPpi].every(value=>value>0))return [];
    const index=counts.get(page)||0;counts.set(page,index+1);
    return [{page,index,width:pixelWidth/xPpi*72,height:pixelHeight/yPpi*72}];
  });
}

// Executed in Chromium against Poppler XML, never against document scripts.
export function repairPageShells() {
  const root=document.querySelector('[data-validatebook-root]');
  if(!root)return [];
  const pages=[...root.querySelectorAll(':scope > .pdf-source-page[data-reader-page]')];
  if(!pages.length)return [];
  const originalText=root.textContent;
  const changes=[];
  root.setAttribute('data-reader-content','true');
  root.querySelectorAll('[data-reader-content]').forEach(n=>n.removeAttribute('data-reader-content'));
  // Consecutive normal-flow sections may share a page, especially in translations.
  // Only structural shells are eligible; prose and decorated layouts retain
  // their spacing. The page box owns the outer inset exactly once.
  for(const page of pages){
    const pending=[...page.children];
    while(pending.length){
      const shell=pending.shift();
      if(!shell.matches('main,article,section,div')||[...shell.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
      if(shell.matches('.pdf-table-wrap'))continue;
      const style=getComputedStyle(shell);
      if(!['block','flow-root'].includes(style.display)||!['static','relative'].includes(style.position)||!['transparent','rgba(0, 0, 0, 0)'].includes(style.backgroundColor)||style.backgroundImage!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(style['border'+side+'Width'])>0))continue;
      const properties={'padding':'0px','margin':'0px','min-height':'0px','font-size':'inherit','break-before':'auto','break-after':'auto'};
      const before=shell.getAttribute('style');
      for(const [key,value] of Object.entries(properties))shell.style.setProperty(key,value,'important');
      changes.push({kind:'page_shell_spacing',page:page.getAttribute('data-reader-page'),before,after:shell.getAttribute('style')});
      pending.push(...shell.children);
    }
  }
  if(root.textContent!==originalText)throw Error('Page shell repair changed narrative text');
  return changes;
}

export function sourcePagePresentation(xml) {
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  if(doc.querySelector('parsererror'))throw Error('Invalid source typography XML');
  const fonts=new Map([...doc.querySelectorAll('fontspec')].map(n=>[n.getAttribute('id'),Number(n.getAttribute('size'))]));
  const pages=[...doc.querySelectorAll('page')].map(p=>({number:Number(p.getAttribute('number')),width:Number(p.getAttribute('width')),height:Number(p.getAttribute('height')),rows:[...p.querySelectorAll('text')].map(n=>({text:n.textContent.trim(),left:Number(n.getAttribute('left')),top:Number(n.getAttribute('top')),width:Number(n.getAttribute('width')),height:Number(n.getAttribute('height')),size:fonts.get(n.getAttribute('font')),bold:!!n.querySelector('b'),linked:!!n.querySelector('a')})).filter(n=>n.text&&!/^\d+$/.test(n.text)),images:[...p.querySelectorAll('image')].map((n,index)=>({index,width:Number(n.getAttribute('width')),height:Number(n.getAttribute('height')),left:Number(n.getAttribute('left')),top:Number(n.getAttribute('top'))}))}));
  const mode=values=>{const counts=new Map();for(const value of values){const n=Math.round(value);counts.set(n,(counts.get(n)||0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];};
  const runningHeaders=new Map();
  for(const p of pages)for(const text of new Set(p.rows.filter(r=>r.top<p.height*.06).map(r=>r.text)))runningHeaders.set(text,(runningHeaders.get(text)||0)+1);
  for(const p of pages)p.rows=p.rows.filter(r=>!(r.top<p.height*.06&&runningHeaders.get(r.text)>=3));
  const dense=pages.filter(p=>p.rows.length>=12),wide=dense.flatMap(p=>p.rows.filter(r=>r.width>p.width*.6));
  if(dense.length<2||wide.length<20)throw Error('Insufficient recurring source bounds for page padding');
  const width=pages[0].width,height=pages[0].height;
  if(pages.some(p=>p.width!==width||p.height!==height))throw Error('Mixed PDF page sizes require an explicit page geometry plan');
  // Paragraph first lines can be more numerous than continuation lines. Use each
  // dense page's left envelope, not the most frequent row indent.
  const left=mode(dense.map(p=>Math.min(...p.rows.filter(r=>r.width>p.width*.6).map(r=>r.left))).filter(Number.isFinite)),right=width-mode(wide.map(r=>r.left+r.width));
  const top=mode(dense.map(p=>Math.min(...p.rows.map(r=>r.top))));
  const bottoms=dense.map(p=>Math.max(...p.rows.map(r=>r.top+r.height))).sort((a,b)=>a-b);
  const bottom=height-bottoms[Math.floor((bottoms.length-1)*.95)];
  const margins={top,right,bottom,left};
  if(Object.values(margins).some(n=>!Number.isFinite(n)||n<0)||left+right>width*.5||top+bottom>height*.4)throw Error('Ambiguous source page margins');
  const contents=[];
  let contentsNote='';
  const compact=value=>value.normalize('NFKC').toLowerCase().replace(/^\s*\d+[.)]?\s*/,'').replace(/[^\p{L}\p{N}]+/gu,'');
  const outline=[...doc.querySelectorAll('outline item')].map(item=>({label:item.childNodes[0]?.textContent?.trim()||item.textContent.trim(),destination:Number(item.getAttribute('page'))}));
  for(const page of doc.querySelectorAll('page')){
    const rows=[...page.querySelectorAll('text')];
    const foundBefore=contents.length;
    for(let i=0;i<rows.length;i++){
      const node=rows[i],a=node.querySelector('a');if(!a)continue;
      let value=node.textContent.trim();
      if(/\.{3,}$/.test(value)&&rows[i+1]?.querySelector('a')?.getAttribute('href')===a.getAttribute('href')&&/^\d+$/.test(rows[i+1].textContent.trim()))value+=' '+rows[i+1].textContent.trim();
      const match=value.match(/^(.*?)\.{3,}\s*(\d+)\s*$/);if(!match)continue;
      contents.push({label:match[1].trim(),number:match[2],page:Number(page.getAttribute('number')),indent:Number(node.getAttribute('left'))-left,top:Number(node.getAttribute('top')),size:fonts.get(node.getAttribute('font')),destination:Number(a.getAttribute('href')?.match(/#(\d+)$/)?.[1])});
    }
    if(contents.length!==foundBefore||!rows.some(node=>/^contents\s*$/i.test(node.textContent.trim())))continue;
    const pageWidth=Number(page.getAttribute('width'));
    const ordered=rows.map(node=>({node,text:node.textContent.replace(/\s+/g,' ').trim(),top:Number(node.getAttribute('top')),left:Number(node.getAttribute('left')),size:fonts.get(node.getAttribute('font'))})).filter(row=>row.text).sort((a,b)=>a.top-b.top||a.left-b.left);
    const heading=ordered.find(row=>/^contents$/i.test(row.text));
    const noteRows=ordered.filter(row=>row.top>heading.top&&/^(?:page\s+numbers\s+refer|10\.$)/i.test(row.text));
    contentsNote=noteRows.map(row=>row.text).join(' ').replace(/\s+/g,' ').trim();
    const numbers=ordered.filter(row=>/^\d+$/.test(row.text)&&row.left>pageWidth*.7&&row.top>heading.top+20&&row.top<Number(page.getAttribute('height'))*.9);
    const entries=[];
    for(let i=0;i<numbers.length;i++){
      const number=numbers[i];
      const nextTop=numbers[i+1]?.top??number.top+60;
      const lines=ordered.filter(row=>row.left<number.left-20&&row.top>=number.top-3&&row.top<Math.min(nextTop-4,number.top+56)&&!/^part\b/i.test(row.text)&&!/^page\s+numbers\s+refer/i.test(row.text));
      if(!lines.length)continue;
      const label=lines.map(row=>row.text).join(' ').replace(/\s+/g,' ').trim();
      const destinations=outline.filter(item=>compact(item.label)===compact(label));
      if(destinations.length!==1)continue;
      entries.push({kind:'entry',label,number:number.text,page:Number(page.getAttribute('number')),indent:lines[0].left-left,top:number.top,size:lines[0].size,lineAdvances:lines.slice(1).map((line,index)=>line.top-lines[index].top),destination:destinations[0].destination});
    }
    const parts=ordered.filter(row=>/^part\s+[ivxlcdm]+\s*:/i.test(row.text)).map(row=>({kind:'part',label:row.text,page:Number(page.getAttribute('number')),indent:row.left-left,top:row.top,size:row.size}));
    contents.push(...parts,...entries);
    contents.sort((a,b)=>a.page-b.page||a.top-b.top);
  }
  const entries=contents.filter(row=>row.kind!=='part');
  const contentsFontSize=mode(entries.map(r=>r.size));
  const contentsLineHeight=mode(entries.flatMap(row=>row.lineAdvances||[]))||contentsFontSize*1.45;
  const images=pages.flatMap(page=>page.images.map(image=>({...image,page:page.number}))).filter(image=>image.width>0&&image.height>0);
  return {width,height,margins,evidence:{densePages:dense.length,wideRows:wide.length},contents,contentsNote,contentsLineHeight,contentsFontSize,images};
}

// Scale source images with the page instead of leaving converted pixel widths
// fixed. Page/order correspondence must be unique; ambiguous pages are left
// untouched and reported by the caller.
export function applySourceImagePresentation({width,margins,images=[]}) {
  const changes=[],unmatched=[];
  const contentWidth=width-(margins?.left||0)-(margins?.right||0);
  if(!(contentWidth>0))return {changes,unmatched:['Source image content width']};
  const byPage=new Map();
  for(const image of images){const list=byPage.get(image.page)||[];list.push(image);byPage.set(image.page,list);}
  for(const [page,sources] of byPage){
    const sheet=document.querySelector(`.pdf-source-page[data-source-page="${page}"]`);
    const targets=sheet?[...sheet.querySelectorAll('.pdf-figure img')]:[];
    if(targets.length!==sources.length){unmatched.push(`page ${page}: ${sources.length} source images, ${targets.length} HTML images`);continue;}
    targets.forEach((image,index)=>{
      const source=sources[index],cover=page===1&&image.closest('figure')?.id==='page_1';
      const ratio=cover?100:Math.min(100,source.width/contentWidth*100);
      const before={width:image.style.width,marginLeft:image.style.marginLeft,marginRight:image.style.marginRight,display:image.style.display};
      image.style.width=ratio+'%';image.style.height='auto';image.style.marginLeft='auto';image.style.marginRight='auto';image.style.display='block';
      const figure=image.closest('.pdf-figure');if(figure){figure.style.marginLeft='0px';figure.style.marginRight='0px';}
      changes.push({kind:'source_image_presentation',page,before,after:{width:image.style.width,marginLeft:'auto',marginRight:'auto',display:'block'}});
    });
  }
  return {changes,unmatched};
}

// Preserve labels and links; page labels are generated presentation, never prose edits.
export function applyContentsPresentation({profile,language='en',mapping=[]}) {
  const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const result=[],unmatched=[],changes=[];
  const sourceEntries=profile.contents||[];
  const levels=[...new Set(sourceEntries.map(r=>r.indent))].sort((a,b)=>a-b);
  const rowParts=tr=>{
    const cells=[...tr.children].filter(cell=>/^(td|th)$/i.test(cell.tagName));
    if(cells.length<2)return null;
    const number=cells[cells.length-1].textContent.replace(/\s+/g,' ').trim();
    const label=cells.slice(0,-1).map(cell=>cell.textContent.replace(/\s+/g,' ').trim()).filter(Boolean).join(' ');
    return label&&/^\d{1,4}$/.test(number)?{label,number}:null;
  };
  const tableRows=table=>[...table.querySelectorAll('tr')].map(rowParts).filter(Boolean);
  const contentsContext=table=>{
    if(table.classList.contains('pdf-toc'))return true;
    const rows=tableRows(table);
    if(rows.length<3)return false;
    const before=[];let node=table.closest('.pdf-table-wrap')||table;
    for(let prev=node.previousElementSibling;prev&&before.length<6;prev=prev.previousElementSibling)before.push(prev);
    if(before.some(el=>el.classList?.contains('source-toc')||/^(contents|indice|índice|table des matières|inhalt)$/i.test(el.textContent.replace(/\s+/g,' ').trim())))return true;
    const page=table.closest('.pdf-source-page');
    const heading=page?.querySelector('h1,h2,h3,h4,h5,h6');
    if(heading&&/^(contents|indice|índice|table des matières|inhalt)$/i.test(heading.textContent.replace(/\s+/g,' ').trim()))return true;
    let previous=page?.previousElementSibling;
    for(let i=0;previous&&i<3;i++,previous=previous.previousElementSibling){
      if(previous.querySelector?.('.source-contents-heading,.source-toc'))return true;
    }
    return false;
  };
  const makeAnchor=({label,number,href,source})=>{
    const a=document.createElement('a');
    if(href)a.href=href;
    a.setAttribute('data-page-label',number);
    a.setAttribute('data-page-label-origin',language==='en'?'pdf':'translation');
    const labelSpan=document.createElement('span');labelSpan.className='validatebook-toc-label';labelSpan.textContent=label;
    const folio=document.createElement('span');folio.className='validatebook-toc-page';folio.textContent=' '+number;
    a.append(labelSpan,folio);
    const size=source?.size||profile.contentsFontSize;if(size>0)a.style.fontSize=`calc(${size*96/72}px * var(--validatebook-page-scale, 1))`;
    return a;
  };
  const replaceTableWithList=(table,entries,{sourceBacked=false}={})=>{
    const list=document.createElement('ol');list.className='source-toc';
    for(const entry of entries){
      const li=document.createElement('li');
      if(entry.kind==='part'){li.className='source-toc-part';li.textContent=entry.label;}
      else{
        const source=entry.source||entry;
        const href=entry.href||(source.destination?'#page_'+source.destination:null);
        li.append(makeAnchor({label:entry.label,number:entry.number,href,source}));
        if(source?.indent!==undefined)li.setAttribute('data-toc-level',String(Math.max(0,levels.indexOf(source.indent))));
      }
      list.append(li);
    }
    const before=table.outerHTML;const page=table.closest('.pdf-source-page'),wrap=table.closest('.pdf-table-wrap');
    const boundaryId=wrap?.id||table.id;
    if(/^page_\d+$/.test(boundaryId)&&!list.id)list.id=boundaryId;
    if(wrap)wrap.replaceWith(list);else table.replaceWith(list);
    const heading=page?.querySelector('h1,h2,h3,h4,h5,h6');if(heading)heading.classList.add('source-contents-heading');
    if(sourceBacked&&profile.contentsNote&&!page?.textContent.includes(profile.contentsNote)){
      const note=document.createElement('p');note.className='source-contents-note';note.textContent=profile.contentsNote;list.after(note);
    }
    changes.push({kind:'source_contents_recovery',before,after:list.outerHTML,sourceEntries:entries.map(entry=>entry.source||entry)});
  };
  if(language==='en'){
    const linked=sourceEntries.filter(source=>source.kind!=='part');
    for(const table of document.querySelectorAll('table.pdf-toc')){
      if(!linked.length||linked.some(source=>!document.getElementById('page_'+source.destination))){unmatched.push('Contents source structure');continue;}
      replaceTableWithList(table,sourceEntries,{sourceBacked:true});
    }
    for(const table of document.querySelectorAll('table.pdf-table')){
      if(!contentsContext(table))continue;
      const converted=[];
      for(const row of tableRows(table)){
        const matches=sourceEntries.filter(source=>source.kind!=='part'&&normalize(source.label)===normalize(row.label));
        converted.push({...row,source:matches.length===1?matches[0]:undefined,href:matches.length===1?'#page_'+matches[0].destination:null,number:matches.length===1?matches[0].number:row.number});
      }
      if(converted.length)replaceTableWithList(table,converted,{sourceBacked:false});
    }
  }else{
    for(const table of document.querySelectorAll('table.pdf-table,table.pdf-toc')){
      if(!contentsContext(table))continue;
      const converted=tableRows(table).map((row,index)=>({label:row.label,number:row.number,source:mapping[index]}));
      if(converted.length)replaceTableWithList(table,converted,{sourceBacked:false});
    }
  }
  const repairExistingContentsBoundaries=()=>{
    const headings=[...document.querySelectorAll('h1[id^="page_"],h2[id^="page_"],h3[id^="page_"],h4[id^="page_"],h5[id^="page_"],h6[id^="page_"]')].filter(h=>/^(contents|indice|índice|table des matières|inhalt)$/i.test(h.textContent.replace(/\s+/g,' ').trim()));
    for(const heading of headings){
      const start=Number(heading.id.slice(5));if(!Number.isInteger(start))continue;
      const lists=[];
      for(let node=heading.nextElementSibling;node;node=node.nextElementSibling){
        if(/^page_\d+$/.test(node.id||'')&&!node.classList.contains('source-toc'))break;
        if(/^H[1-6]$/.test(node.tagName)&&/^page_\d+$/.test(node.id||''))break;
        if(node.classList.contains('source-toc'))lists.push(node);
      }
      lists.forEach((list,index)=>{
        if(index===0||/^page_\d+$/.test(list.id||''))return;
        list.id='page_'+(start+index);
        changes.push({kind:'source_contents_boundary',before:null,after:list.id});
      });
    }
  };
  repairExistingContentsBoundaries();
  const lineHeight=(profile.contentsLineHeight>0&&profile.contentsFontSize>0)?profile.contentsLineHeight/profile.contentsFontSize:null;
  if(language==='en')for(const li of document.querySelectorAll('.source-toc-part')){
    const matches=sourceEntries.filter(row=>row.kind==='part'&&normalize(row.label)===normalize(li.textContent));
    if(matches.length!==1){unmatched.push(li.textContent.trim());continue;}
    const source=matches[0],size=source.size||profile.contentsFontSize;
    if(size>0)li.style.fontSize=`calc(${size*96/72}px * var(--validatebook-page-scale, 1))`;
    if(lineHeight)li.style.lineHeight=String(lineHeight);
  }
  for(const a of document.querySelectorAll('.source-toc a')){
    if(lineHeight)a.parentElement.style.lineHeight=String(lineHeight);
    if(!a.hasAttribute('href'))continue;
    const label=a.querySelector('.validatebook-toc-label')?.textContent||a.textContent;
    const matches=language==='en'?sourceEntries.filter(r=>r.kind!=='part'&&normalize(r.label)===normalize(label)):mapping.filter(r=>r.href===a.getAttribute('href'));
    if(matches.length!==1){unmatched.push(label);continue;}
    const source=matches[0],target=document.getElementById(a.getAttribute('href').slice(1));
    const size=source.size||profile.contentsFontSize;
    if(size>0)a.style.fontSize=`calc(${size*96/72}px * var(--validatebook-page-scale, 1))`;
    const destination=target?.closest('.pdf-source-page');
    const page=language==='en'?source.number:destination?String([...destination.parentElement.querySelectorAll(':scope > .pdf-source-page')].indexOf(destination)+1):null;
    if(!page){unmatched.push(label);continue;}
    if(!a.querySelector('.validatebook-toc-label')){const span=document.createElement('span');span.className='validatebook-toc-label';span.append(...a.childNodes);a.append(span);}
    a.setAttribute('data-page-label',page);a.setAttribute('data-page-label-origin',language==='en'?'pdf':'reader');
    let folio=a.querySelector('.validatebook-toc-page');if(!folio){folio=document.createElement('span');folio.className='validatebook-toc-page';a.append(folio);}folio.textContent=' '+page;
    a.parentElement.setAttribute('data-toc-level',String(Math.max(0,levels.indexOf(source.indent))));
    result.push({href:a.getAttribute('href'),number:source.number,indent:source.indent,label});
  }
  return {html:(document.doctype?'<!DOCTYPE html>\n':'')+document.documentElement.outerHTML,mapping:result,unmatched,changes};
}

export function pagePaddingDifferences(layout,profile,language='en') {
  if(!profile||language!=='en')return [];
  return (layout.pagination?.pages||[]).filter(page=>!page.padding||page.padding.some((value,i)=>Math.abs(value/page.width-(page.cover?0:profile.margins[['top','right','bottom','left'][i]]/profile.width))>.002)).map(page=>({page:page.number,width:layout.width,padding:page.padding,expected:profile.margins}));
}

export function pageHeightDifferences(layout,profile) {
  if(!profile)return [];
  return (layout.pagination?.pages||[]).filter(p=>p.height+2<p.width*profile.height/profile.width)
    .map(p=>({page:p.number,width:layout.width,height:p.height,minimumHeight:p.width*profile.height/profile.width}));
}

function contentsCss({contents=[],contentsLineHeight,contentsFontSize}) {
  if(!contents.length)return '';
  const lineHeight=(contentsLineHeight>0&&contentsFontSize>0)?contentsLineHeight/contentsFontSize:1.4;
  const sizeBase=contentsFontSize>0?contentsFontSize:1;
  return `
[data-validatebook-root] .source-contents-heading{margin:0 0 .25em!important;text-align:left!important}
[data-validatebook-root] .source-toc{box-sizing:border-box;width:100%;list-style:none;margin:0;padding:0}
[data-validatebook-root] .source-toc li{margin:0!important;line-height:${lineHeight};text-indent:0}
[data-validatebook-root] .source-toc .source-toc-part{font-weight:400;margin-top:1em!important}
[data-validatebook-root] .source-contents-note{font-style:italic;margin-top:1.5em}
[data-validatebook-root] .source-toc a[data-page-label]{display:flex;align-items:baseline;gap:.12em;color:inherit;text-decoration:none}
[data-validatebook-root] .source-toc .validatebook-toc-label{min-width:0;overflow-wrap:anywhere}
[data-validatebook-root] .source-toc a[data-page-label]::before{content:"";order:1;flex:1 0 .5em;align-self:baseline;border-bottom:1px dotted currentColor}
[data-validatebook-root] .source-toc a[data-page-label]::after{content:attr(data-page-label);order:2;flex:none;text-align:right;font-variant-numeric:lining-nums}
[data-validatebook-root] .source-toc a:has(.validatebook-toc-page)::after{content:none}
[data-validatebook-root] .source-toc .validatebook-toc-page{order:2;flex:none;font-variant-numeric:lining-nums}
${[...new Set(contents.map(r=>r.indent))].sort((a,b)=>a-b).map((indent,i)=>`[data-validatebook-root] .source-toc li[data-toc-level="${i}"]{padding-left:${(Number(indent)||0)/sizeBase}em}`).join('\n')}
`.replaceAll('[data-validatebook-root]','[data-validatebook-root][data-validatebook-root]');
}

export function translatedPaginationCss({width,height,margins=null,contents=[],contentsLineHeight,contentsFontSize}) {
  if(!(width>0&&height>0))throw Error('Source PDF page dimensions required');
  const padding=margins?['top','right','bottom','left'].map(k=>(margins[k]/width*100)+'cqw').join(' '):'0';
  return `/* validateBook translated flow */
[data-validatebook-root]:has(> .pdf-source-page){container-type:inline-size;background:var(--reader-surround,var(--standalone-surround,#e3e6e4));box-shadow:none;border-color:transparent}
[data-validatebook-root] > .pdf-source-page{container-type:inline-size;--validatebook-page-scale:max(1,calc(100cqw / ${width*4/3}px));font-size:calc(1em * var(--validatebook-page-scale));display:flow-root;box-sizing:border-box;min-height:${height/width*100}cqw;margin:0 0 32px;padding:${padding};background:var(--reader-paper,var(--standalone-paper,#fff));border:1px solid var(--reader-paper-line,var(--standalone-paper-line,#d7dcda));box-shadow:0 2px 8px #0002;break-after:page}
[data-validatebook-root] > .pdf-source-page:last-of-type{margin-bottom:0;break-after:auto}
[data-validatebook-root] > .pdf-source-page:has(figure#page_1){padding:0}
.pdf-source-page figure#page_1{margin:0}
.pdf-source-page figure#page_1 img{display:block;width:100%;height:auto;margin:0}
@media print{[data-validatebook-root]:has(> .pdf-source-page){width:100%;max-width:none;padding:0;border:0;background:transparent}[data-validatebook-root] > .pdf-source-page{min-height:0;margin:0;border:0;box-shadow:none;break-after:page}.pdf-source-page[data-blank-page]{min-height:90vh}}
`+contentsCss({contents,contentsLineHeight,contentsFontSize});
}

export function paginationCss({width,height,margins,contents=[],contentsLineHeight,contentsFontSize}) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Source PDF page dimensions required');
  const padding=margins?['top','right','bottom','left'].map(k=>(margins[k]/width*100)+'cqw').join(' '):'0';
  const toc=contentsCss({contents,contentsLineHeight,contentsFontSize});
  return `/* validateBook source pagination */
@property --validatebook-page-scale{syntax:"<number>";inherits:true;initial-value:1}
[data-validatebook-root]:has(> .pdf-source-page){container-type:inline-size;background:var(--reader-surround,var(--standalone-surround,#e3e6e4));box-shadow:none;border-color:transparent}
[data-validatebook-root] > .pdf-source-page{container-type:inline-size;--validatebook-page-scale:max(1,calc(100cqw / ${width*4/3}px));font-size:calc(1em * var(--validatebook-page-scale));display:flow-root;box-sizing:border-box;min-height:${height/width*100}cqw;margin:0 0 32px;padding:${padding};background:var(--reader-paper,var(--standalone-paper,#fff));border:1px solid var(--reader-paper-line,var(--standalone-paper-line,#d7dcda));box-shadow:0 2px 8px #0002;break-after:page}
[data-validatebook-root] > .pdf-source-page:last-of-type{margin-bottom:0;break-after:auto}
[data-validatebook-root] > .pdf-source-page:has(figure#page_1){padding:0}
.pdf-source-page figure#page_1{margin:0}
.pdf-source-page figure#page_1 img{display:block;width:100%;height:auto;margin:0}
.pdf-source-page p[data-page-continuation]{text-indent:0!important}
[data-validatebook-root] .pdf-table-wrap{max-width:100%;overflow-x:auto}
[data-validatebook-root] table{max-width:100%;border-collapse:collapse}
[data-validatebook-root] th, [data-validatebook-root] td{overflow-wrap:normal;word-break:normal;hyphens:none}
${toc}
@media print{[data-validatebook-root]:has(> .pdf-source-page){width:100%;max-width:none;padding:0;border:0;background:transparent}[data-validatebook-root] > .pdf-source-page{min-height:0;margin:0;border:0;box-shadow:none;break-after:page}.pdf-source-page[data-blank-page]{min-height:90vh}}
`;
}
