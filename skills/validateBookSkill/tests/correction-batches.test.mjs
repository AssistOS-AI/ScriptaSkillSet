import test from 'node:test';
import assert from 'node:assert/strict';
import {tryCorrectionBatches} from '../src/correction-batches.mjs';

test('rejected combined candidate permits an independent verified repair',async()=>{
  const attempts=[],rejections=[];
  const result=await tryCorrectionBatches([{name:'all'},{name:'pagination'},{name:'tables'}],async batch=>{
    attempts.push(batch.name);
    if(batch.name==='all'){const error=Error('Unsafe candidate');error.findings=[{category:'hidden_content'}];throw error;}
    return true;
  },async(batch,error)=>rejections.push([batch.name,error.findings[0].category]));
  assert.equal(result,'pagination');assert.deepEqual(attempts,['all','pagination']);assert.deepEqual(rejections,[['all','hidden_content']]);
});

test('unchanged batches continue and consolidation failures remain explicit',async()=>{
  const rejected=[];
  assert.equal(await tryCorrectionBatches([{name:'all'},{name:'unchanged'},{name:'tables'}],async b=>{
    if(b.name==='all')throw Error('CSS consolidation changed computed margin-right');
    return b.name==='tables';
  },async b=>rejected.push(b.name)),'tables');
  assert.deepEqual(rejected,['all']);
});

test('runtime and concurrent edit errors cannot be treated as rejected layout',async()=>{
  for(const message of ['CDP timeout','Concurrent source change before repair'])await assert.rejects(tryCorrectionBatches([{name:'all'}],async()=>{throw Error(message);},async()=>assert.fail('must propagate')),new RegExp(message));
});
