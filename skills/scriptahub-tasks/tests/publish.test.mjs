import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { publishPackage } from '../scripts/run.mjs';

test('package submission uses exact inventoried bytes and refuses modification or path escapes', async () => {
  const previous = process.cwd(), root = await fs.mkdtemp(path.join(os.tmpdir(),'scripta-submit-'));
  try {
    process.chdir(root); await fs.mkdir('package');
    const source = crypto.randomBytes(150000);
    await fs.writeFile('package/book.pdf',source);
    const inventory = {executionId:'execution-one',publicationPermitted:true,baseCommit:'a'.repeat(40),files:[{path:'book.pdf',size:source.length,sha256:crypto.createHash('sha256').update(source).digest('hex')}]};
    await fs.writeFile('inventory.json',JSON.stringify(inventory)); await fs.writeFile('validation.json','{}');
    const input = {executionId:'execution-one',catalogue:'https://github.com/example/books/blob/main/collection.json',branch:'main',packageRoot:'package',inventory:'inventory.json',validation:'validation.json'};
    let prepared = false, published = false; const received = [];
    const call = async (tool,args) => {
      if (tool === 'scriptahub_task_package_prepare') { assert.deepEqual(args.files,inventory.files); prepared = true; return {}; }
      if (tool === 'scriptahub_task_package_upload') {
        assert.equal(prepared,true); assert.equal(args.offset,Buffer.concat(received).length);
        const chunk = Buffer.from(args.data,'base64'); assert.ok(chunk.length <= 65536); received.push(chunk);
        return {nextOffset:args.offset+chunk.length};
      }
      assert.equal(tool,'scriptahub_task_publish'); assert.equal(args.executionId,input.executionId);
      assert.deepEqual(Buffer.concat(received),source); published = true; return {state:'completed',publication:{commit:'b'.repeat(40)}};
    };
    assert.equal((await publishPackage(call,input)).state,'completed'); assert.equal(published,true);
    await fs.writeFile('package/book.pdf',Buffer.alloc(source.length));
    await assert.rejects(publishPackage(call,input),/checksum mismatch/);
    await fs.symlink('package','linked');
    await assert.rejects(publishPackage(call,{...input,packageRoot:'linked'}),/symlinks/);
    await assert.rejects(publishPackage(call,{...input,packageRoot:'../outside'}),/inside this run/);
  } finally { process.chdir(previous); await fs.rm(root,{recursive:true,force:true}); }
});
