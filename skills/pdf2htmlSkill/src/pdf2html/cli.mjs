#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { doctor } from './runtime.mjs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const help=`Usage: pdf2html doctor
       pdf2html convert [PDF_OR_DIRECTORY ...] [--output DIRECTORY] [--lang CODE]
                        [--title TEXT] [--image-scale NUMBER] [--overwrite] [--keep-qa-artifacts]
       pdf2html validate INPUT --html INDEX_HTML [--keep-qa-artifacts]\n`;
try {
  if (process.argv[2] === 'decorations') {
    if (process.argv.length !== 4) throw new Error('Usage: pdf2html decorations INPUT.pdf');
    const { inspectSource } = await import('./source.mjs');
    const { paragraphBorders } = await import('./decorations.mjs');
    const { sourceLists } = await import('./lists.mjs');
    const source = await inspectSource(process.argv[3]);
    process.stdout.write(JSON.stringify({ sourceSha256: source.profile.sha256, ...paragraphBorders(source.evidence), lists: sourceLists(source.evidence) }) + '\n');
    process.exit(0);
  }
  if (process.argv[2] === 'fonts') {
    if (process.argv.length !== 5) throw new Error('Usage: pdf2html fonts INPUT.pdf OUTPUT_DIRECTORY');
    const { inspectSource, extractFonts } = await import('./source.mjs');
    const source = await inspectSource(process.argv[3]);
    process.stdout.write(JSON.stringify({ sourceSha256: source.profile.sha256, fonts: await extractFonts(source.profile.path, source.qpdf, process.argv[4]) }) + '\n');
    process.exit(0);
  }
  if (process.argv[2] === 'repair') {
    const { repairCommand } = await import('../repair.mjs');
    console.log(JSON.stringify(await repairCommand('pdf2html', process.argv.slice(3)), null, 2));
    process.exit(0);
  }
  const {values,positionals}=parseArgs({allowPositionals:true,options:{output:{type:'string'},lang:{type:'string'},title:{type:'string'},html:{type:'string'},'image-scale':{type:'string'},overwrite:{type:'boolean'},'keep-qa-artifacts':{type:'boolean'},help:{type:'boolean',short:'h'}}});
  const [command,...inputs]=positionals;
  if(values.help) process.stdout.write(help);
  else {
    if (['convert', 'validate'].includes(command)) {
      if (command === 'validate' && (inputs.length !== 1 || !values.html)) throw new Error('validate requires one input PDF and --html.');
      if (command === 'convert' && values.output && inputs.length !== 1) throw new Error('--output requires exactly one input PDF.');
      if (values['image-scale'] !== undefined && (!Number.isFinite(Number(values['image-scale'])) || Number(values['image-scale']) <= 0)) throw new Error('--image-scale must be greater than zero.');
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('../../scripts/setup.mjs', import.meta.url)), '--ensure'], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 1900000 });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('Automatic runtime preparation failed. See the setup diagnostic above.')));
      });
    }
    let result;
    if(command==='doctor') {if(inputs.length) throw new Error('doctor does not accept inputs.');result=await doctor();if(!result.ok)process.exitCode=1;}
    else if(command==='convert') {
      const options={title:values.title,imageScale:values['image-scale']===undefined?2:Number(values['image-scale']),overwrite:!!values.overwrite,keepQaArtifacts:!!values['keep-qa-artifacts']};
      if(values.output) {if(inputs.length!==1) throw new Error('--output requires exactly one input PDF.'); const {convertPdf}=await import('./converter.mjs');result=await convertPdf(inputs[0],values.output,{...options,language:values.lang||'und'});}
      else {const {convertMany}=await import('./batch.mjs');result=await convertMany(inputs,{...options,defaultLanguage:values.lang});}
    } else if(command==='validate') {if(inputs.length!==1 || !values.html) throw new Error('validate requires one input PDF and --html.');const {validateExisting}=await import('./converter.mjs');result=await validateExisting(inputs[0],values.html,!!values['keep-qa-artifacts']);}
    else throw new Error(help.trim());
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }
} catch(error) {process.stderr.write(`pdf2html: ${error.message}\n`);process.exitCode=1;}
