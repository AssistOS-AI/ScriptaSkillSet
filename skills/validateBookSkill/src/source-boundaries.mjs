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

// A converter can merge several vertically distinct source lines into one
// paragraph or pre block. When their exact join equals the block text, restore
// the PDF structure: lines of the same font role keep one element and receive a
// <br> at real sentence boundaries; a change of source font role splits the
// block into one element per role so each keeps its own family and size. The
// exact text is preserved in every case.
export function restoreSourceLineBreaks(xml) {
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  const compact=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  const fontInfo=Object.fromEntries([...doc.getElementsByTagName('fontspec')].map(n=>[n.getAttribute('id'),{size:Number(n.getAttribute('size')),family:n.getAttribute('family')||''}]));
  const pages=new Map(),bodySizes=new Map();
  for(const pg of doc.querySelectorAll('page')){
    const lines=[...pg.querySelectorAll('text')].map(n=>({text:n.textContent.trim(),top:Number(n.getAttribute('top')),width:Number(n.getAttribute('width')),size:fontInfo[n.getAttribute('font')]?.size||0,family:fontInfo[n.getAttribute('font')]?.family||''})).filter(l=>l.text);
    pages.set(pg.getAttribute('number'),lines);
    const counts=new Map();for(const l of lines)counts.set(l.size,(counts.get(l.size)||0)+l.text.length);
    bodySizes.set(pg.getAttribute('number'),[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||0);
  }
  const endsSentence=value=>/[.!?…]["'”’)\]]*$/.test(value.trim());
  const role=line=>line.size+'|'+line.family;
  const insertBreaks=(node,texts)=>{
    node.querySelectorAll('br').forEach(mark=>mark.remove());
    const starts=[];let offset=0;for(const value of texts){starts.push(offset);offset+=value.length+1;}
    let inserted=0;
    for(let line=1;line<texts.length;line++){
      if(!endsSentence(texts[line-1]))continue;
      const boundary=starts[line];
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let textNode,position=0,point=null;
      while((textNode=walker.nextNode())){if(position+textNode.length>=boundary){point={textNode,offset:boundary-position};break;}position+=textNode.length;}
      if(!point)break;
      const mark=document.createElement('br');
      if(point.offset<=0)point.textNode.parentNode.insertBefore(mark,point.textNode);
      else if(point.offset>=point.textNode.length)point.textNode.parentNode.insertBefore(mark,point.textNode.nextSibling);
      else point.textNode.parentNode.insertBefore(mark,point.textNode.splitText(point.offset));
      inserted++;
    }
    return inserted;
  };
  const changes=[];
  for(const page of document.querySelectorAll('.pdf-source-page[data-source-page]')){
    const pageId=page.getAttribute('data-source-page');
    const lines=pages.get(pageId);
    if(!lines)continue;
    const body=bodySizes.get(pageId)||0;
    const column=lines.filter(l=>l.size===body).reduce((max,l)=>Math.max(max,l.width),0);
    for(const block of [...page.querySelectorAll(':scope > p, :scope > pre')]){
      if(block.querySelector('a,img,table')||block.id)continue;
      const text=block.textContent.trim(),key=compact(text);if(key.length<3)continue;
      let run=null;
      for(let start=0;start<lines.length&&!run;start++){
        let acc='';
        for(let end=start;end<lines.length;end++){acc+=compact(lines[end].text);if(acc===key){run={start,end};break;}if(acc.length>key.length)break;}
      }
      if(!run)continue;
      const runLines=lines.slice(run.start,run.end+1);
      if(runLines.length<2)continue;
      if(runLines.map(l=>l.text).join(' ')!==text)continue;
      const before=block.outerHTML;
      const groups=[];for(const line of runLines){const current=groups.at(-1);if(current&&current.role===role(line))current.lines.push(line);else groups.push({role:role(line),lines:[line]});}
      const isMono=family=>/mono|courier|consol|menlo|typewriter/i.test(String(family).replace(/^[A-Z]{6}\+/,''));
      if(groups.length>1){
        const wrapper=[...block.children].length===1?block.children[0]:null;
        if(wrapper&&wrapper.tagName==='CODE'&&!wrapper.querySelector('*')){while(wrapper.firstChild)block.insertBefore(wrapper.firstChild,wrapper);wrapper.remove();}
        const simple=[...block.childNodes].every(node=>node.nodeType===3||(node.nodeType===1&&node.tagName==='BR'));
        if(simple){
          for(const group of groups){
            const texts=group.lines.map(line=>line.text);
            const mono=isMono(group.lines[0].family);
            const clone=document.createElement(mono?'pre':'p');
            for(const attr of block.attributes)if(attr.name!=='id')clone.setAttribute(attr.name,attr.value);
            if(mono){const code=document.createElement('code');code.textContent=texts.join(' ');clone.append(code);insertBreaks(code,texts);}
            else{clone.textContent=texts.join(' ');insertBreaks(clone,texts);}
            block.parentNode.insertBefore(clone,block);
          }
          block.remove();
          changes.push({kind:'source_font_runs',before,after:groups.map(group=>group.lines.map(line=>line.text).join(' ')).join(' | '),page:pageId,lines:runLines.length});
          continue;
        }
      }
      const isPre=block.tagName==='PRE';
      if(!isPre&&new Set(runLines.map(l=>l.top)).size<2)continue;
      if(column>0&&runLines.slice(0,-1).every(l=>l.width>=column*0.9))continue;
      insertBreaks(block,runLines.map(l=>l.text));
      if(block.outerHTML!==before)changes.push({kind:'source_line_breaks',before,after:block.outerHTML,page:pageId,lines:runLines.length});
    }
  }
  return changes;
}
