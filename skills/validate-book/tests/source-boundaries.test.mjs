import test from 'node:test';
import assert from 'node:assert/strict';
import {openBrowser} from '../src/browser.mjs';
import {restoreSourceLineBreaks} from '../src/source-boundaries.mjs';

test('merged ragged source lines receive PDF line breaks without changing text', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const html='<main data-validatebook-root><section class="pdf-source-page" data-source-page="326"><p class="membrane">The membrane darkened. Then the rent ledger opened.</p><p class="body">Alpha beta gamma delta epsilon zeta eta theta iota.</p></section></main>';
  await browser.evaluate('document.body.innerHTML='+JSON.stringify(html));
  const xml='<pdf2xml><page number="326" height="1263" width="894"><fontspec id="0" size="21" color="#000000"/><text top="655" left="132" width="210" font="0">The membrane darkened. </text><text top="686" left="132" width="236" font="0">Then the rent ledger opened. </text><text top="100" left="78" width="741" font="0">Alpha beta gamma delta epsilon zeta eta theta iota. </text></page></pdf2xml>';
  const changes=await browser.evaluate(`(${restoreSourceLineBreaks.toString()})(${JSON.stringify(xml)})`);
  assert.equal(changes.length,1);
  assert.equal(await browser.evaluate('document.querySelectorAll(".membrane br").length'),1);
  assert.equal(await browser.evaluate('document.querySelectorAll(".body br").length'),0);
  assert.equal(await browser.evaluate('document.querySelector(".membrane").textContent'),'The membrane darkened. Then the rent ledger opened.');
  assert.equal(changes[0].kind,'source_line_breaks');
});

test('merged blocks with different source font roles split into separate elements', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const html='<main data-validatebook-root><section class="pdf-source-page" data-source-page="9"><p class="voice">NO. The answer arrived too fast for diplomacy.</p></section></main>';
  await browser.evaluate('document.body.innerHTML='+JSON.stringify(html));
  const xml='<pdf2xml><page number="9" height="1263" width="894"><fontspec id="0" size="14" family="CourierNew" color="#000000"/><fontspec id="1" size="21" family="EBGaramond" color="#000000"/><text top="501" left="97" width="32" font="0">NO. </text><text top="522" left="132" width="338" font="1">The answer arrived too fast for diplomacy. </text></page></pdf2xml>';
  const changes=await browser.evaluate(`(${restoreSourceLineBreaks.toString()})(${JSON.stringify(xml)})`);
  assert.equal(changes.length,1);
  assert.equal(changes[0].kind,'source_font_runs');
  assert.deepEqual(await browser.evaluate('[...document.querySelectorAll(".pdf-source-page > p, .pdf-source-page > pre")].map(n=>n.textContent.trim())'),['NO.','The answer arrived too fast for diplomacy.']);
  assert.equal(await browser.evaluate('document.querySelector(".pdf-source-page > pre > code").textContent.trim()'),'NO.');
});

test('a dialogue preformatted block mixed with the system voice splits by font role', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const html='<main data-validatebook-root><section class="pdf-source-page" data-source-page="9"><pre class="mix"><code>"You do not kill civilizations," she said. NO. KILLING IS OFTEN WASTEFUL.</code></pre></section></main>';
  await browser.evaluate('document.body.innerHTML='+JSON.stringify(html));
  const xml='<pdf2xml><page number="9" height="1263" width="894"><fontspec id="0" size="21" family="AAAAAA+EBGaramond" color="#000000"/><fontspec id="1" size="14" family="LAAAAA+CourierNew" color="#000000"/><text top="100" left="132" width="600" font="0">"You do not kill civilizations," she said. </text><text top="130" left="97" width="260" font="1">NO. KILLING IS OFTEN WASTEFUL. </text></page></pdf2xml>';
  const changes=await browser.evaluate(`(${restoreSourceLineBreaks.toString()})(${JSON.stringify(xml)})`);
  assert.equal(changes.length,1);
  assert.equal(changes[0].kind,'source_font_runs');
  assert.deepEqual(await browser.evaluate('[...document.querySelectorAll(".pdf-source-page > p, .pdf-source-page > pre")].map(n=>n.tagName)'),['P','PRE']);
  assert.equal(await browser.evaluate('document.querySelector(".pdf-source-page > pre > code").textContent.trim()'),'NO. KILLING IS OFTEN WASTEFUL.');
});
