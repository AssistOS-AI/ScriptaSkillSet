import {familyKey,pointsToCssPixels,pageScale} from './typography.mjs';
import {issue} from './layout-checks.mjs';

const role=r=>r.tag+'|'+String(r.classes||'').split(/\s+/).filter(Boolean).sort().join(' ');
const compact=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
// Match presentation roles, never translated words or English page numbers.
export function translationStyles(master,profile,sourceFontMap={}) {
  const groups=new Map();
  const contexts={};
  for(const record of master.records.filter(r=>r.roleContext&&/^(p|h[1-6]|figcaption)$/.test(r.tag))){
    const key=record.roleContext+'|'+record.tag;(contexts[key]??=[]).push({selector:record.selector});
  }
  for(const mapping of master.typography.mappings){
    const record=master.records.find(r=>r.selector===mapping.selector);if(!record)continue;
    const families=[...new Set(mapping.sourceFamilies.map(familyKey))];
    if(families.length!==1||!sourceFontMap[families[0]])continue;
    const value={sizePt:mapping.fontSizePt,family:sourceFontMap[families[0]],weight:record.font.weight,style:record.font.style,align:record.style.textAlign,
      leading:mapping.fontSizePt===profile.bodyPt?profile.leadingCssPx/profile.bodyCssPx:parseFloat(record.style.lineHeight)/parseFloat(record.font.size),gap:mapping.paragraphGapCssPx===undefined?null:mapping.paragraphGapCssPx/pointsToCssPixels(mapping.fontSizePt)};
    const key=role(record),entries=groups.get(key)||[];entries.push(value);groups.set(key,entries);
    if(record.roleContext){const entry=contexts[record.roleContext+'|'+record.tag]?.find(x=>x.selector===record.selector);if(entry)entry.value=value;}
  }
  const result={$contexts:contexts};
  const title=(master.displayProfiles||[]).filter(p=>compact(p.groups[0]?.text)===compact(master.title));
  if(title.length===1&&title[0].groups.every(g=>sourceFontMap[familyKey(g.family)]))result.$title=title[0].groups.map(g=>({sizePt:g.size,family:sourceFontMap[familyKey(g.family)],weight:g.bold?'700':'400',style:g.italic?'italic':'normal',align:g.align||'center',leading:g.leading/g.size,gap:0}));
  for(const [key,entries] of groups){
    // A missing paragraph-gap measurement is unknown, not a competing style.
    // Fill it only when the measured members of this role agree.
    const gaps=[...new Set(entries.filter(v=>v.gap!==null).map(v=>v.gap))];
    if(gaps.length===1)for(const value of entries)if(value.gap===null)value.gap=gaps[0];
    const variants=new Map();
    for(const value of entries){const signature=JSON.stringify(value);const hit=variants.get(signature)||{value,count:0};hit.count++;variants.set(signature,hit);}
    const ordered=[...variants.values()].sort((a,b)=>b.count-a.count);
    // Mixed roles stay explicit; an arbitrary paragraph cannot certify them.
    if(ordered[0].count/entries.length>=.8)result[key]=ordered[0].value;
  }
  return result;
}

export function translatedStyleCheck(document,styles,profile,language,defaultSizePx) {
  const actions=[],findings=[];
  const records=document.records.filter(r=>/^(p|h[1-6]|figcaption)$/.test(r.tag)&&r.text.trim());
  const title=records.filter(r=>/^h[1-6]$/.test(r.tag)&&compact(r.text)===compact(document.title));
  const titleGroup=title.length===1&&title[0].roleContext?records.filter(r=>r.roleContext===title[0].roleContext):[];
  for(const r of records){
    const key=r.roleContext+'|'+r.tag,source=styles.$contexts?.[key];
    const peers=r.roleContext?records.filter(x=>x.roleContext===r.roleContext&&x.tag===r.tag):[];
    const contextual=source?.length===peers.length?source?.[peers.indexOf(r)]?.value:null;
    const display=styles.$title?.length===titleGroup.length?styles.$title[titleGroup.indexOf(r)]:null;
    const expected=display||contextual||styles[role(r)];
    if(!expected){findings.push(issue(language,'translation_style_unmapped',r.selector,'No unambiguous source presentation role; translated prose is preserved.'));continue;}
    const size=pointsToCssPixels(expected.sizePt),scale=pageScale(r,profile.pages[0].width);
    const properties={'font-size':`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${size/defaultSizePx})`,'font-family':expected.family,'font-weight':expected.weight,'font-style':expected.style};
    // Preserve centered display roles, but never reintroduce stretched prose
    // justification after the native spacing handler has repaired it.
    if(expected.align!=='justify')properties['text-align']=expected.align;
    if(Number.isFinite(expected.leading))properties['line-height']=String(expected.leading);
    if(expected.gap!==null)properties['margin-bottom']=expected.gap+'em';
    const family=expected.family.split(',')[0].replace(/["']/g,'').trim();
    if(Math.abs(parseFloat(r.font.size)-size*scale)>1||!r.font.family.includes(family)||Number.isFinite(expected.leading)&&Math.abs(parseFloat(r.style.lineHeight)-size*scale*expected.leading)>1||expected.gap!==null&&Math.abs(r.style.marginBottom-size*scale*expected.gap)>1){
      actions.push({kind:'presentation',selector:r.selector,properties});
      findings.push(issue(language,'translation_style_difference',r.selector,'Translated paragraph differs from its source presentation role.',{expected,actual:r.font,width:document.width}));
    }
  }
  return {actions,findings};
}

const pxRatio=(value,defaultSizePx)=> {
  const n=parseFloat(value);
  return Number.isFinite(n)&&defaultSizePx>0?n/defaultSizePx:null;
};

const recordScale=record=>{
  const value=Number(record?.pageScale);
  return Number.isFinite(value)&&value>0?value:1;
};

const unscaledPx=(value,record)=>{
  const n=parseFloat(value);
  return Number.isFinite(n)?n/recordScale(record):NaN;
};

const canonicalProperties=(source,defaultSizePx)=>{
  const size=unscaledPx(source.font.size,source);
  const sizeRatio=pxRatio(size,defaultSizePx);
  const leading=unscaledPx(source.style.lineHeight,source);
  const marginBottom=unscaledPx(source.style.marginBottom,source);
  const marginTop=unscaledPx(source.style.marginTop,source);
  const properties={};
  if(sizeRatio!==null)properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${sizeRatio})`;
  for(const [key,value] of [['font-family',source.font.family],['font-weight',source.font.weight],['font-style',source.font.style],['text-align',source.style.textAlign],['color',source.style.color]])if(value)properties[key]=value;
  if(Number.isFinite(size)&&Number.isFinite(leading)&&size>0)properties['line-height']=String(leading/size);
  if(Number.isFinite(size)&&Number.isFinite(marginBottom))properties['margin-bottom']=(marginBottom/size)+'em';
  if(Number.isFinite(size)&&Number.isFinite(marginTop))properties['margin-top']=(marginTop/size)+'em';
  return properties;
};

const canonicalDifference=(source,target)=>{
  const size=unscaledPx(source.font.size,source);
  const targetSize=unscaledPx(target.font.size,target);
  if(Number.isFinite(size)&&Number.isFinite(targetSize)&&Math.abs(size-targetSize)>1)return true;
  const expectedFamily=String(source.font.family||'').split(',')[0].replace(/["']/g,'').trim();
  if(expectedFamily&&!String(target.font.family||'').includes(expectedFamily))return true;
  if(source.font.weight&&target.font.weight&&String(source.font.weight)!==String(target.font.weight))return true;
  if(source.font.style&&target.font.style&&String(source.font.style)!==String(target.font.style))return true;
  if(source.style.textAlign&&target.style.textAlign&&String(source.style.textAlign)!==String(target.style.textAlign))return true;
  if(source.style.color&&target.style.color&&String(source.style.color)!==String(target.style.color))return true;
  const leading=unscaledPx(source.style.lineHeight,source),targetLeading=unscaledPx(target.style.lineHeight,target);
  if(Number.isFinite(size)&&Number.isFinite(targetSize)&&Number.isFinite(leading)&&Number.isFinite(targetLeading)&&size>0&&Math.abs(targetLeading-targetSize*leading/size)>1)return true;
  for(const key of ['marginBottom','marginTop']){
    const expected=unscaledPx(source.style[key],source),actual=unscaledPx(target.style[key],target);
    if(Number.isFinite(size)&&Number.isFinite(targetSize)&&Number.isFinite(expected)&&Number.isFinite(actual)&&Math.abs(actual-targetSize*expected/size)>1)return true;
  }
  return false;
};

export function canonicalTranslationActions(master,document,language,defaultSizePx) {
  if(!master||language==='en')return {actions:[],findings:[]};
  const actions=[],findings=[];
  const eligible=r=>/^(p|h[1-6]|li|figcaption)$/.test(r.tag)&&r.text.trim();
  const byPage=records=>{
    const pages=new Map();
    for(const r of records.filter(eligible)){
      const page=Number(r.page||r.selector?.match(/#page_(\d+)/)?.[1]);
      if(!Number.isInteger(page))continue;
      const list=pages.get(page)||[];list.push(r);pages.set(page,list);
    }
    return pages;
  };
  const sourcePages=byPage(master.records),targetPages=byPage(document.records);
  for(const [page,source] of sourcePages){
    const target=targetPages.get(page);
    if(!target)continue;
    const limit=Math.min(source.length,target.length);
    for(let i=0;i<limit;i++){
      const s=source[i],t=target[i];
      if(s.tag!==t.tag&&/^h[1-6]$/.test(t.tag)&&s.tag==='p'&&t.selector.startsWith('#'))actions.push({kind:'tag',selector:t.selector,expectedTag:t.tag,tag:'p',safeTranslationStyle:true});
      actions.push({kind:'presentation',selector:t.selector,properties:canonicalProperties(s,defaultSizePx),safeTranslationStyle:true});
    }
    if(target.length!==source.length)findings.push(issue(language,'translation_block_count_difference','page '+page,'Translation page has a different number of text blocks than the English canonical layout; text is preserved but layout correspondence is incomplete.',{englishBlocks:source.length,translationBlocks:target.length}));
  }
  return {actions,findings};
}
