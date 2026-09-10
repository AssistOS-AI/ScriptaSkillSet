#!/usr/bin/env node
/** Cold-copy build/integration check, no prior archives or services. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {ROOT} from '../scripts/lib/paths.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shf portable test ')),copy=path.join(temp,'copied skill','shf-presentation-creator'),project=path.join(temp,'unrelated app','public','shf');
const results=[];const run=(name,args,cwd=copy)=>{const p=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:90000});results.push({name,pass:p.status===0,exitCode:p.status,log:p.stdout.slice(-1800),error:p.stderr.slice(-1800)});if(p.status!==0)throw new Error(name+' failed: '+p.stderr);};
try{
 fs.cpSync(ROOT,copy,{recursive:true,filter:src=>!src.includes(path.sep+'evaluation'+path.sep)});
 fs.mkdirSync(path.join(copy,'evaluation'),{recursive:true});
 run('cold rebuild using only copied skill',['scripts/build.mjs']);
 run('cold-copy Node test suite',['--test','tests/core.test.mjs']);
 run('player copied to unrelated project',['scripts/shf.mjs','install-player',project]);
 run('minimal presentation compiled from unrelated working directory',[path.join(copy,'scripts/shf.mjs'),'compile',path.join(copy,'examples/minimal.direction.json'),path.join(temp,'unrelated app','public','films')],path.join(temp,'unrelated app'));
 run('compiled presentation validates from unrelated working directory',[path.join(copy,'scripts/shf.mjs'),'validate',path.join(temp,'unrelated app','public','films','first-scene.shf')],path.join(temp,'unrelated app'));
 run('custom vector example compiles without library mutation',['scripts/shf.mjs','compile','examples/custom-asset.direction.json',path.join(temp,'custom-output')]);
 run('native WAV voice attacher in cold copy',['scripts/prepare-voices.mjs','visual-lab']);
 run('editorial checker example',['scripts/check-editorial.mjs','assets/templates/editorial.example.json','assets/templates/source.example.txt']);
 const a=fs.readFileSync(path.join(ROOT,'assets/player/shf-player.js')),b=fs.readFileSync(path.join(project,'shf-player.js'));
 results.push({name:'installed runtime exactly matches distribution',pass:a.equals(b),sha256:crypto.createHash('sha256').update(b).digest('hex')});
 const c=fs.readFileSync(path.join(ROOT,'examples/rendered/mars-library.shf')),d=fs.readFileSync(path.join(copy,'examples/rendered/mars-library.shf'));
 results.push({name:'cold build reproduces identical Mars archive',pass:c.equals(d)});
} finally {fs.rmSync(temp,{recursive:true,force:true});fs.writeFileSync(path.join(ROOT,'evaluation/portability-results.json'),JSON.stringify({checks:results.length,passed:results.filter(r=>r.pass).length,results},null,2));}
console.log(JSON.stringify(results,null,2));if(results.some(x=>!x.pass))process.exitCode=1;
