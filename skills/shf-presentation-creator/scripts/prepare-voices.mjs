#!/usr/bin/env node
/** Re-measure and reattach bundled demonstration lines. MP3 examples require ffprobe.
 * WAV-only lab can be processed with Node alone: node scripts/prepare-voices.mjs visual-lab */
import fs from 'node:fs';import path from 'node:path';
import {ROOT} from './lib/paths.mjs';import {attachVoice,voiceTasks} from './lib/voice.mjs';
const names=process.argv.slice(2);if(!names.length)names.push('visual-lab','mars-library','freedom-practice','governable-ai');
for(const name of names){if(!/^[a-z-]+$/.test(name))throw new Error('Invalid example name.');
 const d=JSON.parse(fs.readFileSync(path.join(ROOT,'examples',name+'.direction.json'))),receipts=JSON.parse(fs.readFileSync(path.join(ROOT,name+'.receipts.json')));
 const tasks=voiceTasks(d);fs.writeFileSync(path.join(ROOT,'examples',name+'.voice-tasks.json'),JSON.stringify(tasks,null,2));
 const result=attachVoice(d,receipts,ROOT);
 // Portable prepared directions keep original media on disk; no duplicated base64 in authoring JSON.
 for(const r of receipts.lines){const a=result.direction.assets['voice-'+r.id];delete a.data;a.path=r.file.replace('../assets/','assets/');}
 // Keep prepared files in the skill root so media paths are inside their project sandbox.
 
 
 // Ready directions are at the skill root; every media path remains inside that root.
 fs.writeFileSync(path.join(ROOT,name+'.ready.direction.json'),JSON.stringify(result.direction,null,2));
 fs.writeFileSync(path.join(ROOT,'evaluation',name+'.audio-report.json'),JSON.stringify(result.report,null,2));
 console.log(name,result.report.length,'measured lines',result.direction.durationMs,'ms');
}
