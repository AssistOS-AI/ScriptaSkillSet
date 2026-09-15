import { issue, normalizeText } from './layout-checks.mjs';

export const pointsToCssPixels = points => points * 96 / 72;
const median = values => { const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)] ?? null; };
export const familyKey = s => String(s||'').replace(/^[A-Z]{6}\+/,'').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman)$/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();

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
      if(!samples.length)return true;
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
  const fonts = Object.fromEntries([...dom.getElementsByTagName('fontspec')].map(n=>[n.getAttribute('id'),{sizePt:Number(n.getAttribute('size')),family:n.getAttribute('family')}]));
  return [...dom.getElementsByTagName('page')].map((page,index)=>({page:index+1,lines:[...page.getElementsByTagName('text')].map(n=>({text:n.textContent,top:Number(n.getAttribute('top')),left:Number(n.getAttribute('left')),width:Number(n.getAttribute('width')),font:fonts[n.getAttribute('font')]})).filter(n=>n.text.trim()&&n.font?.sizePt>0)}));
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

export function compareTypography(profile, document, language='en', {sourceFontMap={}}={}) {
  const findings=[],mappings=[];
  const normal=s=>normalizeText(s).replaceAll(' ','');
  const sourceLines=profile.pages.flatMap(p=>p.lines.map(line=>({...line,page:p.page,joined:normal(line.text)})).filter(line=>line.joined));
  const source=sourceLines.map(line=>line.joined).join('');
  const platformSamples=selector=>(document.platformFonts||[]).filter(sample=>sample.selector===selector);
  for(const r of document.records.filter(r=>/^(p|h[1-6]|figcaption)$/.test(r.tag)&&normalizeText(r.text).length>=3)){
    if(language==='en'&&profile.displayPages?.includes(Number(r.page)))continue;
    const text=normal(r.text);if(!text)continue;
    const start=source.indexOf(text);
    if(language==='en'&&start<0){findings.push(issue(language,'source_typography_unmapped',r.selector,'An English paragraph has no unique source-text match, so its font size and family are not certified.',{page:r.page}));continue;}
    if(language==='en'&&start>=0&&source.indexOf(text,start+1)>=0){findings.push(issue(language,'source_typography_ambiguous',r.selector,'A repeated source passage cannot authorize paragraph font-size or family certification.',{page:r.page,needsJudgment:true}));continue;}
    if(start<0||source.indexOf(text,start+1)>=0)continue;
    const end=start+text.length;
    let offset=0;const sizes=[],matchedLines=[];
    for(const line of sourceLines){const length=line.joined.length;if(offset<end&&offset+length>start){matchedLines.push(line);for(let i=0;i<Math.min(length,100);i++)sizes.push(line.font.sizePt);}offset+=length;}
    const sourcePt=median(sizes);if(!sourcePt)continue;
    const expected=pointsToCssPixels(sourcePt),actual=parseFloat(r.font.size);
    const mapping={selector:r.selector,page:matchedLines[0].page,fontSizePt:sourcePt,expectedCssPx:expected,actualCssPx:actual,sourceFamilies:[...new Set(matchedLines.map(l=>l.font.family))]};const last=matchedLines.at(-1),next=sourceLines.find(l=>l.page===last.page&&l.top>last.top+1&&l.font.sizePt===sourcePt);
    if(r.tag==='p'&&next&&profile.leadingPt&&next.top-last.top<profile.leadingPt*2)mapping.paragraphGapCssPx=Math.max(0,pointsToCssPixels(next.top-last.top)-profile.leadingCssPx);
    if(mapping.paragraphGapCssPx<1)mapping.paragraphGapCssPx=0;
    mappings.push(mapping);
    if(Math.abs(actual-expected)>Math.max(1,expected*.08))findings.push(issue(language,'absolute_font_size_difference',r.selector,'Computed default font size differs from the PDF font size in physical units.',{...mapping,repair:{kind:'presentation',selector:r.selector,properties:{'font-size':`${sourcePt/profile.bodyPt}em`}}}));
    const actualLeading=r.spacing?.lineAdvancePx||parseFloat(r.style.lineHeight);
    if(sourcePt===profile.bodyPt&&profile.leadingCssPx&&Math.abs(actualLeading-profile.leadingCssPx)>Math.max(1,profile.leadingCssPx*.1))findings.push(issue(language,'line_leading_difference',r.selector,'Distance between lines differs from PDF baseline increments.',{page:mapping.page,expectedCssPx:profile.leadingCssPx,actualCssPx:actualLeading,repair:{kind:'presentation',selector:r.selector,properties:{'line-height':String(profile.leadingCssPx/expected)}}}));
    if(mapping.paragraphGapCssPx!==undefined&&r.style.marginBottom>mapping.paragraphGapCssPx+1)findings.push(issue(language,'paragraph_gap_difference',r.selector,'Extra paragraph margin exceeds the source continuous prose baseline rhythm.',{actualCssPx:r.style.marginBottom,expectedCssPx:mapping.paragraphGapCssPx,repair:{kind:'presentation',selector:r.selector,properties:{'margin-bottom':`${mapping.paragraphGapCssPx/expected}em`}}}));
    const expectedFamily=expectedFamilyStack(mapping.sourceFamilies,sourceFontMap);
    if(language==='en'&&expectedFamily?.key&&!usesSourceFace(r.font.family,expectedFamily.key,expectedFamily.stack,platformSamples(r.selector))){
      const properties=expectedFamily.stack?{'font-family':expectedFamily.stack}:undefined;
      findings.push(issue(language,'source_font_family_difference',r.selector,'Rendered paragraph font family differs from the uniquely matched PDF face.',{...mapping,actualFamily:r.font.family,expectedFamily:expectedFamily.stack||expectedFamily.key,...(properties?{repair:{kind:'presentation',selector:r.selector,properties}}:{})}));
    }
  }
  return {profile:{bodyPt:profile.bodyPt,bodyCssPx:profile.bodyCssPx,leadingCssPx:profile.leadingCssPx,fontSizeUncertaintyPt:profile.fontSizeUncertaintyPt},mappings,findings,limitation:'Short dialogue and prose use the same checks. The matching unit is the HTML paragraph, including paragraphs that continue across PDF pages. Unmapped or ambiguous English paragraphs are findings, not certified. Unique matches compare font size and source family. PDF fontspec is rounded to whole points; tolerance includes that uncertainty. Baseline leading is measured independently.'};
}

export function typographyActions(profile, document, sourceComparison, {defaultSizePx,justifyPolicy='source',masterTypography=sourceComparison,sourceFontMap={}}={}) {
  const actions=[];
  if(!Number.isFinite(defaultSizePx)||defaultSizePx<=0)throw Error('Explicit default CSS font size is required for calibration');
  if(!['source','natural'].includes(justifyPolicy))throw Error('Unknown paragraph spacing policy');
  const root=document.presentation?.contentSelector||'body';
  actions.push({kind:'presentation',selector:root,properties:{'font-size':`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${profile.bodyCssPx/defaultSizePx})`}});
  const mapped=new Map(sourceComparison.mappings.map(m=>[m.selector,m]));
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
  for(const r of document.records.filter(r=>/^(p|h[1-6]|figcaption)$/.test(r.tag))){
    const m=mapped.get(r.selector);const properties={};
    if(!m&&profile.leadingCssPx&&Math.abs(parseFloat(r.font.size)-(document.presentation?.bodyFontSize||0))<.5){properties['line-height']=String(profile.leadingCssPx/profile.bodyCssPx);if(masterTypography.mappings.filter(x=>x.paragraphGapCssPx===0).length>masterTypography.mappings.length*.7)properties['margin-bottom']='0';}
    if(m){properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${pointsToCssPixels(m.fontSizePt)/defaultSizePx})`;if(m.paragraphGapCssPx!==undefined)properties['margin-bottom']=`${m.paragraphGapCssPx/pointsToCssPixels(m.fontSizePt)}em`;if(m.fontSizePt===profile.bodyPt&&profile.leadingCssPx)properties['line-height']=String(profile.leadingCssPx/profile.bodyCssPx);}
    if(m?.sourceFamilies?.length){
      const keys=[...new Set(m.sourceFamilies.filter(Boolean).map(familyKey))];
      const mapped=keys.length===1?sourceFontMap[keys[0]]:null;
      const candidates=keys.length===1?installedFamilies.get(keys[0]):null;
      if(mapped)properties['font-family']=mapped;
      else if(candidates?.size===1)properties['font-family']=[...candidates][0];
    }
    if(justifyPolicy==='natural'||r.spacing?.excessive){if(!['center','right','end'].includes(r.style?.textAlign))properties['text-align']='left';properties['word-spacing']='normal';properties['letter-spacing']='normal';}
    if(Object.keys(properties).length)actions.push({kind:'presentation',selector:r.selector,properties});
  }
  return actions;
}
