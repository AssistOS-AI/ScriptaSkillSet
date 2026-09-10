import { atomicWrite, clamp, fail } from './util.mjs';
import fs from 'node:fs/promises';

export function decodeWav(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') fail('Expected a RIFF/WAVE file');
  if (b.readUInt32LE(4) + 8 > b.length) fail('Truncated RIFF file');
  let format, data;
  for (let pos = 12; pos + 8 <= b.length;) {
    const tag = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4), start = pos + 8;
    if (start + size > b.length) fail(`Truncated WAV chunk: ${tag}`);
    if (tag === 'fmt ') {
      if (size < 16) fail('WAV fmt chunk is too short');
      let code = b.readUInt16LE(start);
      if (code === 0xfffe) { if (size < 40) fail('Invalid extensible WAV'); code = b.readUInt16LE(start + 24); }
      format = { code, channels: b.readUInt16LE(start + 2), sampleRate: b.readUInt32LE(start + 4), blockAlign: b.readUInt16LE(start + 12), bits: b.readUInt16LE(start + 14) };
    }
    if (tag === 'data') data = { start, size };
    pos = start + size + (size % 2);
  }
  if (!format || !data) fail('Missing WAV fmt or data chunk');
  const { code, channels, sampleRate, blockAlign, bits } = format;
  if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 192000) fail('Only mono/stereo PCM WAV at 8–192 kHz is supported');
  if (!(code === 1 && [16, 24, 32].includes(bits)) && !(code === 3 && bits === 32)) fail('Use PCM16/24/32 or float32 WAV; compressed input is unsupported');
  if (blockAlign !== channels * bits / 8 || data.size % blockAlign) fail('Invalid WAV block alignment');
  const frames = data.size / blockAlign;
  if (!frames) fail('Empty WAV');
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0, p = data.start; i < frames; i++) for (let c = 0; c < channels; c++, p += bits / 8) {
    const v = code === 3 ? b.readFloatLE(p) : bits === 16 ? b.readInt16LE(p) / 32768 : bits === 24 ? b.readIntLE(p, 3) / 8388608 : b.readInt32LE(p) / 2147483648;
    if (!Number.isFinite(v)) fail('Non-finite sample in WAV');
    planes[c][i] = v;
  }
  return { sampleRate, channels: planes, frames, duration: frames / sampleRate };
}
export const readWav = async (file) => decodeWav(await fs.readFile(file));
export function encodeWav(audio) {
  const { sampleRate, channels } = audio, n = channels[0]?.length;
  if (!n || ![1, 2].includes(channels.length) || !Number.isInteger(sampleRate) || sampleRate < 8000) fail('Invalid audio buffer');
  if (channels.some(c => c.length !== n)) fail('Mismatched audio channel lengths');
  const size = n * channels.length * 2;
  if (size > 0xffffffff - 36) fail('RIFF size exceeds 4 GiB');
  const b = Buffer.alloc(44 + size);
  b.write('RIFF', 0); b.writeUInt32LE(size + 36, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(channels.length, 22); b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * channels.length * 2, 28); b.writeUInt16LE(channels.length * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(size, 40);
  for (let i = 0, p = 44; i < n; i++) for (const channel of channels) {
    if (!Number.isFinite(channel[i])) fail('Cannot encode a non-finite sample');
    b.writeInt16LE(clamp(Math.round(channel[i] * 32768), -32768, 32767), p); p += 2;
  }
  return b;
}
export const writeWav = (file, audio) => atomicWrite(file, encodeWav(audio));
export function mono(audio) {
  if (audio.channels.length === 1) return audio;
  const out = new Float32Array(audio.channels[0].length);
  for (let i = 0; i < out.length; i++) out[i] = (audio.channels[0][i] + audio.channels[1][i]) / 2;
  return { sampleRate: audio.sampleRate, channels: [out] };
}
export function resample(audio, sampleRate) {
  if (audio.sampleRate === sampleRate) return audio;
  const ratio = sampleRate / audio.sampleRate, cutoff = Math.min(1, ratio), radius = Math.ceil(16 / cutoff);
  const length = Math.max(1, Math.round(audio.channels[0].length * ratio));
  const sinc = x => Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  const channels = audio.channels.map(input => {
    const output = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const center = i / ratio, lo = Math.max(0, Math.ceil(center - radius)), hi = Math.min(input.length - 1, Math.floor(center + radius));
      let sum = 0, weights = 0;
      for (let j = lo; j <= hi; j++) {
        const delta = j - center;
        const weight = cutoff * sinc(delta * cutoff) * (0.5 + 0.5 * Math.cos(Math.PI * delta / radius));
        sum += input[j] * weight; weights += weight;
      }
      output[i] = weights ? sum / weights : 0;
    }
    return output;
  });
  return { sampleRate, channels };
}
export function statistics(audio) {
  let peak = 0, energy = 0, clipped = 0, nonzero = 0;
  const frames = audio.channels[0].length, n = frames * audio.channels.length;
  for (const channel of audio.channels) for (const x of channel) {
    if (!Number.isFinite(x)) fail('Non-finite audio');
    peak = Math.max(peak, Math.abs(x)); energy += x * x;
    if (Math.abs(x) >= 0.999) clipped++;
    if (Math.abs(x) > 0.001) nonzero++;
  }
  return { frames, sampleRate: audio.sampleRate, channels: audio.channels.length, durationSeconds: frames / audio.sampleRate,
    peak, peakDbFS: peak > 0 ? 20 * Math.log10(peak) : null, rms: Math.sqrt(energy / n), nearFullScaleSamples: clipped, activeFraction: nonzero / n };
}
export function envelope(audio, hz = 25) {
  const input = mono(audio).channels[0], hop = Math.max(1, Math.round(audio.sampleRate / hz)), values = [];
  let peak = 0;
  for (let i = 0; i < input.length; i += hop) {
    let e = 0; const end = Math.min(input.length, i + hop);
    for (let j = i; j < end; j++) e += input[j] ** 2;
    const v = Math.sqrt(e / (end - i)); values.push(v); peak = Math.max(peak, v);
  }
  return { kind: 'amplitude-not-phonemes', hopFrames: hop, values: values.map(v => +(peak ? Math.sqrt(v / peak) : 0).toFixed(3)) };
}
