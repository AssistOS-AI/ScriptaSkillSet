import { issue, normalizeText } from './layout-checks.mjs';

export const pointsToCssPixels = points => points * 96 / 72;
export const pageScale = (record, widthPt) => record.pageWidth>0&&widthPt>0 ? Math.max(1,record.pageWidth/pointsToCssPixels(widthPt)) : 1;
const median = values => { const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)] ?? null; };
const colorKey = value => {
  const text=String(value||'').toLowerCase();
  if(/^#[\da-f]{6}$/.test(text))return text.slice(1).match(/../g).map(part=>parseInt(part,16)).join(',');
  const rgb=text.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);return rgb?rgb.slice(1).join(','):text;
};
export const familyKey = s => String(s||'').replace(/^[A-Z]{6}\+/,'').replace(/MT$/i,'').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman)$/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export const fontStyleFromName = name => /(?:^|[-_ ])(?:bold)?italic(?:mt)?$/i.test(String(name||'').replace(/^[A-Z]{6}\+/,'')) ? 'italic' : 'normal';
export const fontWeightFromName = name => /(?:^|[-_ ])bold(?:italic)?(?:mt)?$/i.test(String(name||'').replace(/^[A-Z]{6}\+/,'')) ? 700 : 400;
export function normalizePdfFontFamilies(fonts) {
  const groups = new Map();
  for (const font of fonts || []) {
    const key = familyKey(font.source_name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(font);
  }
  const canonical = new Map();
  for (const [key, group] of groups) {
    const chosen = group.find(font => font.weight === 400 && font.style === 'normal')
      || group.find(font => fontWeightFromName(font.source_name) === 400 && fontStyleFromName(font.source_name) === 'normal')
      || group.find(font => font.style === 'normal')
      || group[0];
    canonical.set(key, chosen.css_family);
  }
  return (fonts || []).map(font => ({ ...font, css_family: canonical.get(familyKey(font.source_name)) || font.css_family }));
}
export function sourceFontSupport(fonts) {
  const normalized = normalizePdfFontFamilies(fonts);
  const byKey = new Map();
  for (const font of normalized) {
    const key = familyKey(font.source_name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { weights: new Set(), styles: new Set(), faces: new Set(), cssFamily: font.css_family });
    const entry = byKey.get(key);
    entry.weights.add(font.weight); entry.styles.add(font.style); entry.faces.add(`${font.weight}:${font.style}`);
    if (font.weight === 400 && font.style === 'normal') entry.cssFamily = font.css_family;
  }
  return Object.fromEntries([...byKey].map(([key, entry]) => [key, {
    cssFamily: entry.cssFamily,
    weights: [...entry.weights],
    styles: [...entry.styles],
    hasNormal400: entry.faces.has('400:normal')
  }]));
}
const words = text => normalizeText(text).match(/[\p{L}\p{N}]{3,}/gu)||[];
const runningMatterKey = text => {
  const value=String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const match=value.match(/^(.{6,}?)\s*[·•|]\s*\d{1,4}$/u);
  return match?normalizeText(match[1]).replaceAll(' ',''):null;
};

function expectedFamilyStack(sourceFamilies, sourceFontMap) {
  const keys=[...new Set(sourceFamilies.filter(Boolean).map(familyKey))];
  return keys.length===1?{key:keys[0],stack:sourceFontMap[keys[0]]||null}:null;
}

function cssFamilyTokens(computed) {
  return String(computed||'').split(',').map(token=>token.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
}

function usesSourceFace(computed, sourceKey, expectedStack, samples=[]) {
  const tokens=cssFamilyTokens(computed);
  if(expectedStack){
    const custom=expectedStack.match(/"([^"]+)"/)?.[1];
    if(custom&&tokens.includes(custom)){
      if(!samples.length||familyKey(custom).startsWith('pdffont'))return true;
      return samples.some(sample=>sample.fonts.some(font=>font.glyphCount>0&&(familyKey(font.familyName)===sourceKey||font.familyName===custom||(font.isCustomFont&&familyKey(font.familyName)===familyKey(custom)))));
    }
  }
  if(tokens.map(familyKey).includes(sourceKey))return true;
  if(samples.some(sample=>sample.fonts.some(font=>font.glyphCount>0&&familyKey(font.familyName)===sourceKey)))return true;
  return tokens.some(token=>familyKey(token).startsWith('pdffont'))&&samples.some(sample=>sample.fonts.some(font=>font.glyphCount>0&&font.isCustomFont));
}

// pdftohtml runs at zoom 1: fontspec sizes and coordinates are PDF points,
// not CSS pixels and not the heights of glyph bounding boxes.
export function parsePdfTypography(xml) {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.getElementsByTagName('parsererror').length) throw Error('Invalid source typography XML');
  const fonts = Object.fromEntries([...dom.getElementsByTagName('fontspec')].map(n=>[n.getAttribute('id'),{sizePt:Number(n.getAttribute('size')),family:n.getAttribute('family'),color:n.getAttribute('color')}]));
  const boldText = node => [...node.getElementsByTagName('b')].map(n=>n.textContent).join(' ');
  return [...dom.getElementsByTagName('page')].map((page,index)=>({page:index+1,width:Number(page.getAttribute('width')),height:Number(page.getAttribute('height')),lines:[...page.getElementsByTagName('text')].map(n=>({text:n.textContent,top:Number(n.getAttribute('top')),left:Number(n.getAttribute('left')),width:Number(n.getAttribute('width')),font:fonts[n.getAttribute('font')],bold:n.getElementsByTagName('b').length>0,boldText:boldText(n)})).filter(n=>n.text.trim()&&n.font?.sizePt>0)}));
}

export function readingSourceLines(pages) {
  const compact=s=>normalizeText(s).replaceAll(' ','');
  const headerCounts=new Map();
  const footerCounts=new Map();
  for(const p of pages){
    const limit=Number.isFinite(p.height)&&p.height>0?p.height*.06:null;
    const bottom=Number.isFinite(p.height)&&p.height>0?p.height*.88:null;
    if(limit==null)continue;
    const seen=new Set();
    for(const line of p.lines){
      const text=compact(line.text);
      if(!text||seen.has(text)||!(line.top<limit))continue;
      seen.add(text);headerCounts.set(text,(headerCounts.get(text)||0)+1);
    }
    if(bottom!=null){
      const footerSeen=new Set();
      for(const line of p.lines){
        const key=runningMatterKey(line.text);
        if(!key||footerSeen.has(key)||!(line.top>bottom))continue;
        footerSeen.add(key);footerCounts.set(key,(footerCounts.get(key)||0)+1);
      }
    }
  }
  const running=new Set([...headerCounts].filter(([,count])=>count>=3).map(([text])=>text));
  for(const [text,count] of footerCounts)if(count>=3)running.add(text);
  return pages.flatMap(p=>p.lines.map(line=>({...line,page:p.page,joined:compact(line.text)})).filter(line=>{
    if(!line.joined)return false;
    if(/^\d+$/.test(String(line.text).trim()))return false;
    if(running.has(line.joined))return false;
    return true;
  }));
}

export function sourceTypographyProfile(pages, geometry) {
  const weights=new Map();
  for(const p of pages)for(const l of p.lines)weights.set(l.font.sizePt,(weights.get(l.font.sizePt)||0)+l.text.length);
  const bodyPt=[...weights].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!bodyPt)throw Error('No source font-size evidence');
  const leading=[];
  // Use precise bbox baseline increments, never glyph-box height as leading.
  for(const [pageIndex,p] of pages.entries()){
    const bounds=(geometry[pageIndex]?.blocks||[]).flatMap(b=>b.lines);
    const top=line=>bounds.find(b=>Math.abs(b.top-line.top)<1)?.top??line.top;
    for(let i=1;i<p.lines.length;i++){
      const a=p.lines[i-1],z=p.lines[i],delta=top(z)-top(a);
      if(a.font.sizePt===bodyPt&&z.font.sizePt===bodyPt&&a.text.length>30&&z.text.length>30&&delta>bodyPt*.9&&delta<bodyPt*1.9)leading.push(delta);
    }
  }
  return {bodyPt,bodyCssPx:pointsToCssPixels(bodyPt),leadingPt:median(leading),leadingCssPx:median(leading)===null?null:pointsToCssPixels(median(leading)),fontSizeUncertaintyPt:.5,units:'PDF pt; CSS px = pt × 96/72',pages};
}

function sourceJoined(lines) { return lines.map(line=>line.joined).join(''); }
function occurrenceCount(text, lines) {
  const exact=lines.filter(line=>line.joined===text).length;
  if(exact)return exact;
  const source=sourceJoined(lines);
  let count=0, start=-1;
  while((start=source.indexOf(text,start+1))>=0) count++;
  return count;
}
function locateSourceText(text, lines, occurrence=null) {
  const exact=lines.map((line,i)=>line.joined===text?i:-1).filter(i=>i>=0);
  if(occurrence==null&&exact.length===1){
    const start=sourceJoined(lines.slice(0,exact[0])).length;
    return {status:'unique',start,lines};
  }
  if(occurrence!=null&&exact.length>occurrence){
    const start=sourceJoined(lines.slice(0,exact[occurrence])).length;
    return {status:'unique',start,lines};
  }
  const source=sourceJoined(lines);
  if(occurrence==null){
    const start=source.indexOf(text);
    if(start<0)return {status:'missing'};
    if(source.indexOf(text,start+1)>=0)return {status:'ambiguous',start,lines};
    return {status:'unique',start,lines};
  }
  let start=-1;
  for(let i=0;i<=occurrence;i++){
    start=source.indexOf(text,start+1);
    if(start<0)return {status:'missing'};
  }
  return {status:'unique',start,lines};
}

export function compareTypography(profile, document, language='en', {sourceFontMap={}}={}) {
  if(language!=='en')return {profile:{bodyPt:profile.bodyPt,bodyCssPx:profile.bodyCssPx,leadingCssPx:profile.leadingCssPx},mappings:[],findings:[],limitation:'Translated presentation is checked by structural role, not English text matching.'};
  const findings=[],mappings=[];
  const normal=s=>normalizeText(s).replaceAll(' ','');
  const tableText=(page)=>normalizeText((profile.tableFragments||[]).filter(t=>Number(t.page)===Number(page)).flatMap(t=>t.cells.map(c=>c.text)).join(' ')).replaceAll(' ','');
  const tableWords=(page)=>normalizeText((profile.tableFragments||[]).filter(t=>Number(t.page)===Number(page)).flatMap(t=>t.cells.map(c=>c.text)).join(' ')).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
  const sourceLines=readingSourceLines(profile.pages);
  const platformSamples=selector=>(document.platformFonts||[]).filter(sample=>sample.selector===selector);
  const lastPage=Math.max(0,...sourceLines.map(line=>line.page));
  const eligible=document.records.filter(r=>/^(p|h[1-6]|figcaption)$/.test(r.tag)&&normalizeText(r.text).length>=3);
  const pageOccurrences=new Map(),documentOccurrences=new Map();
  for(const r of eligible){
    const key=String(r.page||'')+'|'+normal(r.text);
    if(!pageOccurrences.has(key))pageOccurrences.set(key,[]);
    pageOccurrences.get(key).push(r);
    const text=normal(r.text);
    if(!documentOccurrences.has(text))documentOccurrences.set(text,[]);
    documentOccurrences.get(text).push(r);
  }
  for(const r of eligible){
    if(language==='en'&&profile.displayPages?.includes(Number(r.page)))continue;
    if(r.tag==='figcaption'&&/^figure from pdf page \d+$/i.test(normalizeText(r.text)))continue;
    const text=normal(r.text);if(!text)continue;
    let located=null;
    const page=Number(r.page);
    if(Number.isInteger(page)&&page>0){
      const local=sourceLines.filter(line=>line.page===page);
      const localCount=occurrenceCount(text,local);
      const htmlCount=pageOccurrences.get(String(page)+'|'+text)?.length||0;
      if(localCount===htmlCount&&htmlCount>0)located=locateSourceText(text,local,pageOccurrences.get(String(page)+'|'+text).indexOf(r));
      else for(let end=page;end<=Math.min(lastPage,page+4);end++){
        const slice=sourceLines.filter(line=>line.page>=page&&line.page<=end);
        const found=locateSourceText(text,slice);
        if(found.status==='unique'){located=found;break;}
        if(found.status==='ambiguous'&&end===page)located=found;
      }
    }
    if(located?.status!=='unique'){
      const htmlCount=documentOccurrences.get(text)?.length||0;
      const sourceCount=occurrenceCount(text,sourceLines);
      if(htmlCount===sourceCount&&htmlCount>0)located=locateSourceText(text,sourceLines,documentOccurrences.get(text).indexOf(r));
      else located=locateSourceText(text,sourceLines);
    }
    const start=located.status==='missing'?-1:located.start;
    const matchedSource=located.status==='missing'?sourceLines:located.lines;
    if(language==='en'&&located.status==='missing'){
      if(tableText(r.page).includes(text)||words(normalizeText(r.text)).every(word=>tableWords(r.page).includes(word.toLowerCase())))continue;
      findings.push(issue(language,'source_typography_unmapped',r.selector,'An English paragraph has no unique source-text match, so its font size and family are not certified. Text overlap does not establish a typography mapping.',{page:r.page}));
      continue;
    }
    if(language==='en'&&located.status==='ambiguous'){findings.push(issue(language,'source_typography_ambiguous',r.selector,'A repeated source passage has no unique local mapping for paragraph font-size or family correction.',{page:r.page}));continue;}
    if(located.status!=='unique')continue;
    const end=start+text.length;
    let offset=0;const sizes=[],matchedLines=[];
    for(const line of matchedSource){const length=line.joined.length;if(offset<end&&offset+length>start){matchedLines.push(line);for(let i=0;i<Math.min(length,100);i++)sizes.push(line.font.sizePt);}offset+=length;}
    const sourcePt=median(sizes);if(!sourcePt)continue;
    const scale=pageScale(r,profile.pages.find(p=>p.page===matchedLines[0].page)?.width);
    const expected=pointsToCssPixels(sourcePt)*scale,actual=parseFloat(r.font.size);
    const sourceAdvances=matchedLines.slice(1).map((line,index)=>line.page===matchedLines[index].page?line.top-matchedLines[index].top:null).filter(value=>value>sourcePt*.8&&value<sourcePt*2),sourceBlockLeadingPt=median(sourceAdvances);
    const sourceFamilies=[...new Set(matchedLines.map(l=>l.font.family))];
    const sourceStyles=[...new Set(sourceFamilies.map(fontStyleFromName))];
    const sourceWeights=[...new Set(sourceFamilies.map(fontWeightFromName))];
    const boldChars=matchedLines.reduce((sum,line)=>{
      const bold=normalizeText(line.boldText||'').replaceAll(' ','');
      const whole=normalizeText(line.text||'').replaceAll(' ','');
      if(!whole)return sum;
      if(bold&&bold!==whole)return sum+Math.min(bold.length,whole.length);
      if(line.bold||fontWeightFromName(line.font.family)===700)return sum+whole.length;
      return sum;
    },0);
    const matchedChars=matchedLines.reduce((sum,line)=>sum+normalizeText(line.text||'').replaceAll(' ','').length,0);
    const boldCoverage=matchedChars?boldChars/matchedChars:0;
    const mapping={selector:r.selector,tag:r.tag,page:matchedLines[0].page,fontSizePt:sourcePt,expectedCssPx:expected,actualCssPx:actual,sourceTopPt:matchedLines[0].top,sourceLastTopPt:matchedLines.at(-1).top,sourceBlockLeadingPt,sourceLeadingPt:/^h[1-6]$/.test(r.tag)?sourceBlockLeadingPt:null,sourceFamilies,sourceColors:[...new Set(matchedLines.map(l=>l.font.color).filter(Boolean))],sourceBold:boldCoverage>=.6||sourceWeights.every(weight=>weight===700),sourceBoldCoverage:boldCoverage,sourceStyle:sourceStyles.length===1?sourceStyles[0]:'normal'};const last=matchedLines.at(-1),next=sourceLines.find(l=>l.page===last.page&&l.top>last.top+1&&l.font.sizePt===sourcePt);
    const previous=mappings.at(-1);
    if(/^h[1-6]$/.test(r.tag)&&previous?.page===mapping.page&&mapping.sourceTopPt>previous.sourceLastTopPt){
      const previousRecord=document.records.find(record=>record.selector===previous.selector);
      const interveningTable=document.records.some(record=>record.tag==='table'&&Number(record.page)===mapping.page&&record.nodeIndex>previousRecord?.nodeIndex&&record.nodeIndex<r.nodeIndex);
      const sourceTable=(profile.tableFragments||[]).filter(table=>table.page===mapping.page&&Number.isFinite(table.bottomPt)&&table.bottomPt<=mapping.sourceTopPt).sort((a,b)=>b.bottomPt-a.bottomPt)[0];
      if(interveningTable&&sourceTable){
        mapping.gapBeforePt=Math.max(0,mapping.sourceTopPt-sourceTable.bottomPt);
        mapping.gapBeforeEm=mapping.gapBeforePt/sourcePt;
        mapping.gapSource='source_table_bottom';
      }else{
        const previousAdvance=previous.sourceBlockLeadingPt||(previous.tag==='p'&&previous.fontSizePt===profile.bodyPt?profile.leadingPt:null)||previous.fontSizePt*1.22;
        mapping.gapBeforePt=Math.max(0,mapping.sourceTopPt-previous.sourceLastTopPt-previousAdvance);
        mapping.gapBeforeEm=mapping.gapBeforePt/sourcePt;
        mapping.previousSelector=previous.selector;
      }
    }
    if(r.tag==='p'&&next&&profile.leadingPt&&next.top-last.top<profile.leadingPt*2)mapping.paragraphGapCssPx=Math.max(0,pointsToCssPixels(next.top-last.top)-profile.leadingCssPx);
    if(mapping.paragraphGapCssPx<1)mapping.paragraphGapCssPx=0;
    mappings.push(mapping);
    if(Math.abs(actual-expected)>Math.max(1,expected*.08))findings.push(issue(language,'absolute_font_size_difference',r.selector,'Computed default font size differs from the PDF font size in physical units.',{...mapping,repair:{kind:'presentation',selector:r.selector,properties:{'font-size':`${sourcePt/profile.bodyPt}em`}}}));
    if(mapping.sourceLeadingPt&&Math.abs(parseFloat(r.style.lineHeight)/actual-mapping.sourceLeadingPt/sourcePt)>.08)findings.push(issue(language,'heading_line_leading_difference',r.selector,'Heading line spacing differs from the PDF baseline increments.',{...mapping,repair:{kind:'presentation',selector:r.selector,properties:{'line-height':String(mapping.sourceLeadingPt/sourcePt)}}}));
    if(mapping.gapBeforeEm!==undefined&&Math.abs(r.style.marginTop/actual-mapping.gapBeforeEm)>.12)findings.push(issue(language,'block_gap_difference',r.selector,'Vertical spacing before the heading differs from the adjacent PDF blocks.',{...mapping,actualMarginTop:r.style.marginTop,repair:{kind:'presentation',selector:r.selector,properties:{'margin-top':mapping.gapBeforeEm+'em'}}}));
    if(mapping.sourceColors.length===1&&colorKey(r.style.color)!==colorKey(mapping.sourceColors[0]))findings.push(issue(language,'source_text_color_difference',r.selector,'Rendered text color differs from the PDF font color.',{...mapping,actualColor:r.style.color,expectedColor:mapping.sourceColors[0],repair:{kind:'presentation',selector:r.selector,properties:{color:mapping.sourceColors[0]}}}));
    const actualLeading=(r.spacing?.lineAdvancePx||parseFloat(r.style.lineHeight))/scale;
    if(sourcePt===profile.bodyPt&&profile.leadingCssPx&&Math.abs(actualLeading-profile.leadingCssPx)>Math.max(1,profile.leadingCssPx*.1))findings.push(issue(language,'line_leading_difference',r.selector,'Distance between lines differs from PDF baseline increments.',{page:mapping.page,expectedCssPx:profile.leadingCssPx,actualCssPx:actualLeading,repair:{kind:'presentation',selector:r.selector,properties:{'line-height':String(profile.leadingCssPx/expected)}}}));
    if(mapping.paragraphGapCssPx!==undefined&&r.style.marginBottom/scale>mapping.paragraphGapCssPx+1)findings.push(issue(language,'paragraph_gap_difference',r.selector,'Extra paragraph margin exceeds the source continuous prose baseline rhythm.',{actualCssPx:r.style.marginBottom,expectedCssPx:mapping.paragraphGapCssPx*scale}));
    const expectedFamily=expectedFamilyStack(mapping.sourceFamilies,sourceFontMap);
    if(language==='en'&&expectedFamily?.key&&!usesSourceFace(r.font.family,expectedFamily.key,expectedFamily.stack,platformSamples(r.selector))){
      const properties=expectedFamily.stack?{'font-family':expectedFamily.stack}:undefined;
      findings.push(issue(language,'source_font_family_difference',r.selector,'Rendered paragraph font family differs from the uniquely matched PDF face.',{...mapping,actualFamily:r.font.family,expectedFamily:expectedFamily.stack||expectedFamily.key,...(properties?{repair:{kind:'presentation',selector:r.selector,properties}}:{})}));
    }
  }
  return {profile:{bodyPt:profile.bodyPt,bodyCssPx:profile.bodyCssPx,leadingCssPx:profile.leadingCssPx,fontSizeUncertaintyPt:profile.fontSizeUncertaintyPt},mappings,findings,limitation:'Short dialogue and prose use the same checks. The matching unit is the HTML paragraph, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded. Unmapped or ambiguous English paragraphs are findings, not certified. Unique matches compare font size and source family. PDF fontspec is rounded to whole points; tolerance includes that uncertainty. Baseline leading is measured independently.'};
}

export function typographyActions(profile, document, sourceComparison, {defaultSizePx,justifyPolicy='source',masterTypography=sourceComparison,sourceFontMap={},sourceFontWeights={},sourceFontStyles={},sourceFontFaces={}}={}) {
  const actions=[];
  if(!Number.isFinite(defaultSizePx)||defaultSizePx<=0)throw Error('Explicit default CSS font size is required for calibration');
  if(!['source','natural'].includes(justifyPolicy))throw Error('Unknown paragraph spacing policy');
  const root=document.presentation?.contentSelector||'body';
  actions.push({kind:'presentation',selector:root,properties:{'font-size':`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${profile.bodyCssPx/defaultSizePx})`}});
  const mapped=new Map(sourceComparison.mappings.map(m=>[m.selector,m]));
  const unmappedEnglish=new Set(sourceComparison.findings.filter(f=>f.category==='source_typography_unmapped').map(f=>f.location));
  const installedFamilies=new Map();
  for(const sample of document.platformFonts||[]){
    const record=document.records.find(r=>r.selector===sample.selector);
    if(!record)continue;
    for(const font of sample.fonts.filter(f=>f.glyphCount>0&&f.isCustomFont)){
      const key=familyKey(font.familyName);
      if(!installedFamilies.has(key))installedFamilies.set(key,new Set());
      installedFamilies.get(key).add(record.font.family);
    }
  }
  const records=document.records.filter(r=>/^(p|h[1-6]|figcaption)$/.test(r.tag));
  const bodyMappings=sourceComparison.mappings.filter(m=>m.tag==='p'&&m.fontSizePt===profile.bodyPt);
  const dominantBodyFamily=(()=>{
    const counts=new Map();
    for(const mapping of bodyMappings)for(const family of mapping.sourceFamilies||[]){
      const key=familyKey(family);if(key)counts.set(key,(counts.get(key)||0)+1);
    }
    return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  })();
  const dominantBodyColor=(()=>{
    const counts=new Map();
    for(const mapping of bodyMappings)for(const color of mapping.sourceColors||[])counts.set(color,(counts.get(color)||0)+1);
    return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  })();
  const contextualBodySelectors=new Set();
  for(const r of records){
    if(!unmappedEnglish.has(r.selector)||r.tag!=='p'||normalizeText(r.text).length<80)continue;
    const index=records.indexOf(r);
    const page=String(r.page||'');
    const localMapped=records.filter(candidate=>candidate.tag==='p'&&String(candidate.page||'')===page&&mapped.get(candidate.selector)?.fontSizePt===profile.bodyPt);
    const before=records.slice(Math.max(0,index-5),index).reverse().find(candidate=>candidate.tag==='p'&&mapped.get(candidate.selector)?.fontSizePt===profile.bodyPt);
    const after=records.slice(index+1,index+6).find(candidate=>candidate.tag==='p'&&mapped.get(candidate.selector)?.fontSizePt===profile.bodyPt);
    const supportedSamePage=localMapped.length>=3;
    const supportedByNeighbors=before&&after&&String(before.page||'')===page&&String(after.page||'')===page;
    if(supportedSamePage||supportedByNeighbors)contextualBodySelectors.add(r.selector);
  }
  for(const r of records){
    const m=mapped.get(r.selector);const properties={};
    if(!m&&profile.leadingCssPx&&Math.abs(parseFloat(r.font.size)-(document.presentation?.bodyFontSize||0))<.5){properties['line-height']=String(profile.leadingCssPx/profile.bodyCssPx);if(masterTypography.mappings.filter(x=>x.paragraphGapCssPx===0).length>masterTypography.mappings.length*.7)properties['margin-bottom']='0';}
    if(!m&&contextualBodySelectors.has(r.selector)){
      properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${profile.bodyCssPx/defaultSizePx} * var(--validatebook-page-scale, 1))`;
      if(profile.leadingCssPx)properties['line-height']=String(profile.leadingCssPx/profile.bodyCssPx);
      const bodyGap=median(bodyMappings.map(mapping=>mapping.paragraphGapCssPx).filter(value=>value!==undefined));
      if(bodyGap!==null)properties['margin-bottom']=`${bodyGap/profile.bodyCssPx}em`;
      if(dominantBodyColor)properties.color=dominantBodyColor;
      if(dominantBodyFamily){
        const mappedFamily=sourceFontMap[dominantBodyFamily];
        const candidates=installedFamilies.get(dominantBodyFamily);
        if(mappedFamily&&sourceFontFaces[dominantBodyFamily]?.hasNormal400!==false)properties['font-family']=mappedFamily;
        else if(candidates?.size===1)properties['font-family']=[...candidates][0];
        const weights=sourceFontWeights[dominantBodyFamily]||[];
        if(weights.includes(400))properties['font-weight']='400';
        const styles=sourceFontStyles[dominantBodyFamily]||[];
        if(styles.includes('normal'))properties['font-style']='normal';
      }
    }
    if(m){properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${pointsToCssPixels(m.fontSizePt)/defaultSizePx} * var(--validatebook-page-scale, 1))`;if(m.paragraphGapCssPx!==undefined)properties['margin-bottom']=`${m.paragraphGapCssPx/pointsToCssPixels(m.fontSizePt)}em`;if(m.fontSizePt===profile.bodyPt&&profile.leadingCssPx)properties['line-height']=String(profile.leadingCssPx/profile.bodyCssPx);if(m.sourceLeadingPt)properties['line-height']=String(m.sourceLeadingPt/m.fontSizePt);if(m.gapBeforeEm!==undefined){properties['margin-top']=m.gapBeforeEm+'em';if(m.previousSelector)actions.push({kind:'presentation',selector:m.previousSelector,properties:{'margin-bottom':'0'}});}if(m.sourceColors?.length===1)properties.color=m.sourceColors[0];}
    if(m?.sourceFamilies?.length){
      const keys=[...new Set(m.sourceFamilies.filter(Boolean).map(familyKey))];
      const mapped=keys.length===1?sourceFontMap[keys[0]]:null;
      const candidates=keys.length===1?installedFamilies.get(keys[0]):null;
      const style=m.sourceStyle||'normal';
      const weights=sourceFontWeights[keys[0]]||[];
      const weight=m.sourceBold&&weights.includes(700)?700:weights.includes(400)?400:weights[0];
      const face=sourceFontFaces[keys[0]];
      const mappedSafe = mapped && !(style === 'normal' && weight === 400 && face?.hasNormal400 === false);
      if(mappedSafe)properties['font-family']=mapped;
      else if(candidates?.size===1)properties['font-family']=[...candidates][0];
      if(weight)properties['font-weight']=String(weight);
      properties['font-style']=style;
    }
    const proseParagraph=r.tag==='p'&&(
      m?.fontSizePt===profile.bodyPt||
      contextualBodySelectors.has(r.selector)||
      Math.abs(parseFloat(r.font?.size)-(document.presentation?.bodyFontSize||0))<.5
    );
    const protectedAlignment=['center','right','end'].includes(r.style?.textAlign);
    if(proseParagraph&&!protectedAlignment){
      properties['text-align']=justifyPolicy==='natural'?'left':'justify';
      if(justifyPolicy==='source'){
        properties['text-align-last']='left';
        properties.hyphens='auto';
      }
      properties['word-spacing']='normal';
      properties['letter-spacing']='normal';
    }
    if(Object.keys(properties).length)actions.push({kind:'presentation',selector:r.selector,properties});
  }
  return actions;
}
