// Cost-free request planning: no credential checks, network, model loading, audio or output mutation.
import path from 'node:path';
import { ROOT,readJSON,fail } from './util.mjs';
import { resolveOptions,CLOUD_ENGINES,VOICE_FIELDS } from './config.mjs';
import { validateScore } from './schema.mjs';
import { actingInstruction } from './backend.mjs';
import { buildCloudRequest,cloudConfig } from './cloud.mjs';
import { buildExtraRequest,extraConfig } from './extra-cloud.mjs';
import { EXTRA_ENGINES,CATALOG,requireFreeTier } from './providers.mjs';
export async function planScene(scoreFile,options={},env=process.env){
 const o=await resolveOptions(options,env), score=await readJSON(scoreFile);
 if(o.voice){if(Object.keys(score.voices??{}).length!==1)fail('--voice is for a single-speaker score');Object.values(score.voices)[0][VOICE_FIELDS[o.engine]]=o.voice;}
 if(o.takes!==undefined)score.settings={...score.settings,takes:Number(o.takes)};
 validateScore(score,await readJSON(path.join(ROOT,'schemas/score.schema.json')));
 if(EXTRA_ENGINES.includes(o.engine)&&Object.keys(score.voices).length>1)
  for(const [id,v]of Object.entries(score.voices))if(!v[VOICE_FIELDS[o.engine]])fail(`Set voices.${id}.${VOICE_FIELDS[o.engine]} for a multi-character scene`);
 const cloud=CLOUD_ENGINES.includes(o.engine),config=cloud?(EXTRA_ENGINES.includes(o.engine)?extraConfig(o.engine,o,env):cloudConfig(o.engine,o,env)):null;
 const clips=score.beats.filter(b=>b.type==='speech').map(b=>{
  const job={text:b.text,voice:score.voices[b.speaker],direction:b.direction??{},instruction:actingInstruction(b.direction),pace:b.direction?.pace??1,seed:b.seed??score.settings?.seed??7331};
  const req=cloud?(EXTRA_ENGINES.includes(o.engine)?buildExtraRequest(config,job,o):buildCloudRequest(config,job,o)):null;
  if(o['free-tier-only']&&cloud)requireFreeTier(o.engine,config.model,job.voice[VOICE_FIELDS[o.engine]]??config.voice);
  return {id:b.id,speaker:b.speaker,textCharacters:b.text.length,takes:b.takes??score.settings?.takes??1,
   requestBytes:req?Buffer.byteLength(req.body):null,control:req?.control??'local-model-dependent',warnings:req?.warnings??[]};
 });
 return {engine:o.engine,networkRequests:0,credentialsChecked:false,cacheInspected:false,remainingQuotaKnown:false,
  upperBoundSynthesisRequests:clips.reduce((n,c)=>n+c.takes,0),upperBoundTextCharacters:clips.reduce((n,c)=>n+c.textCharacters*c.takes,0),
  offer:CATALOG.providers[o.engine]??null,clips,
  notes:['Counts assume cache misses. They are not a quote: providers bill tokens/characters/credits differently.',
   'Directions/tags/SSML may contribute to provider accounting. No remaining-quota or monetary cap is inferred.',
   'Environment/account/voice settings may still be needed to construct valid requests, but no secret is read into the result.']};
}
