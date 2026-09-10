import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,readJSON,atomicWrite,safeRelative} from './util.mjs';
import {auditBundle} from './render.mjs';
export async function makePreview(dir,output){
  await auditBundle(dir);
  const timeline=await readJSON(path.join(dir,'timeline.json')),audio={};
  const needed=new Set([...timeline.events.filter(e=>e.kind!=='pause').map(e=>e.asset),...timeline.beds.map(b=>b.asset)]);
  for(const id of needed)audio[id]=(await fs.readFile(safeRelative(dir,timeline.assets[id].file))).toString('base64');
  const data=JSON.stringify({timeline,audio}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const template=await fs.readFile(path.join(ROOT,'web/preview.template.html'),'utf8');
  const player=await fs.readFile(path.join(ROOT,'web/player.js'),'utf8');
  await atomicWrite(output,template.replace('__PLAYER__',()=>player).replace('__BUNDLE__',()=>data));
  return {output,assets:needed.size};
}
