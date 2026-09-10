#!/usr/bin/env node
/** Rebuild previews and films from bundled, measured audio; no network, npm or TTS. */
import './build-fonts.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import '../runtime/shf-core.js';import {ROOT,inside} from './lib/paths.mjs';
import {runtime,standalone} from './lib/standalone.mjs';import {compileFilm} from './lib/director.mjs';import {compose,renderWav,MOODS} from './lib/music.mjs';
import {captionsVTT} from './shf.mjs';
const C=globalThis.SHFCore,write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'||Buffer.isBuffer(v)||v instanceof Uint8Array?v:JSON.stringify(v,null,2));};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
write(path.join(ROOT,'assets/player/shf-player.js'),runtime());
write(path.join(ROOT,'assets/player/FONT-LICENSE.txt'),fs.readFileSync(path.join(ROOT,'assets/fonts/OFL.txt')));
const music={};for(const name of Object.keys(MOODS)){const score=compose(name),result=renderWav(score);music[name]={mime:'audio/wav',data:result.bytes.toString('base64'),sha256:sha(result.bytes),rights:'MIT original procedural score and rendering',quality:'subtle-synthesized-demonstration'};write(path.join(ROOT,'assets/music',name+'.wav'),result.bytes);write(path.join(ROOT,'assets/music',name+'.score.json'),score);write(path.join(ROOT,'assets/music',name+'.metrics.json'),result.metrics);}
write(path.join(ROOT,'assets/music/catalog.json'),Object.keys(music).map(mood=>({id:mood,file:mood+'.wav',score:mood+'.score.json',license:'MIT',original:true,kind:'procedural underscore, not a classical recording'})));
const films=[];
for(const [name,mood] of [['visual-lab','playful'],['mars-library','wonder'],['freedom-practice','calm'],['governable-ai','clarity']]){
 const d=JSON.parse(fs.readFileSync(path.join(ROOT,name+'.ready.direction.json')));
 for(const a of Object.values(d.assets||{}))if(a.path){const b=fs.readFileSync(inside(ROOT,a.path));if(a.sha256&&sha(b)!==a.sha256)throw new Error('Media changed: re-measure '+a.path);a.data=b.toString('base64');delete a.path;}
 d.assets['music-'+mood]=music[mood];d.soundtrack={assetId:'music-'+mood,gain:.12,loop:true,defaultEnabled:false,mood};
 d.musicDisclosure='Muzică originală procedurală, opțională; nu o înregistrare clasică.';
 const f=compileFilm(d),report=C.validate(f);if(!report.valid)throw new Error(name+'\n'+report.errors.join('\n'));
 films.push(f);const out=path.join(ROOT,'examples/rendered');write(path.join(out,name+'.shf'),C.packFilm(f));write(path.join(out,name+'.html'),standalone([f]));write(path.join(out,name+'.vtt'),captionsVTT(f));write(path.join(out,name+'.validation.json'),report);
}
write(path.join(ROOT,'SHF_Preview.html'),standalone(films));write(path.join(ROOT,'SHF_Cinema_Demo.html'),standalone([films[0]]));
const silent=structuredClone(films);for(const f of silent){f.assets={};delete f.soundtrack;for(const s of f.scenes){delete s.audio;delete s.audioClips;delete s.music;}f.description=(f.description||'')+' · Previzualizare fără audio.';}
write(path.join(ROOT,'SHF_Preview_Silent.html'),standalone(silent));
write(path.join(ROOT,'evaluation/build.json'),{runtimeSha256:sha(Buffer.from(runtime())),films:films.map(f=>({id:f.id,scenes:f.scenes.length,lines:f.scenes.reduce((n,s)=>n+s.beats.length,0),durationMs:f.durationMs,nodes:C.validate(f).nodeCount})),musicCues:Object.keys(music).length});
console.log('Built portable player,',films.length,'films and',Object.keys(music).length,'original music cues.');
