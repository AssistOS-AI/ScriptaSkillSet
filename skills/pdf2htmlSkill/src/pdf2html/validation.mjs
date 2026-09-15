import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platform, release } from 'node:os';
import { tokens, counter, round, escapeHtml } from './common.mjs';
import { parseHtml, text } from './dom.mjs';
import { launchBrowser } from './runtime.mjs';
import { renderPage, PNG } from './raster.mjs';
export function coverage(source, output) {
  if (!source.length) return 1;
  const a = counter(source), b = counter(output);
  return [...a].reduce((sum, [token, count]) => sum + Math.min(count, b.get(token) ?? 0), 0) / source.length;
}
export const orderScore = (source, output) => source.length < 2 ? 1 : coverage(source.slice(1).map((token, i) => `${source[i]}\0${token}`), output.slice(1).map((token,i) => `${output[i]}\0${token}`));
export function segmentRanges(totalHeight, width) {
  const limit = Math.max(1, Math.min(12000, Math.floor(20000000 / width))), ranges = [];
  for (let top = 0; top < Math.max(1, totalHeight); top += limit) ranges.push([top, Math.min(limit, totalHeight - top)]);
  return ranges;
}
const finding = (severity, code, message, details = {}) => ({ severity, code, message, details });
export async function validateAssets($, htmlPath) {
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
async function browserChecks(htmlPath, previewDir, browser) {
  const findings = [], metrics = { chromium: browser.version(), viewports: {} }, samples = [];
  for (const width of [1440, 1024, 390]) {
    const height = Math.min(12000, Math.floor(20000000 / width));
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }), errors = [];
    try {
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.evaluate(async () => {
        for (const image of document.images) image.loading = 'eager';
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        await document.fonts.ready;
      });
      const result = await page.evaluate(() => ({
        documentHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
        overflowingElements: [...document.querySelectorAll('body *')].filter(element => {
          if (element.closest('.table-scroll')) return false;
          const rect = element.getBoundingClientRect();
          return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
        }).length,
      }));
      const segments = segmentRanges(result.documentHeight, width), indexes = [...new Set([0, Math.floor(segments.length/2), segments.length-1])];
      for (const [index, [top, segmentHeight]] of segments.entries()) {
        try {
          await page.evaluate(position => window.scrollTo(0,position), Math.min(top, Math.max(0, result.documentHeight-height)));
          const png = await page.screenshot({ fullPage: false });
          if (width === 1440 && indexes.includes(index)) samples.push(png);
          if (previewDir && indexes.includes(index)) await writeFile(join(previewDir, `html-${width}-segment-${String(index+1).padStart(4,'0')}.png`), png);
        } catch(error) { findings.push(finding('error', 'browser-segment-capture', `Could not capture segment ${index+1} at ${width}px.`, { top, height: segmentHeight, error: error.message })); }
      }
      Object.assign(result, { segmentCount: segments.length, segmentHeightLimit: height, sampledSegments: indexes.map(index => index+1), consoleErrors: errors });
      metrics.viewports[width] = result;
      if (result.brokenImages) findings.push(finding('error', 'browser-broken-images', `Broken images at ${width}px.`, result));
      if (result.bodyOverflow || result.overflowingElements) findings.push(finding('error', 'browser-overflow', `Content overflows at ${width}px.`, result));
      if (errors.length) findings.push(finding('error', 'browser-console', `Browser console errors at ${width}px.`, { errors }));
    } finally { await page.close(); }
  }
  return { findings, metrics, samples };
}
async function visualArtifacts(profile, samples, previewDir, browser) {
  const source = [];
  for (const number of [...new Set([1, Math.max(1, Math.floor((profile.pages+1)/2)), profile.pages])].sort((a,b) => a-b)) {
    const png = PNG.sync.write(await renderPage(profile.path, number, 120/72));
    source.push(png.toString('base64'));
    if (previewDir) await writeFile(join(previewDir, `pdf-page-${String(number).padStart(4,'0')}.png`), png);
  }
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(async ({ source, samples }) => {
      const image = async data => { const result = new Image(); result.src = `data:image/png;base64,${data}`; await result.decode(); return result; };
      const sheet = async (data, crop) => {
        const images = await Promise.all(data.map(image)), heights = images.map(item => Math.min(crop, Math.max(1, Math.round(item.height*700/item.width))));
        const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = heights.reduce((a,b) => a+b,0);
        const context = canvas.getContext('2d'); context.fillStyle='white'; context.fillRect(0,0,700,canvas.height);
        let top = 0;
        images.forEach((item,index) => { context.drawImage(item, 0, 0, item.width, heights[index]*item.width/700, 0, top, 700, heights[index]); top += heights[index]; });
        return canvas;
      };
      const left = await sheet(source,Infinity), right = await sheet(samples,1600), canvas = document.createElement('canvas');
      canvas.width=1424; canvas.height=Math.max(left.height,right.height)+40;
      const context=canvas.getContext('2d'); context.fillStyle='#e2e8f0'; context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(left,0,40); context.drawImage(right,724,40); context.fillStyle='#0f172a'; context.font='14px sans-serif'; context.fillText('PDF samples',8,24); context.fillText('Semantic HTML',732,24);
      const height=Math.min(left.height,right.height,2400), a=left.getContext('2d').getImageData(0,0,700,height).data, b=right.getContext('2d').getImageData(0,0,700,height).data;
      let squared=0; for(let index=0; index<a.length; index+=4) for(let channel=0;channel<3;channel++) squared+=(a[index+channel]-b[index+channel])**2;
      return { png:canvas.toDataURL('image/png').split(',')[1], score:Math.max(0,1-Math.sqrt(squared/(700*height*3))/255) };
    }, { source, samples:samples.map(value => value.toString('base64')) });
    if (previewDir) await writeFile(join(previewDir,'visual-comparison.png'),Buffer.from(result.png,'base64'));
    return round(result.score,4);
  } finally { await page.close(); }
}
export async function validateOutput(profile, htmlPath, { expectedTables, expectedPictures, keepQaArtifacts = false, reportDir } = {}) {
  htmlPath = resolve(htmlPath);
  const previewDir = keepQaArtifacts && reportDir ? join(reportDir,'previews') : null;
  if (reportDir) await mkdir(reportDir,{recursive:true});
  if (previewDir) await mkdir(previewDir,{recursive:true});
  const $=parseHtml(await readFile(htmlPath,'utf8')), source=tokens(profile.text), output=tokens(text($.root()[0]));
  const score=coverage(source,output), order=orderScore(source,output), findings=await validateAssets($,htmlPath);
  const anchors=$('[id]').toArray().map(node => node.attribs.id).filter(id => /^page_\d+$/.test(id)), expected=Array.from({length:profile.pages},(_,i) => `page_${i+1}`);
  const missing=expected.filter(id => !anchors.includes(id)), unexpected=anchors.filter(id => !expected.includes(id));
  if (missing.length || unexpected.length || new Set(anchors).size !== anchors.length) findings.push(finding('error','source-page-anchors','HTML page anchors do not match the source PDF pages.',{expected:expected.length,actual:anchors.length,missing,unexpected}));
  for (const [value,warning,error,code,label] of [[score,.98,.95,'text-coverage','Text coverage'],[order,.95,.90,'text-order','Text order score']]) if(value<warning) findings.push(finding(value<error?'error':'warning',code,`${label} is below ${(value<error?error:warning)*100}%.`,{score:value}));
  const tables=$('table').length, contents=$('nav.contents-list').length, images=$('img').length;
  if(expectedTables !== undefined && tables+contents !== expectedTables) findings.push(finding('error','table-count','HTML structural regions differ from Docling table output.',{expected:expectedTables,tables,normalizedContentsLists:contents}));
  if(expectedPictures !== undefined && images<expectedPictures) findings.push(finding('error','picture-count','HTML contains fewer images than Docling picture items.',{expected:expectedPictures,actual:images}));
  const browser=await launchBrowser();
  let checks,visual;
  try { checks=await browserChecks(htmlPath,previewDir,browser); visual=await visualArtifacts(profile,checks.samples,previewDir,browser); } finally {await browser.close();}
  findings.push(...checks.findings);
  const report={status:findings.some(item => item.severity==='error')?'failed':findings.length?'passed_with_warnings':'passed',metrics:{sourcePages:profile.pages,sourceTokens:source.length,htmlTokens:output.length,textCoverage:round(score,4),textOrder:round(order,4),tables,normalizedContentsLists:contents,images,sourcePageAnchors:anchors.length,externalLinks:$('a[href]').toArray().filter(node=>/^https?:\/\//.test(node.attribs.href)).length,internalPageLinks:$('a[href]').toArray().filter(node=>/^#page_\d+$/.test(node.attribs.href)).length,visualSimilarityInformational:visual,...checks.metrics},findings,environment:{node:process.versions.node,platform:`${platform()} ${release()}`}};
  if(reportDir) {
    await writeFile(join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n');
    await writeFile(join(reportDir,'report.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PDF to HTML QA</title></head><body><h1>PDF to HTML QA</h1><p>Status: ${report.status}</p>${previewDir?'<p><a href="previews/visual-comparison.png">Open visual comparison</a></p>':''}<h2>Findings</h2><ul>${findings.map(item=>`<li>${escapeHtml(item.severity+': '+item.code+': '+item.message)}</li>`).join('')}</ul><h2>Metrics</h2><pre>${escapeHtml(JSON.stringify(report.metrics,null,2))}</pre></body></html>`);
  }
  return report;
}
