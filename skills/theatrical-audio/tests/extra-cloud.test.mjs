import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extraConfig,buildExtraRequest,decodeExtraResponse,createExtraCloudBackend,signPolly,GEMINI_VOICES,staticVoices,normalizeStreamingWav } from '../src/extra-cloud.mjs';
import { CATALOG,EXTRA_ENGINES,requireFreeTier,providerListing } from '../src/providers.mjs';
import { CLOUD_ENGINES,ENGINES,VOICE_FIELDS,resolveOptions,loadEnvironment } from '../src/config.mjs';
import { encodeWav,decodeWav,readWav } from '../src/wav.mjs';
import { ROOT,writeJSON,hashFile } from '../src/util.mjs';
import { render,auditBundle } from '../src/render.mjs';
import { planScene } from '../src/plan.mjs';
const env={GEMINI_API_KEY:'test-gemini-token',GROQ_API_KEY:'test-groq-token',HUME_API_KEY:'test-hume-token',CARTESIA_API_KEY:'test-cartesia-token',CLOUDFLARE_API_TOKEN:'test-cloudflare-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),GOOGLE_TTS_API_KEY:'test-google-token',VOICERSS_API_KEY:'test-voicerss-token',DEEPGRAM_API_KEY:'test-deepgram-token',AWS_ACCESS_KEY_ID:'AKIDEXAMPLE',AWS_SECRET_ACCESS_KEY:'EXAMPLESECRET',AWS_REGION:'us-east-1',MISTRAL_API_KEY:'test-mistral-token',MISTRAL_VOICE_ID:'voice-fixture-001'};
const options={'allow-degraded':true};
const sine=Float32Array.from({length:6000},(_,i)=>.2*Math.sin(i*.06));
const wav=encodeWav({sampleRate:24000,channels:[sine]});
const pcm=Buffer.alloc(sine.length*2);sine.forEach((x,i)=>pcm.writeInt16LE(Math.round(x*32767),i*2));
const job={text:"David... don't turn around.",voice:{},direction:{emotion:'scared',delivery:'Quiet, restrained fear.',pace:1},instruction:'Quiet, restrained fear.',pace:1,seed:7331};
function responseFor(e){
 let bytes=wav,contentType='audio/wav';
 if(e==='gemini'){bytes=Buffer.from(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:pcm.toString('base64')}}]}}]}));contentType='application/json';}
 if(e==='hume'){bytes=Buffer.from(JSON.stringify({generations:[{audio:wav.toString('base64'),duration:.25}]}));contentType='application/json';}
 if(e==='mistral'){bytes=Buffer.from(JSON.stringify({audio_data:wav.toString('base64')}));contentType='application/json';}
 if(e==='google'){bytes=Buffer.from(JSON.stringify({audioContent:wav.toString('base64')}));contentType='application/json';}
 if(e==='polly'){bytes=pcm;contentType='audio/pcm';}
 return {bytes,contentType};
}
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'extra-tts-'));
test.after(()=>fs.rm(dir,{recursive:true,force:true}));

test('Registry has 13 cloud providers, ten new adapters, and every engine has a voice field',()=>{
 assert.equal(Object.keys(CATALOG.providers).length,13);assert.equal(EXTRA_ENGINES.length,10);
 for(const e of EXTRA_ENGINES){assert.ok(ENGINES.includes(e));assert.ok(CLOUD_ENGINES.includes(e));assert.equal(VOICE_FIELDS[e],e+'Voice');assert.equal(CATALOG.providers[e].liveTested,false);}
 assert.equal(providerListing({freeOnly:true}).providers.length,9);
});
for(const e of EXTRA_ENGINES){
 test(e+': credential-free request construction and valid audio decoding',()=>{
  const c=extraConfig(e,options,env),req=buildExtraRequest(c,job,options);
  assert.ok(req.url.startsWith('https:'));assert.ok(req.body);assert.equal(req.seedApplied,false);
  assert.ok(!req.body.includes('test-'));assert.ok(!JSON.stringify(c).includes('token'));
  const out=decodeExtraResponse(req,responseFor(e));assert.ok(out.frames>0);assert.ok(out.sampleRate>=16000);
  assert.equal(decodeWav(out.wav).channels.length,1);
 });
 test(e+': native fetch auth, file creation, secret-free cache identity and metadata',async()=>{
  let calls=0;
  const b=await createExtraCloudBackend(e,options,{env,fetchImpl:async(url,init)=>{
   calls++;assert.equal(init.redirect,'error');assert.equal(init.method,'POST');assert.ok(init.signal);
   if(e==='gemini')assert.equal(init.headers['x-goog-api-key'],env.GEMINI_API_KEY);
   if(e==='groq')assert.equal(init.headers.Authorization,'Bearer '+env.GROQ_API_KEY);
   if(e==='hume')assert.equal(init.headers['X-Hume-Api-Key'],env.HUME_API_KEY);
   if(e==='cartesia'){assert.equal(init.headers['Cartesia-Version'],'2026-08-14');assert.equal(init.headers.Authorization,'Bearer '+env.CARTESIA_API_KEY);}
   if(e==='cloudflare'){assert.ok(url.includes('/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/'));assert.equal(init.headers.Authorization,'Bearer '+env.CLOUDFLARE_API_TOKEN);}
   if(e==='google')assert.equal(init.headers['x-goog-api-key'],env.GOOGLE_TTS_API_KEY);
   if(e==='voicerss'){assert.equal(new URLSearchParams(init.body).get('key'),env.VOICERSS_API_KEY);assert.ok(!url.includes('key='));}
   if(e==='deepgram')assert.equal(init.headers.Authorization,'Token '+env.DEEPGRAM_API_KEY);
   if(e==='polly'){assert.match(init.headers.authorization,/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);assert.equal(new Headers(init.headers).get('content-type'),'application/json');}
   if(e==='mistral')assert.equal(init.headers.Authorization,'Bearer '+env.MISTRAL_API_KEY);
   const r=responseFor(e);return new Response(r.bytes,{headers:{'content-type':r.contentType,'x-request-id':'fixture'}});
  }});
  b.validateJob(job);assert.equal(calls,0);
  const meta=JSON.stringify({info:b.info,cache:b.cacheIdentity(job)});
  for(const [name,value]of Object.entries(env))if(name.includes('KEY')||name.includes('TOKEN')||name.includes('SECRET'))assert.ok(!meta.includes(value),name);
  const f=path.join(dir,e+'.wav'),r=await b.synthesize(job,f);assert.equal(calls,1);assert.equal(r.contentVerification,'not-performed');assert.equal(r.emotionVerification,'not-performed');assert.equal(r.provider,e);
  assert.ok((await readWav(f)).channels[0].length>0);await b.close();
 });
 test(e+': missing credentials and offline do not call network',async()=>{
  let calls=0;const dep={env:{CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID},fetchImpl:async()=>{calls++;throw Error('should not reach');}};
  await assert.rejects(createExtraCloudBackend(e,options,dep));
  await assert.rejects(createExtraCloudBackend(e,{offline:true}, {env,...dep}),/offline/);
  assert.equal(calls,0);
 });
 test(e+': non-OK status aborts once without retry or provider fallback',async()=>{
  let calls=0;const b=await createExtraCloudBackend(e,options,{env,fetchImpl:async()=>{calls++;return new Response('SECRET_PROVIDER_ERROR_BODY',{status:429});}});
  const out=path.join(dir,e+'-error.wav');
  await assert.rejects(b.synthesize(job,out),err=>err.message.includes('429')&&!err.message.includes('SECRET_PROVIDER_ERROR_BODY'));
  assert.equal(calls,1);await assert.rejects(fs.stat(out));
 });
}
test('Gemini supports 30 distinct documented voices and sends direction outside transcript',()=>{
 assert.equal(GEMINI_VOICES.length,30);assert.equal(new Set(GEMINI_VOICES).size,30);
 const req=buildExtraRequest(extraConfig('gemini',{},env),job);const p=JSON.parse(req.body);
 assert.equal(p.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Kore');
 assert.equal(p.generationConfig.responseModalities[0],'AUDIO');
 assert.ok(p.contents[0].parts[0].text.endsWith(job.text));
});
test('Gemini refuses empty, blocked, truncated, wrong-encoding or bad-base64 responses',()=>{
 const req=buildExtraRequest(extraConfig('gemini',{},env),job);
 for(const data of [{},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'SAFETY'}]},{candidates:[{content:{parts:[{inlineData:{mimeType:'audio/mp3',data:wav.toString('base64')}}]}}]},{candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16',data:'!bad!'}}]}}]}])
  assert.throws(()=>decodeExtraResponse(req,{bytes:Buffer.from(JSON.stringify(data)),contentType:'application/json'}));
});
test('Groq cap includes directions, with no silent text truncation',()=>{
 const c=extraConfig('groq',{},env);
 assert.doesNotThrow(()=>buildExtraRequest(c,{...job,text:'a'.repeat(200),direction:{}},options));
 assert.throws(()=>buildExtraRequest(c,{...job,text:'a'.repeat(201)},options),/200/);
 assert.throws(()=>buildExtraRequest(c,{...job,text:'a'.repeat(195),direction:{groq:{tags:['whisper']}}},options),/200/);
 const p=JSON.parse(buildExtraRequest(c,{...job,direction:{groq:{tags:['whisper']}}},options).body);assert.equal(p.input,'[whisper] '+job.text);assert.ok(!('speed'in p));
});
test('Hume defaults to Octave 1 with a saved named voice and never creates a dynamic voice',()=>{
 const p=JSON.parse(buildExtraRequest(extraConfig('hume',{},env),job).body);
 assert.equal(p.version,'1');assert.deepEqual(p.utterances[0].voice,{name:'Ava Song',provider:'HUME_AI'});
 assert.equal(p.utterances[0].trailing_silence,0);assert.match(p.utterances[0].description,/restrained/);assert.equal(p.format.type,'wav');
 const c=extraConfig('hume',{model:'2'},env);assert.throws(()=>buildExtraRequest(c,job),/Octave 2/);
 const degraded=JSON.parse(buildExtraRequest(c,job,options).body);assert.ok(!('description'in degraded.utterances[0]));
});
test('Cartesia pins the current API schema, validates enumerated emotion, and preserves text',()=>{
 const c=extraConfig('cartesia',{},env);const p=JSON.parse(buildExtraRequest(c,job).body);
 assert.equal(c.apiVersion,'2026-08-14');assert.equal(typeof p.voice,'string');assert.equal(p.generation_config.emotion,'scared');assert.equal(p.transcript,job.text);
 assert.throws(()=>extraConfig('cartesia',{_provider:{apiVersion:'2025-04-16'}},env),/version/);
 assert.throws(()=>buildExtraRequest(c,{...job,direction:{cartesia:{emotion:'superhero'}}}),/Unsupported/);
 assert.throws(()=>buildExtraRequest(c,{...job,pace:1.9}),/speed/);
});
test('Mistral JSON base64 is not confused with binary audio or PCM32',()=>{
 const c=extraConfig('mistral',{},env),r=buildExtraRequest(c,job,options),p=JSON.parse(r.body);
 assert.equal(p.response_format,'wav');assert.equal(p.stream,false);assert.equal(p.voice_id,env.MISTRAL_VOICE_ID);assert.ok(!('instructions'in p));
 assert.throws(()=>decodeExtraResponse(r,{bytes:Buffer.from('{"audio_data":"oops"}') }));
});
test('VoiceRSS HTTP-200 error text and compressed audio are never saved as WAV',()=>{
 const r=buildExtraRequest(extraConfig('voicerss',{},env),job,options);
 for(const data of [Buffer.from('ERROR: account is inactive!'),Buffer.from('{"error":"secret"}'),Buffer.from('ID3not a wav'),Buffer.from('<html>Denied</html>')])assert.throws(()=>decodeExtraResponse(r,{bytes:data}));
 const form=new URLSearchParams(r.body);assert.equal(form.get('f'),'24khz_16bit_mono');assert.equal(form.has('key'),false);
});
test('Open-ended streaming WAV sizes can be normalized; ordinary truncation cannot',()=>{
 const streaming=Buffer.from(wav);streaming.writeUInt32LE(0xffffffff,4);streaming.writeUInt32LE(0xffffffff,40);
 const fixed=normalizeStreamingWav(streaming);assert.equal(fixed.patched,true);assert.equal(decodeWav(fixed.bytes).channels[0].length,sine.length);
 const truncated=wav.subarray(0,wav.length-20);assert.throws(()=>decodeWav(normalizeStreamingWav(truncated).bytes));
});
test('PCM16 16k Polly output is wrapped at 16k, not wrongly labeled 24k',()=>{
 const r=buildExtraRequest(extraConfig('polly',{},env),job,options),out=decodeExtraResponse(r,responseFor('polly'));
 assert.equal(out.sampleRate,16000);assert.equal(decodeWav(out.wav).sampleRate,16000);
});
test('Polly signs session tokens and is stable for a frozen timestamp without leaking secret',()=>{
 const date=new Date('2026-09-10T10:00:00Z'),session={...env,AWS_SESSION_TOKEN:'temporary-session-token'};
 const a=signPolly('https://polly.us-east-1.amazonaws.com/v1/speech','POST','{}',session,'us-east-1',date);
 const b=signPolly('https://polly.us-east-1.amazonaws.com/v1/speech','POST','{}',session,'us-east-1',date);
 assert.deepEqual(a,b);assert.equal(a['x-amz-date'],'20260910T100000Z');assert.equal(a['x-amz-security-token'],session.AWS_SESSION_TOKEN);
 assert.match(a.authorization,/SignedHeaders=content-type;host;x-amz-date;x-amz-security-token/);assert.ok(!JSON.stringify(a).includes(env.AWS_SECRET_ACCESS_KEY));
});
test('Free-tier guard blocks paid, trial, uncertain and unsupported model profiles',()=>{
 for(const e of ['openai','deepgram','polly','mistral'])assert.throws(()=>requireFreeTier(e,CATALOG.providers[e].defaultModel,CATALOG.providers[e].defaultVoice),/free-tier-only/);
 assert.throws(()=>requireFreeTier('gemini','gemini-2.5-pro-preview-tts','Kore'));
 assert.doesNotThrow(()=>requireFreeTier('gemini','gemini-2.5-flash-preview-tts','Kore'));
 assert.throws(()=>requireFreeTier('google','neural2','en-US-Chirp3-HD-Aoede'));
 assert.match(requireFreeTier('azure','azure-neural','en-US-JennyNeural'),/does NOT/);
});
test('All cloud engines are blocked by --offline at config resolution',async()=>{
 for(const engine of CLOUD_ENGINES)await assert.rejects(resolveOptions({engine,offline:true},{}),/offline/);
});
test('.env loader accepts new provider settings without global packages',async()=>{
 const p=path.join(dir,'new.env');await fs.writeFile(p,Object.entries(env).map(([k,v])=>k+'='+v).join('\n'));const dst={};await loadEnvironment(p,dst);assert.deepEqual(dst,env);
});
test('Google supports OAuth without a Google API key; auth is never in request/cache payload',async()=>{
 const oauth={GOOGLE_ACCESS_TOKEN:'oauth-fixture-token',GOOGLE_CLOUD_PROJECT:'quota-project'},b=await createExtraCloudBackend('google',options,{env:oauth,fetchImpl:async(u,i)=>{
  assert.equal(i.headers.Authorization,'Bearer '+oauth.GOOGLE_ACCESS_TOKEN);assert.equal(i.headers['x-goog-user-project'],'quota-project');assert.ok(!i.headers['x-goog-api-key']);
  const r=responseFor('google');return new Response(r.bytes,{headers:{'content-type':r.contentType}});
 }});
 await b.synthesize(job,path.join(dir,'oauth.wav'));
});
test('Hume and Mistral voice listing do not require voice selection or synthesize text',async()=>{
 for(const e of ['hume','mistral']) {
  const noVoice={...env};delete noVoice.MISTRAL_VOICE_ID;const b=await createExtraCloudBackend(e,{}, {env:noVoice,fetchImpl:async(u,i)=>{
   assert.equal(i.method,'GET');assert.equal(i.body,undefined);return new Response(JSON.stringify(e==='hume'?{voices_page:[{id:'one'}],total_pages:2}:{items:[{id:'one'}],total:101}),{headers:{'content-type':'application/json'}});
  }});const voices=await b.voices();assert.equal(voices.voices[0].id,'one');assert.equal(voices.hasMore,true);assert.ok(voices.nextPageToken);
 }
});
test('plan is network-free and validates all beats before generating anything',async()=>{
 const p=path.join(dir,'plan.json');await writeJSON(p,{format:'theatrical-audio/1',id:'planned',title:'Plan',language:'en',voices:{n:{label:'Narrator',geminiVoice:'Kore'}},beats:[{id:'a',type:'speech',speaker:'n',text:'A test.'},{id:'pause',type:'pause',seconds:2},{id:'b',type:'speech',speaker:'n',text:'Another test.'}]});
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network');};
 try{const r=await planScene(p,{engine:'gemini','free-tier-only':true},{});assert.equal(r.upperBoundSynthesisRequests,2);assert.equal(r.networkRequests,0);assert.equal(calls,0);assert.equal(r.remainingQuotaKnown,false);}finally{globalThis.fetch=original;}
});

test('End-to-end mocked rendering, schema, cached pause edits and timeline audit on all ten new providers',async(t)=>{
 const previousFetch=globalThis.fetch,previousEnv={};
 for(const [k,v]of Object.entries(env)){previousEnv[k]=process.env[k];process.env[k]=v;}
 try {
  for(const e of EXTRA_ENGINES)await t.test(e,async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;const r=responseFor(e);return new Response(r.bytes,{headers:{'content-type':r.contentType}});};
   const root=path.join(dir,'integration-'+e),p=path.join(root,'score.json'),baseVoice=CATALOG.providers[e].defaultVoice??env.MISTRAL_VOICE_ID;
   const s={format:'theatrical-audio/1',id:'scene-'+e,title:'Clip synchronization',language:'en',voices:{n:{label:'Narrator',[e+'Voice']:baseVoice}},
    settings:{sampleRate:24000,takes:1,tailSeconds:0},beats:[{id:'one',type:'speech',speaker:'n',text:'Do not turn around.'},{id:'wait',type:'pause',seconds:1},{id:'two',type:'speech',speaker:'n',text:'It is behind you.'}]};
   await writeJSON(p,s);const o={engine:e,'allow-degraded':true,out:path.join(root,'bundle'),cache:path.join(root,'cache'),'max-requests':2};
   const first=await render(p,o);assert.equal(first.evidence.generatedTakes,2);assert.equal(calls,2);assert.equal(first.evidence.sentTextCharacters,36);
   const a1=first.timeline.events.find(x=>x.id==='two').startFrame;
   s.beats[1].seconds=3;await writeJSON(p,s);const second=await render(p,o);
   assert.equal(second.evidence.cacheHits,2);assert.equal(second.evidence.generatedTakes,0);assert.equal(calls,2);
   assert.equal(second.timeline.events.find(x=>x.id==='two').startFrame-a1,48000);
   assert.equal(second.evidence.sentTextCharacters,0);const audit=await auditBundle(o.out);assert.equal(audit.valid,true);
  });
 } finally {
  globalThis.fetch=previousFetch;for(const [k,v]of Object.entries(previousEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
test('Preflight, budgets and deliberate pacing protect free quotas without automatic retries',async(t)=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY=env.GROQ_API_KEY;
 const base={format:'theatrical-audio/1',id:'budgets',title:'Budgets',language:'en',voices:{n:{label:'Narrator',groqVoice:'troy'}},settings:{sampleRate:24000,tailSeconds:0},beats:[{id:'a',type:'speech',speaker:'n',text:'First short clip.'},{id:'b',type:'speech',speaker:'n',text:'Second short clip.'}]};
 let calls=0,starts=[];globalThis.fetch=async()=>{calls++;starts.push(Date.now());return new Response(wav,{headers:{'content-type':'audio/wav'}});};
 try{
  const p=path.join(dir,'budget.score.json');await writeJSON(p,base);
  await t.test('one-request cap stops before second request',async()=>{
   await assert.rejects(render(p,{engine:'groq',out:path.join(dir,'budget-one'),cache:path.join(dir,'budget-cache-one'),'max-requests':1}),/budget/);assert.equal(calls,1);
  });
  await t.test('character cap stops before any request when first clip exceeds it',async()=>{
   calls=0;await assert.rejects(render(p,{engine:'groq',out:path.join(dir,'budget-chars'),cache:path.join(dir,'budget-cache-chars'),'max-chars':2}),/character budget/);assert.equal(calls,0);
  });
  await t.test('bad later Groq beat is detected before the first paid request',async()=>{
   calls=0;const bad=structuredClone(base);bad.beats[1].text='x'.repeat(201);const bp=path.join(dir,'invalid-later.score.json');await writeJSON(bp,bad);
   await assert.rejects(render(bp,{engine:'groq',out:path.join(dir,'badlater'),cache:path.join(dir,'badlater-cache')}),/200/);assert.equal(calls,0);
  });
  await t.test('configured interval separates request start times; cache does not wait',async()=>{
   calls=0;starts=[];await render(p,{engine:'groq',out:path.join(dir,'paced'),cache:path.join(dir,'paced-cache'),'request-interval-ms':80});assert.equal(calls,2);assert.ok(starts[1]-starts[0]>=75);
  });
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;}
});


test('AWS SigV4 matches an independently computed botocore golden fixture', async()=>{
 const f=JSON.parse(await fs.readFile(path.join(ROOT,'tests/fixtures/aws-sigv4.json'),'utf8'));
 const headers=signPolly(f.url,f.method,f.body,{AWS_ACCESS_KEY_ID:'AKIDEXAMPLE',AWS_SECRET_ACCESS_KEY:'EXAMPLESECRET',AWS_SESSION_TOKEN:'temporary-session-token'},'us-east-1',new Date(f.timestamp));
 assert.equal(headers.authorization,f.authorization);
});
test('Packaged three-character example preflights with eight new publicly documented casts',async()=>{
 for(const engine of ['gemini','groq','cartesia','cloudflare','google','voicerss','deepgram','polly']){
  const p=await planScene(path.join(ROOT,'examples/the-last-light.score.json'),{engine,'allow-degraded':true},env);
  assert.equal(p.upperBoundSynthesisRequests,7);assert.equal(p.networkRequests,0);
 }
});
test('New adapters reject missing per-character voices instead of collapsing the cast',async()=>{
 await assert.rejects(planScene(path.join(ROOT,'examples/the-last-light.score.json'),{engine:'hume'},env),/humeVoice/);
});
