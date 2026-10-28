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
  const result = { node: process.versions.node, runtimeRoot: fileURLToPath(new URL('../../', import.meta.url)), category: 'environment', missing: [], issues: [] };
  const labels = {
    pdfinfo: ['SYSTEM_TOOL_UNAVAILABLE', 'The Poppler pdfinfo utility cannot run.', 'Install Poppler in the workflow execution environment.'],
    pdftoppm: ['SYSTEM_TOOL_UNAVAILABLE', 'The Poppler pdftoppm utility cannot run.', 'Install Poppler in the workflow execution environment.'],
    qpdf: ['SYSTEM_TOOL_UNAVAILABLE', 'QPDF cannot run.', 'Install QPDF in the workflow execution environment.'],
    packages: ['JAVASCRIPT_RUNTIME_UNAVAILABLE', 'The pdf2html JavaScript packages are missing or incompatible.', 'Prepare the locked packages in the configured runtime directory.'],
    native: ['NATIVE_RUNTIME_UNAVAILABLE', 'The native engine files for this platform are missing or invalid.', 'Restore the declared platform files and verify their SHA-256 values.'],
    models: ['MODEL_RUNTIME_UNAVAILABLE', 'The required model files are missing or invalid.', 'Install the model versions declared in integrity.json; never replace expected hashes to accept an unknown download.'],
    docling: ['NATIVE_ENGINE_UNAVAILABLE', 'The native PDF engine cannot start.', 'Check the platform binaries and their shared libraries.'],
    chromium: ['BROWSER_LAUNCH_FAILED', 'Chromium could not be launched for validation.', 'Check the selected browser and its operating-system libraries.'],
  };
  const check = async (name, action) => { try { result[name] = await action(); } catch (error) {
    result[name] = null; result[`${name}_error`] = error.message; result.missing.push(name);
    const [code, message, action] = labels[name];
    result.issues.push({ component: name, code: /Invalid runtime asset:/.test(error.message) ? 'ASSET_INTEGRITY_MISMATCH' : code, message, detail: error.message, action });
  } };
  if (Number(process.versions.node.split('.')[0]) < 22) {
    result.missing.push('node>=22');
    result.issues.push({ component: 'node', code: 'UNSUPPORTED_NODE_VERSION', message: 'Node.js 22 or later is required.', detail: process.versions.node, action: 'Prepare the supported Node.js version in the execution environment.' });
  }
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
  const verifyAssets = async prefix => {
    const manifest = JSON.parse(await readFile(`${nativeRoot}integrity.json`, 'utf8'));
    let count = 0;
    for (const [name, expected] of Object.entries(manifest.files)) {
      if (!name.startsWith(prefix)) continue;
      count++;
      const bytes = await readFile(`${nativeRoot}${name}`);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== expected.bytes || actual !== expected.sha256) throw new Error(`Invalid runtime asset: ${name}. Expected ${expected.bytes} bytes, SHA-256 ${expected.sha256}; received ${bytes.length} bytes, SHA-256 ${actual}. Restore the declared version; do not change hashes to accept an unknown file.`);
    }
    if (!count) throw new Error(`No runtime assets are declared for ${prefix}.`);
    return manifest.version;
  };
  await check('native', () => verifyAssets(`${process.platform}-${process.arch}/`));
  await check('models', () => verifyAssets('models/'));
  if (result.native) await check('docling', async () => {
    const result = await run(process.execPath, [nativeWorker, '--probe'], { timeout: 30000 });
    if (!JSON.parse(result.stdout).includes('pdf')) throw new Error('Native engine has no PDF support.');
    return 'docling.rs 1.32.0';
  });
  if (verifyBrowser && result.packages) await check('chromium', async () => { const browser = await launchBrowser(); try { return browser.version(); } finally { await browser.close(); } });
  else if (verifyBrowser) { result.chromium = null; result.chromium_error = 'Browser launch was not checked because the JavaScript runtime is unavailable; this does not mean the browser binary is absent.'; }
  result.ok = !result.missing.length;
  result.missing.sort();
  result.summary = result.ok ? 'The selected pdf2html runtime is ready.' : `The selected pdf2html runtime is not ready: ${result.missing.join(', ')}. This diagnostic describes the environment, not a defect in the input PDF.`;
  return result;
}
export async function requireRuntime() {
  const runtime = await doctor();
  if (!runtime.ok) throw new Error(`${runtime.summary} Runtime: ${runtime.runtimeRoot}. ${runtime.issues.map(issue => `${issue.code}: ${issue.message} ${issue.detail}`).join('; ')}`);
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
