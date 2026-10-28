import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseHtml, contentText } from './dom.mjs';
import { launchBrowser } from './runtime.mjs';
import { PNG } from './raster.mjs';
const finding = (severity, code, message, details = {}) => ({ severity, code, message, details });
export async function checkAssets($, htmlPath) {
  htmlPath = await realpath(htmlPath);
  const findings = [], root = dirname(htmlPath);
  for (const [index, image] of $('img').toArray().entries()) {
    const src = image.attribs.src ?? '';
    if (!src) { findings.push(finding('error', 'image-src-missing', `Image ${index+1} has no src.`)); continue; }
    if (/^(?:https?:)?\/\//i.test(src)) { findings.push(finding('error', 'remote-image', `Image ${index+1} is not local.`, { src })); continue; }
    if (src.startsWith('data:')) continue;
    try {
      const url = new URL(src, pathToFileURL(htmlPath));
      if (url.protocol !== 'file:') throw new Error('Image must use a local file or data URL.');
      const asset = decodeURIComponent(url.pathname), rel = relative(root, asset);
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) { findings.push(finding('error', 'image-outside-output', `Image escapes the output folder: ${src}`)); continue; }
      const actual = await realpath(asset), actualRel = relative(root, actual);
      if (actualRel.startsWith('../') || actualRel === '..') { findings.push(finding('error', 'image-outside-output', `Image escapes the output folder: ${src}`)); continue; }
      if (!(await stat(actual)).isFile()) throw new Error('Image is not a file.');
      const bytes = await readFile(actual);
      if (bytes.subarray(1,4).toString() === 'PNG') PNG.sync.read(bytes);
      else if (!bytes.length) throw new Error('Empty image.');
      // Chromium decodes every image format below, including JPEG, GIF, WebP and SVG.
    } catch (error) { findings.push(finding('error', error.code === 'ENOENT' ? 'image-file-missing' : 'image-invalid', `Image asset is invalid: ${src}`, { error: error.message })); }
  }
  return findings;
}

// Technical assembly checks only. This command does not compare the book with
// its manuscript and cannot authorize publication.
export async function checkConversionOutput(htmlPath, { expectedPages, expectedTables, expectedPictures, reportDir } = {}) {
  htmlPath = await realpath(resolve(htmlPath));
  const $ = parseHtml(await readFile(htmlPath, 'utf8'));
  const findings = await checkAssets($, htmlPath);
  const sections = $('section[data-source-page]').toArray();
  if (!contentText($('body')[0]).trim() && !$('body img').length) findings.push(finding('error','empty-output','Conversion produced no document content.'));
  if (expectedPages !== undefined && (sections.length !== expectedPages || sections.some((node,index) => node.attribs.id !== 'page_'+(index+1) || node.attribs['data-source-page'] !== String(index+1)))) findings.push(finding('error','page-assembly','Generated page containers are missing or duplicated.'));
  const tables=$('table').length, contents=$('nav.contents-list').length, images=$('img').length;
  if (expectedTables !== undefined && tables+contents !== expectedTables) findings.push(finding('error','table-assembly','Serialized table regions were lost during HTML assembly.'));
  if (expectedPictures !== undefined && images !== expectedPictures) findings.push(finding('error','image-assembly','Serialized image references were lost during HTML assembly.'));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage(), errors=[];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    await page.goto(pathToFileURL(htmlPath).href,{waitUntil:'load'});
    const result = await page.evaluate(async () => {
      await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
      await document.fonts.ready;
      return {brokenImages:[...document.images].filter(image=>!image.complete||!image.naturalWidth).length,failedFonts:[...document.fonts].filter(font=>font.status==='error').length};
    });
    if(result.brokenImages) findings.push(finding('error','image-decode','A generated image cannot be decoded.',result));
    if(result.failedFonts) findings.push(finding('error','font-load','A generated font cannot be loaded.',result));
    if(errors.length) findings.push(finding('error','browser-load','The generated document has browser loading errors.',{errors}));
  } finally { await browser.close(); }
  const report={scope:'conversion-technical',bookValidated:false,status:findings.some(item=>item.severity==='error')?'failed':'passed',metrics:{pages:sections.length,tables,images},findings};
  if(reportDir) { await mkdir(reportDir,{recursive:true}); await writeFile(join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n'); }
  return report;
}
