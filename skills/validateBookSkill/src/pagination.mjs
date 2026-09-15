// Runs inside the audit browser. Split containers at existing page anchors without rewriting prose.
export function paginateDocument({blankPages=[],origin='source',expectedPages=null}={}) {
  const root=document.querySelector('[data-validatebook-root]')||document.body;
  const narrative=()=>{const copy=root.cloneNode(true);copy.querySelectorAll('script,style,template,noscript').forEach(n=>n.remove());return copy.textContent;};
  const before=narrative();
  // A reader imports the first matching root. Pagination must never clone that
  // entry point into page-local fragments.
  root.setAttribute('data-reader-content','true');
  root.querySelectorAll('[data-reader-content]').forEach(n=>n.removeAttribute('data-reader-content'));
  const existing=[...root.querySelectorAll(':scope > .pdf-source-page')];
  if(existing.length){
    const pages=existing.map(n=>Number(n.getAttribute('data-reader-page')));
    if(expectedPages&&(pages.length!==expectedPages||pages.some((n,i)=>n!==i+1)))throw Error('Existing source pagination is incomplete');
    if(pages.some((n,i)=>!Number.isInteger(n)||n<1||(i&&n<=pages[i-1])))throw Error('Existing page order is invalid');
    return {html:(document.doctype?'<!DOCTYPE html>\n':'')+document.documentElement.outerHTML,pages,blankPages:existing.filter(n=>n.hasAttribute('data-blank-page')).map(n=>Number(n.getAttribute('data-reader-page'))),origin,textPreserved:true};
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
  const pages=[...doc.querySelectorAll('page')].map(p=>({number:Number(p.getAttribute('number')),width:Number(p.getAttribute('width')),height:Number(p.getAttribute('height')),rows:[...p.querySelectorAll('text')].map(n=>({text:n.textContent.trim(),left:Number(n.getAttribute('left')),top:Number(n.getAttribute('top')),width:Number(n.getAttribute('width')),height:Number(n.getAttribute('height')),size:fonts.get(n.getAttribute('font')),bold:!!n.querySelector('b'),linked:!!n.querySelector('a')})).filter(n=>n.text&&!/^\d+$/.test(n.text))}));
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
  for(const page of doc.querySelectorAll('page')){
    const rows=[...page.querySelectorAll('text')];
    for(let i=0;i<rows.length;i++){
      const node=rows[i],a=node.querySelector('a');if(!a)continue;
      let value=node.textContent.trim();
      if(/\.{3,}$/.test(value)&&rows[i+1]?.querySelector('a')?.getAttribute('href')===a.getAttribute('href')&&/^\d+$/.test(rows[i+1].textContent.trim()))value+=' '+rows[i+1].textContent.trim();
      const match=value.match(/^(.*?)\.{3,}\s*(\d+)\s*$/);if(!match)continue;
      contents.push({label:match[1].trim(),number:match[2],page:Number(page.getAttribute('number')),indent:Number(node.getAttribute('left'))-left,top:Number(node.getAttribute('top')),size:fonts.get(node.getAttribute('font')),destination:Number(a.getAttribute('href')?.match(/#(\d+)$/)?.[1])});
    }
  }
  const steps=contents.slice(1).filter((r,i)=>r.page===contents[i].page).map((r,i)=>r.top-contents.filter(n=>n.page===r.page&&n.top<r.top).at(-1).top);
  return {width,height,margins,evidence:{densePages:dense.length,wideRows:wide.length},contents,contentsLineHeight:mode(steps),contentsFontSize:mode(contents.map(r=>r.size))};
}

// Preserve labels and links; page labels are generated presentation, never prose edits.
export function applyContentsPresentation({profile,language='en',mapping=[]}) {
  const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const result=[],unmatched=[],changes=[];
  if(language==='en')for(const table of document.querySelectorAll('table.pdf-toc')){
    const cells=[...table.querySelectorAll('tbody tr')].map(r=>r.cells.length===1?r.cells[0]:null);
    const entries=cells.map(cell=>cell?profile.contents.filter(r=>normalize(r.label)===normalize(cell.textContent)):[]);
    if(!cells.length||entries.some(matches=>matches.length!==1)||entries.some(([r])=>!document.getElementById('page_'+r.destination)))continue;
    const list=document.createElement('ol');list.className='source-toc';
    for(let i=0;i<cells.length;i++){
      const source=entries[i][0],li=document.createElement('li'),a=document.createElement('a');a.href='#page_'+source.destination;
      a.textContent=source.label;a.style.fontSize=(source.size*96/72)+'px';a.style.fontWeight='700';
      li.append(a);list.append(li);
    }
    const before=table.outerHTML;table.replaceWith(list);changes.push({kind:'source_contents_recovery',before,after:list.outerHTML,sourceEntries:entries.map(([r])=>r)});
  }
  for(const a of document.querySelectorAll('.source-toc a[href^="#"]')){
    const label=a.querySelector('.validatebook-toc-label')?.textContent||a.textContent;
    const matches=language==='en'?profile.contents.filter(r=>normalize(r.label)===normalize(label)):mapping.filter(r=>r.href===a.getAttribute('href'));
    if(matches.length!==1){unmatched.push(label);continue;}
    const source=matches[0],target=document.getElementById(a.getAttribute('href').slice(1));
    const destination=target?.closest('.pdf-source-page');
    const page=language==='en'?source.number:destination?String([...destination.parentElement.querySelectorAll(':scope > .pdf-source-page')].indexOf(destination)+1):null;
    if(!page){unmatched.push(label);continue;}
    if(!a.querySelector('.validatebook-toc-label')){const span=document.createElement('span');span.className='validatebook-toc-label';span.append(...a.childNodes);a.append(span);}
    a.setAttribute('data-page-label',page);a.setAttribute('data-page-label-origin',language==='en'?'pdf':'reader');
    let folio=a.querySelector('.validatebook-toc-page');if(!folio){folio=document.createElement('span');folio.className='validatebook-toc-page';a.append(folio);}folio.textContent=' '+page;
    const levels=[...new Set(profile.contents.map(r=>r.indent))].sort((a,b)=>a-b);
    a.parentElement.setAttribute('data-toc-level',String(levels.indexOf(source.indent)));
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

export function translatedPaginationCss({width,height}) {
  if(!(width>0&&height>0))throw Error('Source PDF page dimensions required');
  return '/* validateBook translated flow */\n[data-validatebook-root] > .pdf-source-page{min-height:'+height/width*100+'cqw;--validatebook-page-scale:max(1,calc(100cqw / '+width*4/3+'px));font-size:calc(1em * var(--validatebook-page-scale))}\n';
}

export function paginationCss({width,height,margins,contents=[],contentsLineHeight,contentsFontSize}) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Source PDF page dimensions required');
  const padding=margins?['top','right','bottom','left'].map(k=>(margins[k]/width*100)+'cqw').join(' '):'0';
  const toc=contents.length?`
[data-validatebook-root] .source-contents-heading{margin:0 0 .25em!important;text-align:left!important}
[data-validatebook-root] .source-toc{list-style:none;margin:0;padding:0}
[data-validatebook-root] .source-toc li{margin:0!important;line-height:${contentsLineHeight/contentsFontSize};text-indent:0}
[data-validatebook-root] .source-toc a[data-page-label]{display:flex;align-items:baseline;gap:.12em;color:inherit;text-decoration:none}
[data-validatebook-root] .source-toc .validatebook-toc-label{min-width:0;overflow-wrap:anywhere}
[data-validatebook-root] .source-toc a[data-page-label]::before{content:"";order:1;flex:1 0 .5em;align-self:baseline;border-bottom:1px dotted currentColor}
[data-validatebook-root] .source-toc a[data-page-label]::after{content:attr(data-page-label);order:2;flex:none;text-align:right;font-variant-numeric:lining-nums}
[data-validatebook-root] .source-toc a:has(.validatebook-toc-page)::after{content:none}
[data-validatebook-root] .source-toc .validatebook-toc-page{order:2;flex:none;font-variant-numeric:lining-nums}
${[...new Set(contents.map(r=>r.indent))].sort((a,b)=>a-b).map((indent,i)=>`[data-validatebook-root] .source-toc li[data-toc-level="${i}"]{padding-left:${indent/contentsFontSize}em}`).join('\n')}
`.replaceAll('[data-validatebook-root]','[data-validatebook-root][data-validatebook-root]'):'';
  return `/* validateBook source pagination */
@property --validatebook-page-scale{syntax:"<number>";inherits:true;initial-value:1}
[data-validatebook-root]:has(> .pdf-source-page){container-type:inline-size;background:var(--reader-surround,var(--standalone-surround,#e3e6e4));box-shadow:none;border-color:transparent}
[data-validatebook-root] > .pdf-source-page{container-type:inline-size;--validatebook-page-scale:max(1,calc(100cqw / ${width*4/3}px));font-size:calc(1em * var(--validatebook-page-scale));display:flow-root;box-sizing:border-box;min-height:${height/width*100}cqw;margin:0 0 32px;padding:${padding};background:var(--reader-paper,var(--standalone-paper,#fff));border:1px solid var(--reader-paper-line,var(--standalone-paper-line,#d7dcda));box-shadow:0 2px 8px #0002;break-after:page}
[data-validatebook-root] > .pdf-source-page:last-of-type{margin-bottom:0;break-after:auto}
[data-validatebook-root] > .pdf-source-page:has(figure#page_1){padding:0}
.pdf-source-page figure#page_1{margin:0}
.pdf-source-page figure#page_1 img{display:block;width:100%;height:auto;margin:0}
.pdf-source-page p[data-page-continuation]{text-indent:0!important}
[data-validatebook-root] img, [data-validatebook-root] svg, [data-validatebook-root] video{max-width:100%;height:auto}
[data-validatebook-root] .pdf-table-wrap{max-width:100%;overflow-x:auto}
[data-validatebook-root] table{max-width:100%;border-collapse:collapse}
[data-validatebook-root] th, [data-validatebook-root] td{overflow-wrap:anywhere}
${toc}
@media print{[data-validatebook-root]:has(> .pdf-source-page){width:100%;max-width:none;padding:0;border:0;background:transparent}[data-validatebook-root] > .pdf-source-page{min-height:0;margin:0;border:0;box-shadow:none;break-after:page}.pdf-source-page[data-blank-page]{min-height:90vh}}
`;
}
