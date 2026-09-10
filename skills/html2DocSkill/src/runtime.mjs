import { createRequire } from 'node:module';
const require = createRequire(new URL('../external/runtime/package.json',import.meta.url));
export const { Document, Packer } = require('docx');
export const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
export const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const imageTools = require('image-size');
imageTools.disableTypes(imageTools.types.filter(type => !['bmp', 'gif', 'jpg', 'png', 'tiff'].includes(type)));
export const imageSize = imageTools.imageSize;
export const html = require('htmlparser2');
export const css = require('css-tree');
export const select = require('css-select');
export const all=(node,name)=>Array.from(node.getElementsByTagName(name));
export function xml(text) {
 if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML document types and entities are unsupported.');
 const doc=new DOMParser({onError(level,message){throw new Error(`Invalid XML: ${message}`);}}).parseFromString(text,'application/xml');
 return doc;
}
export const xtext=node=>all(node,'w:t').map(n=>n.textContent).join(' ');
export const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
