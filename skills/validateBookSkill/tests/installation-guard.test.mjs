import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openBrowser} from '../src/browser.mjs';
import {paginateDocument,repairPageShells,paginationCss} from '../src/pagination.mjs';
import {inspectLayout,checkDisplay} from '../src/layout-checks.mjs';
import {guardInstallation} from '../src/installation-guard.mjs';

test('nested covers, cumulative spacing and rejected installation preserve originals',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'guard-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const profile={width:400,height:600,margins:{top:40,right:40,bottom:40,left:40}};
  const source='<html lang="en"><head><style>section.author{padding:40px}</style></head><body data-validatebook-root><main data-reader-content><section><figure id="page_1">Cover</figure></section><section class="author"><p id="page_2">Complete narrative.</p></section></main></body></html>';
  await browser.evaluate('document.documentElement.innerHTML='+JSON.stringify(source.replace(/<html[^>]*>|<\/html>/g,'')));
  await browser.evaluate(`(${paginateDocument.toString()})({expectedPages:2})`);
  assert.equal(await browser.evaluate('document.querySelectorAll("[data-reader-content]").length'),1);
  assert.equal(await browser.evaluate('document.querySelector("[data-reader-content]").querySelectorAll(".pdf-source-page").length'),2);
  await browser.evaluate('document.head.insertAdjacentHTML("beforeend",'+JSON.stringify('<style>'+paginationCss(profile)+'</style>')+')');
  const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
  assert.equal(layout.pagination.pages[0].cover,true);
  assert.deepEqual(layout.pagination.pages[0].padding,[0,0,0,0]);
  assert(checkDisplay(layout,'en').some(f=>f.category==='page_spacing_ownership_conflict'));
  const html=await browser.evaluate('document.documentElement.outerHTML');
  const file=path.join(root,'full_content.html');await fs.writeFile(file,'original bytes');
  const result={html:html.replace('</head>','<link rel="stylesheet" data-validatebook-presentation href="validatebook-layout.css"></head>'),stylesheet:{css:paginationCss(profile)}};
  await assert.rejects(guardInstallation(browser,{file,language:'en'},result,null,profile),/page_spacing_ownership_conflict/);
  assert.equal(await fs.readFile(file,'utf8'),'original bytes');
  assert.deepEqual(await fs.readdir(root),['full_content.html']);
  // Two chapters sharing a translated page are valid. Repair only their
  // repeated box insets, preserving the page and all prose in order.
  await browser.evaluate('document.documentElement.innerHTML='+JSON.stringify('<head><style>section.chapter{padding:40px;min-height:900px}</style></head><body data-validatebook-root><section class="pdf-source-page" data-reader-page="7"><main><section class="chapter"><p>End of chapter.</p></section><section class="chapter"><h2>Next chapter</h2><p>Opening paragraph.</p></section></main></section></body>'));
  const before=await browser.evaluate('document.body.textContent');
  await browser.evaluate(`(${repairPageShells.toString()})()`);
  assert.equal(await browser.evaluate('document.body.textContent'),before);
  assert.equal(await browser.evaluate('document.querySelectorAll(".pdf-source-page").length'),1);
  assert.equal(await browser.evaluate('document.querySelector(".pdf-source-page").dataset.readerPage'),'7');
  assert.deepEqual(await browser.evaluate('[...document.querySelectorAll("section.chapter")].map(n=>getComputedStyle(n).paddingTop)'),['0px','0px']);
  // Recreate the formerly accepted first-page-only reader root.
  await browser.evaluate('document.documentElement.innerHTML='+JSON.stringify('<head></head><body lang="en"><section class="pdf-source-page" data-reader-page="1"><main data-reader-content><figure id="page_1">Cover</figure></main></section><section class="pdf-source-page" data-reader-page="2"><p id="page_2">Missing in reader</p></section></body>'));
  const broken=await browser.evaluate(`(${inspectLayout.toString()})()`);
  assert(checkDisplay(broken,'en').some(f=>f.category==='reader_root_incomplete'));
});
