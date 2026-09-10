import { dbGain, clamp, fail } from './util.mjs';
import { statistics } from './wav.mjs';
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function synthesizePreset(preset, seconds, sr = 24000, seed = 7) {
  if (!['space-hum','wind','rain','drone','metal','chime','airlock','pulse'].includes(preset)) fail(`Unknown sound preset ${preset}`);
  const n = Math.round(seconds * sr), out = new Float32Array(n), random = rng(seed);
  const periodic = ['space-hum','wind','rain','drone'].includes(preset);
  let filtered = 0;
  const f = x => Math.round(x * seconds) / seconds;
  for (let i = 0; i < n; i++) {
    const t = i / sr, noise = random() * 2 - 1;
    filtered += 0.006 * (noise - filtered);
    let x = 0;
    if (preset === 'space-hum') x = .23 * Math.sin(2*Math.PI*f(53)*t) + .1*Math.sin(2*Math.PI*f(79.5)*t) + .04*Math.sin(2*Math.PI*f(160)*t) + filtered*.35;
    if (preset === 'wind') x = filtered * 2 * (.75+.25*Math.sin(2*Math.PI*t/seconds));
    if (preset === 'rain') x = noise*.14 + filtered*.6;
    if (preset === 'drone') x = (.19*Math.sin(2*Math.PI*f(110)*t) + .14*Math.sin(2*Math.PI*f(164.8)*t) + .08*Math.sin(2*Math.PI*f(220.3)*t))*(.8+.2*Math.cos(2*Math.PI*t/seconds));
    if (preset === 'metal') x = (.5*Math.sin(2*Math.PI*233*t)*Math.exp(-2.5*t) + .3*Math.sin(2*Math.PI*607.5*t)*Math.exp(-4*t) + .16*noise*Math.exp(-40*t))*(1-Math.exp(-180*t));
    if (preset === 'chime') x = (.4*Math.sin(2*Math.PI*659.25*t)+.18*Math.sin(2*Math.PI*987.77*t))*Math.exp(-2*t)*(1-Math.exp(-100*t));
    if (preset === 'airlock') x = noise*.35*Math.sin(Math.PI*i/n)**2 + .08*Math.sin(2*Math.PI*(83*t+12*t*t))*Math.sin(Math.PI*i/n)**2;
    if (preset === 'pulse') x = .55*Math.sin(2*Math.PI*440*t)*Math.exp(-7*t)*(1-Math.exp(-80*t));
    out[i] = x;
  }
  // Short edge tapers make loops click-safe. A subtle dip at the wrap is possible.
  if (periodic) {
    const fade = Math.min(Math.floor(sr*.06), Math.floor(n/4));
    for (let i=0;i<fade;i++) { const w=Math.sin(Math.PI*.5*i/fade); out[i]*=w; out[n-1-i]*=w; }
  } else {
    const fade = Math.min(Math.floor(sr*.015), Math.floor(n/4));
    for(let i=0;i<fade;i++){out[i]*=i/fade;out[n-1-i]*=i/fade;}
  }
  return { sampleRate: sr, channels: [out] };
}
export function roomReflections(audio, { wet = 0, delayMs = 65 } = {}) {
  if (!wet) return { sampleRate: audio.sampleRate, channels: audio.channels.map(c => c.slice()) };
  const sr=audio.sampleRate, delays=[1,1.71,2.63,3.8,5.13].map(x=>Math.round(x*delayMs*sr/1000));
  const channels=audio.channels.map(input=>{
    const out=new Float32Array(input.length+delays.at(-1)); out.set(input);
    for(let k=0;k<delays.length;k++) for(let i=0;i<input.length;i++) out[i+delays[k]]+=input[i]*wet*(.6**k);
    return out;
  });
  return {sampleRate:sr,channels};
}
export function duckAt(frame, intervals, sr, depthDb = -8) {
  const attack=sr*.06,release=sr*.3;
  let activation=0;
  for(const [start,end] of intervals){
    let a=0;
    if(frame>=start && frame<=end) a=1;
    else if(frame<start && frame>=start-attack) a=(frame-(start-attack))/attack;
    else if(frame>end && frame<end+release) a=1-(frame-end)/release;
    activation=Math.max(activation,a);
  }
  return 1+(dbGain(depthDb)-1)*activation;
}
export function mixScene(timeline, buffers) {
  const n=timeline.durationFrames,sr=timeline.sampleRate;
  const channels=[new Float32Array(n),new Float32Array(n)];
  const intervals=timeline.events.filter(e=>e.kind==='speech').map(e=>[e.startFrame,e.endFrame]);
  function add(asset,start,gainDb,pan=0,loopFrames=null,duckDb=0,fadeFrames=0){
    const audio=buffers[asset];
    if(!audio || audio.sampleRate!==sr) fail(`Missing or unresampled asset ${asset}`);
    const mono=audio.channels.length===1,sourceFrames=audio.channels[0].length;
    if(!mono && pan!==0) fail('Stereo external assets require pan=0; pre-pan them externally');
    const left=mono?Math.cos((clamp(pan,-1,1)+1)*Math.PI/4):1;
    const right=mono?Math.sin((clamp(pan,-1,1)+1)*Math.PI/4):1;
    const count=loopFrames??sourceFrames,base=dbGain(gainDb);
    for(let i=0;i<count && start+i<n;i++){
      if(start+i<0) continue;
      const p=i%sourceFrames;
      const fade=fadeFrames?Math.min(1,i/fadeFrames,(count-1-i)/fadeFrames):1;
      const gain=base*fade*(duckDb?duckAt(start+i,intervals,sr,duckDb):1);
      channels[0][start+i]+=audio.channels[0][p]*gain*left;
      channels[1][start+i]+=audio.channels[mono?0:1][p]*gain*right;
    }
  }
  for(const e of timeline.events) if(e.kind!=='pause') add(e.asset,e.startFrame,e.gainDb,e.pan);
  for(const b of timeline.beds) add(b.asset,0,b.gainDb,0,n,b.duckDb,Math.round(b.fadeSeconds*sr));
  let peak=0;for(const c of channels)for(const v of c)peak=Math.max(peak,Math.abs(v));
  const ceiling=dbGain(timeline.ceilingDbFS??-1),masterGain=Math.min(1,peak?ceiling/peak:1);
  if(masterGain!==1)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=masterGain;
  return {audio:{sampleRate:sr,channels},masterGain,statistics:statistics({sampleRate:sr,channels})};
}
