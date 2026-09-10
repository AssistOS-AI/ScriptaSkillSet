import { CATALOG, requireFreeTier } from './providers.mjs';
import path from 'node:path';
import { ROOT, hash, hashFile, canonical, atomicWrite, fail } from './util.mjs';
import { encodeWav } from './wav.mjs';

export const OPENAI_VOICES = ['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'];
const LEGACY_OPENAI_VOICES = ['alloy','ash','coral','echo','fable','onyx','nova','sage','shimmer'];
export const CLOUD_DEFAULTS = {
  openai: { model: 'gpt-4o-mini-tts', voice: 'marin', baseUrl: 'https://api.openai.com/v1' },
  elevenlabs: { model: 'eleven_v3', voice: '', baseUrl: 'https://api.elevenlabs.io/v1' },
  azure: { model: 'azure-neural', voice: 'en-US-JennyNeural' }
};
const KEY_NAMES = { openai: 'OPENAI_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY', azure: 'AZURE_SPEECH_KEY' };

export function cloudConfig(engine, options = {}, env = process.env) {
  const defaults = CLOUD_DEFAULTS[engine];
  if (!defaults) fail(`Unknown cloud engine ${engine}`);
  const p = options._provider ?? {};
  const prefix = engine === 'openai' ? 'OPENAI_TTS' : engine === 'elevenlabs' ? 'ELEVENLABS' : 'AZURE_TTS';
  const modelEnv = engine === 'elevenlabs' ? env.ELEVENLABS_MODEL_ID : env[`${prefix}_MODEL`];
  const voiceEnv = engine === 'elevenlabs' ? env.ELEVENLABS_VOICE_ID : env[`${prefix}_VOICE`];
  const config = { ...defaults, ...p, engine, model: options.model ?? modelEnv ?? p.model ?? defaults.model,
    voice: voiceEnv ?? p.voice ?? defaults.voice,
    region: env.AZURE_SPEECH_REGION ?? p.region,
    timeoutMs: Number(options['timeout-ms'] ?? p.timeoutMs ?? 180000),
    cacheSalt: p.cacheSalt ?? '' };
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 1800000) fail('timeoutMs must be 1..1800000');
  if (engine === 'azure') {
    if (!config.region || !/^[a-z0-9-]{2,40}$/.test(config.region)) fail('Set AZURE_SPEECH_REGION to the region of your Azure Speech resource (for example, westeurope).');
    config.baseUrl = p.baseUrl ?? `https://${config.region}.tts.speech.microsoft.com`;
  }
  let url;
  try { url = new URL(config.baseUrl); } catch { fail('Invalid provider baseUrl'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('Provider baseUrl must be HTTPS with no credentials, query or fragment');
  config.baseUrl = config.baseUrl.replace(/\/+$/, '');
  return config;
}

function textValue(value, name, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${name} must be a nonempty string of at most ${max} characters`);
  return value;
}
function bounded(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be ${min}..${max}`);
  return value;
}
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// Pure request construction: no credentials or networking. Safe to hash for caching and test with fixtures.
export function buildCloudRequest(config, job, options = {}) {
  const { engine } = config, direction = job.direction ?? {}, warnings = [];
  const text = textValue(job.text, 'speech text');
  const pace = bounded(job.pace ?? 1, 'pace', .5, 2);
  const voice = textValue(job.voice?.[`${engine}Voice`] ?? config.voice, `${engine} voice`, 256);
  if(options['free-tier-only']) requireFreeTier(engine,config.model,voice);
  if (engine === 'openai') {
    const legacy = ['tts-1', 'tts-1-hd'].includes(config.model);
    if (legacy && !options['allow-degraded']) fail('tts-1/tts-1-hd do not support acting instructions. Use gpt-4o-mini-tts or explicitly --allow-degraded.');
    if (!(legacy ? LEGACY_OPENAI_VOICES : OPENAI_VOICES).includes(voice)) fail(`Unsupported built-in OpenAI voice ${voice}; use the voices command. Custom voice enrollment is not implemented.`);
    const payload = { model: config.model, voice, input: text, response_format: 'pcm' };
    if (!legacy) payload.instructions = [job.voice?.description, job.instruction].filter(Boolean).join('. ');
    else { payload.speed = pace; warnings.push('Legacy OpenAI model ignores acting instructions; only voice and speed are used.'); }
    return { url: config.baseUrl + '/audio/speech', contentType: 'application/json', body: JSON.stringify(payload),
      seedApplied: false, warnings, control: legacy ? 'voice-and-speed-only' : 'natural-language-instructions' };
  }
  if (engine === 'elevenlabs') {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(voice) || /^(YOUR|REPLACE|VOICE_ID)/i.test(voice)) fail('Set a real ELEVENLABS_VOICE_ID or voice.elevenlabsVoice from voices --engine elevenlabs.');
    const v3 = config.model === 'eleven_v3', extra = direction.elevenlabs ?? {};
    const tags = extra.tags ?? [];
    if (!Array.isArray(tags) || tags.length > 8 || tags.some(t => typeof t !== 'string' || !/^[A-Za-z][A-Za-z ,'-]{0,63}$/.test(t))) fail('ElevenLabs tags must be a list of short tag names without brackets');
    if (tags.length && !v3) fail('This adapter supports audio tags only with eleven_v3. Remove tags or select eleven_v3.');
    const stability = extra.stability ?? .5;
    bounded(stability, 'stability', 0, 1);
    if (v3 && ![0, .5, 1].includes(stability)) fail('eleven_v3 stability must be 0 (creative), 0.5 (natural), or 1 (robust)');
    const speed = extra.speed ?? pace;
    bounded(speed, 'ElevenLabs speed', .7, 1.2);
    const payload = { text: (tags.length ? tags.map(t => `[${t}]`).join(' ') + ' ' : '') + text,
      model_id: config.model, voice_settings: { stability, speed }, seed: job.seed };
    if (extra.similarityBoost !== undefined) payload.voice_settings.similarity_boost = bounded(extra.similarityBoost, 'similarityBoost', 0, 1);
    if (direction.emotion || direction.delivery || direction.emphasis?.length || direction.intensity !== undefined)
      warnings.push('ElevenLabs uses the explicit direction.elevenlabs tags/settings; free-form direction and intensity are not automatically translated or spoken.');
    if (!tags.length && (direction.emotion || direction.delivery)) warnings.push('No ElevenLabs audio tags supplied: select tags for acting control.');
    return { url: config.baseUrl + '/text-to-speech/' + encodeURIComponent(voice) + '?output_format=pcm_24000',
      contentType: 'application/json', body: JSON.stringify(payload), seedApplied: true, warnings,
      control: v3 ? 'audio-tags-and-voice-settings' : 'voice-settings-only' };
  }
  const extra = direction.azure ?? {};
  if (!/^[A-Za-z0-9_-]+$/.test(voice)) fail('Invalid Azure voice short name');
  const locale = job.voice?.azureLocale ?? (voice.match(/^([a-z]{2,3}-[A-Z]{2})-/)?.[1] ?? (job.language?.includes('-') ? job.language : 'en-US'));
  if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(locale)) fail('Azure locale must look like en-US, ro-RO, fr-FR, etc.');
  let inner = `<prosody rate="${Math.round((pace - 1) * 100)}%">${xml(text)}</prosody>`;
  if (extra.style !== undefined) {
    if (!/^[a-z][a-z_-]{0,63}$/.test(extra.style)) fail('Invalid Azure style');
    const degree = bounded(extra.styleDegree ?? 1, 'Azure styleDegree', .01, 2);
    inner = `<mstts:express-as style="${xml(extra.style)}" styledegree="${degree}">${inner}</mstts:express-as>`;
  } else if (extra.styleDegree !== undefined) fail('Azure styleDegree requires a style');
  if (direction.emotion || direction.delivery || direction.emphasis?.length || direction.intensity !== undefined)
    warnings.push('Azure uses direction.azure.style/styleDegree plus pace. Free-form direction is not executed; styles must be supported by the selected voice.');
  const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${xml(voice)}">${inner}</voice></speak>`;
  return { url: config.baseUrl + '/cognitiveservices/v1', contentType: 'application/ssml+xml', body, seedApplied: false, warnings, control: 'ssml-style-and-prosody' };
}

export async function boundedRequest(url, init, { fetchImpl = globalThis.fetch, timeoutMs = 180000, maxBytes = 32 * 1024 * 1024, engine = 'provider' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      // Do not echo provider bodies, which can contain text, credentials or account details.
      await response.body?.cancel();
      const hint = response.status === 401 || response.status === 403 ? 'Check the API key, resource permissions and model access.'
        : response.status === 429 ? 'Rate limit or quota reached; check provider billing/quota, then retry deliberately.'
        : response.status === 400 ? 'Check model, voice and supported settings.' : 'Provider request failed.';
      throw new Error(`${engine} HTTP ${response.status}. ${hint} No automatic retry was made.`);
    }
    const type = response.headers.get('content-type') ?? '';
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxBytes) { await response.body?.cancel(); fail(`${engine} response exceeds the byte limit`); }
    if (!response.body) fail(`${engine} returned an empty response`);
    const reader = response.body.getReader(), chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); fail(`${engine} response exceeds the byte limit`); }
      chunks.push(Buffer.from(value));
    }
    return { bytes: Buffer.concat(chunks), contentType: type, requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? null };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${engine} request timed out. It may already have been billed; no automatic retry was made.`);
    if (error instanceof TypeError) throw new Error(`${engine} network request failed. Check HTTPS access/proxy and the agent sandbox network permission. No automatic retry was made.`);
    throw error;
  } finally { clearTimeout(timer); }
}

export function pcm24kToWav(bytes, contentType = '') {
  if (/json|html|xml|mpeg|mp3|ogg|wav|flac/i.test(contentType)) fail('Expected raw PCM, but the provider returned an encoded or non-audio response');
  if (bytes.length < 2 || bytes.length % 2) fail('Raw PCM response is empty or has an odd byte count');
  if (['RIFF', 'OggS', 'fLaC'].includes(bytes.toString('ascii', 0, 4)) || bytes.toString('ascii',0,3) === 'ID3') fail('Expected raw PCM, not a compressed/container audio file');
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
  return { wav: encodeWav({ sampleRate: 24000, channels: [samples] }), frames: samples.length, sampleRate: 24000 };
}

export async function createCloudBackend(engine, options = {}, dependencies = {}) {
  if (options.offline) fail('--offline forbids cloud requests');
  const env = dependencies.env ?? process.env, config = cloudConfig(engine, options, env);
  if(options['free-tier-only']) requireFreeTier(engine,config.model,options.voice??config.voice);
  const keyName = KEY_NAMES[engine], apiKey = env[keyName];
  if (!apiKey?.trim() || /^(YOUR|REPLACE|sk-\.\.\.)/i.test(apiKey)) fail(`Missing ${keyName}. Set it in the process environment or use --credentials-file PATH; never paste a secret into the agent conversation.`);
  const headers = engine === 'openai' ? { Authorization: `Bearer ${apiKey}` } : engine === 'elevenlabs' ? { 'xi-api-key': apiKey } : { 'Ocp-Apim-Subscription-Key': apiKey, 'User-Agent': 'theatrical-audio-skill' };
  const sourceHash = await hashFile(path.join(ROOT, 'src/cloud.mjs'));
  // No secret, request timeout, or unused provider configuration is included in this identity.
  const fingerprint = hash(canonical({ sourceHash, engine, endpoint: config.baseUrl, model: config.model, cacheSalt: config.cacheSalt }));
  const info = { engine, model: config.model, execution: 'cloud', alignment: 'none',
    endpoint: config.baseUrl, defaultVoice: config.voice || null, credentialSource: keyName, credentialPresent: true,
    credentialsValidated: false, inferenceTested: false, versions: { node: process.version },
    control: engine === 'openai' ? 'natural-language-instructions' : engine === 'elevenlabs' ? 'explicit-audio-tags-and-settings' : 'ssml-style-and-prosody',
    warnings: ['Cloud rendering sends this clip and its applicable directions to the selected provider; API usage can be billed.',
      'Cached audio is reproducible; a fresh provider generation is not guaranteed byte-identical.',
      'No word/phoneme alignment or automatic acting-quality certification is performed.'] };
  info.freeKind=CATALOG.providers[engine].freeKind; info.offerCheckedAt=CATALOG.providers[engine].checkedAt;
  info.warnings.push(CATALOG.providers[engine].cautions);
  if(options['free-tier-only']) info.warnings.push('Free-tier profile filter only; remaining quota and possible paid overages are NOT checked.');
  const requestOptions = { fetchImpl: dependencies.fetchImpl, timeoutMs: config.timeoutMs, engine };
  return { info, fingerprint,
    // Preflight each job before any billable request in a scene.
    validateJob: job => buildCloudRequest(config, job, options),
    cacheIdentity: job => { const request = buildCloudRequest(config, job, options); return { url: request.url, body: request.body, takeIdentity: job.seed }; },
    async synthesize(job, output) {
      const request = buildCloudRequest(config, job, options);
      const extra = engine === 'azure' ? { 'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm' } : {};
      const response = await boundedRequest(request.url, { method: 'POST', headers: { ...headers, ...extra, 'Content-Type': request.contentType }, body: request.body }, requestOptions);
      const result = pcm24kToWav(response.bytes, response.contentType);
      await atomicWrite(output, result.wav);
      return { frames: result.frames, sampleRate: result.sampleRate, clampedSamples: 0, provider: engine, model: config.model,
        requestId: response.requestId, seedApplied: request.seedApplied, seedDeterminism: request.seedApplied ? 'best-effort-only' : 'not-supported',
        control: request.control, warnings: request.warnings, contentVerification: 'not-performed', emotionVerification: 'not-performed' };
    },
    async voices(pageToken) {
      if (engine === 'openai') return { engine, source: 'documented-built-ins', voices: OPENAI_VOICES.map(id => ({ id })), accountAccessVerified: false };
      let url;
      if (engine === 'elevenlabs') {
        // Official v2 voice catalogue, while synthesis stays on v1.
        url = config.baseUrl.replace(/\/v1$/, '/v2') + '/voices?page_size=100' + (pageToken ? '&next_page_token=' + encodeURIComponent(pageToken) : '');
      } else url = config.baseUrl + '/cognitiveservices/voices/list';
      const response = await boundedRequest(url, { method: 'GET', headers }, { ...requestOptions, maxBytes: 8 * 1024 * 1024 });
      let data; try { data = JSON.parse(response.bytes.toString('utf8')); } catch { fail('Voice catalogue returned invalid JSON'); }
      if (engine === 'elevenlabs') return { engine, voices: (data.voices ?? []).map(v => ({ id: v.voice_id, name: v.name, category: v.category })), hasMore: !!data.has_more, nextPageToken: data.next_page_token ?? null };
      if (!Array.isArray(data)) fail('Azure voice catalogue returned an unexpected structure');
      return { engine, voices: data.filter(v => v.Locale?.startsWith('en-')).map(v => ({ id: v.ShortName, name: v.DisplayName, locale: v.Locale, styles: v.StyleList ?? [] })) };
    }, async close() {} };
}
