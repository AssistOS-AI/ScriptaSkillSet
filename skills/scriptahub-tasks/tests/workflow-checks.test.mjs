import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {insideRun, writeHandoff, requirePreflight, verifyPackage} from '../scripts/workflow-checks.mjs';

async function inRun(callback) {
  const previous = process.cwd();
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scripta-checks-')));
  try { process.chdir(root); await callback(root); }
  finally { process.chdir(previous); await fs.rm(root, {recursive:true, force:true}); }
}
const context = {executionId:'execution-one', runId:'run-one', taskId:'task-one', bookId:'book-one'};

test('durable handoffs preserve execution identity and reject secrets, oversized context and symlinks', async () => inRun(async root => {
  const saved = await writeHandoff({step:'prepare-manuscript', context});
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  await writeHandoff({step:'process-content', context:{...context, artifact:'book.html'}});
  assert.equal(JSON.parse(await fs.readFile(saved.path)).context.artifact, 'book.html');
  await assert.rejects(writeHandoff({step:'process-content', context:{...context, executionId:'another'}}), /another execution/);
  await assert.rejects(writeHandoff({step:'process-content', context:{...context, data:{password:'private'}}}), /Secrets/);
  await assert.rejects(writeHandoff({step:'process-content', context:{...context, data:'x'.repeat(25000)}}), /24 KB/);
  await assert.rejects(insideRun('../outside'), /leaves/);
  await fs.symlink(path.join(root, saved.path), 'link.json');
  await assert.rejects(insideRun('link.json'), /symlinks/);
  await fs.rm(saved.path); await fs.symlink(path.join(root,'link.json'), saved.path);
  await assert.rejects(writeHandoff({step:'process-content', context}), /symlinks/);
}));

test('claim requires a fresh successful preflight, including a valid timestamp', async () => inRun(async () => {
  await assert.rejects(requirePreflight(), /preflight/);
  await fs.mkdir('run-state');
  const now = Date.now();
  const report = {ok:true, checks:Array.from({length:8}, () => ({status:'passed'})), checkedAt:new Date(now).toISOString()};
  await fs.writeFile('run-state/preflight.json', JSON.stringify(report));
  await requirePreflight(now);
  for (const change of [{ok:false}, {checkedAt:'invalid'}, {checkedAt:new Date(now+1000).toISOString()}, {checkedAt:new Date(now-900001).toISOString()}, {checks:[]}]) {
    await fs.writeFile('run-state/preflight.json', JSON.stringify({...report,...change}));
    await assert.rejects(requirePreflight(now), /preflight/);
  }
}));

test('batch verification refuses different bytes, execution identity and unsafe inventory paths before remote access', async () => inRun(async () => {
  await fs.mkdir('package');
  const bytes = Buffer.from('book'); await fs.writeFile('package/book.html', bytes);
  const entry = {path:'book.html', size:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const inventory = {executionId:context.executionId, baseCommit:null, files:[entry]};
  const input = {...context, packageRoot:'package', inventory:'inventory.json', catalogue:'https://github.com/example/books/blob/main/collection.json', branch:'main'};
  for (const [change, pattern] of [[{executionId:'another'}, /another execution/], [{files:[{...entry,sha256:'0'.repeat(64)}]}, /differs/], [{files:[{...entry,path:'../book.html'}]}, /Unsafe/], [{files:[entry,entry]}, /duplicate/]]) {
    await fs.writeFile('inventory.json', JSON.stringify({...inventory,...change}));
    await assert.rejects(verifyPackage(input), pattern);
  }
}));
