import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const run = async (command, args, options = {}) => {
  if (['pdfinfo', 'pdftoppm', 'qpdf'].includes(command)) {
    const local = fileURLToPath(new URL(`../../external/tools/${process.platform}-${process.arch}/bin/${command}`, import.meta.url));
    if (existsSync(local)) command = local;
  }
  try { return await promisify(execFile)(command, args, { timeout: 120000, maxBuffer: 256 * 1024 * 1024, ...options }); }
  catch (error) {
    // QPDF uses exit status 3 for recoverable structural warnings while
    // explicitly reporting that the operation succeeded. Keep the warning in
    // the caller's stderr/evidence path instead of aborting extraction.
    if (String(command).endsWith('/qpdf') && error.code === 3 && /operation succeeded with warnings/i.test(String(error.stderr))) {
      return { stdout: error.stdout || '', stderr: error.stderr || '', warning: true };
    }
    throw new Error(`${command}: ${String(error.stderr || error.message).trim()}${error.killed ? ' (process timed out)' : ''}`, { cause: error });
  }
};
