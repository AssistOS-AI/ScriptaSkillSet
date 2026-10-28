import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkExistingConversion } from '../src/pdf2html/converter.mjs';
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
  assert.equal(result.count,1);assert.equal(manifest.checks.status,'passed');assert.equal(manifest.document.tables,1);assert.equal($('td[colspan="2"]').text(),'Merged heading');assert.equal($('img').length,1);
  assert.match(html,/<strong>bold<\/strong>/);assert.match(html,/<em>italic<\/em>/);assert.ok(!html.includes('PIXELS_ONLY_TOKEN'));assert.equal($('#page_1').length,1);
  assert.deepEqual(await readFile(join(root,'book.pdf')),source);assert.equal(await readFile(join(root,'notes.txt'),'utf8'),'keep');assert.ok(!(await readdir(root)).includes('manifest.json'));
  const report=JSON.parse(await readFile(manifest.checks.report,'utf8'));assert.equal(report.scope,'conversion-technical');assert.equal(report.bookValidated,false);
  const evidence=JSON.parse(await readFile(new URL('fixtures/semantic-evidence.json',import.meta.url),'utf8'));
  const browser=await launchBrowser();
  try {
    for(const width of [1440,1024,390]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.goto(pathToFileURL(manifest.artifact).href);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const geometry=await page.evaluate(()=>{
        const source=document.querySelector('.source-page').getBoundingClientRect();
        const relative=selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {x:rect.left-source.left,y:rect.top-source.top,width:rect.width};};
        return {sourceWidth:source.width,table:relative('.table-scroll'),image:relative('figure img')};
      });
      const pointsPerPixel=geometry.sourceWidth/evidence.pages[0].width_pt;
      assert.ok(Math.abs(geometry.table.x-evidence.pages[0].strokes[0].x0*pointsPerPixel)<2);
      assert.ok(Math.abs(geometry.table.y-evidence.pages[0].strokes[0].top*pointsPerPixel)<2);
      assert.ok(Math.abs(geometry.image.x-evidence.pages[0].images[0].x0*pointsPerPixel)<2);
      assert.ok(Math.abs(geometry.image.y-evidence.pages[0].images[0].top*pointsPerPixel)<2);
      const tableStyle=await page.locator('table tr:first-child th, table tr:first-child td').first().evaluate(node=>({fill:getComputedStyle(node).backgroundColor,border:getComputedStyle(node).borderTopColor}));
      assert.equal(tableStyle.fill,'rgb(211, 211, 211)');
      assert.equal(tableStyle.border,'rgb(0, 0, 0)');
      const sizes=async size=>{await page.evaluate(fontSize=>window.postMessage({type:'axiologic-reader-settings',fontSize},'*'),size);await page.waitForFunction(expected=>Math.abs(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--standalone-size'))-Number(document.querySelector('main').dataset.pdfBodySize)*expected)<.001,size);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.locator('h1,p,table,img').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));};
      const before=await sizes(1.16),after=await sizes(1.72);assert.equal(before.length,after.length);assert.ok(before.every((value,index)=>after[index]>value));
      const ratios=after.map((value,index)=>value/before[index]);assert.ok(Math.max(...ratios)-Math.min(...ratios)<.02,'Text, tables and images must scale together.');
      await page.close();
    }
  } finally {await browser.close();}
  assert.equal(manifest.bookValidated,false);
  const cli=fileURLToPath(new URL('../src/pdf2html/cli.mjs',import.meta.url));
  const checked=await promisify(execFile)(process.execPath,[cli,'check','--html',manifest.artifact],{timeout:120000});
  assert.equal(JSON.parse(checked.stdout).scope,'conversion-technical');
  assert.equal(JSON.parse(checked.stdout).bookValidated,false);
  await assert.rejects(promisify(execFile)(process.execPath,[cli,'validate','--html',manifest.artifact]),error=>error.code===1);

  assert.equal((await checkExistingConversion(manifest.artifact)).status,'passed');
  // Content loss and layout defects belong to the independent book validator.
  await writeFile(manifest.artifact,html.replace('<strong>bold</strong>',''));
  assert.equal((await checkExistingConversion(manifest.artifact)).status,'passed');
  await writeFile(manifest.artifact,html.replace('</head>','<style>strong {display:none}</style></head>'));
  assert.equal((await checkExistingConversion(manifest.artifact)).status,'passed');
  await writeFile(manifest.artifact,html);
  const imagePath=join(root,$('img').first().attr('src'));
  await rm(imagePath);
  const broken=await checkExistingConversion(manifest.artifact);
  assert.equal(broken.status,'failed');
  assert.ok(broken.findings.some(item=>item.code==='image-file-missing'));
});
