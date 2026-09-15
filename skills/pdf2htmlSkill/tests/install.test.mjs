import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAsset, withInstallLock } from '../src/pdf2html/install.mjs';

test('installation reuses verified files offline and rejects corrupt downloads without replacing an existing file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pdf2html-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('verified asset'), path = join(root, 'asset');
  const expected = { url: 'https://example.invalid/asset', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(path, bytes);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal(await installAsset(path, expected), false);
  await writeFile(path, 'old bytes');
  await assert.rejects(installAsset(path, expected), /offline/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response('corrupt'));
  await assert.rejects(installAsset(path, expected), /Checksum mismatch/);
  assert.equal(await readFile(path, 'utf8'), 'old bytes');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  assert.equal(await installAsset(path, expected), true);
  assert.deepEqual(await readFile(path), bytes);
});

test('concurrent installations serialize and release the lock after errors', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pdf2html-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let active = 0, maximum = 0;
  await Promise.all([1, 2].map(() => withInstallLock(root, async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 20));
    active--;
  }, { interval: 5 })));
  assert.equal(maximum, 1);
  await assert.rejects(withInstallLock(root, () => { throw new Error('failed'); }), /failed/);
  await assert.rejects(access(join(root, '.cache/setup.lock')));
  await withInstallLock(root, async () => {});
});
