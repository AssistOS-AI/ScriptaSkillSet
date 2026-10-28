import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function normalize(text) {
  return String(text ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function resolve(document, reference) {
  if (!/^#\/(?:texts|tables|pictures|groups)\/\d+$/u.test(reference)) {
    throw new Error(`Unsupported document reference: ${reference}`);
  }
  const [, collection, index] = reference.split('/');
  const item = document[collection]?.[Number(index)];
  if (!item) throw new Error(`Missing document item: ${reference}`);
  return item;
}

export function documentContract(document) {
  if (document.schema_name !== 'DoclingDocument' || !Array.isArray(document.body?.children)) {
    throw new Error('Expected a DoclingDocument with an ordered body.');
  }
  const items = [];
  const visited = new Set();
  function visit(reference) {
    if (visited.has(reference)) throw new Error(`Repeated document reference: ${reference}`);
    visited.add(reference);
    const item = resolve(document, reference);
    // The HTML serializer exports the BODY content layer.
    if (item.content_layer && item.content_layer !== 'body') return;
    if (reference.startsWith('#/groups/')) {
      for (const child of item.children ?? []) visit(child.$ref);
      return;
    }
    const contract = {
      label: item.label,
      pages: (item.prov ?? []).map(provenance => provenance.page_no),
    };
    if (item.captions?.length) contract.captions = item.captions.map(caption => normalize(resolve(document, caption.$ref).text));
    if (item.hyperlink) contract.hyperlink = item.hyperlink;
    if (!contract.pages.length) throw new Error(`Missing page provenance: ${reference}`);
    if (reference.startsWith('#/tables/')) {
      if (!Array.isArray(item.data?.table_cells)) throw new Error(`Missing table cells: ${reference}`);
      contract.rows = item.data.num_rows;
      contract.columns = item.data.num_cols;
      contract.cells = item.data.table_cells.map(cell => ({
        text: normalize(cell.text),
        row: cell.start_row_offset_idx,
        column: cell.start_col_offset_idx,
        rowSpan: cell.row_span,
        columnSpan: cell.col_span,
        columnHeader: Boolean(cell.column_header),
        rowHeader: Boolean(cell.row_header),
      })).sort((a, b) => a.row - b.row || a.column - b.column);
    } else if (reference.startsWith('#/pictures/')) {
      contract.hasImage = Boolean(item.image?.uri);
    } else {
      contract.text = normalize(item.text);
      if (item.level !== undefined) contract.level = item.level;
    }
    items.push(contract);
    for (const child of item.children ?? []) visit(child.$ref);
  }
  for (const child of document.body.children) visit(child.$ref);
  return {
    pages: Object.values(document.pages ?? {}).map(page => page.page_no).sort((a, b) => a - b),
    items,
  };
}

export function compareDocuments(reference, candidate) {
  const expected = documentContract(reference);
  const actual = documentContract(candidate);
  const differences = [];
  function compare(left, right, path) {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) differences.push({ path: `${path}.length`, expected: left.length, actual: right.length });
      for (let index = 0; index < Math.min(left.length, right.length); index += 1) compare(left[index], right[index], `${path}[${index}]`);
    } else if (left && right && typeof left === 'object' && typeof right === 'object') {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) compare(left[key], right[key], `${path}.${key}`);
    } else differences.push({ path, expected: left ?? null, actual: right ?? null });
  }
  compare(expected, actual, 'document');
  return { equivalent: differences.length === 0, differences };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length !== 2) throw new Error('Usage: node tests/document-equivalence.mjs reference.json candidate.json');
    const documents = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
    const report = compareDocuments(...documents);
    process.stdout.write(`${JSON.stringify({ ...report, differenceCount: report.differences.length, differences: report.differences.slice(0, 25) }, null, 2)}\n`);
    process.exitCode = report.equivalent ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
