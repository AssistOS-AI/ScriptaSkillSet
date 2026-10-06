import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { repairCommand } from '../src/repair.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('repair inserts a translated missing unit beside a unique anchor', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'translate-repair-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'full_content.html');
  await fs.writeFile(source, '<html lang="ro"><body><p>Acasă</p><p>Sfârșit.</p></body></html>');
  const realSource = await fs.realpath(source);
  const reportFile = path.join(directory, 'report.json');
  const reportBytes = Buffer.from(JSON.stringify({
    sourceHashes: [{ file: realSource, sha256: digest(await fs.readFile(source)) }],
    findings: [{ id: 'f1', skill: 'translateHtml', severity: 'error', location: 'page 3', file: realSource }]
  }));
  await fs.writeFile(reportFile, reportBytes);
  const patchesFile = path.join(directory, 'patches.json');
  await fs.writeFile(patchesFile, JSON.stringify({
    reportHash: digest(reportBytes),
    file: realSource,
    patches: [{ findingId: 'f1', anchor: '<p>Sfârșit.</p>', insert: '<p>Nota autorului.</p>', position: 'after' }]
  }));
  const output = path.join(directory, 'full_content.corrected.html');
  const result = await repairCommand('translateHtml', ['--report', reportFile, '--patches', patchesFile, '--output', output]);
  assert.equal(result.status, 'needs_revalidation');
  const candidate = await fs.readFile(output, 'utf8');
  assert.match(candidate, /<p>Sfârșit\.<\/p><p>Nota autorului\.<\/p>/);
});

test('repair still rejects an empty or unsupported patch', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'translate-repair-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'full_content.html');
  await fs.writeFile(source, '<html lang="ro"><body><p>Acasă</p></body></html>');
  const realSource = await fs.realpath(source);
  const reportBytes = Buffer.from(JSON.stringify({
    sourceHashes: [{ file: realSource, sha256: digest(await fs.readFile(source)) }],
    findings: [{ id: 'f1', skill: 'translateHtml', severity: 'error', location: 'page 1', file: realSource }]
  }));
  const reportFile = path.join(directory, 'report.json');
  await fs.writeFile(reportFile, reportBytes);
  const patchesFile = path.join(directory, 'patches.json');
  await fs.writeFile(patchesFile, JSON.stringify({
    reportHash: digest(reportBytes),
    file: realSource,
    patches: [{ findingId: 'f1', anchor: '<p>Acasă</p>', insert: '   ' }]
  }));
  await assert.rejects(
    repairCommand('translateHtml', ['--report', reportFile, '--patches', patchesFile, '--output', path.join(directory, 'x.html')]),
    /Invalid or empty replacement/
  );
});
