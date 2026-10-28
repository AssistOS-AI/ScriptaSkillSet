import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument, chapterBatches } from '../src/core.mjs';
import { parse } from '../src/dom.mjs';

test('explicit copyright sections retain evidence but do not become summary chapters', () => {
  for (const marker of ['class="source-copyright"', 'role="doc-copyright"']) {
    const { units, chapters } = extractDocument(parse(`<html><body><main>
      <section ${marker}><p>Copyright. All rights reserved.</p>
      <p>${'A production note describes how this edition was prepared. '.repeat(12)}</p></section>
      <section><h2>A fictional trial</h2><p>${'The witnesses debate responsibility and law without reaching a simple answer. '.repeat(12)}</p></section>
      </main></body></html>`));
    assert.equal(chapters[0].included, false);
    assert.equal(chapters[0].exclusionReason, 'legal-or-metadata');
    assert.equal(chapters[0].unitIds.length, 2);
    assert.equal(chapters[1].included, true);
    assert.deepEqual(chapterBatches(units, chapters).map(b => b.chapterId), [chapters[1].id]);
  }
});

test('copyright mentions and partial class names do not exclude narrative sections', () => {
  const { chapters } = extractDocument(parse(`<html><body><main>
    <section class="source-copyright-dispute"><h2>The copyright dispute</h2>
    <p>${'A lawyer argues about copyright while the witness explains why her actions caused harm. '.repeat(12)}</p>
    <p>The witness returns to describe the journey and the people who helped her.</p></section>
    </main></body></html>`));
  assert.equal(chapters[0].included, true);
});
