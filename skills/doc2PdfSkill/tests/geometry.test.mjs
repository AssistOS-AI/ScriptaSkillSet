import test from 'node:test';
import assert from 'node:assert/strict';
import {pageBox} from '../src/qa.mjs';
test('page geometry resolves inherited crop boxes and rotation',()=>{
 const j={qpdf:[{}, {'obj:1 0 R':{value:{'/MediaBox':[0,0,600,800],'/Parent':'2 0 R','/UserUnit':2}},'obj:2 0 R':{value:{'/CropBox':[0,0,500,700],'/Rotate':90}}}]};
 assert.deepEqual(pageBox(j,'1 0 R'),[1400,1000]);j.qpdf[1]['obj:1 0 R'].value['/Rotate']=0;assert.deepEqual(pageBox(j,'1 0 R'),[1000,1400]);
});
