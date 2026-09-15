import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDocuments, documentContract } from './document-equivalence.mjs';

function fixture() {
  return {
    schema_name: 'DoclingDocument',
    body: { children: [{ $ref: '#/texts/0' }, { $ref: '#/tables/0' }, { $ref: '#/pictures/0' }] },
    texts: [{ label: 'text', text: 'Text repeated repeated.', prov: [{ page_no: 1 }] }],
    tables: [{ label: 'table', prov: [{ page_no: 1 }], data: { num_rows: 1, num_cols: 2, table_cells: [
      { text: 'Merged heading', start_row_offset_idx: 0, start_col_offset_idx: 0, row_span: 1, col_span: 2, column_header: true },
    ] } }],
    pictures: [{ label: 'picture', prov: [{ page_no: 2 }], image: { uri: 'data:image/png;base64,fixture' } }],
    pages: { 1: { page_no: 1 }, 2: { page_no: 2 } },
  };
}

test('ignores exporter metadata and whitespace while preserving repeated words', () => {
  const candidate = fixture();
  candidate.version = 'another-schema-revision';
  candidate.texts[0].text = ' Text  repeated\nrepeated. ';
  assert.equal(compareDocuments(fixture(), candidate).equivalent, true);
  candidate.texts[0].text = 'Text repeated.';
  assert.equal(compareDocuments(fixture(), candidate).equivalent, false);
});

test('rejects a lost merged cell or changed table header', () => {
  for (const property of ['col_span', 'column_header']) {
    const candidate = fixture();
    candidate.tables[0].data.table_cells[0][property] = property === 'col_span' ? 1 : false;
    assert.equal(compareDocuments(fixture(), candidate).equivalent, false);
  }
});

test('rejects changed reading order, page ownership, and missing image data', () => {
  const reordered = fixture();
  reordered.body.children.reverse();
  assert.equal(compareDocuments(fixture(), reordered).equivalent, false);
  const moved = fixture();
  moved.texts[0].prov[0].page_no = 2;
  assert.equal(compareDocuments(fixture(), moved).equivalent, false);
  const missing = fixture();
  delete missing.pictures[0].image;
  assert.equal(compareDocuments(fixture(), missing).equivalent, false);
});

test('rejects malformed documents and cyclic groups instead of accepting empty output', () => {
  assert.throws(() => documentContract({}), /DoclingDocument/u);
  const cyclic = fixture();
  cyclic.groups = [{ children: [{ $ref: '#/groups/0' }] }];
  cyclic.body.children = [{ $ref: '#/groups/0' }];
  assert.throws(() => documentContract(cyclic), /Repeated document reference/u);
});

test('compares captions attached to a table even when they are outside the body', () => {
  const reference = fixture();
  reference.texts.push({ text: 'Source caption', label: 'caption', prov: [{ page_no: 1 }] });
  reference.tables[0].captions = [{ $ref: '#/texts/1' }];
  const candidate = structuredClone(reference);
  candidate.texts[1].text = 'Changed caption';
  assert.equal(compareDocuments(reference, candidate).equivalent, false);
});

test('uses the HTML serializer body layer while retaining ordinary body text', () => {
  const reference = fixture();
  reference.texts.push({ text: 'Running header', label: 'page_header', content_layer: 'furniture', prov: [{ page_no: 1 }] });
  reference.body.children.unshift({ $ref: '#/texts/1' });
  assert.equal(compareDocuments(reference, fixture()).equivalent, true);
  reference.texts[1].content_layer = 'body';
  assert.equal(compareDocuments(reference, fixture()).equivalent, false);
});
