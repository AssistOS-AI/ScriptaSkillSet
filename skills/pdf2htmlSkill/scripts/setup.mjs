#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { run } from '../src/pdf2html/process.mjs';
import { browserExecutable, loadPlaywright } from '../src/pdf2html/runtime.mjs';
import { installAsset, withInstallLock } from '../src/pdf2html/install.mjs';
import { installLocalTools } from '../src/pdf2html/local-tools.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'src/pdf2html/cli.mjs');
async function probe() {
  try { return JSON.parse((await run(process.execPath, [cli, 'doctor'], { timeout: 240000 })).stdout); }
  catch (error) {
    if (error.cause?.stdout) return JSON.parse(error.cause.stdout);
    throw error;
  }
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or later is required.');
  const platform = `${process.platform}-${process.arch}`;
  if (!['darwin-arm64', 'linux-arm64'].includes(platform)) throw new Error(`Automatic installation is not available for ${platform}. See references/dependencies.md.`);
  let report = await probe();
  if (!report.ok) await withInstallLock(root, async () => {
    report = await probe();
    if (report.ok) return;
    const manifest = JSON.parse(await readFile(join(root, 'external/native/integrity.json'), 'utf8'));
    // These platform binaries are supplied with the skill, not built on startup.
    for (const [name] of Object.entries(manifest.files)) if (name.startsWith(`${platform}/`)) await access(join(root, 'external/native', name));
    if (report.missing.includes('packages')) {
      process.stderr.write('Installing local JavaScript packages.\n');
      await run('npm', ['ci', '--prefix', join(root, 'external/runtime'), '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, '.cache/npm')], { timeout: 600000 });
    }
    if (report.missing.some(name => ['pdfinfo', 'pdftoppm', 'qpdf'].includes(name))) await installLocalTools();
    for (const [name, expected] of Object.entries(manifest.files)) if (name.startsWith('models/')) await installAsset(join(root, 'external/native', name), expected);
    const { chromium } = await loadPlaywright();
    const executablePath = await browserExecutable();
    let browserPresent = true;
    try { await access(executablePath || chromium.executablePath(), constants.X_OK); } catch { browserPresent = false; }
    // Playwright may have only the headless shell installed; a successful probe
    // already proves that browser usable.
    if (!browserPresent && report.missing.includes('chromium')) {
      process.stderr.write('Installing local Chromium.\n');
      const installed = await run(process.execPath, [join(root, 'external/runtime/node_modules/playwright-core/cli.js'), 'install', 'chromium'], { timeout: 600000 });
      if (installed.stdout) process.stderr.write(installed.stdout);
    }
    report = await probe();
    if (!report.ok) throw new Error(`Runtime preparation failed: ${report.missing.map(name => `${name}: ${report[`${name}_error`] || 'unavailable'}`).join('; ')}`);
  });
  if (!process.argv.includes('--ensure')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`pdf2html setup: ${error.message}\n`);
  process.exitCode = 1;
}
