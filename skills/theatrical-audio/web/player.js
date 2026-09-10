/* TheatricalAudioPlayer: no imports, server, framework or timing-by-setTimeout.
 * Audio is scheduled on AudioContext; visual callbacks use that same clock.
 */
(function(global){
  'use strict';
  const gain=db=>Math.pow(10,db/20),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class TheatricalAudioPlayer {
    constructor(timeline,loadBytes,onFrame=()=>{}){
      if(timeline.format!=='theatrical-timeline/1')throw new Error('Unsupported timeline format');
      this.timeline=timeline;this.loadBytes=loadBytes;this.onFrame=onFrame;
      this.context=null;this.buffers=new Map();this.nodes=[];this.playing=false;this.position=0;this.generation=0;this.raf=0;
      this.volume=1;this.epoch=0;this.loading=null;this.destroyed=false;
    }
    async prepare(){
      if(this.destroyed)throw new Error('Player has been destroyed');
      if(this.loading)return this.loading;
      const C=global.AudioContext||global.webkitAudioContext;
      if(!C)throw new Error('Web Audio is not supported in this browser');
      if(!this.context){this.context=new C();this.master=this.context.createGain();this.master.connect(this.context.destination);}
      this.loading=(async()=>{
        const needed=new Set([...this.timeline.events.filter(e=>e.kind!=='pause').map(e=>e.asset),...this.timeline.beds.map(b=>b.asset)]);
        for(const id of needed){
          const a=this.timeline.assets[id];if(!a)throw new Error('Missing asset '+id);
          const bytes=await this.loadBytes(a.file,id);
          const view=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
          const buffer=await this.context.decodeAudioData(view.slice(0));
          if(Math.abs(buffer.duration-a.durationSeconds)>2/this.timeline.sampleRate)throw new Error('Decoded duration does not match '+id);
          this.buffers.set(id,buffer);
        }
      })();
      try{await this.loading;}catch(e){this.loading=null;throw e;}
    }
    audibleContextTime(){
      if(!this.context)return 0;
      if(typeof this.context.getOutputTimestamp==='function'){
        const stamp=this.context.getOutputTimestamp();
        if(stamp.contextTime>0 && stamp.performanceTime>0)return Math.min(this.context.currentTime,stamp.contextTime+(performance.now()-stamp.performanceTime)/1000);
      }
      return this.context.currentTime;
    }
    currentTime(){return this.playing?clamp(this.audibleContextTime()-this.epoch,0,this.timeline.durationSeconds):this.position;}
    async play(){
      if(this.playing)return;
      const token=++this.generation;
      await this.prepare();await this.context.resume();
      if(token!==this.generation||this.destroyed)return;
      if(this.position>=this.timeline.durationSeconds)this.position=0;
      this.epoch=this.context.currentTime+.08-this.position;
      this.playing=true;this.master.gain.value=(this.timeline.masterGain??1)*this.volume;
      this.schedule(this.position);this.tick();
    }
    setVolume(value){this.volume=clamp(value,0,1);if(this.master)this.master.gain.setValueAtTime((this.timeline.masterGain??1)*this.volume,this.context.currentTime);}
    schedule(position){
      const sr=this.timeline.sampleRate,now=this.context.currentTime;
      const add=(id,startSec,endSec,db,pan,loop,curve)=>{
        if(endSec<=position)return;
        const source=this.context.createBufferSource();source.buffer=this.buffers.get(id);source.loop=loop;
        const level=this.context.createGain();level.gain.value=gain(db);
        const panner=this.context.createStereoPanner();panner.pan.value=pan;
        source.connect(level);level.connect(panner);panner.connect(this.master);
        const begin=Math.max(position,startSec),when=Math.max(now,this.epoch+begin);
        const offset=loop?(begin-startSec)%source.buffer.duration:begin-startSec;
        if(curve){
          const duration=endSec-begin,points=Math.max(2,Math.ceil(duration*100)+1),values=new Float32Array(points);
          for(let i=0;i<points;i++)values[i]=gain(db)*curve(begin+i/(points-1)*duration);
          level.gain.setValueCurveAtTime(values,when,duration);
        }
        source.start(when,offset,endSec-begin);
        this.nodes.push(source,level,panner);
      };
      for(const e of this.timeline.events)if(e.kind!=='pause')add(e.asset,e.startFrame/sr,(e.audibleEndFrame??e.endFrame)/sr,e.gainDb??0,e.pan??0,false,null);
      const intervals=this.timeline.events.filter(e=>e.kind==='speech').map(e=>[e.startFrame/sr,e.endFrame/sr]);
      for(const b of this.timeline.beds){
        const curve=time=>{
          let activation=0;
          for(const [start,end] of intervals){let a=0;if(time>=start&&time<=end)a=1;else if(time<start&&time>=start-.06)a=(time-start+.06)/.06;else if(time>end&&time<end+.3)a=1-(time-end)/.3;activation=Math.max(activation,a);}
          const fade=b.fadeSeconds?Math.min(1,time/b.fadeSeconds,(this.timeline.durationSeconds-time)/b.fadeSeconds):1;
          return clamp(fade,0,1)*(1+(gain(b.duckDb??0)-1)*activation);
        };
        add(b.asset,0,this.timeline.durationSeconds,b.gainDb,0,true,curve);
      }
    }
    stopNodes(){for(const node of this.nodes){try{if(node.stop)node.stop();node.disconnect();}catch{}}this.nodes=[];}
    pause(){++this.generation;this.position=this.currentTime();this.playing=false;this.stopNodes();cancelAnimationFrame(this.raf);this.emit();}
    async seek(seconds){const wasPlaying=this.playing;this.pause();this.position=clamp(seconds,0,this.timeline.durationSeconds);this.emit();if(wasPlaying)await this.play();}
    emit(){
      const seconds=this.currentTime(),frame=Math.round(seconds*this.timeline.sampleRate);
      const active=this.timeline.events.filter(e=>e.kind==='speech'&&frame>=e.startFrame&&frame<e.endFrame).map(e=>{
        const hop=e.envelope?.hopFrames,values=e.envelope?.values;
        return {...e,mouthOpen:values?.[Math.floor((frame-e.startFrame)/hop)]??0};
      });
      const visuals=this.timeline.visuals.map(v=>({...v,progress:clamp((frame-v.startFrame)/Math.max(1,v.endFrame-v.startFrame),0,1),hasStarted:frame>=v.startFrame,isActive:frame>=v.startFrame&&frame<v.endFrame}));
      this.onFrame({seconds,frame,duration:this.timeline.durationSeconds,playing:this.playing,active,visuals});
    }
    tick(){
      this.emit();
      if(this.playing&&this.currentTime()>=this.timeline.durationSeconds){this.position=this.timeline.durationSeconds;this.playing=false;this.stopNodes();this.emit();return;}
      if(this.playing)this.raf=requestAnimationFrame(()=>this.tick());
    }
    async destroy(){this.pause();this.destroyed=true;if(this.context)await this.context.close();this.buffers.clear();}
  }
  global.TheatricalAudioPlayer=TheatricalAudioPlayer;
})(globalThis);
