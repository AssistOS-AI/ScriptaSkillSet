#!/usr/bin/env node
/** Local discovery only. Does not install skills, send source material, or invoke a provider.
 * Pass real skill roots supplied by the host. A path match is a candidate, not proof of capability. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const roots=process.argv.slice(2).length?process.argv.slice(2):(process.env.SHF_SKILL_ROOTS||'').split(path.delimiter).filter(Boolean);
if(!roots.length){console.log(JSON.stringify({status:'host-discovery-required',candidates:[],next:'Use the host agent tool/skill registry. For filesystem skills, pass their existing root directories to this script.'},null,2));process.exit(0);}
const found=[],visited=new Set();
function scan(dir,depth=0){if(depth>4||!fs.existsSync(dir))return;const real=fs.realpathSync(dir);if(visited.has(real))return;visited.add(real);
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.isSymbolicLink())continue;const file=path.join(dir,ent.name);if(ent.isDirectory())scan(file,depth+1);else if(ent.name==='SKILL.md'){
  const text=fs.readFileSync(file,'utf8');if(text.length>250000)continue;const lower=text.toLowerCase(),score=[['text-to-speech',8],['text to speech',8],['tts',5],['narration',3],['voice',2],['pronunciation',2],['prosody',2],['audio',1]].reduce((v,[s,w])=>v+(lower.includes(s)?w:0),0);
  if(score>2)found.push({name:text.match(/^name:\s*(.+)$/m)?.[1]||path.basename(dir),path:file,sha256:crypto.createHash('sha256').update(text).digest('hex'),lexicalScore:score,status:'candidate-needs-capability-verification'});
 }}
}
for(const p of roots)scan(path.resolve(p));found.sort((a,b)=>b.lexicalScore-a.lexicalScore);console.log(JSON.stringify({status:'inspect-before-selecting',candidates:found},null,2));
