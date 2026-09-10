// Package original, locally vendored OFL fonts into the portable player.
import fs from 'node:fs';import path from 'node:path';import {ROOT} from './lib/paths.mjs';
const folder=path.join(ROOT,'assets/fonts');
const faces=[['SHF Display',600,'RedHatDisplay-SemiBold.otf'],['SHF Display',700,'RedHatDisplay-Bold.otf'],['SHF Text',400,'RedHatText-Regular.otf']].map(([family,weight,file])=>({family,weight,data:fs.readFileSync(path.join(folder,file)).toString('base64')}));
const license=fs.readFileSync(path.join(folder,'OFL.txt'),'utf8');
const code=`/* Original Red Hat fonts, distributed under SIL OFL 1.1.\n${license.replaceAll('*/','* /')}\n*/\n(()=>{const faces=${JSON.stringify(faces)};let pending;globalThis.SHFPresentationFonts=Object.freeze({ready(){if(!globalThis.document||!globalThis.FontFace)return Promise.resolve();return pending??=Promise.all(faces.map(async f=>{const face=new FontFace(f.family,'url(data:font/otf;base64,'+f.data+')',{weight:String(f.weight),style:'normal'});await face.load();document.fonts.add(face);}));}});})();\n`;
fs.writeFileSync(path.join(ROOT,'runtime/fonts.js'),code);
