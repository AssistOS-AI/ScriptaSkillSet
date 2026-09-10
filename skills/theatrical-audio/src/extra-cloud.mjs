// Native Node.js HTTP adapters. No provider SDKs, servers, global packages or MP3 codecs.
// Every request builder is pure and credential-free. Authentication is injected ONLY at send time.
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, hash, hashFile, canonical, atomicWrite, fail } from './util.mjs';
import { boundedRequest } from './cloud.mjs';
import { decodeWav, encodeWav } from './wav.mjs';
import { CATALOG, EXTRA_ENGINES, requireFreeTier } from './providers.mjs';

export const GEMINI_VOICES = 'Zephyr Puck Charon Kore Fenrir Leda Orus Aoede Callirrhoe Autonoe Enceladus Iapetus Umbriel Algieba Despina Erinome Algenib Rasalgethi Laomedeia Achernar Alnilam Schedar Gacrux Pulcherrima Achird Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat'.split(' ');
export const GROQ_VOICES = ['autumn','diana','hannah','austin','daniel','troy'];
export const CF_VOICES = ['angus','asteria','arcas','orion','orpheus','athena','luna','zeus','perseus','helios','hera','stella'];
export const CARTESIA_EMOTIONS = 'neutral happy excited enthusiastic elated euphoric triumphant amazed surprised flirtatious curious content peaceful serene calm grateful affectionate trust sympathetic anticipation mysterious angry mad outraged frustrated agitated threatened disgusted contempt envious sarcastic ironic sad dejected melancholic disappointed hurt guilty bored tired rejected nostalgic wistful apologetic hesitant insecure confused resigned anxious panicked alarmed scared proud confident distant skeptical contemplative determined'.split(' ');
const BASES = {
 gemini:'https://generativelanguage.googleapis.com/v1beta', groq:'https://api.groq.com/openai/v1', hume:'https://api.hume.ai/v0',
 cartesia:'https://api.cartesia.ai', cloudflare:'https://api.cloudflare.com/client/v4', google:'https://texttospeech.googleapis.com/v1',
 voicerss:'https://api.voicerss.org', deepgram:'https://api.deepgram.com/v1', mistral:'https://api.mistral.ai/v1'
};
const MODEL_ENV = {gemini:'GEMINI_TTS_MODEL',groq:'GROQ_TTS_MODEL',hume:'HUME_TTS_MODEL',cartesia:'CARTESIA_TTS_MODEL',deepgram:'DEEPGRAM_TTS_MODEL',polly:'POLLY_TTS_ENGINE',mistral:'MISTRAL_TTS_MODEL'};
const VOICE_ENV = {gemini:'GEMINI_TTS_VOICE',groq:'GROQ_TTS_VOICE',hume:'HUME_VOICE_ID',cartesia:'CARTESIA_VOICE_ID',cloudflare:'CLOUDFLARE_TTS_VOICE',google:'GOOGLE_TTS_VOICE',voicerss:'VOICERSS_TTS_VOICE',deepgram:'DEEPGRAM_TTS_MODEL',polly:'POLLY_TTS_VOICE',mistral:'MISTRAL_VOICE_ID'};
const number = (v,name,min,max) => { if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) fail(`${name} must be ${min}..${max}`);return v; };
const text = (v,name,max=5000) => { if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${name} must be a nonempty string of at most ${max} characters`);return v; };
const xml = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const uuid = v=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);

export function extraConfig(engine, options={}, env=process.env) {
 if(!EXTRA_ENGINES.includes(engine)) fail('Unknown additional cloud backend');
 const def=CATALOG.providers[engine],p=options._provider??{};
 const config={engine, model: options.model ?? env[MODEL_ENV[engine]] ?? p.model ?? def.defaultModel,
  voice:env[VOICE_ENV[engine]]??p.voice??def.defaultVoice, baseUrl:p.baseUrl??BASES[engine],
  region:env.AWS_REGION??env.AWS_DEFAULT_REGION??p.region??'us-east-1',
  accountId:env.CLOUDFLARE_ACCOUNT_ID??p.accountId,
  project:env.GOOGLE_CLOUD_PROJECT??p.project,
  apiVersion:p.apiVersion??'2026-08-14',cacheSalt:p.cacheSalt??'',
  timeoutMs:Number(options['timeout-ms']??p.timeoutMs??180000)};
 if(engine==='deepgram' && (options.model || env.DEEPGRAM_TTS_MODEL || p.model) && !p.voice) config.voice=config.model;
 number(config.timeoutMs,'timeoutMs',1,1800000);
 if(engine==='polly') {
  if(!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(config.region)) fail('Invalid AWS region');
  config.baseUrl=p.baseUrl??`https://polly.${config.region}.amazonaws.com`;
 }
 if(engine==='cloudflare' && (!config.accountId || !/^[a-f0-9]{32}$/i.test(config.accountId))) fail('Set CLOUDFLARE_ACCOUNT_ID to your 32-character account ID');
 let u;try{u=new URL(config.baseUrl);}catch{fail('Invalid provider baseUrl');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)fail('Provider baseUrl must be HTTPS with no credentials, query or fragment');
 config.baseUrl=config.baseUrl.replace(/\/+$/,'');
 if(engine==='cartesia' && config.apiVersion!=='2026-08-14') fail('This Cartesia adapter targets API version 2026-08-14; do not silently mix older request schemas.');
 text(config.model,'model',200);
 if(options['free-tier-only']) requireFreeTier(engine,config.model,options.voice??config.voice);
 return config;
}
function ignored(warnings, direction, detail, options, requireAcknowledgement=false) {
 const requested=Boolean(direction.emotion||direction.delivery||direction.emphasis?.length||direction.intensity!==undefined);
 if(requested) {
  if(requireAcknowledgement && !options['allow-degraded']) fail(detail+' Add --allow-degraded to explicitly accept the limitation, or choose Gemini/Hume.');
  warnings.push(detail);
 }
}
export function buildExtraRequest(c,job,options={}) {
 const d=job.direction??{}, warnings=[], e=c.engine, t=text(job.text,'speech text'), pace=number(job.pace??1,'pace',.5,2);
 const voice=text(job.voice?.[e+'Voice']??c.voice,e+' voice',256);
 if(options['free-tier-only']) requireFreeTier(e,c.model,voice);
 let url,body,response='wav',control=CATALOG.providers[e].control;
 if(e==='gemini') {
  if(!GEMINI_VOICES.includes(voice)) fail('Unknown Gemini prebuilt voice. Use voices --engine gemini.');
  // Directions are not part of the transcript; the model still needs human/ASR verification.
  const instruction=[job.voice?.description,job.instruction].filter(Boolean).join('. ');
  const prompt=`Perform the following text in language ${job.language || 'en'}. Speak ONLY the supplied text, exactly, without commentary or translation.\nActing direction (do not read aloud): ${instruction||'Natural delivery.'}\n\nText to speak:\n${t}`;
  url=c.baseUrl+'/models/'+encodeURIComponent(c.model)+':generateContent';
  body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}}};
  response='gemini-json';
 } else if(e==='groq') {
  if(c.model!=='canopylabs/orpheus-v1-english') fail('This Groq adapter implements canopylabs/orpheus-v1-english only.');
  if(!GROQ_VOICES.includes(voice)) fail('Unknown Groq English voice. Use voices --engine groq.');
  const tags=d.groq?.tags??[];
  if(!Array.isArray(tags)||tags.length>8||tags.some(x=>typeof x!=='string'||!/^[a-zA-Z][a-zA-Z ,'-]{0,63}$/.test(x)))fail('Groq tags must be short names without brackets');
  const input=(tags.length?tags.map(x=>`[${x}]`).join(' ')+' ':'')+t;
  if(input.length>200) fail('Groq Orpheus permits at most 200 characters including tags. Split the beat before rendering; no text was sent.');
  ignored(warnings,d,'Groq uses direction.groq.tags. Free-form directions, intensity and emphasis are not automatically translated.',options);
  if(pace!==1) warnings.push('Groq has no numeric pace control in this adapter; put an appropriate short cue in direction.groq.tags.');
  url=c.baseUrl+'/audio/speech';body={model:c.model,input,voice,response_format:'wav'};
 } else if(e==='hume') {
  if(!['1','2'].includes(c.model)) fail('HUME_TTS_MODEL must be 1 or 2');
  const v=uuid(voice)?{id:voice}:{name:voice,provider:job.voice?.humeProvider??'HUME_AI'};
  const utterance={text:t,voice:v,speed:pace,trailing_silence:0};
  if(c.model==='1') {
   // Hume recommends concise acting descriptions rather than long instruction boilerplate.
   const desc=[d.emotion,d.delivery,d.emphasis?.length?'Emphasize: '+d.emphasis.join(', '):''].filter(Boolean).join('; ');
   if(desc.length>1000)fail('Hume description is limited to 1000 characters');
   if(desc)utterance.description=desc;
   if(d.intensity!==undefined) warnings.push('Hume has no numeric emotional-intensity parameter; encode nuance in delivery.');
  } else {control='voice-and-speed-only';ignored(warnings,d,'Octave 2 does not yet support description-based acting instructions.',options,true);}
  url=c.baseUrl+'/tts';body={version:c.model,utterances:[utterance],format:{type:'wav'},num_generations:1,split_utterances:false};response='hume-json';
 } else if(e==='cartesia') {
  if(!uuid(voice))fail('Cartesia voice must be a voice-library UUID');
  number(pace,'Cartesia speed',.6,1.5);
  const generation_config={speed:pace};
  const emotion=d.cartesia?.emotion ?? (CARTESIA_EMOTIONS.includes(d.emotion)?d.emotion:undefined);
  if(emotion!==undefined){if(!CARTESIA_EMOTIONS.includes(emotion))fail('Unsupported Cartesia emotion; see docs/CONFIGURATION.md');generation_config.emotion=emotion;}
  if(d.delivery||d.intensity!==undefined||d.emphasis?.length||d.emotion&&!emotion)warnings.push('Cartesia uses a supported enumerated emotion and pace. Free-form acting/intensity/emphasis are not translated; use direction.cartesia.emotion.');
  url=c.baseUrl+'/tts/bytes';body={model_id:c.model,transcript:t,voice,output_format:{container:'wav',encoding:'pcm_s16le',sample_rate:44100},locale:'en-US',generation_config};
 } else if(e==='cloudflare') {
  if(c.model!=='@cf/deepgram/aura-1')fail('This Cloudflare adapter supports @cf/deepgram/aura-1 only (explicit WAV output)');
  if(!CF_VOICES.includes(voice)) fail('Unknown Aura-1 speaker');
  ignored(warnings,d,'Cloudflare Aura-1 accepts text and a speaker, not acting instructions.',options,true);
  if(pace!==1)warnings.push('Cloudflare Aura-1 numeric pace is not implemented.');
  url=c.baseUrl+`/accounts/${c.accountId}/ai/run/${c.model}`;
  body={text:t,speaker:voice,encoding:'linear16',container:'wav',sample_rate:24000};
 } else if(e==='deepgram') {
  if(!/^aura-2-[a-z]+-en$/.test(voice))fail('Use an English Aura-2 model ID as the Deepgram voice, for example aura-2-thalia-en');
  if(t.length>2000)fail('Deepgram clips are limited to 2000 characters by this adapter');
  ignored(warnings,d,'Deepgram Aura uses the selected voice but has no free-form acting instruction field in this adapter.',options,true);
  if(pace!==1)warnings.push('Deepgram numeric pace is not implemented.');
  url=c.baseUrl+'/speak?'+new URLSearchParams({model:voice,encoding:'linear16',container:'wav',sample_rate:'24000'});body={text:t};
 } else if(e==='google') {
  if(!/^[a-z]{2,3}-[A-Z]{2}-(?:Neural2|Standard|Wavenet)-[A-Za-z0-9]+$/.test(voice))fail('This Google adapter expects a locale-qualified Neural2/Standard/Wavenet voice, e.g. en-US-Neural2-F.');
  if(Buffer.byteLength(t,'utf8')>5000)fail('Google Cloud text is limited to 5000 UTF-8 bytes');
  const locale=job.voice?.googleLocale??voice.split('-').slice(0,2).join('-');
  if(!/^[a-z]{2,3}-[A-Z]{2}$/.test(locale))fail('Google locale must look like en-US or ro-RO');
  ignored(warnings,d,'Google Neural2/Standard/Wavenet adapter controls voice and rate, not free-form emotion.',options,true);
  url=c.baseUrl+'/text:synthesize';body={input:{text:t},voice:{name:voice,languageCode:locale},audioConfig:{audioEncoding:'LINEAR16',sampleRateHertz:24000,speakingRate:pace}};response='google-json';
 } else if(e==='voicerss') {
  const locale=job.voice?.voicerssLocale??((job.language&&job.language.includes('-'))?job.language.toLowerCase():'en-us');
  if(!/^[a-z]{2,3}-[a-z]{2}$/.test(locale))fail('VoiceRSS locale must look like en-us or ro-ro');
  ignored(warnings,d,'VoiceRSS supports voice and approximate speaking rate, not theatrical instructions.',options,true);
  const rate=Math.round((pace-1)*10);
  warnings.push('VoiceRSS rate is an approximate scale mapping, not a duration guarantee.');
  url=c.baseUrl+'/';body={src:t,hl:locale,v:voice,c:'WAV',f:'24khz_16bit_mono',r:String(rate)};
 } else if(e==='mistral') {
  if(!/^[A-Za-z0-9_-]+$/.test(voice)||/^(YOUR|REPLACE)/i.test(voice)) fail('Set MISTRAL_VOICE_ID from voices --engine mistral');
  ignored(warnings,d,'Mistral uses a preset/saved reference-conditioned voice. No free-form emotion/instruction field is implemented.',options,true);
  if(pace!==1)warnings.push('Mistral numeric pace is not implemented.');
  warnings.push('A guaranteed free Voxtral TTS allowance has NOT been verified. Check your workspace before use.');
  url=c.baseUrl+'/audio/speech';body={model:c.model,input:t,voice_id:voice,response_format:'wav',stream:false};response='mistral-json';
 } else if(e==='polly') {
  if(!['standard','neural'].includes(c.model))fail('Polly adapter supports standard/neural only; other engines have different SSML controls and pricing.');
  if(!/^[A-Za-z]+$/.test(voice))fail('Invalid Polly VoiceId');
  if(t.length>2800)fail('Polly adapter limits clips to 2800 text characters to leave room for SSML');
  ignored(warnings,d,'Polly adapter implements voice and SSML pace, not free-form acting.',options,true);
  const ssml=`<speak><prosody rate="${Math.round(pace*100)}%">${xml(t)}</prosody></speak>`;
  url=c.baseUrl+'/v1/speech';body={Engine:c.model,OutputFormat:'pcm',SampleRate:'16000',Text:ssml,TextType:'ssml',VoiceId:voice};response='pcm16-16000';
 } else fail('Unknown engine');
 return {url,method:'POST',contentType:e==='voicerss'?'application/x-www-form-urlencoded':'application/json',
  body:e==='voicerss'?new URLSearchParams(body).toString():JSON.stringify(body),response,seedApplied:false,control,warnings,
  // Not exact billable units. SSML, tags and instructions have provider-specific accounting.
  textCharacters:t.length,requestBytes:Buffer.byteLength(e==='voicerss'?new URLSearchParams(body).toString():JSON.stringify(body))};
}

function base64(value) {
 if(typeof value!=='string'||!value.length||value.length>48*1024*1024||value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('Provider returned invalid/oversized base64 audio');
 return Buffer.from(value,'base64');
}
function json(bytes) {try{return JSON.parse(bytes.toString('utf8'));}catch{fail('Provider returned invalid JSON (body not shown)');}}
// Normalize ONLY explicitly open-ended streaming WAV sizes. Normal malformed/truncated WAVs still fail.
export function normalizeStreamingWav(input) {
 let b=Buffer.from(input);
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')fail('Provider did not return a WAV file. No codec fallback or fake audio was created.');
 let patched=false, p=12;
 if(b.readUInt32LE(4)===0xffffffff){b.writeUInt32LE(b.length-8,4);patched=true;}
 while(p+8<=b.length){let n=b.readUInt32LE(p+4);const tag=b.toString('ascii',p,p+4);
  if(tag==='data'&&n===0xffffffff){n=b.length-p-8;b.writeUInt32LE(n,p+4);patched=true;break;}
  if(n>b.length-p-8)break;p+=8+n+(n%2);
 }
 return {bytes:b,patched};
}
export function rawPcm16(bytes,sampleRate,contentType='application/octet-stream') {
 if(!bytes.length||bytes.length%2||/json|html|xml|mpeg|mp3|ogg|flac|wav|text\//i.test(contentType)||['RIFF','OggS','fLaC','ID3'].some(x=>bytes.subarray(0,x.length).toString('ascii')===x))fail('Expected raw PCM16LE, not an error or compressed audio');
 const channel=new Float32Array(bytes.length/2);for(let i=0;i<channel.length;i++)channel[i]=bytes.readInt16LE(i*2)/32768;
 return {wav:encodeWav({sampleRate,channels:[channel]}),frames:channel.length,sampleRate,containerNormalized:false};
}
export function decodeExtraResponse(request, result) {
 let b=result.bytes;
 if(request.response==='pcm16-16000')return rawPcm16(b,16000,result.contentType);
 if(request.response.endsWith('-json')) {
  const d=json(b);
  if(d.error)fail('Provider returned an error object, not audio (body not shown)');
  if(request.response==='gemini-json') {
   const candidate=d.candidates?.[0];
   if(!candidate||candidate.finishReason&&candidate.finishReason!=='STOP')fail('Gemini returned no completed audio candidate; check moderation, model access or output limits.');
   const parts=(candidate.content?.parts??[]).filter(x=>x.inlineData);
   if(!parts.length)fail('Gemini returned no inline audio; no output file was created.');
   const chunks=[];let sr;
   for(const part of parts){const mime=part.inlineData.mimeType??'';
    if(!/^audio\/(?:L16|pcm)(?:;|$)/i.test(mime))fail('Unexpected Gemini audio encoding; expected PCM16LE');
    const rate=Number(mime.match(/(?:^|;)\s*rate=(\d+)/i)?.[1]??24000);
    if(![16000,22050,24000,44100,48000].includes(rate)||sr&&rate!==sr)fail('Inconsistent Gemini sample rate');
    sr=rate;chunks.push(base64(part.inlineData.data));
   }
   // Gemini documentation explicitly specifies little-endian PCM despite its audio/L16 MIME label.
   return rawPcm16(Buffer.concat(chunks),sr,'application/octet-stream');
  }
  const data=request.response==='hume-json'?d.generations?.[0]?.audio:request.response==='mistral-json'?d.audio_data:d.audioContent;
  b=base64(data);
 }
 const normalized=normalizeStreamingWav(b), audio=decodeWav(normalized.bytes);
 if(!audio.channels[0]?.length)fail('Empty synthesized audio');
 return {wav:encodeWav(audio),frames:audio.channels[0].length,sampleRate:audio.sampleRate,containerNormalized:normalized.patched};
}

const sha = s=>crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k,s)=>crypto.createHmac('sha256',k).update(s).digest();
const rfc3986 = s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
// AWS Signature V4, Polly only. No SDK, ~/.aws traversal or implicit credential discovery.
export function signPolly(url, method, body, env, region, now=new Date()) {
 const u=new URL(url), stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''), day=stamp.slice(0,8);
 const headers={'content-type':'application/json',host:u.host,'x-amz-date':stamp};
 if(env.AWS_SESSION_TOKEN)headers['x-amz-security-token']=env.AWS_SESSION_TOKEN;
 const names=Object.keys(headers).sort();
 const canonicalHeaders=names.map(k=>k+':'+String(headers[k]).trim().replace(/\s+/g,' ')+'\n').join('');
 const query=[...u.searchParams.entries()].map(([k,v])=>[rfc3986(k),rfc3986(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(x=>x.join('=')).join('&');
 const uri=u.pathname.split('/').map(s=>rfc3986(decodeURIComponent(s))).join('/');
 const signed=names.join(';'), canonicalRequest=[method,uri,query,canonicalHeaders,signed,sha(body)].join('\n');
 const scope=`${day}/${region}/polly/aws4_request`, toSign=`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonicalRequest)}`;
 const k=hmac(hmac(hmac(hmac('AWS4'+env.AWS_SECRET_ACCESS_KEY,day),region),'polly'),'aws4_request');
 headers.authorization=`AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${hmac(k,toSign).toString('hex')}`;
 delete headers.host;return headers;
}
function auth(config, env, request, now) {
 const e=config.engine, headers={'content-type':request.contentType??'application/json'};let body=request.body;
 const key=env[CATALOG.providers[e].requiredEnvironment[0]];
 if(e==='gemini')headers['x-goog-api-key']=key;
 else if(e==='hume')headers['X-Hume-Api-Key']=key;
 else if(e==='deepgram')headers.Authorization='Token '+key;
 else if(e==='cartesia'){headers.Authorization='Bearer '+key;headers['Cartesia-Version']=config.apiVersion;}
 else if(e==='google'){
  if(env.GOOGLE_ACCESS_TOKEN)headers.Authorization='Bearer '+env.GOOGLE_ACCESS_TOKEN;
  else headers['x-goog-api-key']=env.GOOGLE_TTS_API_KEY;
  if(config.project)headers['x-goog-user-project']=config.project;
 } else if(e==='voicerss') {const form=new URLSearchParams(body);form.set('key',key);body=form.toString();}
 else if(e==='polly')Object.assign(headers,signPolly(request.url,request.method??'POST',body??'',env,config.region,now));
 else headers.Authorization='Bearer '+key;
 return {method:request.method??'POST',headers,body};
}
export function staticVoices(engine) {
 const list=engine==='gemini'?GEMINI_VOICES:engine==='groq'?GROQ_VOICES:engine==='cloudflare'?CF_VOICES:engine==='voicerss'?['Linda','Amy','Mary','John','Mike']:null;
 return list?{engine,source:'documented-built-ins',voices:list.map(id=>({id})),locale:engine==='voicerss'?'en-us':undefined,accountAccessVerified:false}:null;
}
export async function createExtraCloudBackend(engine,options={},dependencies={}) {
 if(options.offline) fail('--offline forbids cloud requests');
 const env=dependencies.env??process.env, config=extraConfig(engine,options,env), def=CATALOG.providers[engine];
 // Voice IDs are job-level requirements, not credentials: voices can be listed before selecting one.
 const required=def.requiredEnvironment.filter(k=>!k.endsWith('_VOICE_ID')&&k!=='AWS_REGION');
 if(engine==='google' && env.GOOGLE_ACCESS_TOKEN)required.splice(0,required.length,'GOOGLE_ACCESS_TOKEN');
 for(const name of required)if(!env[name]||/^(your|replace|paste|cheia)/i.test(env[name]))fail(`Set ${name} in the process environment or use --credentials-file PATH. No request has been made.`);
 const sourceHash=hash(canonical(await Promise.all(['src/extra-cloud.mjs','src/cloud.mjs','src/providers.mjs','providers.json'].map(f=>hashFile(path.join(ROOT,f))))));
 const fingerprint=hash(canonical({sourceHash,engine,endpoint:config.baseUrl,model:config.model,accountId:config.accountId,apiVersion:config.apiVersion,cacheSalt:config.cacheSalt}));
 const info={engine,model:config.model,execution:'cloud',control:engine==='hume'&&config.model==='2'?'voice-and-speed-only':def.control,alignment:'none',endpoint:config.baseUrl,
  defaultVoice:config.voice,credentialSource:required,credentialPresent:true,credentialsValidated:false,inferenceTested:false,
  freeKind:def.freeKind,offerCheckedAt:def.checkedAt,versions:{node:process.version},
  warnings:['API use can be billed even with a published free allowance; check the account dashboard. No provider fallback or automatic retry.',
   'The clip and applicable acting directions are sent to the explicitly selected cloud provider.',def.cautions,
   'No transcription, word alignment or artistic-quality certification is performed. Cached audio, not fresh cloud generation, is reproducible.']};
 if(options['free-tier-only']) info.warnings.push(requireFreeTier(engine,config.model,options.voice??config.voice));
 const ro={fetchImpl:dependencies.fetchImpl,timeoutMs:config.timeoutMs,engine,maxBytes:48*1024*1024};
 return {info,fingerprint,
  validateJob:job=>buildExtraRequest(config,job,options),
  cacheIdentity:job=>{const r=buildExtraRequest(config,job,options);return {url:r.url,body:r.body,response:r.response,takeIdentity:job.seed};},
  async synthesize(job,output){
   const request=buildExtraRequest(config,job,options);
   const response=await boundedRequest(request.url,auth(config,env,request,dependencies.now?.()),ro);
   const audio=decodeExtraResponse(request,response);await atomicWrite(output,audio.wav);
   return {frames:audio.frames,sampleRate:audio.sampleRate,clampedSamples:0,containerNormalized:audio.containerNormalized,
    provider:engine,model:config.model,requestId:response.requestId,seedApplied:false,seedDeterminism:'not-supported',
    control:request.control,warnings:request.warnings,contentVerification:'not-performed',emotionVerification:'not-performed'};
  },
  async voices(pageToken){
   const builtins=staticVoices(engine);if(builtins)return builtins;
   let url, transform;
   const page=Number(pageToken??0);
   if(engine==='hume'){
    if(!Number.isInteger(page)||page<0)fail('Hume --page-token is a zero-based page number');
    url=config.baseUrl+'/tts/voices?'+new URLSearchParams({provider:'HUME_AI',page_number:String(page),page_size:'100'});
    transform=d=>{if(!Array.isArray(d.voices_page))fail('Invalid Hume voice catalogue');return {voices:d.voices_page,hasMore:page+1<d.total_pages,nextPageToken:page+1<d.total_pages?String(page+1):null};};
   } else if(engine==='mistral') {
    if(!Number.isInteger(page)||page<0)fail('Mistral --page-token is an integer offset');
    url=config.baseUrl+'/audio/voices?'+new URLSearchParams({limit:'100',offset:String(page),type:'all'});
    transform=d=>{if(!Array.isArray(d.items))fail('Invalid Mistral voice catalogue');return {voices:d.items,hasMore:page+d.items.length<d.total,nextPageToken:page+d.items.length<d.total?String(page+d.items.length):null};};
   } else if(engine==='google') {
    url=config.baseUrl+'/voices?languageCode=en-US';transform=d=>{if(!Array.isArray(d.voices))fail('Invalid Google voice catalogue');return {voices:d.voices.map(v=>({id:v.name,locales:v.languageCodes,gender:v.ssmlGender})),hasMore:false};};
   } else if(engine==='cartesia') {
    // Curated official IDs avoid pretending an undocumented catalogue pagination contract is stable.
    return {engine,source:'official-curated-examples',exhaustive:false,accountAccessVerified:false,voices:[
     {id:'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',name:'Skylar'}, {id:'47c38ca4-5f35-497b-b1a3-415245fb35e1',name:'Daniel'},
     {id:'62ae83ad-4f6a-430b-af41-a9bede9286ca',name:'Gemma'},{id:'ef191366-f52f-447a-a398-ed8c0f2943a1',name:'Archie'},
     {id:'0834f3df-e650-4766-a20c-5a93a43aa6e3',name:'Leo (emotive)'},{id:'cbaf8084-f009-4838-a096-07ee2e6612b1',name:'Maya (emotive)'}]};
   } else if(engine==='deepgram')return {engine,source:'documented-examples',exhaustive:false,voices:[{id:'aura-2-thalia-en'},{id:'aura-2-apollo-en'}],accountAccessVerified:false};
   else if(engine==='polly') {
    url=config.baseUrl+'/v1/voices?'+new URLSearchParams({Engine:config.model,LanguageCode:'en-US',...(pageToken?{NextToken:pageToken}:{})});
    transform=d=>{if(!Array.isArray(d.Voices))fail('Invalid Polly voice catalogue');return {voices:d.Voices.map(v=>({id:v.Id,name:v.Name,supportedEngines:v.SupportedEngines})),hasMore:!!d.NextToken,nextPageToken:d.NextToken??null};};
   }
   if(!url)fail('No catalogue operation for this provider');
   const req={url,method:'GET',contentType:'application/json'};
   const data=json((await boundedRequest(url,auth(config,env,req,dependencies.now?.()),{...ro,maxBytes:8*1024*1024})).bytes);
   return {engine,source:'provider-catalogue',...transform(data)};
  }, async close(){}
 };
}
