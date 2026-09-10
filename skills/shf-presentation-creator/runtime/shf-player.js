/* SHF 0.4 — embeddable cinematic player. MIT. No external resources or dependencies.
 * The AudioContext clock controls visuals; mute changes only the master gain.
 * Every scene is prepared and its voice sources scheduled before time may advance.
 */
(function(root){
'use strict';
const C=root.SHFCore,themes=root.SHFThemes,NS='http://www.w3.org/2000/svg';
const icons={
 play:'M8 5L19 12L8 19Z',pause:'M8 5V19M16 5V19',prev:'M5 5V19M19 6L8 12L19 18Z',next:'M19 5V19M5 6L16 12L5 18Z',
 volume:'M3 9H7L12 5V19L7 15H3ZM16 8Q21 12 16 16M18 4Q26 12 18 20',mute:'M3 9H7L12 5V19L7 15H3ZM17 9L22 15M22 9L17 15',
 captions:'M3 5H21V19H3ZM10 9H6V15H10M18 9H14V15H18',text:'M4 5H20M4 10H20M4 15H16M4 20H13',
 chapters:'M4 5H7V8H4ZM11 6H21M4 11H7V14H4ZM11 12H21M4 17H7V20H4ZM11 18H21',
 music:'M9 17V5L20 3V15M9 8L20 6M9 17C9 21 3 22 3 18C3 15 9 14 9 17M20 15C20 19 14 20 14 16C14 13 20 12 20 15',
 settings:'M9 3H15L16 6L19 7L21 10V14L18 15L17 18L14 21H10L9 18L6 17L3 14V10L6 9L7 6ZM12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8',
 full:'M3 9V3H9M15 3H21V9M21 15V21H15M9 21H3V15',close:'M5 5L19 19M19 5L5 19',replay:'M4 9V3M4 9H10M4 9Q8 0 17 6Q27 16 14 21Q5 23 3 15'
};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.play}" fill="${name==='play'?'currentColor':'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const btn=(id,name,label)=>`<button id="${id}" type="button" aria-label="${label}" title="${label}">${icon(name)}</button>`;
const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const css=`
:host{container-type:inline-size;display:block;position:relative;width:100%;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;color-scheme:dark;--shf-accent:#efc878;--shf-radius:18px;--shf-caption-size:clamp(14px,1.9vw,23px)}
*{box-sizing:border-box}button,input,select{font:inherit}button{color:inherit;cursor:pointer;border:0;background:transparent;display:inline-grid;place-items:center;flex-shrink:0;width:40px;height:40px;padding:9px;border-radius:9px}button:hover{background:#ffffff1c}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--shf-accent);outline-offset:2px}button[aria-pressed=true]{color:var(--shf-accent)}button svg{width:22px;height:22px;display:block;pointer-events:none}select{color:white;background:#1b2632;border:1px solid #ffffff24;border-radius:6px;padding:7px}input{accent-color:var(--shf-accent);cursor:pointer}
.shell{position:relative;overflow:hidden;border-radius:var(--shf-radius);background:#070b12;box-shadow:0 20px 65px #07132230;border:1px solid #ffffff18}.stage{position:relative;aspect-ratio:1200/760;overflow:hidden;isolation:isolate}.art{position:absolute;inset:0}.art>svg{display:block;width:100%;height:100%}.heading{position:absolute;top:0;left:0;right:0;padding:15px 19px 42px;background:linear-gradient(#060c1482,transparent);pointer-events:none;opacity:1;transition:opacity .2s}.heading .brand{font-size:9px;letter-spacing:.25em;opacity:.75;margin-right:10px}.heading strong{font-size:13px;font-weight:500;text-shadow:0 1px 3px #000}.heading .count{float:right;font:11px ui-monospace,monospace;opacity:.8}.centerplay{position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50%;background:#06122070;backdrop-filter:blur(6px);border:1px solid #ffffff65;box-shadow:0 4px 25px #0002}.centerplay svg{width:30px;height:30px}.centerplay[hidden]{display:none}
.captionbox{position:absolute;left:5%;right:5%;bottom:94px;pointer-events:none;display:flex;justify-content:center;text-align:center}.caption{font-size:var(--shf-caption-size);line-height:1.45;font-weight:500;color:#fff;max-width:100%;overflow-wrap:break-word;text-shadow:0 1px 2px #000,0 2px 8px #0006;white-space:pre-line;padding:5px 12px;border-radius:5px;background:#080c13bd;box-decoration-break:clone}.caption:empty{display:none}.captionbox[hidden]{display:none}
.transport{position:absolute;bottom:0;left:0;right:0;padding:21px 12px 8px;background:linear-gradient(transparent,#060b13cf 30%,#060b13f2);transition:opacity .2s}.progress{display:block;width:calc(100% - 8px);margin:0 4px 4px;height:18px}.controls{display:flex;align-items:center;gap:2px;min-height:40px}.clock{font:11px ui-monospace,monospace;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 7px;color:#d5e0e7}.volume{width:67px;min-width:30px;margin:0 6px 0 0;height:27px}.spacer{flex:1}.muted-label{position:absolute;top:49px;left:19px;font-size:10px;background:#060b1377;padding:2px 6px;border-radius:3px}.muted-label:empty{display:none}.notice{position:absolute;left:8%;right:8%;top:27%;text-align:center;color:#fff;background:#182333ed;padding:12px 18px;border-radius:10px;box-shadow:0 8px 40px #0003}.notice:empty{display:none}
.drawer{border-top:1px solid #ffffff20;padding:17px 20px 20px;background:#101822;max-height:340px;overflow:auto;scrollbar-width:thin}.drawer[hidden],.panel[hidden]{display:none}.drawerheader{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.drawerheader h3{margin:0;font-size:14px;font-weight:600}.drawer p{color:#ced9df;font-size:14px;line-height:1.7;margin:8px 0 18px}.drawer h4{font-size:13px;color:#e9c779;margin:14px 0 0}.chaptergrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.chaptergrid button{height:auto;width:auto;min-height:48px;padding:9px 11px;display:block;text-align:left;border:1px solid #ffffff1e;background:#ffffff04}.chaptergrid button.current{border-color:#efc87899;background:#efc87810}.chaptergrid small{font:10px ui-monospace,monospace;display:block;color:#a6b7c4}.chaptergrid span{font-size:12px}.settingsgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px}.settingsgrid label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#b7c8d4}.settingsgrid input{width:100%}.settingsgrid .check{display:flex;flex-direction:row;align-items:center}.settingsgrid .check input{width:auto}.hint{font-size:11px!important;color:#95a7b6!important;margin-bottom:0!important}
:host(.cinema){position:fixed;inset:0;z-index:2147483000;background:#05090f;display:grid;place-items:center}:host(.cinema) .shell{width:min(100vw,calc(100vh * 1200 / 760));border-radius:0}:host(:fullscreen){display:grid;place-items:center;background:#05090f}:host(:fullscreen) .shell{width:min(100vw,calc(100vh * 1200 / 760));border-radius:0}.playing.idle .heading,.playing.idle .transport{opacity:0;pointer-events:none}.playing.idle .captionbox{bottom:26px}.captionbox{transition:bottom .2s}
@media(max-width:540px){:host{--shf-radius:12px;--shf-caption-size:14px}.heading{padding:10px 11px 30px}.heading strong{font-size:11px}.heading .brand{font-size:8px}.heading .count{font-size:9px}.controls{gap:0}button{width:32px;height:36px;padding:6px}.controls button svg{width:19px;height:19px}.clock{font-size:10px;margin:0;position:absolute;top:10px;right:10px}.progress{width:calc(100% - 82px);margin-top:0;margin-bottom:5px}.volume{width:40px;margin-right:2px}.transport{padding:13px 6px 4px}.captionbox{bottom:79px;left:3%;right:3%}.caption{padding:4px 7px;line-height:1.4}.centerplay{width:50px;height:50px}.drawer{padding:12px}.chaptergrid{grid-template-columns:repeat(2,minmax(0,1fr))}.brand{display:none}.muted-label{top:31px;left:11px}}
@media(max-width:390px){.volume{width:31px}.clock{font-size:8px}.controls button{width:27px;padding:5px}.controls button svg{width:18px;height:18px}}
@media(max-width:340px){#prev{display:none}.clock{font-size:9px}}
@container(max-width:540px){.shell{--shf-radius:12px;--shf-caption-size:14px}.heading{padding:10px 11px 30px}.heading strong{font-size:11px}.heading .brand{font-size:8px}.heading .count{font-size:9px}.controls{gap:0}button{width:32px;height:36px;padding:6px}.controls button svg{width:19px;height:19px}.clock{font-size:10px;margin:0;position:absolute;top:10px;right:10px}.progress{width:calc(100% - 82px);margin-top:0;margin-bottom:5px}.volume{width:40px;margin-right:2px}.transport{padding:13px 6px 4px}.captionbox{bottom:79px;left:3%;right:3%}.caption{padding:4px 7px;line-height:1.4}.centerplay{width:50px;height:50px}.drawer{padding:12px}.chaptergrid{grid-template-columns:repeat(2,minmax(0,1fr))}.brand{display:none}.muted-label{top:31px;left:11px}}
@container(max-width:390px){.volume{width:31px}.clock{font-size:8px}.controls button{width:27px;padding:5px}.controls button svg{width:18px;height:18px}}
@container(max-width:340px){#prev{display:none}.clock{font-size:9px}}
/* Narrow presentations keep the original artwork ratio and reserve an independent caption rail. */
@media(max-width:540px){.stage{aspect-ratio:auto;height:auto;padding-bottom:160px}.art{position:relative;inset:auto;width:100%;aspect-ratio:1200/760}.captionbox{bottom:82px;min-height:58px;align-items:center}.playing.idle .captionbox{bottom:50px}.centerplay{top:25%}}
@container(max-width:540px){.stage{aspect-ratio:auto;height:auto;padding-bottom:160px}.art{position:relative;inset:auto;width:100%;aspect-ratio:1200/760}.captionbox{bottom:82px;min-height:58px;align-items:center}.playing.idle .captionbox{bottom:50px}.centerplay{top:calc(100cqw * 760 / 2400)}.heading{background:linear-gradient(#060c1450,transparent)}}
@container(max-width:340px){.stage{padding-bottom:212px}.controls{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}.controls button{width:100%;height:40px}.controls .spacer{display:none}.volume{width:80%;max-width:55px}.captionbox{bottom:127px}.playing.idle .captionbox{bottom:95px}}
.theme-controls{display:flex;align-items:center;gap:2px;padding:0 4px}.theme-controls button{width:28px;height:36px;padding:4px;border-radius:6px}.theme-controls span{display:block;width:18px;height:18px;border-radius:50%;border:1px solid #ffffff80;background:conic-gradient(#e7b846,#ee876d,#559bad,#e7b846)}.theme-controls [data-player-theme=paper] span{background:#fff}.theme-controls [data-player-theme=night] span{background:#0c1824}.theme-controls button[aria-pressed=true]{outline:1px solid var(--shf-accent);outline-offset:-2px;background:#ffffff16}
@container(max-width:720px){.stage{aspect-ratio:auto;height:auto;padding-bottom:260px}.art{position:relative;inset:auto;width:100%;aspect-ratio:1200/760}.captionbox{bottom:127px;min-height:105px;align-items:center}.playing.idle .captionbox{bottom:95px}.centerplay{top:calc(100cqw * 760 / 2400)}.controls{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0}.controls button{width:100%;height:38px;padding:6px}.controls .spacer{display:none}.controls #prev{display:inline-grid}.volume{width:90%;max-width:55px;min-width:0;margin:0}.theme-controls{grid-column:span 2;padding:0 2px;gap:0}.controls .theme-controls button{flex:1;width:auto;min-width:0;padding:2px}.theme-controls span{width:16px;height:16px}.clock{position:absolute;top:10px;right:10px;margin:0;font-size:10px}.progress{width:calc(100% - 82px);margin:0 4px 5px}.transport{padding:13px 6px 4px}}
/* Sentence cards grow with their text; normal flow prevents art/control overlap. */
@container(max-width:720px){.stage{display:flex;flex-direction:column;padding-bottom:0;aspect-ratio:auto;height:auto}.art{position:relative;inset:auto;flex:none;width:100%;aspect-ratio:1200/760}.captionbox{position:relative;inset:auto;width:100%;min-height:115px;padding:16px 10px;flex:none;align-items:center}.caption{font-size:14px;line-height:1.45}.transport{position:relative;inset:auto;flex:none;width:100%;background:#101822;padding:13px 6px 4px}.playing.idle .captionbox{bottom:auto}.playing.idle .transport{opacity:1;pointer-events:auto}.centerplay{top:calc(100cqw * 760 / 2400)}}
/* One deliberate scene heading, separate from artwork and captions. */
.playing.idle .heading{opacity:1}.shell{box-shadow:none;border:0}.heading{background:none;color:var(--shf-ink,#233844);padding:22px 28px;display:flex;align-items:baseline;gap:16px}.heading strong{font-family:"SHF Display",sans-serif;font-size:clamp(28px,3.8cqw,46px);font-weight:700;text-transform:none;letter-spacing:-.025em;text-shadow:none;line-height:1.1;max-width:92%;text-wrap:balance}.heading .count{margin-left:auto;float:none;font-size:10px;opacity:.55}.muted-label{top:auto;bottom:90px;left:18px}.caption{font-family:"SHF Text",sans-serif;font-weight:400;letter-spacing:0;line-height:1.45;text-shadow:none}.centerplay{box-shadow:none;backdrop-filter:none}
@container(max-width:720px){.heading{position:relative;order:-1;padding:18px 16px 8px}.heading strong{font-size:clamp(21px,4.9cqw,30px);letter-spacing:-.02em}.heading .count{font-size:9px}.muted-label{display:none}}
/* Host themes colour the complete transport and drawers, including narrow/fullscreen modes. */
.transport{background:var(--shf-control-bg,#101822);color:var(--shf-control-ink,#fff)}
.controls,.drawer,.notice,.muted-label,.centerplay{color:var(--shf-control-ink,#fff)}
.drawer,.notice,.muted-label,.centerplay{background:var(--shf-control-bg,#101822);border-color:var(--shf-control-line,#ffffff20)}
.clock,.drawer p,.chaptergrid small,.settingsgrid label{color:var(--shf-control-muted,#b7c8d4)}
.hint{color:var(--shf-control-muted,#95a7b6)!important}
.drawer h4{color:var(--shf-accent)}
button:hover,.theme-controls button[aria-pressed=true]{background:var(--shf-control-hover,#ffffff1c)}
select{color:var(--shf-control-ink,#fff);background:var(--shf-control-bg,#101822);border-color:var(--shf-control-line,#ffffff24)}
.chaptergrid button{border-color:var(--shf-control-line,#ffffff1e);background:var(--shf-control-hover,#ffffff04)}
.chaptergrid button.current{border-color:var(--shf-accent);background:color-mix(in srgb,var(--shf-accent) 12%,transparent)}
.theme-controls span{border-color:var(--shf-control-line,#ffffff80)}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;

/** Bounded decoded-audio cache. Loading does not advance the media clock. */
class AudioBus{
 constructor(owner){this.owner=owner;this.cache=new Map();this.cacheBytes=0;this.sources=[];this.musicSource=null;this.startedCount=0;}
 async unlock(){
  if(!this.ctx){const AC=root.AudioContext||root.webkitAudioContext;if(!AC)throw new Error('Web Audio is unavailable.');
   this.ctx=new AC();this.master=this.ctx.createGain();this.voice=this.ctx.createGain();this.music=this.ctx.createGain();
   this.voice.connect(this.master);this.music.connect(this.master);this.master.connect(this.ctx.destination);this.levels();
  }
  if(this.ctx.state!=='running')await this.ctx.resume();
  if(this.ctx.state!=='running')throw new Error('Press Play to enable audio.');
 }
 levels(active=false){if(!this.ctx)return;const t=this.ctx.currentTime,o=this.owner;
  const gain=(node,val)=>{node.gain.cancelScheduledValues(t);node.gain.setTargetAtTime(val,t,.025);};
  gain(this.master,o.muted?0:o.volume);gain(this.voice,1);
  const base=o.sceneMusic?.gain??o.film?.soundtrack?.gain??.12;
  gain(this.music,o.musicEnabled?Math.min(.3,base)*o.musicVolume*(active?.25:1):0);
 }
 async decode(id){
  if(this.cache.has(id))return this.cache.get(id);
  const film=this.owner.film,a=film.assets?.[id];if(!a?.data)throw new Error('Missing audio file: '+id);
  const b=await this.ctx.decodeAudioData(C.from64(a.data).buffer);
  if(this.owner.film!==film)throw new Error('Film changed during audio decoding.');
  const bytes=b.length*b.numberOfChannels*4;
  while(this.cacheBytes+bytes>32*1024*1024&&this.cache.size){const key=this.cache.keys().next().value,old=this.cache.get(key);this.cacheBytes-=old.length*old.numberOfChannels*4;this.cache.delete(key);}
  this.cache.set(id,b);this.cacheBytes+=bytes;return b;
 }
 clips(scene){return scene.audioClips|| (scene.audio?.assetId?[{...scene.audio,startMs:scene.audio.offsetMs||0,durationMs:scene.audio.durationMs||scene.durationMs}]:[]);}
 async prepare(scene){
  const clips=[];
  for(const clip of this.clips(scene)){
   const buffer=await this.decode(clip.assetId);
   if(clip.startMs+buffer.duration*1000>scene.durationMs+220)throw new Error('Narration exceeds scene '+scene.id+'. Recalculate the timeline from the measured audio.');
   clips.push({...clip,buffer});
  }
  const choice=scene.music===null?null:scene.music||this.owner.film.soundtrack;
  let music=null;
  if(choice?.assetId)try{music={...choice,buffer:await this.decode(choice.assetId)};}catch(e){this.owner.notice('Music cannot play: '+e.message);}
  return {clips,music};
 }
 schedule(prepared,localMs,globalMs,when,rate){
  this.stop();this.owner.sceneMusic=prepared.music;
  for(const clip of prepared.clips){
   const end=clip.startMs+clip.buffer.duration*1000;if(localMs>=end)continue;
   const s=this.ctx.createBufferSource();s.buffer=clip.buffer;s.playbackRate.value=rate;s.connect(this.voice);
   const delay=Math.max(0,clip.startMs-localMs)/1000/rate,offset=Math.max(0,localMs-clip.startMs)/1000;
   s.start(when+delay,offset);this.startedCount++;this.sources.push(s);
  }
  if(prepared.music){const m=prepared.music,b=m.buffer,s=this.ctx.createBufferSource();s.buffer=b;s.loop=m.loop!==false;s.playbackRate.value=rate;s.connect(this.music);
   const offset=m.offsetMs?m.offsetMs/1000:0;s.start(when,((globalMs/1000)+offset)%b.duration);this.musicSource=s;
  }
  this.owner.lastDuck=null;this.levels(false);
 }
 stop(){for(const s of [...this.sources,this.musicSource].filter(Boolean)){try{s.stop();}catch{}try{s.disconnect();}catch{}}this.sources=[];this.musicSource=null;}
 clear(){this.stop();this.cache.clear();this.cacheBytes=0;}
 async destroy(){this.clear();if(this.ctx){const c=this.ctx;this.ctx=null;await c.close();}}
}
class SHFPlayer extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this.film=null;this.time=0;this.rate=1;this.playing=false;this.state='empty';this.theme='color';this.palette=null;this.volume=.85;this.muted=false;this.musicVolume=.7;this.musicEnabled=false;this.captions=true;this.reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;this.sceneIndex=-1;this.token=0;this.frame=0;this.audio=new AudioBus(this);this.lastInteraction=performance.now();
 this.shadowRoot.innerHTML=`<style>${css}</style><div class="shell" id="shell"><div class="stage" id="stage"><div class="art" id="art"></div><div class="heading"><strong id="sceneTitle">SHF</strong><span class="count" id="count"></span></div><span class="muted-label" id="audioLabel"></span>${btn('centerPlay','play','Play film')}<div class="captionbox" id="captionbox"><span class="caption" id="caption"></span></div><div class="notice" id="notice" role="status"></div><div class="transport" id="transport"><input id="seek" class="progress" type="range" min="0" max="1" value="0" step="1" aria-label="Film position"><div class="controls">${btn('play','play','Play / pause (Space)')}${btn('prev','prev','Previous scene')}${btn('next','next','Next scene')}${btn('mute','volume','Mute (M)')}<input id="volume" class="volume" type="range" min="0" max="1" step="0.01" value="0.85" aria-label="Volume"><span id="clock" class="clock">0:00 / 0:00</span><span class="spacer"></span><div class="theme-controls" role="group" aria-label="Visual theme"><button type="button" data-player-theme="color" aria-label="Color theme" title="Color theme" aria-pressed="true"><span></span></button><button type="button" data-player-theme="paper" aria-label="Light theme" title="Light theme" aria-pressed="false"><span></span></button><button type="button" data-player-theme="night" aria-label="Dark theme" title="Dark theme" aria-pressed="false"><span></span></button></div>${btn('cc','captions','Captions (C)')}${btn('music','music','Background music')}${btn('transcriptBtn','text','Transcript')}${btn('chaptersBtn','chapters','Scenes')}${btn('settingsBtn','settings','Settings')}${btn('full','full','Fullscreen (F)')}</div></div></div><section id="drawer" class="drawer" hidden><div class="drawerheader"><h3 id="drawerTitle"></h3>${btn('closeDrawer','close','Close panel')}</div><div id="transcript" class="panel" hidden></div><div id="chapters" class="chaptergrid panel" hidden></div><div id="settings" class="panel" hidden><div class="settingsgrid"><label>Speed<select id="rate"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label>Music level<input id="musicVolume" type="range" min="0" max="1" step="0.01" value="0.7"></label><label class="check"><input id="reduced" type="checkbox"> Reduced motion</label></div><p class="hint">Music ducks automatically under narration. Muting changes volume while speech and animation stay synchronized.</p></div></section></div>`;
 this.$=id=>this.shadowRoot.getElementById(id);this.$('centerPlay').className='centerplay';this.$('cc').setAttribute('aria-pressed','true');this.$('music').setAttribute('aria-pressed','false');this.$('reduced').checked=this.reduced;
 const bind=(id,fn)=>this.$(id).addEventListener('click',fn);
 bind('play',()=>this.toggle());bind('centerPlay',()=>this.toggle());bind('prev',()=>this.jump(Math.max(0,this.sceneIndex-1)));bind('next',()=>this.jump(this.sceneIndex+1));bind('mute',()=>this.setMuted(!this.muted));bind('cc',()=>this.setCaptions(!this.captions));bind('music',()=>this.setMusic(!this.musicEnabled));bind('full',()=>this.fullscreen());
 for(const [id,panel,title] of [['transcriptBtn','transcript','Transcript'],['chaptersBtn','chapters','Scenes'],['settingsBtn','settings','Settings']])bind(id,()=>this.openPanel(panel,title));bind('closeDrawer',()=>this.closePanel());
 this.$('volume').addEventListener('input',e=>this.setVolume(Number(e.target.value)));this.$('musicVolume').addEventListener('input',e=>{this.musicVolume=Number(e.target.value);this.audio.levels(this.voiceActive);});this.shadowRoot.querySelectorAll('[data-player-theme]').forEach(b=>b.addEventListener('click',()=>this.setTheme(b.dataset.playerTheme)));this.$('rate').addEventListener('change',e=>this.setRate(Number(e.target.value)));this.$('reduced').addEventListener('change',e=>this.setReducedMotion(e.target.checked));
 this.$('seek').addEventListener('input',e=>{if(this.scrubbing===undefined){this.scrubbing=this.playing||this.state==='loading';this.pause();}this.seek(Number(e.target.value),false);});this.$('seek').addEventListener('change',()=>{const resume=this.scrubbing;this.scrubbing=undefined;if(resume)this.play();});
 this.shadowRoot.addEventListener('pointermove',()=>this.wake());this.shadowRoot.addEventListener('pointerdown',()=>this.wake());this.shadowRoot.addEventListener('focusin',()=>this.wake());this.$('art').addEventListener('click',()=>this.toggle());
 this.addEventListener('keydown',e=>{const target=e.composedPath()[0];if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(target.tagName))return;const k=e.key.toLowerCase();if(k===' '){e.preventDefault();this.toggle();}else if(k==='arrowright'){e.preventDefault();this.seek(this.currentTimeMs+5000);}else if(k==='arrowleft'){e.preventDefault();this.seek(this.currentTimeMs-5000);}else if(k==='m')this.setMuted(!this.muted);else if(k==='c')this.setCaptions(!this.captions);else if(k==='f')this.fullscreen();});
 this.onVisibility=()=>{if(document.hidden&&this.playing)this.pause();};
 }
 connectedCallback(){if(!this.hasAttribute('tabindex'))this.tabIndex=0;document.addEventListener('visibilitychange',this.onVisibility);}
 disconnectedCallback(){this.pause();this.audio.destroy().catch(()=>{});document.removeEventListener('visibilitychange',this.onVisibility);}
 get durationMs(){return this.film?.scenes.reduce((t,s)=>t+s.durationMs,0)||0;}
 get currentTimeMs(){
  if(!this.playing)return this.time;
  const now=this.clock==='audio'?this.audio.ctx?.currentTime:performance.now()/1000;
  return C.clamp(this.anchorTime+Math.max(0,now-this.anchorNow)*1000*this.rate,this.anchorTime,Math.min(this.boundaryMs,this.durationMs));
 }
 snapshot(){return {filmId:this.film?.id,sceneId:this.film?.scenes[this.sceneIndex]?.id,timeMs:Math.round(this.currentTimeMs),state:this.state,rate:this.rate,volume:this.volume,muted:this.muted,theme:this.theme};}
 emit(name,detail=this.snapshot()){this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true,composed:true}));}
 notice(message){this.$('notice').textContent=message||'';}
 wake(){this.lastInteraction=performance.now();this.$('shell').classList.remove('idle');}
 async setFilm(film){
  await root.SHFPresentationFonts?.ready();
  this.pause();const report=C.validate(film);if(!report.valid)throw new Error(report.errors.join('\n'));
  this.film=JSON.parse(JSON.stringify(film));this.audio.clear();this.time=0;this.sceneIndex=-1;this.state='paused';this.sceneMusic=null;this.notice('');this.$('seek').max=String(report.durationMs);this.$('chapters').replaceChildren();this.$('transcript').replaceChildren();this.closePanel();
  for(const [i,s]of this.film.scenes.entries()){
   const b=document.createElement('button');const small=document.createElement('small'),title=document.createElement('span');small.textContent=String(i+1).padStart(2,'0')+' · '+fmt(s.durationMs);title.textContent=s.title;b.append(small,title);b.addEventListener('click',()=>this.jump(i));this.$('chapters').appendChild(b);
   const h=document.createElement('h4'),p=document.createElement('p');h.textContent=s.title;p.textContent=(s.beats||[]).map(b=>b.text).join(' ');this.$('transcript').append(h,p);
  }
  if(this.film.audioDisclosure){const p=document.createElement('p');p.className='hint';p.textContent=this.film.audioDisclosure;this.$('transcript').prepend(p);}
  this.setAttribute('data-theme',this.theme);this.render(0);this.buttons();this.emit('shf-loaded',report);return report;
 }
 async loadFile(file){return this.setFilm(await C.loadFile(file));}
 async load(url){const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);return this.loadFile(await r.blob());}
 toggle(){if(this.playing||this.state==='loading')this.pause();else this.play();}
 async play(){
  if(!this.film||this.playing||this.state==='loading')return;
  if(this.time>=this.durationMs)this.time=0;
  return this.begin();
 }
 async begin(){
  const token=++this.token,film=this.film,loc=C.sceneAt(film,this.time),scene=film.scenes[loc.index];
  this.state='loading';this.buttons();this.notice('');
  const needsAudio=this.audio.clips(scene).length||scene.music?.assetId||film.soundtrack?.assetId;
  try{
   let prepared={clips:[],music:null};
   if(needsAudio){await this.audio.unlock();prepared=await this.audio.prepare(scene);}
   if(token!==this.token||film!==this.film||!this.isConnected)return;
   this.clock=needsAudio?'audio':'visual';this.anchorTime=this.time;this.boundaryMs=loc.startMs+scene.durationMs;
   this.anchorNow=needsAudio?this.audio.ctx.currentTime+.025:performance.now()/1000;
   if(needsAudio)this.audio.schedule(prepared,loc.localMs,this.time,this.anchorNow,this.rate);else this.audio.stop();
   this.playing=true;this.state='playing';this.buttons();this.wake();this.emit('shf-play');this.tick();
  }catch(e){if(token!==this.token)return;this.playing=false;this.state='error';this.audio.stop();this.buttons();this.notice(e.message+' Playback stopped because the required narration could not play.');this.emit('shf-error',{message:e.message});}
 }
 pause(){
  this.token++;if(this.playing)this.time=this.currentTimeMs;this.playing=false;cancelAnimationFrame(this.frame);this.frame=0;this.audio.stop();this.state=this.film?(this.time>=this.durationMs?'ended':'paused'):'empty';this.buttons();if(this.film)this.render(this.time);this.emit('shf-pause');
 }
 seek(ms,resume=this.playing||this.state==='loading'){
  if(!this.film)return;if(!Number.isFinite(ms))throw new TypeError('seek requires finite milliseconds.');
  this.pause();this.time=C.clamp(ms,0,this.durationMs);this.state=this.time===this.durationMs?'ended':'paused';this.render(this.time);this.buttons();this.emit('shf-seek');if(resume&&this.time<this.durationMs)this.begin();
 }
 jump(index){if(!this.film)return;index=C.clamp(index,0,this.film.scenes.length-1);this.seek(this.film.scenes.slice(0,index).reduce((t,s)=>t+s.durationMs,0));}
 setRate(rate){if(!Number.isFinite(rate))throw new TypeError('Invalid rate.');const t=this.currentTimeMs,resume=this.playing||this.state==='loading';this.pause();this.rate=C.clamp(rate,.5,2);this.$('rate').value=String(this.rate);this.time=t;if(resume)this.begin();}
 setMuted(on){this.muted=!!on;this.audio.levels(this.voiceActive);this.buttons();this.emit('shf-volume');}
 setVolume(value){if(!Number.isFinite(value))throw new TypeError('Volume must be finite.');this.volume=C.clamp(value,0,1);this.muted=this.volume===0;this.$('volume').value=String(this.volume);this.audio.levels(this.voiceActive);this.buttons();this.emit('shf-volume');}
 setMusic(on){this.musicEnabled=!!on;this.audio.levels(this.voiceActive);this.$('music').setAttribute('aria-pressed',String(this.musicEnabled));if(on&&!this.film?.soundtrack&&!this.film?.scenes.some(s=>s.music))this.notice('This film has no music.');else this.notice('');}
 setCaptions(on){this.captions=!!on;this.$('captionbox').hidden=!this.captions;this.$('cc').setAttribute('aria-pressed',String(this.captions));}
 setTheme(name){if(!themes[name])throw new Error('Unknown theme.');this.theme=name;this.palette=null;this.setAttribute('data-theme',name);this.shadowRoot.querySelectorAll('[data-player-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.playerTheme===name)));this.sceneIndex=-1;if(this.film)this.render(this.currentTimeMs);}
 setPalette(patch){const colors={...themes[this.theme],...patch};for(const v of Object.values(colors))if(typeof v!=='string'||!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v))throw new Error('Palette colors must be hex.');this.palette=colors;this.sceneIndex=-1;if(this.film)this.render(this.currentTimeMs);}
 setReducedMotion(on){this.reduced=!!on;this.$('reduced').checked=this.reduced;if(this.film)this.render(this.currentTimeMs);}
 buttons(){if(!this.$)return;this.$('play').innerHTML=icon(this.playing?'pause':this.state==='ended'?'replay':'play');this.$('play').setAttribute('aria-label',this.playing?'Pause':'Play');this.$('centerPlay').hidden=this.playing;this.$('centerPlay').innerHTML=icon(this.state==='ended'?'replay':'play');this.$('mute').innerHTML=icon(this.muted||this.volume===0?'mute':'volume');this.$('mute').setAttribute('aria-pressed',String(this.muted));this.$('audioLabel').textContent=this.muted?'MUTE':this.state==='loading'?'Preparing audio…':'';this.$('shell').classList.toggle('playing',this.playing);if(!this.playing)this.$('shell').classList.remove('idle');}
 openPanel(name,title){if(!this.$(name).hidden){this.closePanel();return;}this.$('drawer').hidden=false;this.$('drawerTitle').textContent=title;for(const id of ['transcript','chapters','settings'])this.$(id).hidden=id!==name;for(const id of ['transcript','chapters','settings'])this.$(id+'Btn').setAttribute('aria-expanded',String(id===name));this.wake();}
 closePanel(){this.$('drawer').hidden=true;for(const id of ['transcript','chapters','settings']){this.$(id).hidden=true;this.$(id+'Btn').setAttribute('aria-expanded','false');}}
 tick(){
  if(!this.playing)return;const t=this.currentTimeMs;
  if(t>=this.boundaryMs-.5){this.time=this.boundaryMs;this.playing=false;this.audio.stop();if(this.time>=this.durationMs){this.state='ended';this.buttons();this.render(this.time);this.emit('shf-ended');return;}this.begin();return;}
  this.render(t);
  const focused=this.shadowRoot.activeElement;this.$('shell').classList.toggle('idle',performance.now()-this.lastInteraction>3500&&this.$('drawer').hidden&&!focused);
  this.frame=requestAnimationFrame(()=>this.tick());
 }
 color(value){return typeof value==='string'&&value.startsWith('$')?((this.palette||themes[this.theme])[value.slice(1)]||'#b45f70'):value;}
 buildScene(scene){
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${this.film.stage.width} ${this.film.stage.height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',scene.alt||scene.title);
  const bg=document.createElementNS(NS,'rect');bg.setAttribute('width','100%');bg.setAttribute('height','100%');bg.setAttribute('fill',(this.palette||themes[this.theme]).bg);svg.appendChild(bg);
  const cam=document.createElementNS(NS,'g');svg.appendChild(cam);this.dom=new Map([['$camera',cam]]);this.defs=new Map();this.drawTargets=new Set((scene.tracks||[]).filter(t=>t.property==='draw').map(t=>t.target));
  const append=(nodes,parent)=>{for(const n of nodes){const g=document.createElementNS(NS,'g');this.dom.set(n.id,g);this.defs.set(n.id,n);parent.appendChild(g);const shape=document.createElementNS(NS,n.type);for(const [k,v]of Object.entries({...n.attrs,...(n.themeAttrs?.[this.theme]||{})}))shape.setAttribute(k,String(this.color(v)));if(n.visibleThemes&&!n.visibleThemes.includes(this.theme))g.style.display='none';if(n.text)shape.textContent=n.text;if(n.type==='text'&&!n.attrs?.['font-family'])shape.setAttribute('font-family','SHF Display, sans-serif');g.appendChild(shape);if(n.children)append(n.children,shape);if(n.type==='path'||n.type==='line')shape.setAttribute('pathLength','1');g._shape=shape;}};
  append(scene.nodes,cam);this.svg=svg;this.$('art').replaceChildren(svg);this.$('stage').style.background=(this.palette||themes[this.theme]).bg;this.style.setProperty('--shf-ink',(this.palette||themes[this.theme]).ink);
 }
 captionAt(scene,localMs){
  // One sentence per card; new narration uses one measured clip per sentence.
  const cue=scene.captions?.find(c=>localMs>=c.startMs&&localMs<c.endMs);
  const beat=scene.captions?.length?cue:scene.beats?.find(b=>localMs>=b.startMs&&localMs<b.endMs);if(!beat)return '';
  const sentences=C.splitSentences(beat.text,this.film.language||'en');if(sentences.length<=1)return sentences[0]||'';
  // Compatibility for older multi-sentence clips: approximate sentence timing,
  // never combine separate sentences on one caption card.
  const weights=sentences.map(s=>s.split(/\s+/).length),total=weights.reduce((a,b)=>a+b,0);
  const elapsed=C.clamp((localMs-beat.startMs)/((beat.spokenEndMs||beat.endMs)-beat.startMs),0,.999999)*total;
  let end=0;for(let i=0;i<sentences.length;i++){end+=weights[i];if(elapsed<end)return sentences[i];}return sentences.at(-1)||'';
 }
 render(ms){
  if(!this.film)return;const loc=C.sceneAt(this.film,ms),scene=this.film.scenes[loc.index];
  if(loc.index!==this.sceneIndex){this.sceneIndex=loc.index;this.buildScene(scene);this.$('sceneTitle').textContent=scene.title;this.$('count').textContent=String(loc.index+1).padStart(2,'0')+' / '+String(this.film.scenes.length).padStart(2,'0');[...this.$('chapters').children].forEach((b,i)=>{b.classList.toggle('current',i===loc.index);b.setAttribute('aria-current',i===loc.index?'step':'false');});this.emit('shf-scene',{sceneId:scene.id,index:loc.index});}
  const states=C.stateAt(scene,loc.localMs,this.reduced);
  for(const [id,state]of states){const el=this.dom.get(id);if(!el)continue;const n=this.defs.get(id),ox=n?.origin?.[0]||0,oy=n?.origin?.[1]||0;el.setAttribute('transform',`translate(${state.x.toFixed(3)} ${state.y.toFixed(3)}) translate(${ox} ${oy}) rotate(${state.rotate.toFixed(3)}) scale(${(state.scale*(state.scaleX??1)).toFixed(5)} ${(state.scale*(state.scaleY??1)).toFixed(5)}) translate(${-ox} ${-oy})`);el.setAttribute('opacity',String(state.opacity));if(el._shape&&this.drawTargets.has(id)){el._shape.setAttribute('stroke-dasharray','1');el._shape.setAttribute('stroke-dashoffset',String(1-state.draw));}}
  this.updateConnections(scene);this.$('caption').textContent=this.captionAt(scene,loc.localMs);this.$('seek').value=String(Math.round(ms));this.$('clock').textContent=fmt(ms)+' / '+fmt(this.durationMs);
  const beat=scene.beats?.find(b=>loc.localMs>=b.startMs&&loc.localMs<(b.spokenEndMs||b.endMs));this.voiceActive=!!beat&&this.audio.clips(scene).length>0;
  if(this.lastDuck!==this.voiceActive){this.lastDuck=this.voiceActive;this.audio.levels(this.voiceActive);}
 }
 updateConnections(scene){
  const cam=this.dom.get('$camera');if(!cam?.getCTM())return;const inv=cam.getCTM().inverse();
  const point=port=>{const node=this.defs.get(port.node),el=this.dom.get(port.node),xy=node?.anchors?.[port.anchor];if(!el||!xy)return null;const m=el.getCTM();if(!m)return null;const p=this.svg.createSVGPoint();p.x=xy[0];p.y=xy[1];return p.matrixTransform(m).matrixTransform(inv);};
  const visible=port=>{let el=this.dom.get(port.node);while(el&&el!==cam){if(Number(el.getAttribute('opacity')??1)<.01||el.style.display==='none')return false;el=el.parentElement;}return true;};
  for(const c of scene.connections||[]){const g=this.dom.get(c.id),a=point(c.from),b=point(c.to);if(!g||!a||!b)continue;const dx=(b.x-a.x)*.42,bend=c.bend||0;g._shape.setAttribute('d',`M${a.x} ${a.y} C${a.x+dx} ${a.y+bend} ${b.x-dx} ${b.y+bend} ${b.x} ${b.y}`);g.style.visibility=visible(c.from)&&visible(c.to)?'visible':'hidden';}
 }
 async fullscreen(){try{if(document.fullscreenElement){await document.exitFullscreen();return;}if(this.requestFullscreen){await this.requestFullscreen();return;}}catch{}this.classList.toggle('cinema');}
 captureSVG(){return this.svg?new XMLSerializer().serializeToString(this.svg):'';}
}
if(!customElements.get('shf-player'))customElements.define('shf-player',SHFPlayer);
root.SHF=Object.freeze({Player:SHFPlayer,core:C,themes,version:'0.4'});
})(globalThis);
