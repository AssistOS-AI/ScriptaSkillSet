import { fail, secondsToFrames } from './util.mjs';

export function compileTimeline(score, performances) {
  const sr = score.settings?.sampleRate ?? 24000;
  const out = new Map(), visiting = new Set(), lookup = new Map(score.beats.map((b, i) => [b.id, { b, i }]));
  const F = s => secondsToFrames(s, sr);
  function anchored(at, fallback = 0) {
    if (at === undefined) return fallback;
    if (typeof at === 'number') return F(at);
    const anchor = resolve(at.beat);
    let base;
    if (at.edge === 'marker') {
      const marker = anchor.markers?.find(m => m.id === at.marker);
      if (!marker) fail(`Missing compiled marker ${at.beat}.${at.marker}`);
      base = marker.frame;
    } else base = at.edge === 'start' ? anchor.startFrame : anchor.endFrame;
    return base + F(at.offsetSeconds ?? 0);
  }
  function resolve(id) {
    if (out.has(id)) return out.get(id);
    if (visiting.has(id)) fail(`Timing dependency cycle at ${id}`);
    const item = lookup.get(id);
    if (!item) fail(`Unknown timing anchor ${id}`);
    visiting.add(id);
    const { b, i } = item;
    const fallback = b.at === undefined && i ? resolve(score.beats[i - 1].id).endFrame : 0;
    const startFrame = anchored(b.at, fallback);
    if (startFrame < 0) fail(`${id} starts before scene zero`);
    let event;
    if (b.type === 'pause') {
      event = { id, kind: 'pause', startFrame, endFrame: startFrame + F(b.seconds) };
    } else {
      const p = performances[id];
      if (!p || !Number.isInteger(p.frames) || p.frames <= 0) fail(`Missing measured audio duration for ${id}`);
      const markers = (b.markers || []).map(m => {
        if (m.audioSha256 !== p.sha256) fail(`Stale marker ${id}.${m.id}: audio SHA-256 changed; re-align or remove the marker`);
        const localFrame = F(m.seconds);
        if (localFrame < 0 || localFrame > p.frames) fail(`Marker ${id}.${m.id} lies outside its dry performance`);
        return { id: m.id, frame: startFrame + localFrame, localFrame, basis: m.basis, label: m.label ?? '' };
      });
      event = { id, kind: 'speech', speaker: b.speaker, text: b.text, direction: b.direction ?? {},
        startFrame, endFrame: startFrame + p.frames, audibleEndFrame: startFrame + p.audibleFrames,
        asset: p.asset, dryAsset: p.dryAsset, audioSha256: p.sha256, selectedTake: p.selectedTake,
        gainDb: b.gainDb ?? 0, pan: b.pan ?? 0, envelope: p.envelope, markers };
    }
    out.set(id, event); visiting.delete(id); return event;
  }
  const events = score.beats.map(b => resolve(b.id));
  const visuals = (score.visuals || []).map(v => {
    const startFrame = anchored(v.at);
    if (startFrame < 0) fail(`${v.id} visual starts before scene zero`);
    return { id: v.id, startFrame, endFrame: startFrame + F(v.durationSeconds), target: v.target, action: v.action, params: v.params ?? {} };
  });
  return { sampleRate: sr, events, visuals, anchor: anchored };
}
export function validateTimeline(t) {
  if (t.format !== 'theatrical-timeline/1' || !Number.isInteger(t.sampleRate) || !Number.isInteger(t.durationFrames) || t.durationFrames <= 0) fail('Invalid compiled timeline header');
  for (const e of [...t.events, ...t.visuals]) {
    if (![e.startFrame, e.endFrame].every(Number.isInteger) || e.startFrame < 0 || e.endFrame < e.startFrame || e.endFrame > t.durationFrames) fail(`Invalid time interval: ${e.id}`);
    if (e.kind && e.kind !== 'pause') {
      const asset = t.assets[e.asset];
      if (!asset) fail(`Missing playback asset: ${e.id}`);
      if (asset.sampleRate !== t.sampleRate || asset.frames !== (e.audibleEndFrame ?? e.endFrame) - e.startFrame) fail(`Playback asset duration disagrees with event: ${e.id}`);
      if (e.kind === 'speech') {
        const dry = t.assets[e.dryAsset];
        if (!dry || dry.frames !== e.endFrame - e.startFrame || dry.sha256 !== e.audioSha256) fail(`Dry performance duration or hash disagrees with event: ${e.id}`);
      }
      if ((e.audibleEndFrame ?? e.endFrame) > t.durationFrames) fail(`Cut audio tail: ${e.id}`);
    }
  }
  return true;
}
