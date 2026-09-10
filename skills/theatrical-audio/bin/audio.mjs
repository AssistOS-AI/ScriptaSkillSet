#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {ROOT,VERSION,parseArgs,checkOptions,readJSON,writeJSON,exists,fail} from '../src/util.mjs';
import {validateScore} from '../src/schema.mjs';
import {render,auditBundle} from '../src/render.mjs';
import {draftScore} from '../src/draft.mjs';
import {makePreview} from '../src/preview.mjs';
import {createBackend} from '../src/backend.mjs';
import {loadWorkspaceEnvironment,resolveOptions,CLOUD_ENGINES,ENGINES,VOICE_FIELDS} from '../src/config.mjs';
import {planScene} from '../src/plan.mjs';
import {CATALOG,providerListing} from '../src/providers.mjs';
import {staticVoices} from '../src/extra-cloud.mjs';
import {createAudioTemplates} from '../src/templates.mjs';
import {OPENAI_VOICES} from '../src/cloud.mjs';

const shared = ['engine','config','settings','python','timeout-ms','offline','model'];
const renderOptions = [...shared,'out','takes','cache','allow-degraded','voice','refresh','max-requests','max-chars','request-interval-ms','free-tier-only','no-audition'];
const help=`Theatrical Audio ${VERSION} — independent speech clips and animation timelines

node bin/audio.mjs say "David... don't turn around." --engine openai \\
  --voice marin --direction "Quiet, restrained fear. Almost whisper." --out demo.wav
node bin/audio.mjs providers [--free-only]
node bin/audio.mjs plan SCORE.json --engine gemini [--free-tier-only]
node bin/audio.mjs setup gemini|groq|hume|cartesia|elevenlabs|azure|cloudflare|google|voicerss|deepgram|mistral|polly|openai
node bin/audio.mjs setup piper --voice ro_RO-mihai-medium --download
node bin/audio.mjs setup qwen|kokoro --download [--device cpu|cuda:0] [--python python3.12]
node bin/audio.mjs draft TEXT.txt --out scene.score.json [--direction "..."]
node bin/audio.mjs validate SCORE.json
node bin/audio.mjs render SCORE.json [--engine NAME]
  [--out DIRECTORY] [--takes 1..5] [--voice NAME_OR_ID] [--model MODEL]
  [--settings audio.config.json] [--config LOCAL_RUNTIME.json] [--cache DIRECTORY]
  [--offline] [--refresh] [--max-requests 100] [--max-chars 1000000]
  [--request-interval-ms 6500] [--free-tier-only] [--no-audition] [--allow-degraded]
node bin/audio.mjs verify BUNDLE_DIRECTORY
node bin/audio.mjs preview BUNDLE_DIRECTORY --out preview.html
node bin/audio.mjs voices [SCORE.json] [--engine NAME] [--page-token TOKEN]
node bin/audio.mjs doctor [--engine NAME] [--settings PATH] [--config PATH]

say additionally accepts --text-file PATH, --pace 0.5..2, --tags "whispers,curious",
  --emotion scared, --stability 0|0.5|1, --style fearful, --style-degree 1.2.

Requires Node >=22; no npm install, server, browser or FFmpeg. Cloud uses environment
keys. Optional --credentials-file PATH loads a TTS .env file; --workspace-root DIRECTORY
opts into that directory's .apikeys. Shell values win. No parent search or implicit cloud fallback.
Defaults to local Piper unless selected by --engine, AUDIO_ENGINE or audio.config.json.
Kokoro needs --allow-degraded (voice/rate, not free-form acting); test-tone is NOT speech.
Local neural models and private Python packages require explicit one-time preparation.
`;
function ensureValues(options) {
  const flags = ['offline','refresh','no-audition','allow-degraded','download','help','free-only','free-tier-only'];
  for (const [key,value] of Object.entries(options)) {
    if (flags.includes(key) && value !== true) fail(`--${key} is a boolean flag and takes no value`);
    if (!flags.includes(key) && value === true) fail(`--${key} requires a value`);
  }
}
async function setup(engine, options) {
  if (!ENGINES.includes(engine) || engine === 'test-tone') fail('Choose '+ENGINES.filter(x=>x!=='test-tone').join(', '));
  if (CLOUD_ENGINES.includes(engine)) {
    for (const key of Object.keys(options)) if (!['engine','settings'].includes(key)) fail(`--${key} is only used when preparing a local model`);
  } else {
    const executable = options.python ?? (process.platform === 'win32' ? 'python' : 'python3');
    const args = engine === 'piper' ? [path.join(ROOT,'tools/setup_piper.py'), '--voice', options.voice ?? 'en_US-ljspeech-medium'] : [path.join(ROOT,'tools/bootstrap.py'),'--engine',engine];
    for (const key of ['device','mode','revision','torch-index','wheelhouse','lock','prepare-wheelhouse','models-dir']) if (options[key]) args.push('--'+key,options[key]);
    if (options.download) args.push('--download');
    await new Promise((resolve,reject) => {
      const child = spawn(executable,args,{stdio:'inherit',cwd:ROOT});
      child.on('error',e=>reject(new Error(`Cannot start ${executable}: ${e.message}. Use --python PATH_TO_PYTHON_3_12.`)));
      child.on('exit',code=>code===0?resolve():reject(new Error(`Local preparation failed (exit ${code}); default engine was not changed.`)));
    });
  }
  const file = path.resolve(options.settings ?? 'audio.config.json');
  const settings = await exists(file) ? await readJSON(file) : {};
  // Validate existing provider settings before preserving them.
  await resolveOptions({ settings: file, engine }).catch(error => { if (Object.keys(settings).length) throw error; });
  await writeJSON(file,{...settings,engine});
  await createAudioTemplates(path.dirname(file));
  return {engine,settings:file,requiredEnvironment: CATALOG.providers[engine]?.requiredEnvironment??[],
    message:CLOUD_ENGINES.includes(engine)?'Set keys in the process environment or use --credentials-file PATH. No API request has been made.':'Local runtime prepared. doctor checks setup; say performs actual inference.'};
}
async function say(text, options) {
  if (options['no-audition']) fail('say always exports one dry WAV; --no-audition is for render');
  if (text && options['text-file']) fail('Use either positional text or --text-file, not both');
  if (options['text-file']) text=await fs.readFile(path.resolve(options['text-file']),'utf8');
  if (typeof text!=='string'||!text.trim()) fail('Pass a quoted line, or --text-file PATH');
  options=await resolveOptions(options);
  const out = path.resolve(options.out ?? 'output/line.wav');
  if (!/\.wav$/i.test(out)) fail('say --out must end in .wav (no codec installation is required)');
  const voice = {label:'Speaker',qwenSpeaker:'Ryan',kokoroVoice:'af_heart'};
  if (options.voice && VOICE_FIELDS[options.engine]) voice[VOICE_FIELDS[options.engine]]=options.voice;
  const direction = {delivery:options.direction ?? '',pace:Number(options.pace ?? 1)};
  if (options.emotion) direction.emotion=options.emotion;
  if(options.tags && options.engine==='groq') direction.groq={tags:options.tags.split(',').map(s=>s.trim()).filter(Boolean)};
  if(options.tags && !['groq','elevenlabs'].includes(options.engine)) fail('--tags is implemented for Groq/ElevenLabs; use --emotion with Cartesia or --direction with Gemini/Hume');
  if ((options.tags || options.stability) && options.engine==='elevenlabs') direction.elevenlabs={...(options.tags?{tags:options.tags.split(',').map(s=>s.trim()).filter(Boolean)}:{}),...(options.stability!==undefined?{stability:Number(options.stability)}:{})};
  if (options.style || options['style-degree']) direction.azure={...(options.style?{style:options.style}:{}),...(options['style-degree']?{styleDegree:Number(options['style-degree'])}:{})};
  const score={format:'theatrical-audio/1',id:'single-line',title:'Voice audition',language:options.language ?? 'en',voices:{speaker:voice},
    settings:{sampleRate:24000,takes:Number(options.takes??1),tailSeconds:0},beats:[{id:'line',type:'speech',speaker:'speaker',text:text.trim(),direction}]};
  validateScore(score,await readJSON(path.join(ROOT,'schemas/score.schema.json')));
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'theatrical-say-'));
  try {
    const file=path.join(temp,'score.json');await writeJSON(file,score);
    const result=await render(file,{...options,out:out.slice(0,-4)+'.scene','no-audition':true});
    const event=result.timeline.events.find(e=>e.kind==='speech');
    const dry=result.timeline.assets[event.dryAsset];
    await fs.mkdir(path.dirname(out),{recursive:true});await fs.copyFile(path.join(result.outDir,dry.file),out);
    return {output:out,scene:result.outDir,durationSeconds:dry.durationSeconds,...result.evidence,warnings:result.timeline.provenance.warnings};
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}
try {
  if (Number(process.versions.node.split('.')[0])<22) fail('Use Node.js 22 or later');
  const {positional,options}=parseArgs(process.argv.slice(2));
  let [command,file]=positional;
  if(!command || command==='help'||options.help){console.log(help);process.exit(0);}
  if(positional.length>2) fail('Too many positional arguments; quote text as one argument');
  ensureValues(options);
  const environmentOptions = {};
  for (const key of ['credentials-file','workspace-root']) {
    if (options[key] !== undefined) environmentOptions[key] = options[key];
    delete options[key];
  }
  if (['say','render','plan','voices','doctor'].includes(command)) {
    await loadWorkspaceEnvironment(process.cwd(), process.env, environmentOptions);
  }
  let result;
  if(command==='providers'){
    checkOptions(options,['free-only']);result=providerListing({freeOnly:!!options['free-only']});
  }else if(command==='plan'){
    checkOptions(options,[...shared,'voice','takes','allow-degraded','free-tier-only']);if(!file)fail('Pass a score file');
    result=await planScene(path.resolve(file),options);
  }else if(command==='validate'){
    checkOptions(options,[]);if(!file)fail('Pass a score JSON file');
    const score=await readJSON(file);validateScore(score,await readJSON(path.join(ROOT,'schemas/score.schema.json')));
    result={valid:true,score:score.id,beats:score.beats.length};
  }else if(command==='setup'){
    checkOptions(options,['engine','settings','python','device','mode','download','revision','torch-index','wheelhouse','lock','prepare-wheelhouse','models-dir','voice']);
    result=await setup(file??options.engine,options);
  }else if(command==='say'){
    checkOptions(options,[...renderOptions,'direction','text-file','pace','tags','stability','style','style-degree','emotion','language']);
    result=await say(file,options);
  }else if(command==='draft'){
    checkOptions(options,['out','direction','title']);if(!file||typeof options.out!=='string')fail('Pass TEXT.txt --out scene.score.json');
    const score=draftScore(await fs.readFile(file,'utf8'),{title:options.title??'Untitled scene',direction:options.direction??''});
    await writeJSON(path.resolve(options.out),score);result={output:options.out,beats:score.beats.length,semanticDirection:'agent-or-human-required'};
  }else if(command==='render'){
    checkOptions(options,renderOptions);if(!file)fail('Pass a score file');
    const r=await render(path.resolve(file),options);result={output:r.outDir,durationSeconds:r.timeline.durationSeconds,...r.evidence,warnings:r.timeline.provenance.warnings};
  }else if(command==='verify'){
    checkOptions(options,[]);if(!file)fail('Pass the bundle directory');result=await auditBundle(path.resolve(file));
  }else if(command==='preview'){
    checkOptions(options,['out']);if(!file||typeof options.out!=='string')fail('Pass BUNDLE --out preview.html');result=await makePreview(path.resolve(file),path.resolve(options.out));
  }else if(command==='voices'){
    checkOptions(options,[...shared,'page-token']);
    if(file){const score=await readJSON(file);result={kind:'configured-cast',voices:score.voices};}
    else {
      const o=await resolveOptions(options);
      if(o.engine==='openai') result={engine:o.engine,source:'documented-built-ins',voices:OPENAI_VOICES,accountAccessVerified:false};
      else if(staticVoices(o.engine)) result=staticVoices(o.engine);
      else if(CLOUD_ENGINES.includes(o.engine)){const b=await createBackend(o.engine,o);try{result=await b.voices(options['page-token']);}finally{await b.close();}}
      else if(o.engine==='piper'){const b=await createBackend(o.engine,o);try{result={engine:o.engine,voices:[b.info.voice],language:b.info.language,source:'prepared-local-model'};}finally{await b.close();}}
      else if(o.engine==='qwen')result={engine:o.engine,source:'documented-English-CustomVoice-speakers',voices:['Ryan','Aiden'],note:'VoiceDesign uses a description instead. The installed model is authoritative.'};
      else if(o.engine==='kokoro')result={engine:o.engine,voices:['af_heart','af_bella','am_adam','bf_emma','bm_george'],exhaustive:false};
      else result={engine:o.engine,voices:[],note:'test-tone is not speech'};
    }
  }else if(command==='doctor'){
    checkOptions(options,shared);
    const o=await resolveOptions(options), b=await createBackend(o.engine,o);
    try{result={preflight:true,inferenceTested:false,serverRequired:false,automaticDownloads:false,...b.info};}finally{await b.close();}
  }else fail('Unknown command '+command+'; use help');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
