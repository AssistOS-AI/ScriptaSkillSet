// Runs in the inert audit browser. Every optional break comes from a verified
// manuscript line-end join; no dictionary, word guessing or prose rewriting.
export function restoreSourceHyphenation(hints) {
  const words=new Map();
  for(const [word,offset] of hints){
    if(typeof word!=='string'||!Number.isInteger(offset)||offset<1||offset>=word.length)throw Error('Invalid source hyphenation evidence');
    if(!words.has(word))words.set(word,new Set());words.get(word).add(offset);
  }
  const root=document.querySelector('[data-reader-content],article,main,.edition-reading')||document.body;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];let node;
  while((node=walker.nextNode()))if(!node.parentElement.closest('script,style,template,noscript,code,pre'))nodes.push(node);
  let changedWords=0;
  for(const node of nodes)node.textContent=node.textContent.replace(/[\p{L}\p{M}]+(?:\u00ad[\p{L}\p{M}]+)*/gu,value=>{
    const plain=value.replaceAll('\u00ad',''),offsets=words.get(plain);
    if(!offsets)return value;
    const points=new Set(offsets);let position=0;
    for(const char of value){if(char==='\u00ad')points.add(position);else position+=char.length;}
    let result=plain;for(const offset of [...points].sort((a,b)=>b-a))result=result.slice(0,offset)+'\u00ad'+result.slice(offset);
    if(result!==value)changedWords++;return result;
  });
  return changedWords?[{kind:'source_discretionary_hyphens',words:changedWords}]:[];
}
