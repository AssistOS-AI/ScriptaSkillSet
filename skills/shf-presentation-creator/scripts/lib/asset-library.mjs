/** SHF original vector repertory. Each sprite has named rig parts and anchors.
 * Units are stage coordinates; object position is normally its floor contact.
 * No external images, font files, SVG markup strings or network resources.
 */
import fs from 'node:fs';
import {openBookVisual} from './book-art.mjs';
import {OBJECTS,OBJECT_META} from './repertory.mjs';
export const LIBRARY_VERSION = '2.0';
class Draw {
  constructor(id){this.id=id;this.n=0;}
  node(type,attrs={},part,text){return {id:this.id+'.'+(part||'n'+(++this.n)),type,attrs,...(text!==undefined?{text}: {})};}
  p(d,fill='$structural',stroke='none',sw=2,part){return this.node('path',{d,fill,stroke,'stroke-width':sw,'stroke-linecap':'round','stroke-linejoin':'round'},part);}
  r(x,y,w,h,fill='$surface',rx=0,stroke='none',sw=2,part){return this.node('rect',{x,y,width:w,height:h,rx,fill,stroke,'stroke-width':sw},part);}
  c(x,y,r,fill='$structural',part){return this.node('circle',{cx:x,cy:y,r,fill},part);}
  e(x,y,rx,ry,fill='$shadow',part){return this.node('ellipse',{cx:x,cy:y,rx,ry,fill},part);}
  l(x1,y1,x2,y2,stroke='$structural',sw=2,part){return this.node('line',{x1,y1,x2,y2,stroke,'stroke-width':sw,'stroke-linecap':'round'},part);}
  t(x,y,text,size=22,fill='$ink',part,anchor='middle'){return this.node('text',{x,y,'font-size':size,fill,'font-weight':600,'text-anchor':anchor},part,text);}
  g(part,children,x=0,y=0){return {...this.node('g',{},part),children,transform:{x,y}};}
}
const variants=(n,...themes)=>({...n,visibleThemes:themes});
const alpha=(n,opacity)=>({...n,opacity});
const root=(id,children,anchors={},extra={})=>({id,type:'g',attrs:{},children,anchors,...extra});
const accent=o=>o.color||'$blue';
function character(id,o={}){
 const d=new Draw(id),coat=accent(o),flipped=o.facing==='left';
 const head=[d.e(0,-3,27,33,'$skin'),d.c(-25,0,7,'$skin'),d.c(25,0,7,'$skin'),d.p('M-27 -3 Q-35 -48 0 -46 Q34 -49 29 -5 L22 -18 Q0 -16 -15 -29 L-20 -4 Z','$hair'),d.p('M-5 7 Q-2 14 4 9','none','$skinShadow',2),d.p('M-8 20 Q0 25 8 20','none','$structural',2.5,'mouth'),alpha(d.e(0,21,5,7,'$structural','mouthO'),0),d.g('eyes',[d.e(-10,2,6.6,8.5,'$white'),d.e(12,2,6.6,8.5,'$white'),d.g('pupils',[d.c(-8,3,2.9,'$structural'),d.c(14,3,2.9,'$structural')]),d.p('M-17 -11 L-5 -13 M7 -13 L20 -10','none','$structural',2,'brows')]),alpha(d.e(-18,12,5,2.5,'$coral'),.4),alpha(d.e(20,12,5,2.5,'$coral'),.4)];
 const body=[d.e(3,7,54,10,'$shadow','shadow'),d.g('legL',[d.p('M-22 -83 L-29 -14 L-6 -14 L3 -86 Z','$trouser'),d.p('M-31 -16 L-7 -16 L-5 -2 Q-24 4 -46 -2 L-45 -10Z','$structural')]),d.g('legR',[d.p('M7 -84 L13 -13 L37 -13 L30 -85 Z','$trouser'),d.p('M13 -15 L37 -15 L48 -6 L48 1 L13 1Z','$structural')]),d.g('armL',[d.p('M-34 -157 Q-46 -132 -47 -107','none',coat,20),d.c(-46,-97,11,'$skin')]),d.p('M-32 -176 Q0 -188 32 -176 L45 -75 Q-2 -58 -44 -75 Z',coat),d.p('M-25 -157 L-29 -81 L-7 -77 L-7 -169 Z','$coatShade'),d.p('M-8 -174 L-2 -72','none','$structural',1.4),d.r(8,-124,20,19,'$coatShade',3),d.c(3,-157,2,'$gold'),d.c(3,-140,2,'$gold'),d.g('armR',[d.p('M32 -156 Q48 -143 52 -117','none',coat,20),d.c(53,-108,11,'$skin')]),d.r(-9,-197,18,24,'$skin',7),d.p('M-19 -185 L16 -185 L20 -174 L-17 -169 Z','$gold'),d.p('M11 -175 L22 -175 L27 -137 L14 -138 Z','$gold'),d.g('head',head,0,-223)];
 const n=root(id,body,{left:[-50,-112],right:[54,-109],hand:[54,-109],head:[0,-223],top:[0,-275],center:[0,-143],feet:[0,0]}, {paint:'sprite'});
 // Facial orientation, not mirrored text or an inverted transform.
 if(flipped)head.find(n=>n.id===id+'.eyes').children.find(n=>n.id===id+'.pupils').transform.x=-5;
 return styleCharacter(n,id,o);
}
function book(id,o={}){return openBookVisual(id,{color:accent(o)});}
function city(id,o={}){
 const d=new Draw(id);const ns=[d.e(0,8,190,22,'$shadow')];
 const colors=['$teal','$blue','$gold','$coral','$teal'];
 for(let i=0;i<5;i++){
  const x=(i-2)*65,h=(o.variant?[168,116,207,239,140]:[118,190,245,160,115])[i],color=colors[i];
  const b=[d.p(`M${x-26} 0 L${x-26} ${-h} L${x+22} ${-h-16} L${x+22} 0 Z`,color,'$edge',1.3),d.p(`M${x+22} ${-h-16} L${x+36} ${-h+1} L${x+36} 0 L${x+22} 0 Z`,'$buildingSide'),d.p(`M${x-26} ${-h} L${x-12} ${-h-16} L${x+22} ${-h-16} Z`,'$page')];
  for(let row=0;row<Math.floor(h/36)-1;row++)for(let col=0;col<2;col++)b.push(d.r(x-15+col*19,-h+20+row*31,8,13,i===2?'$screenInk':'$window',2));
  b.push(d.r(x-9,-27,17,27,'$structural',7));ns.push(d.g('building'+i,b));
 }
 ns.push(d.p('M-181 0 Q0 35 194 0','none','$structural',2));
 return root(id,ns,{center:[0,-117],top:[0,-250],base:[0,0],left:[-180,-70],right:[194,-70]},{paint:'sprite'});
}
function paper(id,o={}){
 const d=new Draw(id);return root(id,[d.r(-48,-130,103,136,'$shadow',8),d.p('M-54 -139 L20 -139 L49 -109 L49 0 L-54 0Z','$page','$edge',1.6),d.p('M20 -139 L20 -109 L49 -109Z','$gold'),d.r(-36,-113,24,8,accent(o),3),d.l(-36,-86,25,-86,'$pageLine',3),d.l(-36,-69,28,-69,'$pageLine',3),d.l(-36,-52,12,-52,'$pageLine',3),d.g('check',[d.c(22,-18,19,'$teal'),d.p('M12 -18 L20 -11 L34 -27','none','$white',4)]),...(o.label?[d.t(0,31,o.label,19)]:[])],{left:[-55,-70],right:[53,-70],top:[0,-141],center:[0,-70],bottom:[0,0]},{paint:'sprite'});
}
function stack(id,o={}){
 const d=new Draw(id),ns=[d.e(0,18,95,13,'$shadow')];
 for(let i=0;i<9;i++){
   const y=-i*22;ns.push(d.g('sheet'+i,[d.r(-81,y-12,167,16,'$page',3,'$edge',1.5),d.p(`M-81 ${y-12} L-59 ${y-29} L98 ${y-29} L86 ${y-12}Z`,i%3===0?'$gold':'$page','$edge',1.2),d.l(-65,y-5,62,y-5,'$pageLine',1)]));
 }
 return root(id,ns,{top:[0,-210],center:[0,-90],left:[-85,-92],right:[100,-92]},{paint:'sprite'});
}
function desk(id,o={}){
 const d=new Draw(id);return root(id,[d.e(0,17,201,17,'$shadow'),d.p('M-174 -142 L-183 0 L-162 0 L-142 -142Z','$woodDark'),d.p('M151 -142 L169 0 L190 0 L181 -142Z','$woodDark'),d.r(-194,-159,400,23,'$woodDark',7),d.p('M-194 -159 L-151 -188 L239 -188 L206 -159Z','$wood'),d.r(-10,-137,175,62,'$wood',8),d.r(53,-119,44,6,'$woodDark',3)],{top:[0,-180],center:[0,-130],left:[-190,-165],right:[226,-176]},{paint:'sprite'});
}
function door(id,o={}){
 const d=new Draw(id),color=accent(o);return root(id,[d.e(0,17,91,18,'$shadow'),d.p('M-84 0 V-214 Q-84 -300 0 -300 Q84 -300 84 -214 V0Z',color,'$edge',2),d.p('M-62 0 V-213 Q-62 -277 0 -277 Q62 -277 62 -213 V0Z','$doorInside'),d.g('leaf',[d.p('M-59 0 V-211 Q-59 -271 0 -271 Q59 -271 59 -211 V0Z','$doorLeaf','$edge',2),d.p('M-43 -206 Q-43 -248 0 -248 Q43 -248 43 -206 V-162 H-43Z','$doorPanel'),d.r(-43,-141,86,115,'$doorPanel',6),d.c(36,-142,5,'$gold')]),d.r(-92,-2,184,12,'$wood',4),...(o.label?[d.t(0,49,o.label,24)]:[])],{left:[-84,-140],right:[84,-140],top:[0,-300],center:[0,-151],handle:[35,-144]},{paint:'sprite'});
}
function shelf(id,o={}){
 const d=new Draw(id),ns=[d.r(-110,-290,220,300,'$woodDark',12),d.r(-96,-276,192,275,'$shelfBack',4)];
 for(let row=0;row<3;row++){
  const y=-7-row*88;
  for(let i=0;i<7;i++){const h=48+(i*11+row*7)%26,x=-80+i*23;ns.push(d.r(x,y-h,17,h,['$blue','$coral','$gold','$teal'][ (i+row)%4],3),d.l(x+5,y-h+9,x+11,y-h+9,'$page',1.7),d.l(x+5,y-9,x+11,y-9,'$page',1.4));}
  ns.push(d.r(-105,y,210,9,'$wood',2));
 }
 return root(id,ns,{left:[-110,-145],right:[110,-145],center:[0,-140],top:[0,-295]},{paint:'sprite'});
}
function machine(id,o={}){
 const d=new Draw(id);return root(id,[d.e(0,17,132,20,'$shadow'),d.r(-106,-220,215,220,'$blue',26,'$edge',1.5),d.r(-113,-32,229,35,'$structural',9),d.r(-87,-199,176,120,'$screenRim',17),d.r(-76,-188,153,96,'$screen',11),d.g('eyes',[d.r(-49,-153,23,30,'$screenInk',9),d.r(29,-153,23,30,'$screenInk',9),d.p('M-15 -117 Q0 -106 16 -117','none','$screenInk',4)]),d.g('screenCheck',[d.p('M-35 -139 L-8 -113 L43 -168','none','$screenInk',10)]),d.r(-72,-60,108,14,'$structural',7),d.c(65,-52,12,'$gold'),d.c(67,-54,4,'$page'),d.l(-107,-108,-133,-108,'$structural',9),d.c(-143,-108,11,'$teal'),d.l(109,-108,138,-108,'$structural',9),d.c(145,-108,11,'$coral'),d.g('antenna',[d.l(0,-219,0,-258,'$structural',4),d.c(0,-265,10,'$coral')])],{input:[-147,-108],output:[149,-108],left:[-147,-108],right:[149,-108],top:[0,-267],center:[0,-143]},{paint:'sprite'});
}
function bulb(id,o={}){
 const d=new Draw(id);return root(id,[variants(alpha(d.c(0,-78,85,'$gold'),.08),'color','night'),d.g('halo',[alpha(d.c(0,-78,67,'$gold'),.12),d.c(0,-78,49,'$gold')]),d.p('M-25 -33 Q-25 -45 -37 -62 Q-64 -110 -27 -132 Q0 -150 28 -131 Q65 -107 38 -62 Q25 -45 25 -33Z','$gold','$edge',2),d.p('M-15 -30 L-15 -80 L0 -67 L15 -80 L15 -30','none','$woodDark',3),d.r(-25,-33,50,27,'$structural',7),d.l(-20,-25,20,-25,'$pageLine',2),d.r(-15,-7,30,10,'$structural',5)],{center:[0,-79],bottom:[0,0],top:[0,-149],left:[-50,-78],right:[50,-78]},{paint:'sprite'});
}
function tree(id,o={}){
 const d=new Draw(id);return root(id,[d.e(0,8,53,11,'$shadow'),d.p('M-12 0 L-7 -170 L10 -170 L17 0Z','$woodDark'),d.p('M0 -92 L-43 -144 M5 -120 L49 -170','none','$woodDark',10),d.g('canopy',[d.c(-42,-171,48,'$teal'),d.c(8,-204,61,'$teal'),d.c(57,-172,44,'$leafLight'),d.c(9,-139,52,'$leafLight'),variants(d.p('M-55 -184 Q-35 -207 -8 -203 M7 -230 Q40 -233 46 -210 M22 -158 Q38 -168 56 -159','none','$white',3),'paper')])],{top:[0,-265],center:[0,-160],left:[-89,-174],right:[103,-174]},{paint:'sprite'});
}
function planet(id,o={}){
 const d=new Draw(id);return root(id,[d.c(0,0,87,'$coral'),d.p('M-80 -25 Q-27 -49 15 -20 T80 10 M-57 38 Q0 13 66 35','none','$planetMark',11),d.e(-26,-53,18,6,'$planetMark'),d.e(21,56,13,4,'$planetMark')],{center:[0,0],left:[-87,0],right:[87,0]},{paint:'sprite'});
}
function balance(id,o={}){
 const d=new Draw(id);return root(id,[d.e(0,11,155,18,'$shadow'),d.p('M-17 -165 H17 L28 -17 H-28Z','$wood'),d.r(-76,-18,152,21,'$woodDark',10),d.c(0,-184,16,'$gold'),d.g('beam',[d.r(-159,-190,318,13,'$woodDark',6),d.p('M-123 -176 L-166 -68 L-78 -68Z','none','$structural',2),d.p('M123 -176 L78 -68 L166 -68Z','none','$structural',2),d.p('M-170 -68 Q-122 -9 -75 -68Z','$blue'),d.p('M75 -68 Q123 -9 170 -68Z','$teal')])],{center:[0,-130],left:[-123,-185],right:[123,-185],top:[0,-200]},{paint:'sprite'});
}
function mirror(id,o={}){
 const d=new Draw(id);return root(id,[d.e(0,12,105,16,'$shadow'),d.p('M-15 -10 L-30 0 M15 -10 L30 0','none','$woodDark',10),d.p('M-95 -30 V-192 Q-95 -294 0 -294 Q95 -294 95 -192 V-30Z','$wood','$edge',2),d.p('M-77 -50 V-190 Q-77 -272 0 -272 Q77 -272 77 -190 V-50Z','$glass'),d.p('M-53 -112 L47 -220 M-43 -83 L29 -157','none','$mirrorGlint',9),d.g('reflection',[d.e(0,-177,24,31,'$reflect'),d.p('M-25 -134 Q0 -145 25 -134 L44 -61 H-43Z','$reflect')])],{center:[0,-151],left:[-95,-151],right:[95,-151],top:[0,-294]},{paint:'sprite'});
}
function plaque(id,o={}){const d=new Draw(id);return root(id,[d.r(-95,-36,190,61,'$surface',14,'$edge',1.5),d.t(0,3,o.label||'IDÉE',23,accent(o))],{center:[0,0],left:[-95,0],right:[95,0],top:[0,-36],bottom:[0,25]});}
function stamp(id,o={}){const d=new Draw(id);return root(id,[d.r(-17,-88,34,63,'$coral',10,'$edge',1.6),d.r(-40,-34,80,26,'$wood',7),d.r(-47,-9,94,13,'$structural',4)],{center:[0,-30],bottom:[0,5]},{paint:'sprite'});}
export const EMOTIONS=['neutral','happy','curious','worried','sad','angry','surprised','determined','tired','skeptical','relieved','inspired'];
export const PEOPLE=Array.from({length:24},(_,i)=>({
 id:'person-'+String(i+1).padStart(2,'0'),
 label:['Ada','Mira','Noor','Leo','Amir','Lina','Sam','Sofia','Jun','Ravi','Elena','Theo','Iris','Alex','Yara','Daniel','Ana','Niko','Lea','Omar','Eli','Maya','Ari','Sage'][i],
 skin:['#EFC7AE','#C98E6B','#885A43','#E1A582','#6A4437','#DCAF90'][i%6],
 hair:['short','bob','curls','bun','long','bald'][i%6],
 hairColor:i>=18?'#B6B9BB':['#28343C','#563A2D','#39272D','#A76B3F'][i%4],
 age:i>=18?'older':i>=12?'young':'adult',
 glasses:i%4===0,beard:[1,7,13,19].includes(i),build:[.94,1.02,1.1,1][i%4],
 coat:['$blue','$teal','$coral','$gold'][i%4],
 collar:['scarf','open','button'][i%3]
}));
function styleCharacter(n,id,o){
 const person=typeof o.identity==='string'?PEOPLE.find(p=>p.id===o.identity):null;
 const cfg={...person,...o};
 const all=new Map();const walk=list=>{for(const x of list){all.set(x.id,x);if(x.children)walk(x.children);}};walk([n]);
 const at=part=>all.get(id+'.'+part),head=at('head'),d=new Draw(id+'.detail');
 const skin=cfg.skin,hairColor=cfg.hairColor;
 for(const node of all.values())for(const [k,v] of Object.entries(node.attrs||{})){
  if(skin&&v==='$skin')node.attrs[k]=skin;
  if(skin&&v==='$skinShadow')node.attrs[k]='#624839';
  if(hairColor&&v==='$hair')node.attrs[k]=hairColor;
  if(person&&v===(o.color||'$blue'))node.attrs[k]=cfg.coat||v;
 }
 const hair=head.children.find(v=>v.type==='path'&&v.attrs.d?.startsWith('M-27 -3'));
 if(hair){const patterns={
 short:'M-27 -3 Q-35 -48 0 -46 Q34 -49 29 -5 L22 -18 Q0 -16 -15 -29 L-20 -4Z',
 bob:'M-30 19 V-22 Q-30 -53 0 -49 Q33 -50 33 -17 V23 L21 19 L21 -22 Q-3 -13 -20 -27 L-21 20Z',
 curls:'M-30 0 Q-46 -13 -29 -25 Q-43 -44 -21 -48 Q-9 -68 7 -51 Q29 -65 38 -39 Q58 -21 33 -5 L25 -22 Q10 -7 -4 -25 Q-20 -7 -21 -21 L-21 1Z',
 bun:'M-30 -1 Q-35 -45 -5 -47 Q-25 -75 1 -79 Q26 -77 16 -48 Q38 -41 31 -2 L21 -18 Q-7 -18 -20 -34 L-20 -1Z',
 long:'M-32 40 V-21 Q-33 -53 0 -49 Q34 -50 35 -15 V43 L20 37 V-22 Q4 -14 -18 -30 L-22 39Z',
 bald:'M-28 0 Q-35 -30 -19 -30 L-24 -3Z M23 -25 Q37 -22 29 2 L23 -4Z'};
 hair.attrs.d=patterns[cfg.hair]||patterns.short;
 }
 const mouth=at('mouth'),eyes=at('eyes'),brows=at('brows');const emotion=cfg.emotion||'neutral';
 const mouths={neutral:'M-8 20 Q0 23 8 20',happy:'M-11 17 Q0 34 12 17Z',curious:'M-6 22 Q0 18 7 22',worried:'M-9 24 Q0 14 9 24',sad:'M-10 27 Q0 16 10 27',angry:'M-10 23 L10 21',surprised:'M-6 18 Q0 9 6 18 Q10 30 0 30 Q-9 28 -6 18Z',determined:'M-10 23 L8 21',tired:'M-7 23 Q0 27 7 23',skeptical:'M-9 23 Q2 25 9 18',relieved:'M-9 18 Q0 28 9 18',inspired:'M-10 17 Q0 32 11 17Z'};
 mouth.attrs.d=mouths[emotion];if(['happy','surprised','inspired'].includes(emotion))mouth.attrs.fill='$structural';
 const brow={neutral:'M-17 -11 L-5 -13 M7 -13 L20 -10',happy:'M-17 -14 Q-10 -20 -4 -14 M7 -14 Q14 -20 21 -14',curious:'M-17 -16 L-5 -20 M7 -12 L20 -10',worried:'M-17 -9 L-5 -16 M7 -16 L20 -8',sad:'M-17 -8 L-5 -17 M7 -17 L20 -8',angry:'M-17 -17 L-5 -9 M7 -9 L20 -17',surprised:'M-17 -19 Q-10 -27 -4 -20 M7 -20 Q14 -27 21 -19',determined:'M-17 -15 L-5 -10 M7 -10 L20 -15',tired:'M-17 -9 L-5 -7 M7 -7 L20 -9',skeptical:'M-17 -17 L-5 -20 M7 -10 L20 -8',relieved:'M-17 -15 L-5 -14 M7 -14 L20 -15',inspired:'M-17 -17 Q-10 -22 -4 -17 M7 -17 Q14 -22 21 -17'};
 brows.attrs.d=brow[emotion];
 if(cfg.dynamicExpressions){
  mouth.opacity=0;brows.opacity=0;
  for(const state of EMOTIONS){
   head.children.push({id:id+'.expression.'+state,type:'g',attrs:{},opacity:state===emotion?1:0,children:[
    {id:id+'.expression.'+state+'.mouth',type:'path',attrs:{d:mouths[state],fill:['happy','surprised','inspired'].includes(state)?'$structural':'none',stroke:'$structural','stroke-width':2.5,'stroke-linecap':'round'}},
    {id:id+'.expression.'+state+'.brows',type:'path',attrs:{d:brow[state],fill:'none',stroke:'$structural','stroke-width':2,'stroke-linecap':'round'}}
   ]});
  }
 }

 if(['tired','skeptical','relieved'].includes(emotion)){
  head.children.push(d.p('M-17 0 L-4 0 M7 0 L20 0','none','$structural',2.2));
 }
 if(cfg.glasses)head.children.push(d.p('M-20 -4 H-3 V9 H-20Z M6 -4 H24 V9 H6Z M-3 0 H6','none','$structural',2));
 if(cfg.beard)head.children.push(d.p('M-23 12 Q-24 36 0 38 Q23 36 23 12 L16 22 Q0 35 -16 22Z',hairColor||'$hair'));
 if(cfg.age==='older')head.children.push(d.p('M-15 -24 H13 M-18 14 L-25 17 M21 14 L27 17','none','$skinShadow',1));
 if(cfg.collar==='open')n.children.push(d.p('M-15 -172 L0 -139 L16 -172 L0 -163Z','$page'));
 if(cfg.collar==='button')n.children.push(d.r(-15,-167,31,6,'$page',3));
 n.transform={...(n.transform||{}),scaleX:cfg.build||1};if(person)n.identity=person.id;n.emotion=emotion;return n;
}
const base={character,book,city,paper,stack,desk,door,shelf,machine,bulb,tree,planet,balance,mirror,plaque,stamp};
const peopleAssets=Object.fromEntries(PEOPLE.flatMap(p=>EMOTIONS.map(e=>[p.id+'-'+e,(id,o)=>character(id,{...o,identity:p.id,emotion:e})])));
export const ASSETS=Object.freeze({...base,...OBJECTS,...peopleAssets});
export const CATALOG=[
 ...Object.keys(base).map(id=>({id,label:id.replaceAll('-',' '),kind:id==='character'?'character':'rigged-object',category:'core',tags:['animated','rigged'],bounds:id==='book'?[-190,-90,380,185]:[-250,-315,500,360]})),
 ...OBJECT_META,
 ...PEOPLE.flatMap(p=>EMOTIONS.map(e=>({id:p.id+'-'+e,label:p.label+' · '+e,kind:'character-variant',category:'people',identity:p.id,emotion:e,tags:[p.age,p.hair,e],bounds:[-95,-315,190,340]})))
];
export function instantiate(object){
 const overridesPath=new URL('../../assets/library/overrides.json',import.meta.url);
 const overrides=fs.existsSync(overridesPath)?JSON.parse(fs.readFileSync(overridesPath,'utf8')):{};
 const custom=object.asset==='custom'?object.visual:overrides[object.asset];
 if(!custom&&!ASSETS[object.asset])throw new Error('Unknown asset: '+object.asset);
 let n;
 if(custom){n=structuredClone(custom);const rename=node=>{node.id=node.id.replace(/^\$asset/,object.id);for(const child of node.children||[])rename(child);};rename(n);if(n.id!==object.id)throw new Error('Custom root ID must be $asset.');}
 else n=ASSETS[object.asset](object.id,object.options||{});
 n.asset=object.asset;n.meaning=object.meaning||object.asset;
 n.transform={...n.transform,x:object.x??600,y:object.y??600,scale:object.scale??1};
 return n;
}
/** Flat color is the default; scenery is explicit and source-motivated. */
export function backdrop(kind='minimal'){
 if(kind!=='mars')return [];
 const d=new Draw('set');
 return [variants(d.c(928,168,102,'$sun'),'color','night'),
  d.p('M0 445 Q200 315 402 440 Q646 243 899 413 Q1100 335 1200 431 V760H0Z','$hillFar'),
  d.p('M0 576 Q264 473 511 563 Q947 424 1200 557 V760H0Z','$hillNear')];
}
