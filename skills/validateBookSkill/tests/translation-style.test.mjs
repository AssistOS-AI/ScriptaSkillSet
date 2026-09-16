import test from 'node:test';
import assert from 'node:assert/strict';
import {translationStyles,translatedStyleCheck,canonicalTranslationActions} from '../src/translation-style.mjs';
const profile={bodyPt:12,bodyCssPx:16,leadingCssPx:24,pages:[{width:432}]};
test('translated prose uses source role typography regardless of wording, length or page',()=>{
 const english={records:[{selector:'#en',tag:'p',classes:'prose',font:{weight:'400',style:'normal',size:'16px'},style:{lineHeight:'24px',textAlign:'left'}}],typography:{mappings:[{selector:'#en',fontSizePt:12,sourceFamilies:['Garamond'],paragraphGapCssPx:0}]}};
 const styles=translationStyles(english,profile,{garamond:'"Source Garamond", serif'});
 const record={selector:'#fr',tag:'p',classes:'prose',text:'Un paragraphe traduit beaucoup plus long.',page:99,pageWidth:864,font:{size:'16px',family:'"Source Garamond", serif'},style:{lineHeight:'24px',marginBottom:0}};
 const doc={records:[record],width:1000};
 const result=translatedStyleCheck(doc,styles,profile,'fr',18.56);
 assert.equal(result.actions.length,1);assert(result.actions[0].properties['font-size'].includes('var(--validatebook-page-scale, 1)'));
 assert.equal(result.findings[0].category,'translation_style_difference');
 record.font.size='24px';record.style.lineHeight='36px';
 assert.equal(translatedStyleCheck(doc,styles,profile,'fr',18.56).findings.length,0);
 assert.equal(record.text,'Un paragraphe traduit beaucoup plus long.');
});
test('unsupported translation roles remain explicit instead of guessing a source paragraph',()=>{
 const doc={records:[{selector:'#unknown',tag:'p',classes:'ambiguous',text:'Unchanged.'}]};
 const result=translatedStyleCheck(doc,{},profile,'ro',18.56);
 assert.equal(result.actions.length,0);assert.equal(result.findings[0].category,'translation_style_unmapped');
});
test('missing gap measurements do not split an otherwise identical source role',()=>{
 const records=Array.from({length:4},(_,i)=>({selector:'#en'+i,tag:'p',classes:'notice',font:{weight:'400',style:'normal',size:'16px'},style:{lineHeight:'24px',textAlign:'justify'}}));
 const mappings=records.map((r,i)=>({selector:r.selector,fontSizePt:12,sourceFamilies:['Garamond'],...(i%2?{paragraphGapCssPx:0}:{})}));
 const styles=translationStyles({records,typography:{mappings}},profile,{garamond:'"Source Garamond", serif'});
 assert.equal(styles['p|notice'].gap,0);
 const record={...records[0],text:'Texte différent.',pageWidth:576,font:{size:'16px',family:'"Source Garamond", serif'},style:{lineHeight:'24px',marginBottom:0}};
 const result=translatedStyleCheck({records:[record]},styles,profile,'fr',18.56);
 assert.equal(result.findings.length,0);
 assert.equal(result.actions.length,0);
});

test('canonical translation actions copy English page role styling without changing text',()=>{
 const master={records:[{selector:'#en-title',tag:'p',text:'TITLE',page:2,font:{family:'Garamond',size:'40px',weight:'700',style:'normal'},style:{lineHeight:'52px',textAlign:'center',color:'rgb(1, 2, 3)',marginBottom:0,marginTop:10}}]};
 const target={records:[{selector:'#ro-title',tag:'h2',text:'TITLU TRADUS',page:2,font:{family:'Arial',size:'16px',weight:'400',style:'normal'},style:{lineHeight:'20px',textAlign:'left',color:'rgb(0, 0, 0)',marginBottom:0,marginTop:0}}]};
 const result=canonicalTranslationActions(master,target,'ro',20);
 assert.equal(result.actions[0].kind,'tag');
 assert.equal(result.actions[1].properties['font-family'],'Garamond');
 assert.equal(result.actions[1].properties['text-align'],'center');
 assert.equal(target.records[0].text,'TITLU TRADUS');
});
