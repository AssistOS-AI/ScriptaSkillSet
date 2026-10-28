import { setStyle } from './dom.mjs';

export function sourceLists(evidence) {
  const result=[];
  const marker=s=>s.replace(/[\u200b\u00ad]/gu,'').match(/^\s*(?:(\d{1,3})[.)]|([•●▪]))\s+/u);
  for(const page of evidence.pages){
    const lines=page.lines.filter(l=>l.top>page.height_pt*.07&&l.bottom<page.height_pt*.94);
    // A contents page uses chapter numerals as navigation, not a semantic list.
    if(lines.some(line=>/^contents$/iu.test(line.text.trim())||/^table of contents$/iu.test(line.text.trim())))continue;
    for(let i=0;i<lines.length;i++){
      const first=marker(lines[i].text);if(!first)continue;
      const items=[],left=lines[i].x0,size=lines[i].size_pt;let j=i;
      while(j<lines.length){
        const m=marker(lines[j].text);if(!m||!!m[1]!==!!first[1]||Math.abs(lines[j].x0-left)>2||(m[1]&&Number(m[1])!==Number(first[1])+items.length))break;
        const start=lines[j],used=[start];j++;
        while(j<lines.length&&!marker(lines[j].text)&&lines[j].x0>left+size*.5&&Math.abs(lines[j].size_pt-size)<.3&&lines[j].top-used.at(-1).top<size*2){used.push(lines[j++]);}
        const words=page.words.filter(w=>Math.abs(w.top-start.top)<1&&w.x0>left+size*.7);
        const textLeft=words[0]?.x0||used[1]?.x0;if(!textLeft)break;
        const gaps=used.slice(1).map((l,k)=>l.top-used[k].top);
        const leading=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:size*1.4;
        const gap=lines[j]?Math.max(0,Math.min(size,lines[j].top-used.at(-1).top-leading)):size*.3;
        items.push({text:used.map(l=>l.text).join(' '),number:m[1]?Number(m[1]):null,marker:m[0].trim(),size,leading,gap,left,textLeft,
          boldLabel:words.slice(0,words.findIndex(w=>!w.bold)<0?words.length:words.findIndex(w=>!w.bold)).map(w=>w.text).join(' ')});
        if(j<lines.length&&lines[j].top-used.at(-1).top>size*2.5)break;
      }
      if(items.length>=2 && !items.every(item=>/\s\d+$/.test(item.text))){result.push({page:page.page_number,kind:first[1]?'ol':'ul',start:first[1]?Number(first[1]):null,bodyLeft:Math.min(...lines.map(l=>l.x0)),items});i=j-1;}
    }
  }
  return result;
}

const normalized=s=>s.normalize('NFKC').replace(/[\s\u200b\u00ad]/gu,'');
export function recoverSourceLists($,section,groups,bodySize){
  for(const group of groups){
    const wanted=normalized(group.items.map(i=>i.text).join(' '));
    const matches=$(section).find('p').toArray().filter(p=>!$(p).closest('li,td,th').length).filter(p=>{const s=normalized($(p).text());return s.includes(wanted)&&s.indexOf(wanted)===s.lastIndexOf(wanted);});
    if(matches.length!==1)continue;
    const p=matches[0],value=$(p).text(),map=[];let compact='';
    for(let i=0;i<value.length;){const c=String.fromCodePoint(value.codePointAt(i)),n=normalized(c);compact+=n;for(let k=0;k<n.length;k++)map.push(i);i+=c.length;}map.push(value.length);
    const start=compact.indexOf(wanted),points=[map[start]];let offset=start;
    for(const item of group.items){offset+=normalized(item.text).length;points.push(map[offset]);}
    const slice=(a,b)=>{const clone=$(p).clone();let position=0;const visit=n=>{if(n.type==='text'){const end=position+n.data.length;n.data=n.data.slice(Math.max(0,a-position),Math.max(0,b-position));position=end;}else for(const child of n.children||[])visit(child);};visit(clone[0]);clone.removeAttr('id');return clone;};
    const list=$(`<${group.kind}></${group.kind}>`).addClass('source-list');if(group.start)list.attr('start',String(group.start));
    setStyle(list[0],'list-style','none');setStyle(list[0],'padding','0');setStyle(list[0],'margin','0');
    for(let k=0;k<group.items.length;k++){
      const item=group.items[k],li=$('<li></li>'),marker=value.slice(points[k],points[k+1]).match(/^\s*(?:\d{1,3}[.)]|[•●▪])\s*/u);
      if(!marker)throw Error('Aligned list marker missing');
      const span=$('<span class="source-list-marker"></span>').append(slice(points[k],points[k]+marker[0].length).contents());
      setStyle(span[0],'display','inline-block');setStyle(span[0],'width',`${(item.textLeft-item.left)/item.size}em`);setStyle(span[0],'text-indent','0');
      li.append(span,slice(points[k]+marker[0].length,points[k+1]).contents());if(item.number)li.attr('value',String(item.number));
      setStyle(li[0],'font-size',`calc(var(--pdf-reader-size) * ${(item.size/bodySize).toFixed(6)})`);setStyle(li[0],'line-height',String(item.leading/item.size));
      setStyle(li[0],'margin-left',`${(item.textLeft-group.bodyLeft)/item.size}em`);setStyle(li[0],'text-indent',`${(item.left-item.textLeft)/item.size}em`);setStyle(li[0],'margin-bottom',`${item.gap/item.size}em`);list.append(li);
    }
    const before=slice(0,points[0]),after=slice(points.at(-1),value.length),replacement=[];
    if(before.text())replacement.push(before[0]);replacement.push(list[0]);if(after.text())replacement.push(after[0]);
    if(p.attribs.id)$(replacement[0]).attr('id',p.attribs.id);
    $(p).replaceWith(replacement);
  }
}
