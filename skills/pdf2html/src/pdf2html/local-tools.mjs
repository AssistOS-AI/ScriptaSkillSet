import { readFile, mkdir, writeFile, access, readdir, rm, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { run } from './process.mjs';
import { installAsset } from './install.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function signLocalBinaries(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await signLocalBinaries(path);
    else if (item.isFile()) {
      const bytes = await readFile(path);
      if (bytes.length < 4 || ![0xfeedfacf, 0xfeedface, 0xcafebabe].includes(bytes.readUInt32LE(0))) continue;
      // Break package-cache hardlinks and use a fresh inode: macOS can retain
      // signature pages for a previously executed or relocated inode.
      const temporary = `${path}.sign-${process.pid}`;
      try {
        await writeFile(temporary, bytes, { mode: 0o755 });
        await run('/usr/bin/codesign', ['--force', '--sign', '-', temporary]);
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    }
  }
}
export async function installLocalTools() {
  const platform = `${process.platform}-${process.arch}`;
  const manifest = JSON.parse(await readFile(join(root, 'external/tool-packages', `${platform}.json`), 'utf8'));
  const cache = join(root, '.cache/tool-packages', platform), prefix = join(root, 'external/tools', platform);
  await mkdir(cache, { recursive: true });
  const archive = join(cache, 'micromamba.tar.bz2');
  await installAsset(archive, manifest.installer);
  const bootstrap = join(cache, 'bootstrap');
  await mkdir(bootstrap, { recursive: true });
  await run('tar', ['-xjf', archive, '-C', bootstrap, 'bin/micromamba', 'info/licenses']);
  const explicit = ['@EXPLICIT'];
  for (const asset of manifest.packages) {
    const path = join(cache, new URL(asset.url).pathname.split('/').at(-1));
    await installAsset(path, asset);
    explicit.push(`${pathToFileURL(path).href}#${asset.md5}`);
  }
  const spec = join(cache, 'explicit.txt');
  await writeFile(spec, `${explicit.join('\n')}\n`);
  // A partial environment belongs to this installer once conda-meta exists.
  try { await access(join(prefix, 'conda-meta')); await rm(prefix, { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await run(join(bootstrap, 'bin/micromamba'), ['create', '--yes', '--no-rc', '--root-prefix', join(cache, 'root'), '--prefix', prefix, '--file', spec], { timeout: 600000, env: { ...process.env, MAMBA_NO_BANNER: '1' } });
  if (process.platform === 'darwin') await signLocalBinaries(prefix);
  for (const name of ['pdfinfo', 'pdftoppm', 'qpdf']) await access(join(prefix, 'bin', name), constants.X_OK);
}
