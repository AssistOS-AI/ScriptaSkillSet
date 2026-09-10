import { EXTRA_ENGINES } from './providers.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, VERSION, readJSON, writeJSON, hash, hashFile, canonical, exists, fail, atomicWrite } from './util.mjs';
import { validateScore } from './schema.mjs';
import { createBackend, actingInstruction } from './backend.mjs';
import { readWav, writeWav, resample, mono, statistics, envelope } from './wav.mjs';
import { roomReflections, synthesizePreset, mixScene } from './dsp.mjs';
import { compileTimeline, validateTimeline } from './timeline.mjs';
import { resolveOptions, CLOUD_ENGINES, VOICE_FIELDS } from './config.mjs';

export async function render(scoreFile, options = {}) {
  options = await resolveOptions(options);
  const score = await readJSON(scoreFile);
  if (options.voice !== undefined) {
    if (typeof options.voice !== 'string' || !options.voice.trim()) fail('--voice requires a voice name/ID');
    if (Object.keys(score.voices).length !== 1) fail('--voice applies only to single-speaker scores; configure each cast member for dialogue');
    const field = VOICE_FIELDS[options.engine];
    if (field) Object.values(score.voices)[0][field] = options.voice;
  }
  if (options.takes !== undefined) score.settings = { ...score.settings, takes: Number(options.takes) };
  validateScore(score, await readJSON(path.join(ROOT, 'schemas/score.schema.json')));
  const engineName = options.engine;
  if(EXTRA_ENGINES.includes(engineName)&&Object.keys(score.voices).length>1)
    for(const [id,v]of Object.entries(score.voices))if(!v[VOICE_FIELDS[engineName]])fail(`Set voices.${id}.${VOICE_FIELDS[engineName]} explicitly for multi-character scenes; one provider default cannot define the whole cast.`);
  if (['piper', 'kokoro', 'test-tone'].includes(engineName) && !options['allow-degraded']) fail('This engine cannot execute theatrical direction. Explicit --allow-degraded is required; no silent quality fallback.');
  const maxRequests = Number(options['max-requests'] ?? 100);
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 2500) fail('--max-requests must be an integer 1..2500');
  const maxChars=Number(options['max-chars']??1000000), intervalMs=Number(options['request-interval-ms']??0);
  if(!Number.isInteger(maxChars)||maxChars<1||maxChars>10000000)fail('--max-chars must be an integer 1..10000000');
  if(!Number.isInteger(intervalMs)||intervalMs<0||intervalMs>60000)fail('--request-interval-ms must be an integer 0..60000');
  let sentCharacters=0,lastRequestStart=0;
  const outDir = path.resolve(String(options.out ?? path.join('output', score.id)));
  await fs.mkdir(outDir, { recursive: true });
  const lockPath = path.join(outDir, '.render.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch { fail(`Another render may own ${outDir}. A crashed job may leave .render.lock; remove it only after confirming no renderer is active.`); }
  await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  let backend;
  const wallStart = performance.now();
  try {
    backend = await createBackend(engineName, options);
    const sampleRate = score.settings?.sampleRate ?? 24000;
    const cacheDir = path.resolve(String(options.cache ?? path.join('.theatrical-audio', 'cache', 'speech')));
    await fs.mkdir(cacheDir, { recursive: true });
    const assets = {}, buffers = {}, performances = {}, takes = [], warnings = [...(backend.info.warnings ?? [])];
    const evidence = { cloud: CLOUD_ENGINES.includes(engineName), cacheHits: 0, generatedTakes: 0, modelLoadsUpperBound: ['piper','qwen','kokoro'].includes(engineName) ? 1 : 0 };
    const makeJob = (beat, seed) => ({ text: beat.text, language: score.language, voice: score.voices[beat.speaker], direction: beat.direction ?? {},
      instruction: actingInstruction(beat.direction), pace: beat.direction?.pace ?? 1, seed, maxNewTokens: score.settings?.maxNewTokens ?? 1024 });
    // Validate all cloud requests before spending on the first clip. This makes missing voice IDs cheap to catch.
    if (backend.validateJob) for (const beat of score.beats.filter(b => b.type === 'speech')) backend.validateJob(makeJob(beat, beat.seed ?? score.settings?.seed ?? 7331));
    async function addAsset(id, audio, folder = 'clips') {
      const tmp = path.join(outDir, folder, id + '.pending.wav');
      await writeWav(tmp, audio);
      const sha256 = await hashFile(tmp), file = `${folder}/${id}-${sha256.slice(0, 16)}.wav`;
      const destination = path.join(outDir, file);
      await fs.rename(tmp, destination);
      const stored = await readWav(destination);
      assets[id] = { file, sha256, ...statistics(stored) };
      buffers[id] = stored;
      return assets[id];
    }
    const frontEndHash = hash(canonical(await Promise.all(['src/render.mjs', 'src/wav.mjs'].map(f=>hashFile(path.join(ROOT,f))))));
    for (const beat of score.beats) {
      if (beat.type !== 'speech') continue;
      const voice = score.voices[beat.speaker], optionsForBeat = [];
      const count = beat.takes ?? score.settings?.takes ?? 1;
      for (let take = 0; take < count; take++) {
        const seed = ((beat.seed ?? score.settings?.seed ?? 7331) + take * 104729) % 2147483647;
        const job = makeJob(beat, seed);
        // Placement, selectedTake, gain, pan and room acoustics are deliberately NOT TTS cache inputs.
        const cacheKey = hash(canonical({ version: VERSION, frontEndHash, backend: backend.fingerprint, job: backend.cacheIdentity ? backend.cacheIdentity(job) : job, sampleRate }));
        const cachedWav = path.join(cacheDir, cacheKey + '.wav'), cachedMeta = path.join(cacheDir, cacheKey + '.json');
        let synthesis, dry, reused = false;
        if (!options.refresh && await exists(cachedWav) && await exists(cachedMeta)) {
          const meta = await readJSON(cachedMeta);
          if (meta.sha256 === await hashFile(cachedWav)) {
            dry = await readWav(cachedWav); synthesis = meta.synthesis; reused = true;
          } else warnings.push(`Corrupted cache entry regenerated for ${beat.id} take ${take}.`);
        }
        if (!reused) {
          const rawFile = path.join(outDir, `.raw-${beat.id}-${take}-${process.pid}.wav`);
          process.stderr.write(`Synthesize ${beat.id}, take ${take + 1}/${count} [${engineName}]\n`);
          try {
            if (CLOUD_ENGINES.includes(engineName) && evidence.generatedTakes >= maxRequests) fail('Cloud request budget reached. Raise --max-requests explicitly to continue; completed clips remain cached.');
            if(CLOUD_ENGINES.includes(engineName)){
              if(sentCharacters+job.text.length>maxChars)fail('Cloud text-character budget reached. No next request sent; completed clips remain cached.');
              const wait=lastRequestStart?Math.max(0,intervalMs-(Date.now()-lastRequestStart)):0;
              if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
              lastRequestStart=Date.now();sentCharacters+=job.text.length;
            }
            synthesis = await backend.synthesize(job, rawFile);
            dry = resample(mono(await readWav(rawFile)), sampleRate);
            await writeWav(cachedWav, dry);
            const sha256 = await hashFile(cachedWav);
            await writeJSON(cachedMeta, { cacheKey, sha256, synthesis, backend: backend.info, job });
            dry = await readWav(cachedWav);
          } finally { await fs.rm(rawFile, { force: true }); }
          evidence.generatedTakes++;
        } else evidence.cacheHits++;
        for (const warning of synthesis?.warnings ?? []) if (!warnings.includes(warning)) warnings.push(warning);
        const stats = statistics(dry);
        const issues = [];
        if (stats.durationSeconds > 25) issues.push('Long clip: consider a semantic split; duration is not a transcription check.');
        if (stats.rms < .001) issues.push('Almost silent audio.');
        if (stats.nearFullScaleSamples) issues.push(`${stats.nearFullScaleSamples} near-full-scale samples; inspect the dry take.`);
        if (synthesis?.clampedSamples > 0) issues.push('Model output was outside PCM range before encoding.');
        const dryId = `${beat.id}_dry_t${take}`;
        const dryAsset = await addAsset(dryId, dry, 'dry');
        const record = { beat: beat.id, take, seed, cacheKey, reused, dryAsset: dryId, sha256: dryAsset.sha256, ...stats,
          technicallyUsable: stats.rms >= .001 && stats.durationSeconds >= .05,
          issues, contentVerification: 'not-performed', emotionVerification: 'not-performed', synthesis };
        takes.push(record); optionsForBeat.push({ dry, record });
      }
      const selected = beat.selectedTake === undefined ? optionsForBeat.find(x => x.record.technicallyUsable) : optionsForBeat[beat.selectedTake];
      if (!selected?.record.technicallyUsable) fail(`No technically usable selected take for ${beat.id}; inspect takes or regenerate. No voice substitution performed.`);
      const { dry, record } = selected;
      const processed = roomReflections(dry, score.settings?.room);
      const wetPeak = statistics(processed).peak;
      if (wetPeak > .98) { // Prevent clipping during stem encoding; record conservative attenuation below.
        for (const channel of processed.channels) for (let i=0;i<channel.length;i++) channel[i] *= .98/wetPeak;
      }
      const assetId = `${beat.id}_playback`, playback = await addAsset(assetId, processed);
      performances[beat.id] = { frames: dry.channels[0].length, audibleFrames: playback.frames,
        asset: assetId, dryAsset: record.dryAsset, sha256: record.sha256, selectedTake: record.take, envelope: envelope(dry),
        stemAttenuation: wetPeak > .98 ? .98/wetPeak : 1 };
      warnings.push(...record.issues.map(x=>`${beat.id}: ${x}`));
    }
    evidence.sentTextCharacters=sentCharacters;
    evidence.remainingProviderQuotaKnown=false;
    const compiled = compileTimeline(score, performances);
    for (const e of compiled.events) if (e.kind === 'speech') {
      e.stemAttenuation = performances[e.id].stemAttenuation;
      // Retain conservative attenuation, rather than recovering a possibly clipping single stem.
    }
    for (const effect of score.effects ?? []) {
      const a = await loadSound(effect, scoreFile, sampleRate);
      const asset = await addAsset(`${effect.id}_effect`, a);
      const startFrame = compiled.anchor(effect.at, 0);
      if (startFrame < 0) fail(`Negative effect start: ${effect.id}`);
      compiled.events.push({ id: effect.id, kind: 'effect', startFrame, endFrame: startFrame + asset.frames,
        audibleEndFrame: startFrame + asset.frames, asset: `${effect.id}_effect`, gainDb: effect.gainDb ?? -12, pan: effect.pan ?? 0 });
    }
    const beds = [];
    for (const bed of score.beds ?? []) {
      await addAsset(`${bed.id}_bed`, await loadSound(bed, scoreFile, sampleRate), 'beds');
      beds.push({ id: bed.id, asset: `${bed.id}_bed`, loop: true, gainDb: bed.gainDb ?? -24, duckDb: bed.duckDb ?? -8, fadeSeconds: bed.fadeSeconds ?? .25 });
    }
    const bodyEnd = Math.max(1, ...compiled.events.map(e=>e.audibleEndFrame??e.endFrame), ...compiled.visuals.map(v=>v.endFrame));
    const durationFrames = bodyEnd + Math.round((score.settings?.tailSeconds ?? .5) * sampleRate);
    if (durationFrames / sampleRate > (score.settings?.maxSceneSeconds ?? 300)) fail('Scene exceeds maxSceneSeconds. Split the score into scenes; do not assemble an unbounded book in RAM.');
    const timeline = {
      format: 'theatrical-timeline/1', id: score.id, title: score.title, language: score.language, sampleRate, durationFrames, durationSeconds: durationFrames / sampleRate,
      clock: 'integer-audio-frames', assets, voices: score.voices,
      events: compiled.events.sort((a,b)=>a.startFrame-b.startFrame || a.id.localeCompare(b.id)), visuals: compiled.visuals.sort((a,b)=>a.startFrame-b.startFrame), beds,
      ceilingDbFS: score.settings?.ceilingDbFS ?? -1,
      provenance: { skillVersion: VERSION, engine: backend.info, scoreSha256: hash(canonical(score)), generatedAt: new Date().toISOString(),
        selectionPolicy: 'explicit selectedTake, otherwise first technically usable; no automatic emotion ranking',
        alignment: 'clip-boundaries + optional hash-bound markers; amplitude envelope is not lip-sync', warnings },
    };
    validateTimeline(timeline);
    const mix = mixScene(timeline, buffers);
    timeline.masterGain = mix.masterGain;
    timeline.mix = { file: 'audition.wav', ...mix.statistics, normalization: 'attenuation-only sample-peak ceiling; NOT LUFS or true-peak mastering' };
    if (!options['no-audition']) await writeWav(path.join(outDir, 'audition.wav'), mix.audio);
    else await fs.rm(path.join(outDir, 'audition.wav'), { force: true });
    if (!options['no-audition']) timeline.mix.sha256 = await hashFile(path.join(outDir, 'audition.wav'));
    else { delete timeline.mix.file; timeline.mix.exported = false; }
    await writeJSON(path.join(outDir, 'takes.json'), takes);
    await writeJSON(path.join(outDir, 'score.json'), score);
    await writeJSON(path.join(outDir, 'report.json'), { ...evidence, durationSeconds: timeline.durationSeconds,
      renderSeconds: (performance.now()-wallStart)/1000, speechClips: score.beats.filter(b=>b.type==='speech').length,
      byteSizes: {dry: Object.values(assets).filter(a=>a.file.startsWith('dry/')).reduce((n,a)=>n+44+a.frames*a.channels*2,0)},
      validated: ['WAV structure','finite samples','exact frame durations','anchor resolution','asset SHA-256','sample peak ceiling'],
      notValidated: ['intelligibility by ASR','emotional fidelity','human naturalness','phoneme-level lip-sync'], warnings });
    await writeJSON(path.join(outDir, 'timeline.json'), timeline); // Commit the manifest last.
    return { outDir, timeline, evidence };
  } finally {
    try { if (backend) await backend.close(); }
    finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
  }
}
async function loadSound(spec, scoreFile, sampleRate) {
  if (Boolean(spec.file) === Boolean(spec.preset)) fail(`${spec.id}: supply exactly one of file or preset`);
  if (spec.file) {
    if (/^[a-z]+:\/\//i.test(spec.file)) fail('Sound assets must be local files');
    return resample(await readWav(path.resolve(path.dirname(scoreFile), spec.file)), sampleRate);
  }
  if (!spec.seconds) fail(`${spec.id}: procedural sounds require seconds`);
  return synthesizePreset(spec.preset, spec.seconds, sampleRate, spec.seed ?? 7);
}
export async function auditBundle(dir) {
  const t=await readJSON(path.join(dir,'timeline.json'));validateTimeline(t);
  const results=[];
  for(const [id,asset] of Object.entries(t.assets)){
    const file=path.resolve(dir,asset.file);
    if(!file.startsWith(path.resolve(dir)+path.sep)) fail('Asset path leaves bundle');
    if(await hashFile(file)!==asset.sha256)fail(`Asset digest mismatch: ${id}`);
    const s=statistics(await readWav(file));
    if(s.frames!==asset.frames || s.sampleRate!==t.sampleRate)fail(`Asset timing mismatch: ${id}`);
    results.push({id,valid:true,frames:s.frames});
  }
  return {valid:true,assets:results,warning:'Technical validation does not certify acting, transcript correctness or naturalness.'};
}
