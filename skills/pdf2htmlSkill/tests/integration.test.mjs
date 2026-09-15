import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertMany } from '../src/pdf2html/batch.mjs';
import { launchBrowser } from '../src/pdf2html/runtime.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';
test('complete in-place conversion preserves tables, emphasis, pixels and reader scaling',{skip:process.env.RUN_PDF2HTML_INTEGRATION!=='1'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'pdf2html-integration-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(new URL('fixtures/semantic.pdf',import.meta.url),join(root,'book.pdf'));
  await writeFile(join(root,'notes.txt'),'keep');
  const source=await readFile(join(root,'book.pdf'));
  const result=await convertMany([],{invocationDir:root,defaultLanguage:'en',keepQaArtifacts:true});
  const manifest=result.books[0],html=await readFile(manifest.artifact,'utf8'),$=parseHtml(html);
  assert.equal(result.count,1);assert.equal(manifest.validation.status,'passed');assert.equal(manifest.document.tables,1);assert.equal($('td[colspan="2"]').text(),'Merged heading');assert.equal($('img').length,1);
  assert.match(html,/<strong>bold<\/strong>/);assert.match(html,/<em>italic<\/em>/);assert.ok(!html.includes('PIXELS_ONLY_TOKEN'));assert.equal($('#page_1').length,1);
  assert.deepEqual(await readFile(join(root,'book.pdf')),source);assert.equal(await readFile(join(root,'notes.txt'),'utf8'),'keep');assert.ok(!(await readdir(root)).includes('manifest.json'));
  const report=JSON.parse(await readFile(manifest.validation.report,'utf8'));assert.equal(report.metrics.textCoverage,1);
  const browser=await launchBrowser();
  try {
    for(const width of [1440,1024,390]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.goto(pathToFileURL(manifest.artifact).href);
      const sizes=async size=>{await page.evaluate(fontSize=>window.postMessage({type:'axiologic-reader-settings',fontSize},'*'),size);await page.waitForFunction(expected=>getComputedStyle(document.documentElement).getPropertyValue('--standalone-size').trim()===`${expected}rem`,size);return page.locator('h1,p,th,td').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)));};
      const before=await sizes(1.16),after=await sizes(1.72);assert.equal(before.length,after.length);assert.ok(before.every((value,index)=>after[index]>value));
      await page.close();
    }
  } finally {await browser.close();}
});
