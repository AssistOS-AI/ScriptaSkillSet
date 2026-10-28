import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../skills/', import.meta.url);
test('every portable skill folder matches its canonical SKILL.md name', async () => {
  const names = new Set();
  for (const directory of await fs.readdir(root, {withFileTypes:true})) {
    if (!directory.isDirectory() || directory.name.startsWith('.')) continue;
    const file = new URL(`${directory.name}/SKILL.md`, root);
    const text = await fs.readFile(file, 'utf8');
    const name = /^name:\s*([^\r\n]+)$/m.exec(text)?.[1].trim();
    assert.match(name || '', /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Invalid canonical name in ${directory.name}`);
    assert.equal(directory.name, name, `Folder and descriptor identity disagree: ${directory.name}`);
    assert.equal(names.has(name), false, `Duplicate skill name: ${name}`);
    names.add(name);
  }
  assert.ok(names.size > 0);
});
