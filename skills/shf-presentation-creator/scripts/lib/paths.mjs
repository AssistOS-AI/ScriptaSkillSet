import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
/** Confine local reads, including existing symlink ancestors, to an explicit base. */
export function inside(base,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\0'))throw new Error('A relative contained path is required.');
 const root=path.resolve(base),target=path.resolve(root,relative),rel=path.relative(root,target);
 if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel))throw new Error('Path escapes its source directory.');
 const actualRoot=fs.realpathSync(root);let ancestor=target;
 while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
 const actual=fs.realpathSync(ancestor),resolved=path.relative(actualRoot,actual);
 if(resolved.startsWith('..'+path.sep)||resolved==='..'||path.isAbsolute(resolved))throw new Error('Symlink escapes its source directory.');
 return target;
}
