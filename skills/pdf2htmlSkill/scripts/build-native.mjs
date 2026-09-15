#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { run } from '../src/pdf2html/process.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  if(!['darwin','linux'].includes(process.platform))throw new Error('Native builds require macOS or Linux.');
  const source=join(root,'external/docling-source'),target=join(root,'.cache/native-build');
  const version=(await run('rustc',['--version'])).stdout.match(/rustc (\d+)\.(\d+)/);
  if(!version||Number(version[1])<1||Number(version[1])===1&&Number(version[2])<88)throw new Error('Rust 1.88 or later and a C/C++ linker are required.');
  const triple=`${process.arch==='arm64'?'aarch64':'x86_64'}-unknown-linux-gnu`;
  const args=process.platform==='linux'?['zigbuild','--target',`${triple}.2.28`]:['build'];
  if(process.platform==='linux') {
    await run('zig',['version']);
    await run('cargo',['zigbuild','--version']);
  }
  await run('cargo',[...args,'--locked','--release','--package','docling-node','--target-dir',target],{cwd:source,timeout:3600000});
  const platform=`${process.platform}-${process.arch}`,destination=join(root,'external/native',platform);
  await mkdir(destination,{recursive:true});
  await cp(process.platform==='darwin'?join(target,'release/libdocling_node.dylib'):join(target,triple,'release/libdocling_node.so'),join(destination,'docling.node'));
  const path=join(root,'external/native/integrity.json'),manifest=JSON.parse(await readFile(path,'utf8')),bytes=await readFile(join(destination,'docling.node'));
  manifest.files[`${platform}/docling.node`]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Built ${platform}/docling.node. Install the matching PDFium library and run scripts/pdf2html doctor.\n`);
} catch(error) {process.stderr.write(`pdf2html build: ${error.message}\n`);process.exitCode=1;}
