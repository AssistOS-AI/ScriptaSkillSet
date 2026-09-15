import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
export const nativeRoot = fileURLToPath(new URL('../../external/native/', import.meta.url));
export const nativeWorker = fileURLToPath(new URL('./native-worker.mjs', import.meta.url));
export async function browserExecutable() {
  if (process.env.PDF2HTML_CHROMIUM_EXECUTABLE) return process.env.PDF2HTML_CHROMIUM_EXECUTABLE;
  if (process.platform === 'linux' && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
    for (const path of ['/usr/bin/chromium-browser', '/usr/bin/chromium']) {
      try { await access(path, constants.X_OK); return path; } catch {}
    }
  }
  return undefined;
}
export async function loadPlaywright() {
  const executablePath = await browserExecutable();
  // This setting also applies to subsequent browser launches in the same process.
  if (executablePath) process.env.PDF2HTML_CHROMIUM_EXECUTABLE = executablePath;
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= fileURLToPath(new URL('../../external/browser/', import.meta.url));
  return import('../../external/runtime/node_modules/playwright-core/index.mjs');
}
export async function launchBrowser() {
  const { chromium } = await loadPlaywright();
  const executablePath = await browserExecutable();
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}
export async function doctor({ verifyBrowser = true } = {}) {
  const result = { node: process.versions.node, missing: [] };
  const check = async (name, action) => { try { result[name] = await action(); } catch (error) { result[name] = null; result[`${name}_error`] = error.message; result.missing.push(name); } };
  if (Number(process.versions.node.split('.')[0]) < 22) result.missing.push('node>=22');
  for (const command of ['pdfinfo', 'pdftoppm', 'qpdf']) await check(command, async () => {
    const output = await run(command, [command === 'qpdf' ? '--version' : '-v'], { timeout: 60000 });
    return (output.stdout || output.stderr).trim().split('\n')[0];
  });
  await check('packages', async () => {
    await loadPlaywright();
    await import('../../external/runtime/node_modules/@napi-rs/canvas/index.js');
    for (const module of ['cheerio', 'pngjs']) await import(`../../external/runtime/node_modules/${module}/${module === 'cheerio' ? 'lib/index.js' : 'lib/png.js'}`);
    await import('../../external/runtime/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    return 'available';
  });
  await check('models', async () => {
    const manifest = JSON.parse(await readFile(`${nativeRoot}integrity.json`, 'utf8'));
    for (const [name, expected] of Object.entries(manifest.files)) {
      if (name.includes('/') && !name.startsWith('models/') && !name.startsWith(`${process.platform}-${process.arch}/`)) continue;
      const bytes = await readFile(`${nativeRoot}${name}`);
      if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Invalid runtime asset: ${name}. Restore it using the installation instructions in references/dependencies.md.`);
    }
    return manifest.version;
  });
  await check('docling', async () => {
    const result = await run(process.execPath, [nativeWorker, '--probe'], { timeout: 30000 });
    if (!JSON.parse(result.stdout).includes('pdf')) throw new Error('Native engine has no PDF support.');
    return 'docling.rs 1.32.0';
  });
  if (verifyBrowser) await check('chromium', async () => { const browser = await launchBrowser(); try { return browser.version(); } finally { await browser.close(); } });
  result.ok = !result.missing.length;
  result.missing.sort();
  return result;
}
export async function requireRuntime() {
  const runtime = await doctor();
  if (!runtime.ok) throw new Error(`Missing or incompatible runtime dependencies: ${runtime.missing.join(', ')}. See references/dependencies.md. Details: ${runtime.missing.map(name => runtime[`${name}_error`] ?? name).join('; ')}`);
  return runtime;
}
export async function extractDocument(path) {
  const result = await run(process.execPath, [nativeWorker, path], { timeout: 3600000 });
  if (/DBG final table .*rows=None/.test(result.stderr)) throw new Error('TableFormer did not produce a structure for a detected table. Conversion stopped before publication.');
  if (/tableformer.*(?:failed|unavailable|fallback)|(?:failed|unable) to load.*(?:model|layout|tableformer)/i.test(result.stderr)) throw new Error(`Structural model failure: ${result.stderr.trim()}`);
  const document = JSON.parse(result.stdout);
  if (document.schema_name !== 'DoclingDocument') throw new Error('Structural engine returned an unsupported document.');
  return document;
}
