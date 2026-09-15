import assert from 'node:assert/strict';

const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,caption,figcaption,th,td';

async function snapshot(content) {
  return content.locator(textSelector).evaluateAll(elements => elements
    .filter(element => element.textContent.trim() && element.getClientRects().length)
    .map(element => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        text: element.textContent,
        size: Number.parseFloat(style.fontSize),
        clipped: ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2,
      };
    }));
}

function assertScale(before, after, direction) {
  assert.equal(after.length, before.length, 'Resizing changed the number of visible text elements.');
  for (let index = 0; index < before.length; index += 1) {
    const original = before[index];
    const resized = after[index];
    assert.equal(resized.text, original.text, `Resizing changed text at element ${index}.`);
    assert.ok(direction * (resized.size - original.size) > 0, `${original.tag} at index ${index} did not resize.`);
    assert.equal(resized.clipped, false, `${original.tag} at index ${index} clips resized text.`);
  }
  const ratios = after.map((element, index) => element.size / before[index].size);
  assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.002, 'Text proportions changed during resizing.');
}

/** Exercise the actual reader through a caller-owned Playwright Page. */
export async function verifyReaderControls(page, readerUrl, { width = 390 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(readerUrl, { waitUntil: 'load' });
  const smaller = page.locator('[data-reader-text-smaller]');
  const larger = page.locator('[data-reader-text-larger]');
  await larger.waitFor({ state: 'visible' });
  await page.locator('.reader-html-content, iframe.reader-html-frame').first().waitFor({ state: 'visible' });
  let content;
  if (await page.locator('iframe.reader-html-frame').count()) {
    const frame = await page.locator('iframe.reader-html-frame').elementHandle();
    const document = await frame.contentFrame();
    content = document.locator('body');
  } else content = page.locator('.reader-html-content');
  await content.locator(textSelector).first().waitFor({ state: 'visible' });
  const original = await snapshot(content);
  assert.ok(original.length > 0, 'The reader did not display document text.');
  await larger.click();
  await content.page().waitForTimeout(100);
  const increased = await snapshot(content);
  assertScale(original, increased, 1);
  await smaller.click();
  await content.page().waitForTimeout(100);
  const restored = await snapshot(content);
  assertScale(increased, restored, -1);
  restored.forEach((element, index) => assert.ok(Math.abs(element.size - original[index].size) < 0.02, 'A− did not restore the original size.'));
  for (let index = 0; index < 10; index += 1) await larger.click();
  await content.page().waitForTimeout(100);
  const maximum = await snapshot(content);
  assertScale(original, maximum, 1);
  const assets = await content.locator('img').evaluateAll(async images => {
    const loaded = await Promise.all(images.map(async image => {
      image.loading = 'eager';
      try { await image.decode(); } catch { return false; }
      return image.complete && image.naturalWidth > 0;
    }));
    return loaded.every(Boolean);
  });
  assert.ok(assets, 'The reader contains a broken image.');
  const horizontalOverflow = await content.evaluate(element => {
    const root = element.ownerDocument.documentElement;
    return root.scrollWidth > root.clientWidth + 2;
  });
  assert.equal(horizontalOverflow, false, 'Reader resizing caused document horizontal overflow.');
  return { width, elements: original.length, originalSize: original[0].size, increasedSize: increased[0].size, maximumSize: maximum[0].size };
}
