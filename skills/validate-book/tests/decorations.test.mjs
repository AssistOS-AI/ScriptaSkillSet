import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDecorations, decorationActions, translatedDecorations } from '../src/decorations.mjs';

const border={page:5,text:'A quote.',size:10,stroke:{width:2,color:'#777777'},properties:{'border-left':'0.2em solid #777777','padding-left':'0.8em','margin-left':'1.4em','text-indent':'0px'}};
const profile={borders:[border],unresolved:[]};
const record={tag:'p',selector:'#quote',page:'5',text:'A quote.',font:{size:'15px'}};
test('detects absent border and accepts measured color, thickness and insets at default size',()=>{
  const doc={records:[record],width:1024};
  assert.equal(compareDecorations(profile,doc).findings[0].category,'source_border_difference');
  assert.equal(decorationActions(compareDecorations(profile,doc)).length,1);
  doc.records=[{...record,decoration:{width:3,style:'solid',color:'rgb(119, 119, 119)',padding:12,margin:21,indent:0}}];
  assert.equal(compareDecorations(profile,doc).findings.length,0);
  doc.records[0].decoration.color='rgb(0, 0, 0)';assert.equal(compareDecorations(profile,doc).findings.length,1);
});
test('unmapped, repeated, wrong-page and partial matches are never repaired',()=>{
  for(const records of [[],[record,record],[{...record,page:'6'}],[{...record,text:'A quote. Extra prose.'}]]) {
    const result=compareDecorations(profile,{records});assert.equal(result.findings[0].category,'source_border_unmapped');assert.equal(decorationActions(result).length,0);
  }
  assert.equal(compareDecorations(null,{records:[]}).findings[0].category,'source_decorations_unchecked');
});
test('translation mapping follows stable structure, not English words or page numbers',()=>{
  const target={records:[{...record,text:'Un citat.',selector:'#ro',page:'6'}]};
  const translated=translatedDecorations(profile,{records:[record]},target,{matches:[{source:'#quote',target:'#ro'}]},'ro');
  assert.equal(translated.borders[0].text,'Un citat.');assert.equal(translated.borders[0].page,6);
  assert.equal(decorationActions(compareDecorations(translated,target,'ro')).length,1);
  assert.equal(translatedDecorations(profile,{records:[record]},target,{matches:[]},'ro').unresolved.length,1);
});
