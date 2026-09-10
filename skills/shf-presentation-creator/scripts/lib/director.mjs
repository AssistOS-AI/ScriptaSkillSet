/** Semantic actions compile to sampled SVG tracks. No timers, eval, or hidden code. */
import {instantiate,backdrop,ASSETS,LIBRARY_VERSION,EMOTIONS} from './asset-library.mjs';
export const ACTIONS=Object.freeze(['appear','disappear','moveTo','lookAt','react','character.express','character.gesture','walkTo','reach','book.open','book.turnPage','city.grow','stack.grow','stack.wobble','door.open','door.close','machine.think','machine.approve','paper.verify','balance.weigh','stamp.press','tree.sway','light.warm','connection.draw']);
export function compileScene(scene){
 const objects=scene.objects||[], byId=new Map(objects.map(o=>[o.id,o]));
 if(!objects.length||byId.size!==objects.length)throw new Error(scene.id+': empty/duplicate objects.');
 const nodes=[...backdrop(scene.setting),...objects.map(instantiate)],lookup=new Map();
 const walk=(list)=>{for(const n of list){if(lookup.has(n.id))throw new Error('Duplicate visual ID '+n.id);lookup.set(n.id,n);if(n.children)walk(n.children);}};walk(nodes);
 const channels=new Map();const originals=new Map([...lookup].map(([id,n])=>[id,{...n.transform}]));
 function baseline(target,property){const n=lookup.get(target);return property==='opacity'?(n.opacity??1):property==='draw'?1:originals.get(target)?.[property]??(['scale','scaleX','scaleY'].includes(property)?1:0);}
 function priorValue(target,property,at){const tr=channels.get(target+':'+property);if(!tr)return baseline(target,property);return [...tr.keys].reverse().find(k=>k.t<=at)?.v??baseline(target,property);}
 function keys(target,property,points,essential=true){
  if(!lookup.has(target))throw new Error('Unknown rig part '+target);
  const ch=target+':'+property;let tr=channels.get(ch);
  if(!tr){tr={target,property,essential,keys:[{t:0,v:baseline(target,property),ease:'inOut'}]};channels.set(ch,tr);}
  tr.essential=tr.essential&&essential;
  for(const [t,v,ease='inOut'] of points){
   if(!Number.isFinite(t)||t<0||t>scene.durationMs)throw new Error(scene.id+': action outside scene: '+ch+' @'+t);
   if(!Number.isFinite(v))throw new Error('Nonfinite semantic action value.');
   const k={t:Math.round(t),v,ease};let i=tr.keys.findIndex(x=>x.t===k.t);if(i>=0)tr.keys[i]=k;else tr.keys.push(k);
  }
  tr.keys.sort((a,b)=>a.t-b.t);
 }
 function origin(id,xy){lookup.get(id).origin=xy;}
 // Default rig states: no checkmark before verification; machine eyes remain visible.
 for(const o of objects){if(o.asset==='paper')lookup.get(o.id+'.check').opacity=o.options?.checked?1:0;if(o.asset==='machine')lookup.get(o.id+'.screenCheck').opacity=0;}
 const connections=(scene.connections||[]).map(c=>({...c}));
 for(const c of connections){
  for(const ep of [c.from,c.to])if(!lookup.get(ep.node)?.anchors?.[ep.anchor])throw new Error('Connection requires existing object and named anchor.');
  if(lookup.has(c.id))throw new Error('Connection ID collision.');
  const n={id:c.id,type:'path',attrs:{d:'M0 0L0 0',fill:'none',stroke:c.color||'$teal','stroke-width':c.width||3,'stroke-linecap':'round'},meaning:c.meaning||'relationship'};
  // Cables behind foreground actors, so ports attach rather than float over faces.
  nodes.splice(backdrop(scene.setting).length,0,n);lookup.set(c.id,n);originals.set(c.id,{});
 }
 const applied=[];
 for(const originalAction of scene.actions||[]){
  const a={...originalAction};
  if(!ACTIONS.includes(a.action))throw new Error('Unsupported semantic action '+a.action);
  if(a.cue){const beat=(scene.beats||[]).find(b=>b.id===a.cue.beatId);if(!beat)throw new Error('Unknown cue beat '+a.cue.beatId);a.atMs=(a.cue.edge==='end'?beat.endMs:beat.startMs)+(a.cue.offsetMs||0);}
  const id=a.actor,n=lookup.get(id),obj=byId.get(id);if(!n)throw new Error('Action actor missing '+id);
  const at=a.atMs??0,dur=a.durationMs??900,end=at+dur;
  if(!Number.isFinite(dur)||dur<=0||at<0||end>scene.durationMs)throw new Error('Invalid action interval.');
  const requireAsset=(name)=>{const customCharacter=name==='character'&&obj?.asset==='custom'&&obj.options?.rig==='character'&&['head','armL','armR','legL','legR'].every(part=>lookup.has(id+'.'+part));if(obj?.asset!==name&&!(name==='character'&&obj?.asset?.startsWith('person-'))&&!customCharacter)throw new Error(`${a.action} requires ${name}, got ${obj?.asset}.`);};
  const part=s=>id+'.'+s;
  const pulse=(target,prop,rest,peak,essential=true)=>keys(target,prop,[[at,rest],[at+dur*.38,peak],[end,rest]],essential);
  switch(a.action){
   case 'appear': {const scale=n.transform?.scale??1;keys(id,'opacity',[[0,0],[at,0],[at+dur*.55,1]]);keys(id,'scale',[[0,scale*.88],[at,scale*.88],[at+dur*.75,scale*1.02],[end,scale]]);break;}
   case 'disappear':keys(id,'opacity',[[at,1],[end,0]]);break;
   case 'moveTo':for(const p of ['x','y'])if(a[p]!==undefined)keys(id,p,[[at,priorValue(id,p,at)],[end,a[p]]]);break;
   case 'lookAt':{
    requireAsset('character');const other=byId.get(a.target);if(!other)throw new Error('lookAt target missing.');
    const sign=priorValue(other.id,'x',at)>priorValue(id,'x',at)?1:-1;keys(part('head'),'rotate',[[at,priorValue(part('head'),'rotate',at)],[end,sign* (a.up?-7:4)]]);keys(part('pupils'),'x',[[at,priorValue(part('pupils'),'x',at)],[end,sign*4]]);if(a.up)keys(part('pupils'),'y',[[at,priorValue(part('pupils'),'y',at)],[end,-2.5]]);break;
   }
   case 'character.express':{
    requireAsset('character');if(!EMOTIONS.includes(a.emotion))throw new Error('Unknown character emotion '+a.emotion);
    for(const emotion of EMOTIONS){const target=part('expression.'+emotion);if(!lookup.has(target))throw new Error('character.express requires dynamicExpressions: true');keys(target,'opacity',[[at,priorValue(target,'opacity',at)],[end,emotion===a.emotion?1:0]]);}break;
   }
   case 'character.gesture':{
    requireAsset('character');const poses={invite:[28,-42,-5,1],explain:[8,-62,3,1],question:[40,-45,-7,-1],recoil:[-12,18,7,-3],reflect:[8,-125,6,-1],resolve:[15,-44,-3,2],release:[-4,-14,0,0]};
    const pose=poses[a.gesture];if(!pose)throw new Error('Unknown character gesture '+a.gesture);
    origin(part('armL'),[-34,-157]);origin(part('armR'),[32,-156]);origin(id,[0,0]);
    for(const [target,peak] of [[part('armL'),pose[0]],[part('armR'),pose[1]],[part('head'),pose[2]],[id,pose[3]]]){
     const rest=priorValue(target,'rotate',at);keys(target,'rotate',[[at,rest],[at+dur*.2,rest+(peak-rest)*.12],[at+dur*.48,peak],[at+dur*.78,peak],[end,rest]],false);
    }break;
   }
   case 'react':{
    requireAsset('character');origin(part('armR'),[32,-156]);
    pulse(part('head'),'y',-223,-229);pulse(part('brows'),'y',0,-4);pulse(part('armR'),'rotate',0,a.emotion==='surprised'?-33:-16);if(a.emotion==='surprised'){keys(part('mouth'),'opacity',[[at,1],[at+dur*.2,0],[at+dur*.75,0],[end,1]]);keys(part('mouthO'),'opacity',[[0,0],[at,0],[at+dur*.2,1],[at+dur*.75,1],[end,0]]);}break;
   }
   case 'reach':{
    requireAsset('character');origin(part('armR'),[32,-156]);const until=a.untilMs??end;
    keys(part('armR'),'rotate',[[at,0],[at+dur*.45,-46],[until,-46],[Math.min(scene.durationMs,until+dur*.55),0]]);break;
   }
   case 'walkTo':{
    requireAsset('character');const x=a.x??priorValue(id,'x',at),y=priorValue(id,'y',at);keys(id,'x',[[at,priorValue(id,'x',at)],[end,x]]);
    const count=Math.max(2,Math.min(10,Math.round(dur/420)));const yy=[[at,y]],ll=[[at,0]],rr=[[at,0]];
    origin(part('legL'),[-16,-83]);origin(part('legR'),[18,-83]);
    for(let i=1;i<count*2;i++){const t=at+dur*i/(count*2);yy.push([t,y-(i%2?4:0)]);ll.push([t,i%2?9:-9]);rr.push([t,i%2?-9:9]);}
    yy.push([end,y]);ll.push([end,0]);rr.push([end,0]);keys(id,'y',yy);keys(part('legL'),'rotate',ll);keys(part('legR'),'rotate',rr);break;
   }
   case 'book.open':requireAsset('book');for(const side of ['left','right'])keys(part(side),'scaleX',[[0,.06],[at,.06],[end,1]]);break;
   case 'book.turnPage':requireAsset('book');pulse(part('right'),'scaleX',1,.15);break;
   case 'city.grow':{
    requireAsset('city');for(let i=0;i<5;i++){const t=at+i*dur*.1;keys(part('building'+i),'scaleY',[[0,.005],[t,.005],[t+dur*.55,1.025],[t+dur*.6,1]]);keys(part('building'+i),'opacity',[[0,0],[t,0],[t+dur*.2,1]]);}break;
   }
   case 'stack.grow':{
    requireAsset('stack');for(let i=1;i<9;i++){const t=at+(i-1)*dur/9,land=t+dur/9*.7;keys(part('sheet'+i),'opacity',[[0,0],[t,0],[t+120,1]]);keys(part('sheet'+i),'x',[[0,95],[t,95],[land,0]]);keys(part('sheet'+i),'y',[[0,-100],[t,-100],[land,0],[Math.min(land+110,scene.durationMs),-2],[Math.min(land+220,scene.durationMs),0]]);}break;
   }
   case 'stack.wobble':{
    requireAsset('stack');for(let i=1;i<9;i++)keys(part('sheet'+i),'x',[[at,0],[at+dur*.22,2+i*.65],[at+dur*.48,-i*.5],[at+dur*.72,i*.25],[end,0]]);break;
   }
   case 'door.open':requireAsset('door');origin(part('leaf'),[-59,0]);keys(part('leaf'),'scaleX',[[at,1],[end,.06]]);break;
   case 'door.close':requireAsset('door');origin(part('leaf'),[-59,0]);keys(part('leaf'),'scaleX',[[0,.06],[at,.06],[end,1]]);break;
   case 'machine.think':{
    requireAsset('machine');origin(part('eyes'),[0,-140]);origin(part('antenna'),[0,-219]);keys(part('eyes'),'scaleY',[[at,1],[at+dur*.16,.15],[at+dur*.22,1],[at+dur*.6,1],[at+dur*.68,.15],[at+dur*.74,1]]);keys(part('antenna'),'rotate',[[at,0],[at+dur*.25,9],[at+dur*.5,-6],[at+dur*.75,3],[end,0]],false);break;
   }
   case 'machine.approve':requireAsset('machine');keys(part('eyes'),'opacity',[[at,1],[end,0]]);keys(part('screenCheck'),'opacity',[[0,0],[at,0],[end,1]]);break;
   case 'paper.verify':requireAsset('paper');keys(part('check'),'opacity',[[0,0],[at,0],[end,1]]);break;
   case 'balance.weigh':requireAsset('balance');origin(part('beam'),[0,-184]);keys(part('beam'),'rotate',[[at,0],[at+dur*.25,10],[at+dur*.55,-7],[at+dur*.8,3],[end,0]]);break;
   case 'stamp.press':requireAsset('stamp');keys(id,'y',[[at,obj.y],[at+dur*.38,obj.y+30],[at+dur*.6,obj.y+30],[end,obj.y]]);break;
   case 'tree.sway':requireAsset('tree');origin(part('canopy'),[0,-125]);pulse(part('canopy'),'rotate',0,2,false);break;
   case 'light.warm':requireAsset('bulb');keys(part('halo'),'opacity',[[at,.12],[end,1]],false);break;
   case 'connection.draw':keys(id,'draw',[[0,0],[at,0],[end,1]]);break;
  }
  applied.push({...a});
 }
 const {objects:_,actions:__,connections:___,...metadata}=scene;
 return {...metadata,nodes,tracks:[...channels.values()],connections,direction:{libraryVersion:LIBRARY_VERSION,objects,actions:applied}};
}
export function compileFilm(direction){
 if(direction.format!=='SHF-Direction'||!['0.3','0.4'].includes(direction.version))throw new Error('Expected SHF-Direction 0.3/0.4.');
 const film={...direction,version:'0.4',format:'SHF',profile:'svg-scene-v1',scenes:direction.scenes.map(compileScene)};
 film.durationMs=film.scenes.reduce((t,s)=>t+s.durationMs,0);return film;
}
