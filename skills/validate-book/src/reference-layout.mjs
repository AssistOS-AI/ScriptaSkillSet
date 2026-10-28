import {inspectLayout, issue} from './layout-checks.mjs';

function referenceWidths() {
  const pages=[...document.querySelectorAll('.pdf-source-page[data-reader-page],section.source-page[data-source-page]')];
  const nodes=pages.length?pages:[document.querySelector('[data-reader-content],article,main,.edition-reading')||document.body];
  return nodes.map(node=>({page:Number(node.getAttribute('data-source-page')||node.getAttribute('data-reader-page'))||1,width:node.getBoundingClientRect().width}));
}

// Select a viewport that naturally delivers the PDF's physical page width.
// Do not override document widths, typography, styles or scripts to make it fit.
export async function measureReferenceLayout(browser, pages) {
  if(!pages?.length||pages.some(page=>!(page.width>0)))throw Error('PDF page dimensions are required for reference measurement');
  const expected=new Map(pages.map(page=>[page.page,page.width*96/72]));
  const wanted=expected.get(pages[0].page);
  const uniform=new Set(expected.values()).size===1;
  const expectedWidth=page=>expected.get(page)??(uniform?wanted:undefined);
  let width=Math.ceil(wanted+16),actual=[];
  for(let attempt=0;attempt<8;attempt++){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    actual=await browser.evaluate(`(${referenceWidths.toString()})()`);
    const delta=wanted-(actual[0]?.width||0);
    if(Math.abs(delta)<=1)break;
    const next=Math.ceil(width+delta);
    if(next<1||next>32768||next===width)break;
    width=next;
  }
  const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
  const geometryFindings=actual.filter(page=>expectedWidth(page.page)!==undefined&&Math.abs(page.width-expectedWidth(page.page))>1)
    .map(page=>issue('en','reference_page_width_difference','page '+page.page,'HTML cannot deliver the original PDF page width without changing its styles.',{expectedCssPx:expectedWidth(page.page),actualCssPx:page.width}));
  return {...layout,measurementKind:'pdf-reference',referencePages:actual.map(page=>({...page,expectedWidth:expectedWidth(page.page)})),geometryFindings};
}

const normalized=value=>String(value).normalize('NFC').replaceAll('\u00ad','').replace(/\s+/gu,' ').trim();
export const REFERENCE_SPACING_TOLERANCE=Object.freeze({absoluteCssPx:2,relative:0.25});
export function compareReferenceSpacing(pages, document, language='en') {
  if(document.measurementKind!=='pdf-reference')throw Error('Source spacing comparison requires a PDF reference measurement');
  const findings=[...(document.geometryFindings||[])], measurements=[];
  for(const record of document.records){
    if(!record.spacing?.lines)continue;
    const page=pages.find(page=>page.page===Number(record.page));
    if(!page)continue;
    const sourceLines=page.blocks.flatMap(block=>block.lines).filter(line=>line.words?.length>1);
    for(const line of record.spacing.lines){
      if(line.words.length<2||!line.complete)continue;
      const text=normalized(line.words.join(' '));
      const matches=sourceLines.filter(source=>normalized(source.words.map(word=>word.text).join(' '))===text);
      if(matches.length!==1)continue;
      const source=matches[0],expected=source.words.slice(1).map((word,i)=>(word.left-source.words[i].right)*96/72);
      if(expected.length!==line.gaps.length)continue;
      // Allow normal PDF/browser font metrics and font-size rounding differences.
      // The tolerance is source-relative, never a fixed limit on justified gaps.
      const differences=line.gaps.map((actual,i)=>({expectedCssPx:expected[i],actualCssPx:actual,
        toleranceCssPx:Math.max(REFERENCE_SPACING_TOLERANCE.absoluteCssPx,Math.abs(expected[i])*REFERENCE_SPACING_TOLERANCE.relative)}));
      measurements.push({selector:record.selector,page:page.page,text,gaps:differences});
      const natural=value=>value==='normal'||Number.parseFloat(value)===0;
      const naturalSpacing=natural(record.style?.wordSpacing)&&natural(record.style?.letterSpacing);
      if(differences.some(gap=>Math.abs(gap.actualCssPx-gap.expectedCssPx)>gap.toleranceCssPx))findings.push(issue(language,'source_word_spacing_difference',record.selector,'Word gaps exceed the rendering tolerance for the matching PDF line at the original page width.',{page:page.page,text,gaps:differences,severity:naturalSpacing?'warning':'error',naturalSpacing}));
    }
  }
  return {findings,measurements,tolerance:REFERENCE_SPACING_TOLERANCE,scope:'matching-lines-at-original-pdf-width'};
}
