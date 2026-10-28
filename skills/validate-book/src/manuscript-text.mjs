import { issue } from './layout-checks.mjs';

// Independent manuscript comparison. Typography matching may ignore punctuation;
// manuscript acceptance deliberately does not use that approximate matcher.
export const manuscriptTokens = value => String(value).normalize('NFC')
  .replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/gu, value => ({ﬀ:'ff',ﬁ:'fi',ﬂ:'fl',ﬃ:'ffi',ﬄ:'ffl',ﬅ:'st',ﬆ:'st'})[value])
  .replaceAll('\u00ad','').match(/[\p{L}\p{M}\p{N}_]+|[^\s]/gu) ?? [];
const key = value => manuscriptTokens(value).join('\0');

export function manuscriptEvidence(pages) {
  const headers=new Map();
  for(const page of pages) {
    const seen=new Set(page.blocks.flatMap(block=>block.lines).filter(line=>line.top<page.height*.06).map(line=>key(line.text)));
    for(const value of seen)headers.set(value,(headers.get(value)||0)+1);
  }
  const lines=[];
  for(const page of pages)for(const [blockIndex,block] of page.blocks.entries())for(const line of block.lines) {
    const value=line.text.trim();
    // Printed folios are running matter only at a physical page edge. A number
    // in a paragraph, table or list is still manuscript content.
    if (/^\d{1,4}$/u.test(value) && (line.top<page.height*.06 || line.bottom>page.height*.88))continue;
    if (line.top<page.height*.06 && headers.get(key(value))>=3)continue;
    lines.push({...line,page:page.page,pageHeight:page.height,blockIndex});
  }
  const spellings=new Set(), compounds=new Set();
  for(const line of lines)for(const value of line.text.match(/[\p{L}\p{M}]+(?:[-‐‑][\p{L}\p{M}]+)*/gu)??[]) {
    if(/[-‐‑]/u.test(value)){
      compounds.add(value.replace(/[-‐‑]/gu,''));
      for(const component of value.split(/[-‐‑]/u))spellings.add(component);
    }else spellings.add(value);
  }
  const tokens=[], joins=new Map(), locations=[];
  for(let index=0;index<lines.length;index++) {
    const line=lines[index],next=lines[index+1], current=manuscriptTokens(line.text);
    const left=current.at(-2), hyphen=current.at(-1), right=next&&manuscriptTokens(next.text)[0];
    const size=line.bottom-line.top, nextSize=next?next.bottom-next.top:0;
    const sameColumn=next&&Math.abs(line.left-next.left)<size;
    const sameParagraph=next&&line.page===next.page&&next.top>line.top&&next.top-line.bottom<size*.8;
    const acrossPage=next&&next.page===line.page+1&&line.bottom>line.pageHeight*.75&&next.top<next.pageHeight*.25;
    if (/^[\p{L}\p{M}]+$/u.test(left??'') && /^[\p{L}\p{M}]+$/u.test(right??'') && ['-','‐'].includes(hyphen)
      && size>0 && Math.abs(nextSize-size)<size*.15 && sameColumn && (sameParagraph||acrossPage)
      && spellings.has(left+right) && !compounds.has(left+right)) joins.set(tokens.length+current.length-2,left+right);
    tokens.push(...current);locations.push(...current.map(()=>({page:line.page,line:index+1})));
  }
  return {tokens,joins,locations};
}

export function compareManuscriptText(evidence, document, language='en') {
  if(typeof document.manuscriptText!=='string')return [issue(language,'source_text_unchecked','document','Independent manuscript text measurement is missing.')];
  const expected=evidence.tokens, actual=manuscriptTokens(document.manuscriptText);
  let source=0,target=0;
  while(source<expected.length&&target<actual.length) {
    if(expected[source]===actual[target]) {source++;target++;continue;}
    if(evidence.joins.get(source)===actual[target]) {source+=3;target++;continue;}
    break;
  }
  if(source===expected.length&&target===actual.length)return [];
  const location=evidence.locations[source]??evidence.locations.at(-1);
  return [issue(language,'source_text_mismatch',location?'page '+location.page:'document',
    'HTML text differs from the manuscript in wording, punctuation, capitalization or reading order.',
    {page:location?.page,sourceToken:source,htmlToken:target,expected:expected.slice(Math.max(0,source-8),source+16).join(' '),actual:actual.slice(Math.max(0,target-8),target+16).join(' ')})];
}

// Runs inside the validator's inert Chromium document. Inline markup never
// inserts spaces inside words; only semantic block boundaries separate text.
export function inspectManuscriptText() {
  const root=document.querySelector('[data-reader-content], article, main, .edition-reading')||document.body;
  function visit(node) {
    if(node.nodeType===Node.TEXT_NODE)return node.textContent;
    if(node.nodeType!==Node.ELEMENT_NODE||node.matches('script,style,template,noscript,button,[data-reader-controls],[data-conversion-notice]'))return '';
    if(/^\d{1,4}$/.test(node.textContent.trim())&&node.matches('p,footer,[role="doc-pagebreak"]')) {
      const page=node.closest('[data-source-page],[data-reader-page]');
      if(page){const box=page.getBoundingClientRect(),r=node.getBoundingClientRect();if(r.top<box.top+box.height*.06||r.bottom>box.top+box.height*.88)return '';}
    }
    const value=[...node.childNodes].map(visit).join('');
    return /^(P|H[1-6]|SECTION|ARTICLE|DIV|LI|TABLE|TR|TD|TH|CAPTION|FIGCAPTION|BR|HR)$/.test(node.tagName)?' '+value+' ':value;
  }
  return visit(root);
}
