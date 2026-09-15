// Restore a numeric reference tail lost at a source-page boundary, only when
// both surrounding fragments match the PDF. This is not prose rewriting.
export function restoreReferenceBoundaries(pages) {
  const changes=[];
  const compact=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  for(let i=0;i<pages.length-1;i++){
    const rows=pages[i].text.split('\n').map(s=>s.trim()).filter(Boolean);
    const next=pages[i+1].text.split('\n').map(s=>s.trim()).find(Boolean);
    const number=rows.at(-1);
    if(!/^\d{1,8}\.$/.test(number)||!next||next.length<30)continue;
    const current=document.querySelector(`.pdf-source-page[data-reader-page="${pages[i].page}"]`);
    const following=document.querySelector(`.pdf-source-page[data-reader-page="${pages[i+1].page}"]`);
    if(!current||!following)continue;
    const matches=[...current.querySelectorAll('p')].filter(p=>p.textContent.trim().endsWith(next));
    if(matches.length!==1)continue;
    const p=matches[0],text=p.textContent,offset=text.lastIndexOf(next),prefix=text.slice(0,offset).trim();
    if(!prefix||!compact(rows.slice(0,-1).join(' ')).endsWith(compact(prefix)))continue;
    const before=p.outerHTML,walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node,position=0,start;
    while((node=walker.nextNode())){if(position+node.length>=offset){start={node,offset:offset-position};break;}position+=node.length;}
    if(!start)continue;
    const range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(p,p.childNodes.length);
    const restored=p.cloneNode(false);restored.removeAttribute('id');restored.append(range.extractContents());
    p.append(document.createTextNode(number));
    const anchor=following.querySelector(':scope > .pdf-page-anchor');
    if(anchor)anchor.after(restored);else following.prepend(restored);
    changes.push({kind:'source_reference_boundary',before,after:p.outerHTML+'\n'+restored.outerHTML,sourcePage:pages[i].page,restored:number,nextPage:pages[i+1].page,sourceNextLine:next});
  }
  return changes;
}

export function restoreSplitSourcePhrases(xml) {
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  const compact=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  const pages=new Map([...doc.querySelectorAll('page')].map(p=>[p.getAttribute('number'),compact([...p.querySelectorAll('text')].map(n=>n.textContent).join(' '))]));
  const changes=[];
  for(const page of document.querySelectorAll('.pdf-source-page[data-source-page]')){
    const source=pages.get(page.getAttribute('data-source-page'));
    if(!source)continue;
    const blocks=[...page.querySelectorAll(':scope > p')];
    for(let i=0;i<blocks.length-1;i++){
      const current=blocks[i],next=blocks[i+1];
      if(current.querySelector('a,img,table')||next.querySelector('a,img,table')||next.id)continue;
      const a=current.textContent.trim(),b=next.textContent.trim();
      if(a.split(/\s+/).length>12||!a||!b)continue;
      const joined=compact(a+' '+b);
      if(!joined||!source.includes(joined))continue;
      if(a.split(/\s+/).length>4&&source.includes(compact(a))&&source.includes(compact(b)))continue;
      const before=current.outerHTML+'\n'+next.outerHTML;
      current.append(document.createTextNode(' '));
      current.append(...next.childNodes);
      next.remove();
      if(compact(current.textContent)!==joined)throw Error('Split-phrase repair changed paragraph text');
      changes.push({kind:'split_source_phrase',before,after:current.outerHTML,page:page.getAttribute('data-source-page')});
      blocks.splice(i+1,1);i--;
    }
  }
  return changes;
}
