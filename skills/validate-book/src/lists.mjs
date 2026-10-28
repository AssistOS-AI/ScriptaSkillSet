// Browser-local, text-preserving recovery driven by the converter's PDF evidence.
export function recoverLists(groups, repair=false) {
  const normal=s=>s.normalize('NFKC').replace(/[\s\u200b\u00ad]/gu,'');
  const findings=[],changes=[];
  const before=document.body.textContent;
  function mapping(value){let text='';const offsets=[];for(let i=0;i<value.length;){const c=String.fromCodePoint(value.codePointAt(i));const n=normal(c);text+=n;for(let k=0;k<n.length;k++)offsets.push(i);i+=c.length;}offsets.push(value.length);return {text,offsets};}
  function range(node,start,end){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);const r=document.createRange();let n,offset=0,started=false;while((n=walker.nextNode())){const next=offset+n.length;if(!started&&start<=next){r.setStart(n,Math.max(0,start-offset));started=true;}if(started&&end<=next){r.setEnd(n,Math.max(0,end-offset));return r;}offset=next;}throw Error('List text range exceeds source paragraph');}
  function mark(li,item){
    if(li.querySelector(':scope > .source-list-marker'))return false;
    const marker=li.textContent.match(/^\s*(?:\d{1,3}[.)]|[•●▪])\s*/u);if(!marker)throw Error('Source list marker missing');
    const r=range(li,0,marker[0].length),span=document.createElement('span');span.className='source-list-marker';span.append(r.extractContents());r.insertNode(span);
    span.style.display='inline-block';span.style.width=((item.textLeft-item.left)*96/72)+'px';span.style.textIndent='0';span.style.fontWeight='400';return true;
  }
  for(const group of groups||[]){
    const section=document.querySelector('[data-source-page="'+group.page+'"]');if(!section){findings.push({page:group.page,kind:'source_list_unmapped'});continue;}
    const wanted=normal(group.items.map(i=>i.text).join(' '));
    const lists=[...section.querySelectorAll(group.kind)].filter(n=>normal(n.textContent)===wanted);
    if(lists.length===1&&lists[0].children.length===group.items.length){
      const list=lists[0];
      if(repair){let changed=false;[...list.children].forEach((li,i)=>{changed=mark(li,group.items[i])||changed;});if(changed)changes.push({page:group.page,kind:'source_list_marker_insets',items:group.items.length});}
      if(getComputedStyle(list).display==='none'||[...list.children].some((li,i)=>li.tagName!=='LI'||normal(li.textContent)!==normal(group.items[i].text)||getComputedStyle(li).display!=='list-item'||Math.abs(parseFloat(getComputedStyle(li).fontSize)-group.items[i].size*96/72)>.15||Math.abs(parseFloat(getComputedStyle(li).lineHeight)-group.items[i].leading*96/72)>.15||Math.abs(parseFloat(getComputedStyle(li).marginLeft)-(group.items[i].textLeft-group.bodyLeft)*96/72)>.15||Math.abs(parseFloat(getComputedStyle(li).textIndent)-(group.items[i].left-group.items[i].textLeft)*96/72)>.15||!li.querySelector(':scope > .source-list-marker')))findings.push({page:group.page,kind:'source_list_display_difference'});
      continue;
    }
    const candidates=[...section.querySelectorAll('p')].filter(n=>!n.closest('li,td,th')&&(()=>{const t=normal(n.textContent);return t.includes(wanted)&&t.indexOf(wanted)===t.lastIndexOf(wanted);})());
    if(candidates.length!==1){findings.push({page:group.page,kind:'source_list_unmapped'});continue;}
    if(!repair){findings.push({page:group.page,kind:'source_list_flattened',items:group.items.length});continue;}
    const p=candidates[0],value=p.textContent,m=mapping(value),start=m.text.indexOf(wanted),points=[m.offsets[start]];let consumed=start;
    for(const item of group.items){consumed+=normal(item.text).length;points.push(m.offsets[consumed]);}
    const clone=(a,b)=>{const n=p.cloneNode(false);n.removeAttribute('id');n.append(range(p,a,b).cloneContents());return n;};
    const list=document.createElement(group.kind);list.className='source-list';if(group.start)list.start=group.start;
    const style=getComputedStyle(p);list.style.cssText='list-style-type:none;padding:0;margin:0;';
    list.style.marginTop=style.marginTop;list.style.marginBottom=style.marginBottom;
    for(let k=0;k<group.items.length;k++){
      const item=group.items[k],li=document.createElement('li');if(item.number)li.value=item.number;
      li.append(...clone(points[k],points[k+1]).childNodes);
      li.style.fontFamily=style.fontFamily;li.style.fontSize=(item.size*96/72)+'px';li.style.fontWeight='400';li.style.lineHeight=String(item.leading/item.size);
      li.style.display='list-item';li.style.listStyleType='none';li.style.margin='0';li.style.padding='0';li.style.textAlign='left';
      li.style.marginLeft=((item.textLeft-group.bodyLeft)/item.size)+'em';li.style.textIndent=((item.left-item.textLeft)/item.size)+'em';li.style.marginBottom=(item.gap/item.size)+'em';
      if(item.boldLabel){const label=mapping(li.textContent),at=label.text.indexOf(normal(item.boldLabel));if(at>=0){const r=range(li,label.offsets[at],label.offsets[at+normal(item.boldLabel).length-1]+String.fromCodePoint(li.textContent.codePointAt(label.offsets[at+normal(item.boldLabel).length-1])).length),strong=document.createElement('strong');strong.append(r.extractContents());r.insertNode(strong);}}
      list.append(li);
      mark(li,item);
    }
    const prefix=clone(0,points[0]),suffix=clone(points.at(-1),value.length),parts=[];
    if(prefix.textContent)parts.push(prefix);parts.push(list);if(suffix.textContent)parts.push(suffix);
    if(p.id)parts[0].id=p.id;
    p.replaceWith(...parts);changes.push({page:group.page,kind:'source_list_recovered',items:group.items.length,start:group.start});
  }
  if(document.body.textContent!==before)throw Error('List recovery changed text');
  return {findings,changes};
}
