import { readdir, readFile, realpath, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const problem = (code, message) => Object.assign(new Error(message), { code });
async function codeFiles(root, folder) {
  const files = [];
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const name = join(folder, entry.name);
    if (entry.isSymbolicLink()) throw problem('RUNTIME_CODE_LINK', `Runtime code must not contain symbolic links: ${name}`);
    if (entry.isDirectory()) files.push(...await codeFiles(root, name));
    else if (entry.isFile()) files.push(name);
    else throw problem('RUNTIME_CODE_INVALID', `Unsupported runtime code entry: ${name}`);
  }
  return files.sort();
}

export async function resolveExecutionRoot(sourceRoot, configuredRoot) {
  const source = await realpath(sourceRoot);
  if (!configuredRoot) return source;
  let prepared;
  try { prepared = await realpath(configuredRoot); }
  catch { throw problem('PREPARED_RUNTIME_MISSING', `The configured pdf2html runtime does not exist: ${configuredRoot}. Prepare it before running the workflow; the PDF has not been converted.`); }
  if (prepared === source) return source;
  const sourceFiles = [...await codeFiles(source, 'src'), ...await codeFiles(source, 'scripts')].sort();
  let preparedFiles;
  try { preparedFiles = [...await codeFiles(prepared, 'src'), ...await codeFiles(prepared, 'scripts')].sort(); }
  catch (error) { if (error.code?.startsWith('RUNTIME_')) throw error; throw problem('PREPARED_RUNTIME_INCOMPLETE', 'The prepared pdf2html runtime is missing its source code. Prepare the complete matching skill.'); }
  if (JSON.stringify(sourceFiles) !== JSON.stringify(preparedFiles)) throw problem('PREPARED_RUNTIME_VERSION_MISMATCH', 'The prepared pdf2html code differs from the selected skill. Refresh the prepared runtime before execution.');
  for (const name of [...sourceFiles, 'external/native/integrity.json', 'external/runtime/package.json', 'external/runtime/package-lock.json']) {
    const target = join(prepared, name);
    const resolved = await realpath(target).catch(() => null);
    if (!resolved || relative(prepared, resolved).startsWith('..') || !(await lstat(target)).isFile()) throw problem('PREPARED_RUNTIME_INCOMPLETE', `Prepared runtime file is missing or outside its root: ${name}`);
    const [original, installed] = await Promise.all([readFile(join(source, name)), readFile(target)]);
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    if (hash(original) !== hash(installed)) throw problem('PREPARED_RUNTIME_VERSION_MISMATCH', `Prepared runtime does not match the selected skill: ${name}. Refresh it; do not bypass the integrity check.`);
  }
  return prepared;
}
