import fs from 'node:fs';
import { ROOT } from './util.mjs';
import path from 'node:path';
export const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT,'providers.json'),'utf8'));
export const EXTRA_ENGINES = ["gemini", "groq", "hume", "cartesia", "cloudflare", "google", "voicerss", "deepgram", "polly", "mistral"];
export const EXTRA_ENV = [
 'GEMINI_API_KEY','GEMINI_TTS_MODEL','GEMINI_TTS_VOICE',
 'GROQ_API_KEY','GROQ_TTS_MODEL','GROQ_TTS_VOICE',
 'HUME_API_KEY','HUME_TTS_MODEL','HUME_VOICE_ID',
 'CARTESIA_API_KEY','CARTESIA_TTS_MODEL','CARTESIA_VOICE_ID',
 'CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_TTS_VOICE',
 'GOOGLE_TTS_API_KEY','GOOGLE_ACCESS_TOKEN','GOOGLE_CLOUD_PROJECT','GOOGLE_TTS_VOICE',
 'VOICERSS_API_KEY','VOICERSS_TTS_VOICE','DEEPGRAM_API_KEY','DEEPGRAM_TTS_MODEL',
 'AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_REGION','AWS_DEFAULT_REGION','POLLY_TTS_VOICE','POLLY_TTS_ENGINE',
 'MISTRAL_API_KEY','MISTRAL_VOICE_ID','MISTRAL_TTS_MODEL'
];
export function providerListing({freeOnly=false}={}) {
 const providers=Object.values(CATALOG.providers).filter(p=>!freeOnly || p.freeKind.startsWith('recurring'));
 return {checkedAt:CATALOG.checkedAt,notice:CATALOG.notice,providers};
}
export function requireFreeTier(engine,model,voice) {
 const p=CATALOG.providers[engine];
 if(!p || !p.freeKind.startsWith('recurring')) throw new Error('--free-tier-only refuses '+engine+': '+(p?.freeKind??'not a cloud free-tier provider'));
 const permitted = engine==='gemini' ? ['gemini-2.5-flash-preview-tts','gemini-3.1-flash-tts-preview'].includes(model)
  : engine==='groq' ? model==='canopylabs/orpheus-v1-english'
  : engine==='hume' ? ['1','2'].includes(model)
  : engine==='cartesia' ? /^sonic-(?:3|3\.5|3\.6)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
  : engine==='cloudflare' ? model==='@cf/deepgram/aura-1'
  : engine==='google' ? /^en-[A-Z]{2}-(?:Neural2|Standard|Wavenet)-[A-Za-z0-9]+$/.test(voice??'')
  : engine==='elevenlabs' ? ['eleven_v3','eleven_multilingual_v2','eleven_flash_v2_5','eleven_turbo_v2_5'].includes(model)
  : true;
 if(!permitted) throw new Error('--free-tier-only: this model/voice is not in the verified offer profile. Select the documented default or review the offer and omit this flag explicitly.');
 return 'Free-tier eligibility filter only: this does NOT read remaining quota or prevent provider-side overage billing.';
}
