import {familyKey,pointsToCssPixels,pageScale} from './typography.mjs';
import {issue,alignTranslationBlocks,sentenceCount,sentenceUnits} from './layout-checks.mjs';

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
    const properties={'font-size':`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${size/defaultSizePx} * var(--validatebook-page-scale, 1))`,'font-family':expected.family,'font-weight':expected.weight,'font-style':expected.style};
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

// The PDF subset faces only cover the English glyph set. For a translated
// edition keep the fallback faces (full language coverage) as the primary
// family so diacritics do not fall back glyph-by-glyph into mixed fonts.
export const glyphSafeFamily=family=>{const parts=String(family||'').split(',').map(part=>part.trim()).filter(Boolean);return parts.length>1?parts.slice(1).join(', '):(family||'');};

const canonicalProperties=(source,defaultSizePx)=>{
  const size=unscaledPx(source.font.size,source);
  const sizeRatio=pxRatio(size,defaultSizePx);
  const leading=unscaledPx(source.style.lineHeight,source);
  const marginBottom=unscaledPx(source.style.marginBottom,source);
  const marginTop=unscaledPx(source.style.marginTop,source);
  const properties={};
  if(sizeRatio!==null)properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${sizeRatio} * var(--validatebook-page-scale, 1))`;
  for(const [key,value] of [['font-family',source.font.family],['font-weight',source.font.weight],['font-style',source.font.style],['text-align',source.style.textAlign],['color',source.style.color]])if(value)properties[key]=value;
  if(properties['font-family'])properties['font-family']=glyphSafeFamily(properties['font-family']);
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

const rewriteSelectorTag=(selector,tag)=>{
  const parts=String(selector).split(' > ');
  const last=parts[parts.length-1];
  if(!last||/^#/.test(last))return selector;
  parts[parts.length-1]=last.replace(/^[a-zA-Z][a-zA-Z0-9]*/,tag);
  return parts.join(' > ');
};

export function canonicalTranslationActions(master,document,language,defaultSizePx,verifiedAlignment=null) {  if(!master||language==='en')return {actions:[],findings:[]};
  const actions=[],findings=[];
  const alignment=verifiedAlignment||alignTranslationBlocks(master,document,language);
  for(const pair of alignment.matches){
    const s=pair.source||master.records.find(record=>record.selector===pair.sourceSelector||record.selector===pair.source),targets=pair.targets||[pair.target||document.records.find(record=>record.selector===pair.targetSelector||record.selector===pair.target)];
    if(!s||sentenceCount(s.text,'en')!==targets.reduce((sum,target)=>sum+sentenceCount(target?.text,language),0))continue;
    for(const t of targets){
      if(!t)continue;
      const properties=canonicalProperties(s,defaultSizePx);
      let selector=t.selector;
      // The translated edition must carry the English block roles: headings keep
      // their level and short label paragraphs become headings, so the layout
      // maps to the same display styles as the source edition.
      if(s.tag!==t.tag){
        const promoteToHeading=/^h[1-6]$/.test(s.tag)&&(/^h[1-6]$/.test(t.tag)||(t.tag==='p'&&t.text.length<=80));
        const demoteToParagraph=/^h[1-6]$/.test(t.tag)&&s.tag==='p';
        if(promoteToHeading||demoteToParagraph){
          const tag=promoteToHeading?s.tag:'p';
          actions.push({kind:'tag',selector:t.selector,expectedTag:t.tag,tag,safeTranslationStyle:true});
          selector=rewriteSelectorTag(t.selector,tag);
        }
      }
      actions.push({kind:'presentation',selector,properties,safeTranslationStyle:true});
    }
  }
  for(const page of alignment.ambiguousPages||[])findings.push(issue(language,'translation_alignment_ambiguous','page '+page.page,'Translation layout is not propagated because block alignment is ambiguous.',page));
  // Pages that did not fully reconcile still inherit the canonical English
  // presentation by pairing same-tag blocks in order, so translated text never
  // keeps a divergent font size/family/spacing from the source edition.
  const styled=new Set(alignment.matches.flatMap(pair=>pair.targets||[pair.target]).filter(Boolean).map(target=>target.selector));
  for(const page of alignment.mismatchedPages||[]){
    const sources=page.englishRecords||[],targets=page.translationRecords||[];
    let sourceIndex=0;
    for(const target of targets){
      if(styled.has(target.selector))continue;
      if(!/^(p|h[1-6]|li|blockquote|figcaption)$/.test(target.tag)||!target.text?.trim())continue;
      let source=null;
      for(let index=sourceIndex;index<sources.length;index++)if(sources[index].tag===target.tag){source=sources[index];sourceIndex=index+1;break;}
      if(!source)for(const candidate of sources)if(candidate.tag===target.tag){source=candidate;break;}
      if(!source)continue;
      actions.push({kind:'presentation',selector:target.selector,properties:canonicalProperties(source,defaultSizePx),safeTranslationStyle:true});
      styled.add(target.selector);
    }
  }
  // Sentence-count reconciliation is intentionally not applied: merging or
  // splitting sentences rewrites punctuation and casing, and a translation's
  // prose is immutable. Page anchors and heading levels provide the structural
  // mapping without touching the translated text.
  // Finally align every heading level to the English master, chapter by chapter.
  // Tag changes run after presentation, so applied styles and selectors stay
  // valid; the replacement copies attributes and children unchanged.
  const tagged=new Set(actions.filter(action=>action.kind==='tag').map(action=>action.selector));
  const headingSegments=records=>{const out=[];let current=[];for(const record of records){if(!/^h[1-6]$/.test(record.tag))continue;if(record.tag==='h1'){if(current.length)out.push(current);current=[record];}else current.push(record);}if(current.length)out.push(current);return out;};
  const masterSegments=headingSegments(master.records),targetSegments=headingSegments(document.records);
  for(let s=0;s<Math.min(masterSegments.length,targetSegments.length);s++){
    const source=masterSegments[s],target=targetSegments[s];
    for(let i=0;i<Math.min(source.length,target.length);i++){
      const s0=source[i],t0=target[i];
      if(s0.tag!==t0.tag&&!tagged.has(t0.selector))actions.push({kind:'tag',selector:t0.selector,expectedTag:t0.tag,tag:s0.tag,safeTranslationStyle:true});
    }
  }
  return {actions,findings};
}

const translationRuns=alignment=>{
  const groups=[];
  for(const op of alignment?.operations||[]){
    if(op.kind==='match'||op.kind==='split'||op.kind==='merge'){
      const sources=op.sources||[op.source],targetBlocks=op.targets||[op.target];
      groups.push({sources,targetBlocks,reflowable:sources.every(item=>item.tag==='p')&&targetBlocks.length>0&&targetBlocks.every(item=>item.tag==='p')});
    }else groups.push({sources:op.source?[op.source]:[],targetBlocks:op.target?[op.target]:[],reflowable:false});
  }
  const runs=[];let run=[],runPage=null;
  for(const group of groups){
    if(!group.reflowable){if(run.length)runs.push(run);run=[];runPage=null;continue;}
    const page=(group.targetBlocks[0]||group.sources[0])?.page??null;
    if(run.length&&String(page)!==String(runPage)){runs.push(run);run=[];}
    runPage=page;run.push(group);
  }
  if(run.length)runs.push(run);
  return runs;
};

// Grouping-only runs (sentence counts already match) are fixed by moving whole
// paragraph nodes, so inline links and emphasis survive untouched.
export function paragraphGroupPlan(alignment,language){
  const plan=[];
  for(const run of translationRuns(alignment)){
    const sourceCounts=run.flatMap(group=>group.sources.map(source=>sentenceUnits(source.text,'en').length));
    const targets=run.flatMap(group=>group.targetBlocks.map(target=>({selector:target.selector,units:sentenceUnits(target.text,language).length})));
    const sourceTotal=sourceCounts.reduce((sum,count)=>sum+count,0),targetTotal=targets.reduce((sum,item)=>sum+item.units,0);
    if(!sourceTotal||sourceTotal!==targetTotal)continue;
    const merges=[];let index=0,valid=true;
    for(const count of sourceCounts){
      let sum=0;const group=[];
      while(sum<count&&index<targets.length){sum+=targets[index].units;group.push(targets[index]);index++;}
      if(sum!==count){valid=false;break;}
      if(group.length>1)merges.push({keep:group[0].selector,remove:group.slice(1).map(item=>item.selector)});
    }
    if(!valid||index!==targets.length)continue;
    plan.push(...merges);
  }
  return plan;
}

const upperFirst=value=>String(value).replace(/(\p{L})/u,letter=>letter.toUpperCase());
const lowerFirst=value=>String(value).replace(/(\p{L})/u,letter=>letter.toLowerCase());

// Joining two translated sentences keeps every word; only the boundary
// punctuation/case changes so the paragraph reaches the canonical count.
export function mergeSentenceUnits(left,right){
  const head=String(left).replace(/\s*[.!?…]+\s*["»'’)\]]*$/u,'').trim();
  return head+', '+lowerFirst(String(right).trim());
}

export function splitSentenceUnit(unit){
  const value=String(unit).trim();
  const matches=[...value.matchAll(/[,;:]\s+/gu)];
  if(matches.length){
    const boundary=matches[Math.floor(matches.length/2)];
    const cut=boundary.index+boundary[0].length;
    const head=value.slice(0,boundary.index).trim();
    const tail=value.slice(cut).trim();
    if(head&&tail)return [head+'.',upperFirst(tail)];
  }
  // No internal punctuation: split at the word boundary closest to the middle.
  // Never split a short sentence: fragments must stay whole phrases so a
  // sentence-count reflow can never reduce prose to single words.
  const words=value.split(/\s+/);
  if(words.length<8)return null;
  let best=-1,bestDifference=Infinity;
  for(let index=3;index<=words.length-3;index++){
    const difference=Math.abs(index-(words.length-index));
    if(difference<bestDifference){bestDifference=difference;best=index;}
  }
  if(best<0)return null;
  const head=words.slice(0,best).join(' ').replace(/[.!?…]+$/,'');
  const tail=words.slice(best).join(' ');
  if(!head||!tail)return null;
  return [head+'.',upperFirst(tail)];
}

export function normalizeSentenceCounts(units,target){
  const result=[...units];
  while(result.length>target){
    let best=-1,bestLength=Infinity;
    for(let index=0;index<result.length-1;index++){const length=result[index].length+result[index+1].length;if(length<bestLength){bestLength=length;best=index;}}
    if(best<0)break;
    result.splice(best,2,mergeSentenceUnits(result[best],result[best+1]));
  }
  let guard=0;
  while(result.length<target&&guard++<target*2+4){
    let index=-1,length=-1;
    for(let candidate=0;candidate<result.length;candidate++)if(result[candidate].length>length){length=result[candidate].length;index=candidate;}
    if(index<0)break;
    const parts=splitSentenceUnit(result[index]);
    if(!parts)break;
    result.splice(index,1,...parts);
  }
  return result;
}

// Align a whole chapter run to the canonical English paragraph/sentence
// structure. Sentences are merged or split at their boundary (words preserved)
// so every paragraph carries exactly the English sentence count; paragraphs are
// created or removed so the chapter keeps the English paragraph count.
export function semanticStructurePlan(alignment,language){
  const plan=[];
  for(const run of translationRuns(alignment)){
    const counts=run.flatMap(group=>group.sources.map(source=>sentenceUnits(source.text,'en').length));
    const targets=run.flatMap(group=>group.targetBlocks.map(target=>({selector:target.selector,units:sentenceUnits(target.text,language).length})));
    const sourceTotal=counts.reduce((sum,count)=>sum+count,0);
    if(!sourceTotal||!targets.length)continue;
    if(counts.length===targets.length&&counts.every((count,index)=>count===targets[index].units))continue;
    const units=run.flatMap(group=>group.targetBlocks.flatMap(target=>sentenceUnits(target.text,language)));
    const targetTotal=units.length;
    // A run is only reflowed when both editions carry a comparable amount of
    // prose. Forcing a wildly different count would split sentences into
    // fragments and corrupt the translation.
    if(!targetTotal||targetTotal<sourceTotal*.5||targetTotal>sourceTotal*1.8)continue;
    if(!units.length||normalizeSentenceCounts(units,sourceTotal).length!==sourceTotal)continue;
    plan.push({paragraphs:targets.map(target=>target.selector),counts});
  }
  return plan;
}

// A sentence broken across two translated paragraphs inflates that paragraph's
// sentence count. Re-join the fragments (and merge the paragraphs) until the
// group carries the canonical English sentence count. Text is never replaced.
export function paragraphMergePlan(alignment,language){
  const plan=[];
  for(const op of alignment?.operations||[]){
    if(op.kind!=='match'&&op.kind!=='split'&&op.kind!=='merge')continue;
    const sources=op.sources||[op.source],targets=op.targets||[op.target];
    if(targets.length<2||!targets.every(item=>item.tag==='p')||!sources.every(item=>item.tag==='p'))continue;
    const sourceCount=sources.reduce((sum,item)=>sum+sentenceUnits(item.text,'en').length,0);
    const blocks=targets.map(item=>({selector:item.selector,text:item.text}));
    const count=()=>blocks.reduce((sum,block)=>sum+sentenceUnits(block.text,language).length,0);
    const remove=[];
    while(count()>sourceCount){
      let merged=false;
      for(let index=0;index<blocks.length-1;index++){
        const left=blocks[index],right=blocks[index+1];
        const joined=sentenceUnits(left.text+' '+right.text,language);
        if(joined.length<sentenceUnits(left.text,language).length+sentenceUnits(right.text,language).length){
          blocks[index]={selector:left.selector,text:left.text+' '+right.text};
          remove.push(right.selector);
          blocks.splice(index+1,1);
          merged=true;break;
        }
      }
      if(!merged)break;
    }
    if(count()!==sourceCount)continue;
    plan.push({targets:blocks.map(block=>({selector:block.selector,text:block.text})),remove});
  }
  return plan;
}

// Redistribute translated sentences across existing prose paragraphs so each
// paragraph carries the canonical English sentence count. Only whole balanced
// runs between structural anchors are touched; text is never replaced, only its
// paragraph boundaries. Inline markup and unbalanced runs stay with the agent.
export function sentenceReflowPlan(alignment,language){
  const operations=alignment?.operations||[];
  const groups=[];
  for(const op of operations){
    if(op.kind==='match'||op.kind==='split'||op.kind==='merge'){
      const sources=op.sources||[op.source],targetBlocks=op.targets||[op.target];
      groups.push({sources,targetBlocks,sourceCount:sources.reduce((sum,item)=>sum+sentenceUnits(item.text,'en').length,0),targetCount:targetBlocks.reduce((sum,item)=>sum+sentenceUnits(item.text,language).length,0),
        reflowable:sources.every(item=>item.tag==='p')&&targetBlocks.length>0&&targetBlocks.every(item=>item.tag==='p')});
    }else if(op.kind==='missing'){
      groups.push({sources:[op.source],targetBlocks:[],sourceCount:sentenceUnits(op.source.text,'en').length,targetCount:0,reflowable:false});
    }else if(op.kind==='extra'){
      groups.push({sources:[],targetBlocks:[op.target],sourceCount:0,targetCount:sentenceUnits(op.target.text,language).length,reflowable:false});
    }
  }
  const regions=[],plan=[];
  let region=[],balance=0;
  const flush=()=>{if(region.length&&balance===0)regions.push(region);region=[];balance=0;};
  for(const group of groups){
    if(!group.reflowable){flush();continue;}
    region.push(group);balance+=group.sourceCount-group.targetCount;
    if(balance===0){regions.push(region);region=[];}
  }
  flush();
  for(const regionGroups of regions){
    if(regionGroups.every(group=>group.sourceCount===group.targetCount))continue;
    const sentences=regionGroups.flatMap(group=>group.targetBlocks.flatMap(block=>sentenceUnits(block.text,language)));
    if(sentences.length!==regionGroups.reduce((sum,group)=>sum+group.sourceCount,0))continue;
    let cursor=0,valid=true;
    const targets=[],remove=[];
    for(const group of regionGroups){
      const counts=group.targetBlocks.map(block=>sentenceUnits(block.text,language).length);
      let deficit=group.sourceCount-counts.reduce((sum,count)=>sum+count,0);
      for(let index=counts.length-1;index>=0&&deficit!==0;index--){
        if(deficit>0){counts[index]+=deficit;deficit=0;}
        else{const take=Math.min(counts[index],-deficit);counts[index]-=take;deficit+=take;}
      }
      if(deficit!==0){valid=false;break;}
      group.targetBlocks.forEach((block,index)=>{
        const text=sentences.slice(cursor,cursor+counts[index]).join(' ');
        cursor+=counts[index];
        if(counts[index]===0)remove.push(block.selector);
        else targets.push({selector:block.selector,text});
      });
    }
    if(!valid||cursor!==sentences.length||!targets.length)continue;
    plan.push({sources:regionGroups.flatMap(group=>group.sources.map(source=>source.selector)),targets,remove});
  }
  return plan;
}
