import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveExecutionRoot } from '../src/pdf2html/runtime-location.mjs';

try {
  const source = fileURLToPath(new URL('../', import.meta.url));
  const root = await resolveExecutionRoot(source, process.env.PDF2HTML_RUNTIME_ROOT);
  const child = spawn(process.execPath, [join(root, 'src/pdf2html/cli.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
  child.once('error', error => { console.error(`pdf2html: Could not start the prepared runtime: ${error.message}`); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch (error) {
  const report = { ok: false, category: 'environment', code: error.code || 'RUNTIME_CONFIGURATION_ERROR',
    runtimeRoot: process.env.PDF2HTML_RUNTIME_ROOT || null, message: error.message, documentConverted: false };
  if (process.argv[2] === 'doctor') console.log(JSON.stringify(report, null, 2));
  console.error(`pdf2html [${report.code}]: ${report.message}`);
  process.exitCode = 1;
}
