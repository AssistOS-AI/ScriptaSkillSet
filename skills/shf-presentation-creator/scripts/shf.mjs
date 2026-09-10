#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';
import '../runtime/shf-core.js';
import {compileFilm} from './lib/director.mjs';import {analyzeText} from './lib/analyze.mjs';
import {standalone,runtime} from './lib/standalone.mjs';import {ROOT,inside} from './lib/paths.mjs';
import {CATALOG} from './lib/asset-library.mjs';import {voiceTasks,attachVoice} from './lib/voice.mjs';import {compose,renderWav} from './lib/music.mjs';
const C=globalThis.SHFCore;
const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,data)=>{fs.mkdirSync(path.dirname(path.resolve(p)),{recursive:true});fs.writeFileSync(p,typeof data==='string'||Buffer.isBuffer(data)||data instanceof Uint8Array?data:JSON.stringify(data,null,2));};
export async function readFilm(file){const bytes=fs.readFileSync(file);if(bytes[0]===0x50&&bytes[1]===0x4b)return C.loadFile(new Blob([bytes]));let f=JSON.parse(bytes.toString('utf8'));if(f.format==='SHF-Direction')f=compileFilm(f);for(const a of Object.values(f.assets||{}))if(a.path&&!a.data)a.data=fs.readFileSync(inside(path.dirname(path.resolve(file)),a.path)).toString('base64');const v=C.validate(f);if(!v.valid)throw new Error(v.errors.join('\n'));return f;}
const vttTime=n=>{n=Math.round(n);const s=Math.floor(n/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(Math.round(n%1000)).padStart(3,'0');};
export function captionsVTT(f){let out='WEBVTT\n\n',offset=0;for(const s of f.scenes){for(const b of s.captions||s.beats||[])out+=vttTime(offset+b.startMs)+' --> '+vttTime(offset+b.endMs)+'\n'+b.text.replace(/-->/g,'→')+'\n\n';offset+=s.durationMs;}return out;}
export function installPlayer(target){
 const dest=path.resolve(target),files={'shf-player.js':runtime(),'FONT-LICENSE.txt':fs.readFileSync(path.join(ROOT,'assets/fonts/OFL.txt'),'utf8'),'LICENSE':fs.readFileSync(path.join(ROOT,'LICENSE'),'utf8'),'embed.html':'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script src="./shf-player.js"></script><shf-player id="film"></shf-player><input type="file" accept=".shf" id="open"><script>document.getElementById("open").onchange=e=>document.getElementById("film").loadFile(e.target.files[0]);</script>'};
 for(const [name,data]of Object.entries(files)){const p=path.join(dest,name);if(fs.existsSync(p)&&fs.readFileSync(p,'utf8')!==data)throw new Error('Refusing to overwrite a different existing file: '+p+' . Choose a new directory or reconcile changes.');}
 fs.mkdirSync(dest,{recursive:true});for(const [n,v]of Object.entries(files))fs.writeFileSync(path.join(dest,n),v);
 return {directory:dest,files:Object.keys(files),runtimeSha256:crypto.createHash('sha256').update(files['shf-player.js']).digest('hex')};
}
export async function main(args=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('SHF authoring requires Node.js 22 or later; see dependencies.md in the skill folder.');
 const [cmd,input,out,...flags]=args,opts=Object.fromEntries(flags.filter(x=>x.startsWith('--')).map(x=>x.slice(2).split('=')));
 if(!cmd){console.log('SHF toolkit\n  install-player TARGET_DIRECTORY\n  analyze SOURCE.txt ANALYSIS.json [--language=en] [--minutes=7] [--genre=auto]\n  compile DIRECTION.json OUTPUT_DIRECTORY\n  validate FILM.shf\n  voice-tasks DIRECTION.json TASKS.json\n  attach-voice DIRECTION.json RECEIPTS.json OUTPUT.json\n  catalog QUERY\n  music MOOD OUTPUT.wav\n  captions FILM.shf OUTPUT.vtt');return;}
 if(cmd==='install-player'){if(!input)throw new Error('Target directory required.');console.log(JSON.stringify(installPlayer(input),null,2));return;}
 if(cmd==='analyze'){if(!out)throw new Error('Output required.');write(out,analyzeText(fs.readFileSync(input,'utf8'),{title:path.basename(input),language:opts.language||'en',targetMinutes:Number(opts.minutes||7),genre:opts.genre||'auto'}));return;}
 if(cmd==='catalog'){const q=(input||'').toLowerCase();console.log(JSON.stringify(CATALOG.filter(x=>JSON.stringify(x).toLowerCase().includes(q)),null,2));return;}
 if(cmd==='voice-tasks'){const d=readJSON(input);write(out,voiceTasks(d));write(out.replace(/\.json$/i,'')+'.direction.json',d);return;}
 if(cmd==='attach-voice'){const [output]=flags;if(!output)throw new Error('Output direction path required after receipts.');const result=attachVoice(readJSON(input),readJSON(out),path.dirname(path.resolve(out)));write(output,result.direction);write(output+'.audio-report.json',result.report);return;}
 if(cmd==='music'){if(!out)throw new Error('WAV output required.');const score=compose(input),render=renderWav(score);write(out,render.bytes);write(out+'.score.json',score);write(out+'.metrics.json',render.metrics);return;}
 const f=await readFilm(input);
 if(cmd==='validate'){console.log(JSON.stringify(C.validate(f),null,2));return;}
 if(cmd==='captions'){write(out,captionsVTT(f));return;}
 if(cmd==='compile'){if(!out)throw new Error('Output directory required.');write(path.join(out,f.id+'.shf'),C.packFilm(f));write(path.join(out,f.id+'.html'),standalone([f]));write(path.join(out,f.id+'.vtt'),captionsVTT(f));write(path.join(out,'validation.json'),C.validate(f));console.log(JSON.stringify({id:f.id,durationMs:f.scenes.reduce((a,s)=>a+s.durationMs,0),output:path.resolve(out)},null,2));return;}
 throw new Error('Unknown command '+cmd);
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('SHF:',e.message);process.exitCode=1;});
