/** Original procedural underscore. No sampled recordings or borrowed melodies.
 * These are restrained synthesizer cues, not concert-quality classical performances. */
export const MOODS={
 curiosity:{bpm:84,root:60,scale:[0,2,5,7,9],path:[0,2,1,3,2,4,1,2]},
 wonder:{bpm:68,root:62,scale:[0,2,4,7,9],path:[0,2,4,3,1,4,2,3]},
 calm:{bpm:64,root:57,scale:[0,2,4,7,9],path:[2,1,0,1,3,2,1,0]},
 tension:{bpm:82,root:50,scale:[0,2,3,7,8],path:[0,1,0,2,1,0,3,1]},
 melancholy:{bpm:62,root:57,scale:[0,2,3,7,10],path:[4,3,2,1,2,0,1,0]},
 hope:{bpm:76,root:60,scale:[0,2,4,7,9],path:[0,1,2,1,3,2,4,3]},
 discovery:{bpm:88,root:62,scale:[0,2,4,7,11],path:[0,2,1,3,2,4,3,0]},
 resolve:{bpm:74,root:55,scale:[0,2,4,7,9],path:[0,0,2,1,3,2,1,0]},
 warmth:{bpm:70,root:60,scale:[0,4,5,7,9],path:[0,1,2,1,0,3,1,0]},
 intrigue:{bpm:78,root:53,scale:[0,2,3,7,10],path:[0,2,1,0,4,2,3,1]},
 clarity:{bpm:80,root:60,scale:[0,2,4,7,9],path:[0,1,2,3,2,1,0,0]},
 playful:{bpm:96,root:64,scale:[0,2,4,7,9],path:[0,3,1,4,2,0,3,1]}
};
export function compose(mood='curiosity',seconds=16){
 const m=MOODS[mood];if(!m)throw new Error('Unknown mood '+mood);if(!Number.isFinite(seconds)||seconds<4||seconds>120)throw new Error('Cue duration must be 4..120 seconds.');
 const events=[],step=60/m.bpm*2;
 for(let t=0,i=0;t<seconds-.8;t+=step,i++){
  events.push({time:t,duration:Math.min(step*1.4,seconds-t),midi:m.root+m.scale[m.path[i%m.path.length]]+12,velocity:.24,timbre:'felt'});
  if(i%2===0){events.push({time:t,duration:Math.min(step*2,seconds-t),midi:m.root-12+(i%4===2?7:0),velocity:.19,timbre:'pad'});events.push({time:t+.06,duration:Math.min(step*1.9,seconds-t-.06),midi:m.root+7,velocity:.10,timbre:'pad'});}
 }
 return {format:'SHF-Score',version:'1',id:'original-'+mood,title:'SHF · '+mood,mood,original:true,composer:'Procedural SHF score generator',license:'MIT',seed:'deterministic-1',bpm:m.bpm,durationSeconds:seconds,maxPolyphony:6,events};
}
export function renderWav(score,sampleRate=16000){
 if(!Number.isFinite(score.durationSeconds)||score.durationSeconds<=0||score.durationSeconds>120)throw new Error('Invalid score duration.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000)throw new Error('Sample rate must be 8000..48000 Hz.');
 if(!Array.isArray(score.events)||score.events.length>300)throw new Error('Too many music events.');
 const samples=new Float32Array(Math.ceil(sampleRate*score.durationSeconds));
 for(const e of score.events){
  if(!Number.isFinite(e.time)||!Number.isFinite(e.duration)||!Number.isFinite(e.midi)||e.midi<28||e.midi>100||!Number.isFinite(e.velocity)||e.velocity<0||e.velocity>.6||e.time<0||e.duration<=0||e.time+e.duration>score.durationSeconds+.001||!['pad','felt'].includes(e.timbre))throw new Error('Invalid note event.');
  const f=440*2**((e.midi-69)/12),start=Math.floor(e.time*sampleRate),end=Math.min(samples.length,Math.ceil((e.time+e.duration)*sampleRate));
  for(let i=Math.max(0,start);i<end;i++){const t=(i-start)/sampleRate,release=Math.min(1,(end-i)/sampleRate/.8),attack=Math.min(1,t/(e.timbre==='pad'?.35:.035));
   const env=attack*release*(e.timbre==='pad'?.65:Math.exp(-t/1.9));const x=2*Math.PI*f*t;
   samples[i]+=(Math.sin(x)+.15*Math.sin(x*2)*Math.exp(-t*3)+.04*Math.sin(x*3))*env*e.velocity;
  }
 }
 let peak=0;
 for(let i=0;i<samples.length;i++){const fade=Math.min(1,i/sampleRate/1.2,(samples.length-1-i)/sampleRate/1.5);samples[i]*=fade;peak=Math.max(peak,Math.abs(samples[i]));}
 const factor=peak>0?.25/peak:0,out=Buffer.alloc(44+samples.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);
 let sq=0;for(let i=0;i<samples.length;i++){const v=samples[i]*factor;sq+=v*v;out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2);}
 return {bytes:out,metrics:{sampleRate,durationSeconds:samples.length/sampleRate,peak:.25,rms:Math.sqrt(sq/samples.length),source:'original-synthesized-demo'}};
}
