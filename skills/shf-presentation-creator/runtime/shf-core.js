/* SHF 0.4 • deterministic data, timeline and ZIP core • MIT • no dependencies */
(function (root) {
  'use strict';
  const VERSION = '0.4';
  const TYPES = new Set(['g','path','rect','circle','ellipse','line','text','polygon']);
  const PROPS = new Set(['x','y','scale','rotate','opacity','draw','scaleX','scaleY']);
  const ATTRS = new Set(['d','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','fill-rule','font-size','font-family','font-weight','text-anchor','letter-spacing','opacity']);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function ease(x, name) {
    x = clamp(x, 0, 1);
    if (name === 'hold') return x < 1 ? 0 : 1;
    if (name === 'linear') return x;
    if (name === 'inOut') return x*x*(3-2*x);
    if (name === 'out') return 1-Math.pow(1-x,3);
    return x;
  }
  function sample(keys, t) {
    if (!keys.length) return 0;
    if (t <= keys[0].t) return keys[0].v;
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i].t) {
        const a = keys[i-1], b = keys[i];
        return a.v+(b.v-a.v)*ease((t-a.t)/(b.t-a.t), b.ease || 'inOut');
      }
    }
    return keys[keys.length-1].v;
  }
  function sceneAt(film, t) {
    const starts = [0];
    for (const s of film.scenes) starts.push(starts[starts.length-1]+s.durationMs);
    t = clamp(Number.isFinite(t) ? t : 0, 0, starts[starts.length-1]);
    let lo = 0, hi = film.scenes.length-1;
    while (lo < hi) { const mid = Math.floor((lo+hi+1)/2); if (starts[mid] <= t) lo = mid; else hi = mid-1; }
    return {index:lo, localMs:t-starts[lo], startMs:starts[lo], totalMs:starts[starts.length-1], timeMs:t};
  }
  function walk(nodes, f, depth = 0) {
    if (depth > 20) throw new Error('Scene nesting exceeds 20 levels.');
    for (const n of nodes || []) { f(n); if (n.children) walk(n.children, f, depth+1); }
  }
  function stateAt(scene, t, reduced = false) {
    const states = new Map();
    walk(scene.nodes, n => states.set(n.id, {x:n.transform?.x||0, y:n.transform?.y||0, scale:n.transform?.scale??1, rotate:n.transform?.rotate||0, scaleX:n.transform?.scaleX??1, scaleY:n.transform?.scaleY??1, opacity:n.opacity??1, draw:1}));
    states.set('$camera', {x:0,y:0,scale:1,scaleX:1,scaleY:1,rotate:0,opacity:1,draw:1});
    for (const tr of scene.tracks || []) {
      const state = states.get(tr.target); if (!state) continue;
      // Essential explanations retain their sequence; decorative motion is frozen.
      const time = reduced && tr.essential === false ? 0 : t;
      state[tr.property] = sample(tr.keys, time);
    }
    return states;
  }
  function validateUnchecked(film) {
    const errors = [], warnings = [];
    const err = x => errors.push(x);
    if (!film || typeof film !== 'object') return {valid:false,errors:['Not an object.'],warnings};
    if (film.format !== 'SHF' || !['0.3',VERSION].includes(film.version)) err('Expected format SHF, version 0.3 or 0.4.');
    if(film.profile!==undefined&&film.profile!=='svg-scene-v1')err('Unsupported playback profile.');
    if (typeof film.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(film.id)) err('Film id must be 1–80 filename-safe letters, digits, hyphens or underscores.');
    if (typeof film.title !== 'string' || !film.title) err('Missing title.');
    if (!finite(film.stage?.width) || !finite(film.stage?.height) || film.stage.width<1 || film.stage.height<1) err('Invalid stage size.');
    if (!Array.isArray(film.scenes) || !film.scenes.length || film.scenes.length>600) return {valid:false,errors:[...errors,'Expected 1–600 scenes.'],warnings};
    const sceneIds = new Set(), sourceIds = new Set((film.sources||[]).map(s=>s.id));
    let total = 0, nodeTotal = 0;
    for (const s of film.scenes) {
      if (typeof s.id !== 'string' || !s.id || sceneIds.has(s.id)) err('Invalid/duplicate scene id: '+s.id); sceneIds.add(s.id);
      if (!finite(s.durationMs) || s.durationMs<=0 || s.durationMs>600000) err(s.id+': duration must be 1–600000 ms.');
      if (typeof s.title !== 'string') err(s.id+': missing title.');
      total+=s.durationMs;
      const ids = new Set(['$camera']); let count = 0;
      try { walk(s.nodes, n => {
        count++; if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id)) err(s.id+': invalid/duplicate node id.'); ids.add(n.id);
        if (!TYPES.has(n.type)) err(s.id+': unsupported node type '+n.type);
        for (const [k,v] of Object.entries(n.attrs||{})) {
          if (!ATTRS.has(k)) err(s.id+': disallowed attribute '+k);
          if (typeof v !== 'string' && !finite(v)) err(s.id+': invalid attribute value');
          if (typeof v === 'string' && /url\s*\(|javascript:|<|>/i.test(v)) err(s.id+': unsafe attribute value');
        }
        if(n.visibleThemes && (!Array.isArray(n.visibleThemes)||n.visibleThemes.some(x=>!['color','paper','night'].includes(x))))err('Invalid theme variant.');
        for(const patch of Object.values(n.themeAttrs||{})) for(const [k,v] of Object.entries(patch)){if(!ATTRS.has(k)||!(typeof v==='string'||finite(v))||(typeof v==='string'&&/url\s*\(|javascript:|<|>/i.test(v)))err('Invalid theme attribute.');}
        if(n.anchors) for(const v of Object.values(n.anchors)) if(!Array.isArray(v)||v.length!==2||!v.every(finite))err('Invalid anchor coordinates.');
        if (n.text !== undefined && typeof n.text !== 'string') err(s.id+': text must be a string.');
        if (n.text?.length>600) err(s.id+': visual text too long.');
        for (const [k,v] of Object.entries(n.transform||{})) if (!['x','y','scale','scaleX','scaleY','rotate'].includes(k) || !finite(v)) err(s.id+': invalid transform.');
        if(n.origin!==undefined&&(!Array.isArray(n.origin)||n.origin.length!==2||!n.origin.every(finite))) err(s.id+': invalid transform origin.');
        if (n.opacity!==undefined && (!finite(n.opacity)||n.opacity<0||n.opacity>1)) err(s.id+': invalid opacity.');
      }); } catch (e) { err(e.message); }
      if (!Array.isArray(s.nodes)||!count||count>1500) err(s.id+': expected 1–1500 visual nodes.');
      nodeTotal += count;
      for(const con of s.connections||[]) {
        if(con.bend!==undefined&&!finite(con.bend))err('Invalid connection curvature.');
        if(!ids.has(con.id) || !ids.has(con.from?.node) || !ids.has(con.to?.node)) err(s.id+': missing connection endpoint.');
        const lookup=new Map();walk(s.nodes,n=>lookup.set(n.id,n));
        for(const port of [con.from,con.to]) {const a=lookup.get(port?.node)?.anchors?.[port?.anchor];if(!Array.isArray(a)||a.length!==2||!a.every(finite))err(s.id+': invalid named anchor.');}
      }
      const channels = new Set();
      for (const tr of s.tracks||[]) {
        if (!ids.has(tr.target) || !PROPS.has(tr.property)) err(s.id+': invalid animation target/property.');
        const ch=tr.target+':'+tr.property; if(channels.has(ch)) err(s.id+': duplicate track '+ch); channels.add(ch);
        if (!Array.isArray(tr.keys) || !tr.keys.length || tr.keys.length>1000) {err(s.id+': invalid keys.');continue;}
        let prior = -1;
        for (const k of tr.keys) {
          if(!finite(k.t)||k.t<0||k.t>s.durationMs||k.t<=prior||!finite(k.v)) err(s.id+': invalid/unordered key.');
          if(k.ease&&!['linear','inOut','out','hold'].includes(k.ease)) err(s.id+': unsupported easing.');
          if(tr.property==='draw'&&(k.v<0||k.v>1)) err(s.id+': draw out of range.');
          if(tr.property==='opacity'&&(k.v<0||k.v>1)) err(s.id+': opacity out of range.');
          if(['scale','scaleX','scaleY'].includes(tr.property)&&k.v<=0) err(s.id+': scale must be positive.');
          prior=k.t;
        }
      }
      let clipEnd=0;
      if(s.audio && s.audioClips?.length)err(s.id+': use audio OR audioClips, not both.');
      for(const clip of s.audioClips||[]){
        if(!film.assets?.[clip.assetId])err(s.id+': missing audio clip '+clip.assetId);
        if(!finite(clip.startMs)||!finite(clip.durationMs)||clip.startMs<clipEnd||clip.durationMs<=0||clip.startMs+clip.durationMs>s.durationMs+1)err(s.id+': invalid or overlapping narration clips.');
        clipEnd=clip.startMs+clip.durationMs;
      }
      let priorEnd = 0;
      for (const b of s.beats||[]) {
        if (!finite(b.startMs)||!finite(b.endMs)||b.startMs<priorEnd||b.endMs<=b.startMs||b.endMs>s.durationMs) err(s.id+': invalid/overlapping beat timing.');
        if (typeof b.text!=='string') err(s.id+': beat requires text.');
        if(b.spokenEndMs!==undefined&&(!finite(b.spokenEndMs)||b.spokenEndMs<=b.startMs||b.spokenEndMs>b.endMs))err(s.id+': invalid spokenEndMs.');
        for (const r of b.sourceRefs||[]) if(!sourceIds.has(r)) err(s.id+': missing source '+r);
        priorEnd=b.endMs;
      }
      let captionEnd=0;for(const c of s.captions||[]){if(!finite(c.startMs)||!finite(c.endMs)||c.startMs<captionEnd||c.endMs<=c.startMs||c.endMs>s.durationMs||typeof c.text!=='string')err(s.id+': invalid caption cue.');captionEnd=c.endMs;}
      if (!s.beats?.length) warnings.push(s.id+': no narration/caption beats.');
      if(s.audio?.offsetMs!==undefined&&s.audio.offsetMs!==0)err(s.id+': this profile requires narration offsetMs 0.');
      if (s.audio?.assetId && !film.assets?.[s.audio.assetId]) err(s.id+': missing narration asset.');
      if (s.audio?.durationMs > s.durationMs+100) err(s.id+': narration exceeds scene duration.');
    }
    if (!finite(total)||total>4*3600000) err('Film exceeds four-hour prototype limit.');
    if (film.durationMs!==undefined && (!finite(film.durationMs)||total!==film.durationMs)) err('Declared total duration does not match scenes.');
    for(const music of [film.soundtrack,...film.scenes.map(s=>s.music)].filter(Boolean)){
      if(music.assetId&&!film.assets?.[music.assetId])err('Missing music asset '+music.assetId);
      if(music.gain!==undefined&&(!finite(music.gain)||music.gain<0||music.gain>0.3))err('Music gain must be 0..0.3.');
    }
    for(const [id,a] of Object.entries(film.assets||{})) {
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id))err('Unsafe asset id.');
      if(!['audio/mpeg','audio/wav','audio/ogg'].includes(a.mime)) err('Unsupported media type for '+id);
      if(a.path&&!safePath(a.path)) err('Unsafe asset path.');
      if(a.data!==undefined&&(typeof a.data!=='string'||!/^[A-Za-z0-9+/=\s]*$/.test(a.data))) err('Invalid base64 asset '+id);
    }
    return {valid:!errors.length, errors, warnings, durationMs:total, nodeCount:nodeTotal};
  }
  function validate(film){try{return validateUnchecked(film);}catch(e){return {valid:false,errors:['Malformed film data: '+e.message],warnings:[]};}}
  function safePath(name) {
    return typeof name==='string' && name.length>0 && name.length<240 && !name.startsWith('/') && !/[\\\x00-\x1f:]/.test(name) && !name.split('/').some(x=>x==='..'||x==='.'||!x);
  }
  const crcTable = Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function crc32(a) {let c=0xffffffff;for(const v of a)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function bytes64(a) {let out='';for(let i=0;i<a.length;i+=32768)out+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(out);}
  function from64(s) {return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  function zipStore(entries) {
    const enc=new TextEncoder(), locals=[], centrals=[];let offset=0;
    for(const [name,raw] of Object.entries(entries)) {
      if(!safePath(name)) throw new Error('Unsafe ZIP path.');
      const n=enc.encode(name), a=typeof raw==='string'?enc.encode(raw):raw;
      const h=new Uint8Array(30+n.length),v=new DataView(h.buffer),crc=crc32(a);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,a.length,true);v.setUint32(22,a.length,true);v.setUint16(26,n.length,true);h.set(n,30);
      const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,a.length,true);cv.setUint32(24,a.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);
      locals.push(h,a);centrals.push(c);offset+=h.length+a.length;
    }
    const end=new Uint8Array(22),ev=new DataView(end.buffer),cdSize=centrals.reduce((n,c)=>n+c.length,0);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);
    const out=new Uint8Array(offset+cdSize+22);let pos=0;for(const x of [...locals,...centrals,end]){out.set(x,pos);pos+=x.length;}return out;
  }
  async function unzip(input) {
    const a=input instanceof Uint8Array?input:new Uint8Array(input), v=new DataView(a.buffer,a.byteOffset,a.byteLength), dec=new TextDecoder('utf-8',{fatal:true});
    if(a.length>128*1024*1024||a.length<22)throw new Error('Archive must be 22 B–128 MiB.');
    let end=-1;for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--){if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===a.length){end=i;break;}}
    if(end<0)throw new Error('Missing ZIP directory.');
    const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true);let pos=v.getUint32(end+16,true);
    if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count||count>2000||pos+size!==end)throw new Error('Split, ZIP64, or oversized archives are not supported.');
    const files=Object.create(null);let total=0;
    for(let i=0;i<count;i++){
      if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw new Error('Invalid ZIP central header.');
      const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),cs=v.getUint32(pos+20,true),us=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),xl=v.getUint16(pos+30,true),cl=v.getUint16(pos+32,true),off=v.getUint32(pos+42,true);
      if(pos+46+nl+xl+cl>end)throw new Error('Truncated ZIP directory.');
      const name=dec.decode(a.subarray(pos+46,pos+46+nl));pos+=46+nl+xl+cl;
      if(name.endsWith('/')&&us===0)continue;
      if(!safePath(name)||Object.hasOwn(files,name)||flags&1||![0,8].includes(method))throw new Error('Unsafe, encrypted, duplicate or unsupported ZIP entry.');
      total+=us;if(us>64*1024*1024||total>128*1024*1024)throw new Error('Uncompressed archive limit exceeded.');
      if(off+30>a.length||v.getUint32(off,true)!==0x04034b50)throw new Error('Invalid ZIP local header.');
      const localNameLen=v.getUint16(off+26,true),st=off+30+localNameLen+v.getUint16(off+28,true);
      if(st+cs>a.length||dec.decode(a.subarray(off+30,off+30+localNameLen))!==name||v.getUint16(off+8,true)!==method)throw new Error('ZIP local/central mismatch.');
      let data=a.slice(st,st+cs);
      if(method===8){
        if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot open deflated ZIPs. Export ZIP STORE with the included packer.');
        let ds;try{ds=new DecompressionStream('deflate-raw');}catch{throw new Error('deflate-raw unavailable; use ZIP STORE.');}
        const reader=new Blob([data]).stream().pipeThrough(ds).getReader(),parts=[];let n=0;
        while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>us){await reader.cancel();throw new Error('ZIP expansion limit exceeded.');}parts.push(r.value);}
        data=new Uint8Array(n);let p=0;for(const x of parts){data.set(x,p);p+=x.length;}
      }
      if(data.length!==us||crc32(data)!==crc)throw new Error('ZIP integrity check failed for '+name);
      files[name]=data;
    }
    return files;
  }
  async function loadFile(file) {
    if(file.size>128*1024*1024)throw new Error('File exceeds 128 MiB limit.');
    const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>128*1024*1024)throw new Error('File too large.');let film;
    if(bytes[0]===0x50&&bytes[1]===0x4b){
      const files=await unzip(bytes);
      if(!files['film.json'])throw new Error('film.json must be at the archive root.');
      film=JSON.parse(new TextDecoder().decode(files['film.json']));
      for(const a of Object.values(film.assets||{})){if(a.path){if(!files[a.path])throw new Error('Missing asset '+a.path);a.data=bytes64(files[a.path]);}}
    } else { film=JSON.parse(new TextDecoder().decode(bytes)); }
    const result=validate(film);if(!result.valid)throw new Error(result.errors.join('\n'));
    for(const a of Object.values(film.assets||{}))if(!a.data)throw new Error('An offline file must include every referenced audio asset.');
    return film;
  }
  function packFilm(film) {
    const result=validate(film);if(!result.valid)throw new Error(result.errors.join('\n'));
    const m=JSON.parse(JSON.stringify(film)),entries={};
    for(const [id,a] of Object.entries(m.assets||{})){
      if(!a.data)throw new Error('Cannot export missing audio bytes.');
      a.path='assets/'+id.replace(/[^a-zA-Z0-9_-]/g,'_')+(a.mime==='audio/mpeg'?'.mp3':a.mime==='audio/ogg'?'.ogg':'.wav');
      if(entries[a.path])throw new Error('Asset path collision.');entries[a.path]=from64(a.data);delete a.data;
    }
    entries['film.json']=JSON.stringify(m,null,2);return zipStore(entries);
  }
  function splitSentences(text,language='en'){
    const value=String(text||'').trim();if(!value)return [];
    if(globalThis.Intl?.Segmenter){try{return [...new Intl.Segmenter(language,{granularity:'sentence'}).segment(value)].map(s=>s.segment.trim()).filter(Boolean);}catch{}}
    return (value.match(/[^.!?]+(?:[.!?]+(?:["”’']*)|$)/g)||[]).map(s=>s.trim()).filter(Boolean);
  }
  root.SHFCore=Object.freeze({VERSION,TYPES,ATTRS,PROPS,clamp,ease,sample,walk,stateAt,sceneAt,validate,crc32,zipStore,unzip,loadFile,packFilm,bytes64,from64,splitSentences});
})(globalThis);
