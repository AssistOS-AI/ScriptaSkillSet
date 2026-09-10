import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './paths.mjs';
export function runtime(){return ['shf-core.js','themes.js','fonts.js','shf-player.js'].map(f=>fs.readFileSync(path.join(ROOT,'runtime',f),'utf8')).join('\n');}
export function standalone(films){
 return fs.readFileSync(path.join(ROOT,'assets','preview-template.html'),'utf8').replace('__RUNTIME__',()=>runtime().replace(/<\/script/gi,'<\\/script')).replace('__FILMS__',()=>JSON.stringify(films).replace(/</g,'\\u003c'));
}
