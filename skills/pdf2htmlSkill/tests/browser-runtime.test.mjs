import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

for (const configured of [undefined, join(tmpdir(), 'pdf2html-custom-browser-cache')]) {
  test(`doctor initializes Playwright with ${configured ? 'explicit' : 'skill-local'} browser directory before import`, async () => {
    const env = { ...process.env };
    delete env.PLAYWRIGHT_BROWSERS_PATH;
    delete env.PDF2HTML_CHROMIUM_EXECUTABLE;
    if (configured) env.PLAYWRIGHT_BROWSERS_PATH = configured;
    const code = `
      const runtime = await import('./src/pdf2html/runtime.mjs');
      const selected = await runtime.browserExecutable();
      const report = await runtime.doctor({ verifyBrowser: false });
      const { chromium } = await import('./external/runtime/node_modules/playwright-core/index.mjs');
      process.stdout.write(JSON.stringify({ packages: report.packages, executable: chromium.executablePath(), selected, after: await runtime.browserExecutable() }));
    `;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env, timeout: 120000, maxBuffer: 1048576 });
    const result = JSON.parse(stdout);
    assert.equal(result.packages, 'available');
    assert.ok(result.executable.startsWith((configured ?? join(root, 'external/browser')) + '/'), result.executable);
    assert.equal(result.after, result.selected);
  });
}
