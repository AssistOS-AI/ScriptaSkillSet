import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inside} from './paths.mjs';
import '../../runtime/shf-core.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function voiceTasks(direction){
 const tasks=[];
 for(const scene of direction.scenes)for(const [i,b]of (scene.beats||[]).entries()){
  if(!b.id)b.id=scene.id+'-line-'+String(i+1).padStart(2,'0');
  if(globalThis.SHFCore.splitSentences(b.text,direction.language||'en').length!==1)throw new Error('Use exactly one sentence per narration beat: '+b.id);
  const director=b.performance||{};
  tasks.push({id:b.id,sceneId:scene.id,text:b.text,language:direction.language||'en',speakerId:b.speakerId||'narrator',
   context:{filmTitle:direction.title,sceneTitle:scene.title,sceneIntent:scene.intent||scene.promise||'',previousLine:scene.beats[i-1]?.text||'',nextLine:scene.beats[i+1]?.text||''},
   performance:{delivery:'engaged, intimate, clear; not an advertisement',emotion:scene.emotion||'curiosity',intensity:.3,targetWpm:140,pauseBeforeMs:250,pauseAfterMs:1000,emphasize:[],pronunciations:direction.pronunciations||{},avoid:['shouting','singsong cadence','reading stage directions','invented words'],...director},
   output:{file:'audio/'+b.id+'.wav',preferredFormat:'wav-pcm16',preferredSampleRate:24000,alignment:'word timestamps preferred; otherwise line-level with explicit alignmentQuality'},
   continuity:{voiceId:direction.voice?.id||'choose-once-and-lock',referenceAudio:direction.voice?.referenceAudio||null,rule:'Keep speaker identity, accent, mic distance and loudness stable across lines.'},
   privacy:{sourceRights:direction.editorial?.rights||'verify-before-publication',sendOnlyNeededContext:true},
   status:'pending-provider-selection'});
 }
 return {format:'SHF-VoiceTasks',version:'1',filmId:direction.id,selection:'Inspect actual environment skills/tools; choose an available compatible TTS provider. Do not invent a skill or API.',tasks};
}
export function audioInfo(file){
 const b=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE'){
  let pos=12,rate=0,data=0;while(pos+8<=b.length){const id=b.toString('ascii',pos,pos+4),n=b.readUInt32LE(pos+4);if(pos+8+n>b.length)throw new Error('Truncated WAV.');if(id==='fmt '){if(n<16)throw new Error('Bad WAV fmt.');rate=b.readUInt32LE(pos+16);}if(id==='data')data+=n;pos+=8+n+(n%2);}
  if(!rate||!data)throw new Error('Unusable WAV.');return {bytes:b,durationMs:data/rate*1000,mime:'audio/wav',sha256:sha(b)};
 }
 const ff=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8',timeout:20000});
 if(ff.error||ff.status!==0)throw new Error('MP3/OGG duration measurement needs ffprobe, or supply PCM WAV. No guessed duration is accepted.');
 const duration=Number(ff.stdout.trim());if(!(duration>0))throw new Error('Invalid measured duration.');
 if(!['.mp3','.ogg','.wav'].includes(ext))throw new Error('Supported media: WAV, MP3, OGG.');
 return {bytes:b,durationMs:duration*1000,mime:ext==='.mp3'?'audio/mpeg':ext==='.ogg'?'audio/ogg':'audio/wav',sha256:sha(b)};
}
/** Attach one file per line, measure every file, and retime actions through a monotonic map.
 * A generated file is not accepted as high quality merely because the provider returned success. */
export function attachVoice(direction,receipts,baseDir){
 const d=structuredClone(direction),byId=new Map((receipts.lines||[]).map(r=>[r.id,r]));if(byId.size!==(receipts.lines||[]).length)throw new Error('Duplicate voice receipt ID.');
 d.assets={...(d.assets||{})};const report=[];
 for(const scene of d.scenes){
  const old=structuredClone(scene.beats||[]),knots=[[0,0]];let lastEnd=0,oldEnd=0;delete scene.audio;scene.audioClips=[];
  for(let i=0;i<old.length;i++){
   const b=old[i],id=b.id||scene.id+'-line-'+String(i+1).padStart(2,'0'),r=byId.get(id);if(!r)throw new Error('Missing voice receipt for '+id);
   if(r.textSha256&&r.textSha256!==sha(b.text))throw new Error('Narration text changed: regenerate voice for '+id);
   const p=inside(baseDir,r.file),info=audioInfo(p);if(r.sha256&&r.sha256!==info.sha256)throw new Error('Audio hash mismatch for '+id);
   if(info.durationMs<80||info.durationMs>90000)throw new Error('Implausible line duration for '+id);
   const pause=b.performance?.pauseAfterMs;
   if(pause!==undefined&&(!Number.isFinite(pause)||pause<0||pause>30000))throw new Error('Invalid pauseAfterMs for '+id);
   const gap=i===0?Math.max(650,b.startMs):Math.max(150,b.startMs-oldEnd);
   const start=Math.round(lastEnd+gap),spokenEnd=start+Math.ceil(info.durationMs);
   const tail=pause??Math.max(1000,b.endMs-(b.spokenEndMs||b.endMs));const end=spokenEnd+tail;
   const beat=scene.beats[i];Object.assign(beat,{id,startMs:start,spokenEndMs:spokenEnd,endMs:end,alignmentQuality:r.alignmentQuality||'line-only'});
   const assetId='voice-'+id;d.assets[assetId]={mime:info.mime,data:info.bytes.toString('base64'),sha256:info.sha256,rights:r.rights||'unverified',provider:r.provider||receipts.provider||'unspecified',quality:r.quality||'requires-listening-review'};
   scene.audioClips.push({assetId,beatId:id,startMs:start,durationMs:Math.ceil(info.durationMs),speakerId:beat.speakerId||'narrator'});
   knots.push([b.startMs,start],[b.endMs,end]);lastEnd=end;oldEnd=b.endMs;report.push({id,...{durationMs:Math.ceil(info.durationMs),sha256:info.sha256},alignmentQuality:beat.alignmentQuality});
  }
  const newDuration=lastEnd+Math.max(400,scene.durationMs-oldEnd);knots.push([scene.durationMs,newDuration]);
  // Duplicate source knots at exact adjoining boundaries are collapsed deterministically.
  const map=new Map(knots);const points=[...map].sort((a,b)=>a[0]-b[0]);
  const warp=t=>{if(t<=0)return 0;for(let i=1;i<points.length;i++)if(t<=points[i][0]){const a=points[i-1],b=points[i];return Math.round(a[1]+(t-a[0])/(b[0]-a[0])*(b[1]-a[1]));}return newDuration;};
  for(const a of scene.actions||[]){if(a.cue)continue;const oldStart=a.atMs||0,oldStop=oldStart+(a.durationMs||900);a.atMs=warp(oldStart);a.durationMs=Math.max(1,warp(oldStop)-a.atMs);if(a.untilMs!==undefined)a.untilMs=warp(a.untilMs);}
  scene.durationMs=Math.ceil(newDuration);
 }
 d.version='0.4';d.durationMs=d.scenes.reduce((t,s)=>t+s.durationMs,0);d.voiceBuild={status:'measured-and-retimed',lines:report.length,quality:'requires-listening-review',provider:receipts.provider||'mixed'};
 return {direction:d,report};
}
