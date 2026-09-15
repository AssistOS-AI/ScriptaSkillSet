// Source geometry must prove continuity on both sides before merging a heading.
export function repairFalseHeadings(xml,repair=true) {
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  const compact=s=>s.normalize('NFKC').replace(/\s+/gu,'');
  const fonts=new Map([...doc.querySelectorAll('fontspec')].map(n=>[n.getAttribute('id'),Number(n.getAttribute('size'))]));
  const pages=new Map([...doc.querySelectorAll('page')].map(p=>[p.getAttribute('number'),[...p.querySelectorAll('text')].map(n=>({text:n.textContent.trim(),top:Number(n.getAttribute('top')),left:Number(n.getAttribute('left')),size:fonts.get(n.getAttribute('font')),bold:!!n.querySelector('b')})).filter(l=>l.text)]));
  const changes=[];
  for(const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6')){
    const previous=heading.previousElementSibling,next=heading.nextElementSibling;
    if(previous?.tagName!=='P'||next?.tagName!=='P'||heading.hasAttribute('data-source-display-group'))continue;
    const page=heading.closest('.pdf-source-page')?.getAttribute('data-reader-page'),lines=pages.get(page);
    if(!lines)continue;
    const candidates=lines.map((line,i)=>compact(line.text)===compact(heading.textContent)?i:-1).filter(i=>i>0);
    if(candidates.length!==1)continue;
    const index=candidates[0],line=lines[index],a=lines[index-1],b=lines[index+1],endsPage=!b;
    if(line.bold||a.size!==line.size||(!endsPage&&b.size!==line.size)||line.top-a.top<line.size*.9||line.top-a.top>line.size*1.8||(!endsPage&&(b.top-line.top<line.size*.9||b.top-line.top>line.size*1.8||Math.abs(line.left-b.left)>1)))continue;
    if(!compact(previous.textContent).endsWith(compact(a.text))||(!endsPage&&!compact(next.textContent).startsWith(compact(b.text))))continue;
    const combined=compact(previous.textContent+heading.textContent+(endsPage?'':next.textContent));
    if(!compact(lines.map(l=>l.text).join(' ')).includes(compact(previous.textContent+heading.textContent)))continue;
    const before=[previous,heading,next].map(n=>n.outerHTML).join('\n');
    if(!repair){changes.push({page,sourceLine:line.text,detail:'A plain source line inside a continuous paragraph is incorrectly marked as a heading.'});continue;}
    for(const node of endsPage?[heading]:[heading,next]){
      previous.append(document.createTextNode(' '));
      if(node.id){const anchor=document.createElement('span');anchor.id=node.id;previous.append(anchor);}
      if(node===heading)for(const emphasis of node.querySelectorAll('b,strong'))emphasis.replaceWith(...emphasis.childNodes);
      previous.append(...node.childNodes);node.remove();
    }
    if(compact(previous.textContent)!==combined)throw Error('False-heading repair changed paragraph text');
    changes.push({kind:'false_heading_in_paragraph',page,before,after:previous.outerHTML,sourceLine:line,previousSourceLine:a,nextSourceLine:b});
  }
  return changes;
}
