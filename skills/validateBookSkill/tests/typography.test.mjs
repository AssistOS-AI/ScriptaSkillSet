import test from 'node:test';
import assert from 'node:assert/strict';
import {pointsToCssPixels,sourceTypographyProfile,compareTypography,typographyActions} from '../src/typography.mjs';
import {frameScale} from '../src/reader-presentation.mjs';
import {checkDisplay, compareStructure, compareEnglish} from '../src/layout-checks.mjs';
const text='A final address appeared: EQUATORIAL CONTINUITY ARCHIVE, NAIROBI. ACCESS TRUSTEE: NURU OKAFOR.';
const lines=[{text,top:100,font:{sizePt:11}},{text:'Another sufficiently long line after this paragraph.',top:115.5,font:{sizePt:11}}];
const pages=[{page:1,lines}];
const geometry=[{blocks:[{lines:[{text,top:100,bottom:114.3},{text:lines[1].text,top:115.5,bottom:129.8}]}]}];
const profile=sourceTypographyProfile(pages,geometry);
test('smaller table text cannot determine body prose leading',()=>{
  const table=Array.from({length:20},(_,i)=>({text:'Small table text with enough characters for the old length heuristic '+i,top:200+i*11.6,font:{sizePt:8}}));
  const body=Array.from({length:30},(_,i)=>({...lines[i%2],top:100+i*19.5,text:('Ordinary body prose repeated sufficiently to establish the body size '+i).repeat(2)}));
  const measured=[{blocks:[{lines:body},{lines:table}]}];
  const mixed=sourceTypographyProfile([{page:1,lines:[...body,...table]}],measured);
  assert.equal(mixed.bodyPt,11);
  assert.equal(mixed.leadingPt,19.5);
});
const doc=(size=23,leading=31)=>({presentation:{bodyFontSize:size,contentSelector:'body'},records:[{tag:'p',selector:'#passage',text,font:{size:String(size)},style:{lineHeight:String(leading),marginBottom:4}}]});
test('point conversion and baseline distance are independent from glyph height',()=>{assert.equal(pointsToCssPixels(12),16);assert.equal(profile.bodyPt,11);assert.equal(profile.leadingCssPx,15.5*4/3);assert.notEqual(profile.leadingCssPx,14.3*4/3);});
test('absolute enlargement fails even with unchanged relative type hierarchy',()=>{const c=compareTypography(profile,doc());assert(c.findings.some(f=>f.category==='absolute_font_size_difference'));assert(c.findings.some(f=>f.category==='line_leading_difference'));assert(c.findings.some(f=>f.category==='paragraph_gap_difference'));});
test('correct physical typography does not trigger false enlargement',()=>{const d=doc(11*4/3,15.5*4/3);d.records[0].style.marginBottom=0;assert.equal(compareTypography(profile,d).findings.length,0);});
test('ambiguous repeated source passages cannot authorize font replacement',()=>{const c=compareTypography({...profile,pages:[...pages,...pages]},doc());assert.equal(c.mappings.length,0);assert(c.findings.some(f=>f.category==='source_typography_ambiguous'));});
test('calibration is general, preserves control variables, and natural spacing never edits prose',()=>{const d=doc(),c=compareTypography(profile,d),a=typographyActions(profile,d,c,{defaultSizePx:18.56,justifyPolicy:'natural'});assert(a[0].properties['font-size'].includes('--reader-font-size'));assert(a.find(x=>x.selector==='#passage').properties['text-align']==='left');assert(a.every(x=>!('text' in x)&&x.kind==='presentation'));assert.throws(()=>typographyActions(profile,d,c),/default CSS/);});
test('natural word spacing preserves centered and right-aligned display paragraphs',()=>{for(const textAlign of ['center','right','end']){const d=doc();d.records[0].style.textAlign=textAlign;const actions=typographyActions(profile,d,compareTypography(profile,d),{defaultSizePx:18.56,justifyPolicy:'natural'});assert.equal(actions.find(a=>a.selector==='#passage').properties['text-align'],undefined);}});
test('route-based reader inflation and marker-based defaults are explicit, unsupported contracts fail',()=>{const routeScaling='const sourceScale = /\\/old\\/book/.test(new URL(state.htmlFrame.src).pathname) ? 1 : 1.24;';assert.equal(frameScale(routeScaling,'/new/book',true),1.24);assert.equal(frameScale(routeScaling,'/old/book',true),1);const current="const sourceScale = state.htmlFrame.contentDocument?.body?.hasAttribute('data-pdf-fidelity') ? 1 : 1.24;";assert.equal(frameScale(current,'/any/book',true),1);assert.equal(frameScale(current,'/any/book',false),1.24);assert.throws(()=>frameScale('unknown','/',true),/not recognized/);});
test('rendered excessive word spacing is actionable even without overflow',()=>{const d={language:'en',duplicates:[],brokenLinks:[],scrollWidth:390,width:390,fontFaces:[],records:[{selector:'#p',tag:'p',text,spacing:{excessive:true,gapP90Em:1.2}}]};const f=checkDisplay(d,'en').find(f=>f.category==='excessive_word_spacing');assert.equal(f.repair.properties['text-align'],'left');});
test('translated prose inherits the English baseline rhythm without text matching or rewriting',()=>{const master=compareTypography(profile,doc());const target=doc();target.records[0].text='Un paragraf tradus care nu coincide lexical cu sursa engleză.';const own=compareTypography(profile,target,'ro');assert.equal(own.mappings.length,0);const actions=typographyActions(profile,target,own,{defaultSizePx:18.56,masterTypography:master});const p=actions.find(a=>a.selector==='#passage');assert.equal(p.properties['margin-bottom'],'0');assert.equal(Number(p.properties['line-height']),profile.leadingCssPx/profile.bodyCssPx);});

test('short dialogue uses the same PDF font-size checks as surrounding prose',()=>{
  const dialogue=['"Recommendation recorded."','"Do you confirm recycling?"','"I confirm that you made a recommendation."'];
  const source={...profile,pages:[{page:1,lines:dialogue.map((text,i)=>({text,top:100+i*15.5,font:{sizePt:11}}))}]};
  const target=doc(18.56);target.records=dialogue.map((text,i)=>({...target.records[0],selector:'#dialogue'+i,text}));
  const compared=compareTypography(source,target);
  assert.equal(compared.mappings.length,3);
  assert.equal(compared.findings.filter(f=>f.category==='absolute_font_size_difference').length,3);
  assert(compared.mappings.every(m=>m.expectedCssPx===44/3));
  const ambiguous={...source,pages:[{page:1,lines:[...source.pages[0].lines,source.pages[0].lines[0]]}]};
  const repeated=compareTypography(ambiguous,target);
  assert(!repeated.mappings.some(m=>m.selector==='#dialogue0'));
  assert(repeated.findings.some(f=>f.category==='source_typography_ambiguous'&&f.location==='#dialogue0'));
});

test('a paragraph that continues across PDF pages still maps as one HTML paragraph',()=>{
  const first='This makes the subject part of the Outfinitist philosophy adopted here. Outfinitism begins from finite but movable limits.';
  const second='It is to distinguish physical impossibility from institutional refusal.';
  const source={...profile,pages:[
    {page:5,lines:[{text:first,top:693,font:{sizePt:11,family:'AAAAAA+EBGaramond'}}]},
    {page:6,lines:[{text:second,top:76,font:{sizePt:11,family:'AAAAAA+EBGaramond'}},{text:lines[1].text,top:166,font:{sizePt:11,family:'AAAAAA+EBGaramond'}}]}
  ]};
  const fonts={ebgaramond:'"pdf-font-9e82528ffc0c", Georgia, serif'};
  const target=doc(11*4/3,15.5*4/3);target.records[0].text=first+' '+second;target.records[0].style.marginBottom=0;
  target.records[0].font.family='Georgia, "Iowan Old Style", "Palatino Linotype", serif';
  const wrong=compareTypography(source,target,'en',{sourceFontMap:fonts});
  assert.equal(wrong.mappings.length,1);
  assert.equal(wrong.mappings[0].fontSizePt,11);
  assert.equal(wrong.mappings[0].page,5);
  assert.deepEqual(wrong.mappings[0].sourceFamilies,['AAAAAA+EBGaramond']);
  assert(wrong.findings.some(f=>f.category==='source_font_family_difference'));
  assert.equal(wrong.findings.find(f=>f.category==='source_font_family_difference').repair.properties['font-family'],fonts.ebgaramond);
  target.records[0].font.family=fonts.ebgaramond;
  const compared=compareTypography(source,target,'en',{sourceFontMap:fonts});
  assert.equal(compared.findings.length,0);
  const actions=typographyActions(source,target,compared,{defaultSizePx:18.56,sourceFontMap:fonts});
  assert.equal(actions.find(a=>a.selector==='#passage').properties['font-family'],fonts.ebgaramond);
});

test('running headers and printed folios do not split a cross-page paragraph match',()=>{
  const first='Here the moral line appears. A good business can earn money by reducing a problem.';
  const second='A business dependent on the problem earns more when the problem persists.';
  const header='ASPIRIN, VIAGRA & COFFINS · AN AI WRITING EXPERIMENT';
  const source={...profile,pages:[
    {page:11,height:648,lines:[{text:first,top:693,font:{sizePt:11}}]},
    {page:12,height:648,lines:[
      {text:header,top:20,font:{sizePt:8}},
      {text:second,top:76,font:{sizePt:11}},
      {text:'12',top:616,font:{sizePt:8}}
    ]},
    {page:13,height:648,lines:[{text:header,top:20,font:{sizePt:8}}]},
    {page:14,height:648,lines:[{text:header,top:20,font:{sizePt:8}}]}
  ]};
  const target=doc(11*4/3,15.5*4/3);target.records[0].text=first+' '+second;target.records[0].style.marginBottom=0;target.records[0].page='11';
  const compared=compareTypography(source,target);
  assert.equal(compared.mappings.length,1);
  assert.equal(compared.findings.length,0);
});

test('a chapter heading on its source page is unique even when the contents list repeats it',()=>{
  const heading='CHAPTER 1';
  const source={...profile,pages:[
    {page:4,height:648,lines:[{text:heading,top:149,font:{sizePt:11,family:'CAAAAA+EBGaramond'}}]},
    {page:13,height:648,lines:[{text:heading,top:76,font:{sizePt:16,family:'CAAAAA+EBGaramond'}}]}
  ]};
  const target=doc(16*4/3,21);target.records[0]={tag:'h2',selector:'#page_13',text:heading,page:'13',font:{size:String(16*4/3)},style:{lineHeight:String(21),marginBottom:0}};
  const compared=compareTypography(source,target);
  assert.equal(compared.mappings.length,1);
  assert.equal(compared.mappings[0].page,13);
  assert.equal(compared.mappings[0].fontSizePt,16);
  assert(!compared.findings.some(f=>f.category==='source_typography_ambiguous'));
});

test('unpaginated repeated passages map by document order instead of remaining ambiguous',()=>{
  const heading='CONTENTS';
  const source={...profile,pages:[
    {page:4,height:648,lines:[{text:heading,top:45,font:{sizePt:9,family:'BAAAAA+Arial'}}]},
    {page:13,height:648,lines:[{text:heading,top:76,font:{sizePt:16,family:'CAAAAA+EBGaramond'}}]}
  ]};
  const target={presentation:{bodyFontSize:21,contentSelector:'body'},records:[
    {tag:'h2',selector:'#toc',text:heading,font:{size:String(9*4/3)},style:{lineHeight:'16',marginBottom:0}},
    {tag:'h1',selector:'#chapter',text:heading,font:{size:String(16*4/3)},style:{lineHeight:'24',marginBottom:0}}
  ]};
  const compared=compareTypography(source,target);
  assert.equal(compared.mappings.length,2);
  assert.equal(compared.mappings[0].fontSizePt,9);
  assert.equal(compared.mappings[1].fontSizePt,16);
  assert(!compared.findings.some(f=>f.category==='source_typography_ambiguous'));
});

test('excessive word spacing at a later viewport is still repaired',()=>{
  const d=doc();
  d.records[0].spacing={excessive:false};
  d.layouts=[{width:1440,records:[{selector:'#passage',spacing:{excessive:false}}]},{width:390,records:[{selector:'#passage',spacing:{excessive:true}}]}];
  const actions=typographyActions(profile,d,compareTypography(profile,d),{defaultSizePx:18.56});
  assert.equal(actions.find(a=>a.selector==='#passage').properties['text-align'],'left');
});

test('same-page repeated headings map by local order instead of remaining ambiguous',()=>{
  const heading='Selected Bibliography and Notes for Orientation';
  const source={...profile,pages:[{page:80,height:648,lines:[
    {text:heading,top:45,font:{sizePt:11,family:'CAAAAA+EBGaramond'}},
    {text:heading,top:80,font:{sizePt:16,family:'CAAAAA+EBGaramond'}}
  ]}]};
  const target={presentation:{bodyFontSize:21,contentSelector:'body'},records:[
    {tag:'h2',selector:'#page_80',text:heading,page:'80',font:{size:String(11*4/3)},style:{lineHeight:'20',marginBottom:0}},
    {tag:'h2',selector:'#sub',text:heading,page:'80',font:{size:String(16*4/3)},style:{lineHeight:'24',marginBottom:0}}
  ]};
  const compared=compareTypography(source,target);
  assert.equal(compared.mappings.length,2);
  assert.equal(compared.mappings[0].fontSizePt,11);
  assert.equal(compared.mappings[1].fontSizePt,16);
  assert(!compared.findings.some(f=>f.category==='source_typography_ambiguous'));
});

test('a declared custom CONTENTS face is accepted even when the PDF subset name differs',()=>{
  const source={...profile,pages:[{page:4,height:648,lines:[{text:'CONTENTS',top:45,font:{sizePt:9,family:'BAAAAA+Arial'}}]}]};
  const fonts={arial:'"pdf-font-06572dbddc97", system-ui, sans-serif'};
  const target=doc(12,16);target.records[0]={tag:'h2',selector:'#page_4',text:'CONTENTS',page:'4',font:{size:'12',family:fonts.arial},style:{lineHeight:'16',marginBottom:0}};
  target.platformFonts=[{selector:'#page_4',fonts:[{familyName:'Arial',glyphCount:8,isCustomFont:false}]}];
  const compared=compareTypography(source,target,'en',{sourceFontMap:fonts});
  assert.equal(compared.mappings.length,1);
  assert(!compared.findings.some(f=>f.category==='source_font_family_difference'));
  const actions=typographyActions(source,target,compared,{defaultSizePx:18.56,sourceFontMap:fonts,sourceFontWeights:{arial:[400]}});
  assert.equal(actions.find(a=>a.selector==='#page_4').properties['font-weight'],'400');
});

test('high token overlap cannot certify unmapped copyright typography',()=>{
  const source={...profile,pages:[{page:3,height:648,lines:[{text:'Copyright © [2026] Axiologic Research All rights reserved.',top:80,font:{sizePt:11}}]}]};
  const target=doc(11*4/3,15.5*4/3);target.records[0].text='Copyright © [2026] ScriptaHub All rights reserved.';target.records[0].page='3';target.records[0].style.marginBottom=0;
  const compared=compareTypography(source,target);
  const finding=compared.findings.find(f=>f.category==='source_typography_unmapped');
  assert.equal(finding.severity,'error');
});

test('split table lines and rebranded copyright are not unmatched source omissions',()=>{
  const pages=[{page:3,text:'Copyright © [2026] Axiologic Research\nAll rights reserved.\nKDP publishing rights held by Outfinity SRL (Iasi, Romania).'},{page:67,text:'RCT and longitudinal             Stronger for causality and direction; may be short or\nstudy                            unrepresentative.'}];
  const document={records:[{tag:'p',selector:'#page_3',text:'Copyright © [2026] ScriptaHub All rights reserved.'},{tag:'p',selector:'#t',text:'RCT and longitudinal study Stronger for causality and direction; may be short or unrepresentative.'}],text:'Copyright © [2026] ScriptaHub All rights reserved. KDP publishing rights held by Outfinity SRL (Iasi, Romania). Available for free on ScriptaHub website. This work was created under the umbrella of ScriptaHub as part of two interconnected research programs. RCT and longitudinal study Stronger for causality and direction; may be short or unrepresentative.'};
  assert.equal(compareEnglish(pages,document).findings.length,0);
});

test('source page folios are not treated as translated structural counterparts',()=>{
  const record=(id,text,tag='p')=>({id,selector:'#'+id,tag,classes:'',text,font:{family:'Garamond'}});
  const document=records=>({records,text:records.map(r=>r.text).join('\n')});
  const findings=compareStructure(document([record('page_13','CHAPTER 1','h2')]),document([record('page_13','Un paragraf tradus.')]),'ro').findings;
  assert(!findings.some(f=>f.category==='structural_tag'||f.category==='missing_structural_anchor'));
});

test('generated figure captions are not treated as unmapped source prose',()=>{
  const target=doc(11*4/3,15.5*4/3);target.records[0]={tag:'figcaption',selector:'#cap',text:'Figure from PDF page 11',page:'11',font:{size:String(11*4/3)},style:{lineHeight:String(15.5*4/3),marginBottom:0}};
  assert.equal(compareTypography(profile,target).findings.length,0);
});

test('an unmapped English paragraph is an error, not an uncertified pass',()=>{
  const target=doc(11*4/3,15.5*4/3);target.records[0].text='This English paragraph never occurs in the PDF source.';target.records[0].style.marginBottom=0;
  const compared=compareTypography(profile,target);
  assert.equal(compared.mappings.length,0);
  assert.equal(compared.findings[0].category,'source_typography_unmapped');
});

test('translated prose without a lexical PDF match is not an English unmapped error',()=>{
  const target=doc();target.records[0].text='Un paragraf tradus care nu coincide lexical cu sursa engleză.';
  const own=compareTypography(profile,target,'ro');
  assert.equal(own.mappings.length,0);
  assert(!own.findings.some(f=>f.category==='source_typography_unmapped'||f.category==='source_font_family_difference'));
});
