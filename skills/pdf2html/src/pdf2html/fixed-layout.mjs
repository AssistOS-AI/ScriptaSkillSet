import { alignment, blockWords, setStyle, text } from './dom.mjs';
import { median, tokens } from './common.mjs';
import { sourceTables } from './source-tables.mjs';

const bounds = words => ({
  left: Math.min(...words.map(word => word.x0)),
  right: Math.max(...words.map(word => word.x1)),
  top: Math.min(...words.map(word => word.top)),
  bottom: Math.max(...words.map(word => word.bottom)),
});

function place(node, box, page) {
  if (![box.left, box.right, box.top, box.bottom].every(Number.isFinite)) return false;
  if (box.right <= box.left || box.bottom <= box.top) return false;
  if (box.left < -1 || box.top < -1 || box.right > page.width_pt + 1 || box.bottom > page.height_pt + 1) return false;
  setStyle(node, 'position', 'absolute');
  setStyle(node, 'left', `${Math.max(0, box.left).toFixed(2)}pt`);
  setStyle(node, 'top', `${Math.max(0, box.top).toFixed(2)}pt`);
  setStyle(node, 'width', `${Math.min(page.width_pt - box.left, box.right - box.left).toFixed(2)}pt`);
  setStyle(node, 'margin', '0');
  return true;
}

function matchingTable($, element, tables, used) {
  const table = element.name === 'table' ? element : $(element).find('table').first()[0];
  if (!table) return null;
  const actual = tokens($(table).find('tr').toArray().map(row => text(row)).join(' ')).join(' ');
  const match = tables.find(item => !used.has(item) && tokens(item.cells.map(cell => cell.text).join(' ')).join(' ') === actual);
  if (match) used.add(match);
  return match;
}

function provenanceBox($, element, page) {
  const node = element.attribs['data-pdf-box'] ? element : $(element).find('[data-pdf-box]').first()[0];
  if (!node || node.attribs['data-pdf-page'] !== String(page.page_number)) return null;
  const values = node.attribs['data-pdf-box'].split(',').map(Number);
  return values.length === 4 && values.every(Number.isFinite)
    ? { left:values[0], top:values[1], right:values[2], bottom:values[3] } : null;
}

function styleTable($, element, source) {
  const table = element.name === 'table' ? element : $(element).find('table').first()[0];
  if (!table) return;
  setStyle(table, 'width', '100%');
  setStyle(table, 'height', `${(source.bottomPt - source.topPt).toFixed(2)}pt`);
  setStyle(table, 'margin', '0');
  setStyle(table, 'table-layout', 'fixed');
  const rows = $(table).find('tr').toArray();
  for (const [rowIndex, row] of rows.entries()) {
    const rowCells = source.cells.filter(cell => cell.row === rowIndex && cell.rowspan === 1);
    if (rowCells.length) setStyle(row, 'height', `${Math.max(...rowCells.map(cell => cell.heightPt)).toFixed(2)}pt`);
    let col = 0;
    for (const cell of $(row).children('th,td').toArray()) {
      const expected = source.cells.find(item => item.row === rowIndex && item.col === col);
      if (expected) {
        for (const side of ['top','right','bottom','left']) setStyle(cell, `border-${side}`, expected.borders[side]);
        setStyle(cell, 'background-color', expected.background);
        if (expected.typography?.paddingPt) setStyle(cell, 'padding', expected.typography.paddingPt.map(value => `${value.toFixed(2)}pt`).join(' '));
      }
      col += Number(cell.attribs.colspan ?? 1);
    }
  }
}

function readerScript(bodySize) {
  return `(() => {
    const main = document.querySelector('main.pdf-document');
    if (!main) return;
    const frames = [...main.querySelectorAll('.pdf-page-frame')];
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:var(--reader-font-size,var(--standalone-size,${bodySize.toFixed(2)}pt))';
    main.append(probe);
    const base = ${bodySize.toFixed(4)} * 96 / 72;
    const update = () => {
      const wanted = Number.parseFloat(getComputedStyle(probe).fontSize);
      const pageZoom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pdf-page-zoom'));
      const zoom = (Number.isFinite(wanted) && wanted > 0 ? wanted / base : 1) * (Number.isFinite(pageZoom) && pageZoom > 0 ? pageZoom : 1);
      const available = main.clientWidth;
      for (const frame of frames) {
        const page = frame.querySelector('.source-page');
        const width = Number(frame.dataset.pdfWidth) * 96 / 72;
        const height = Number(frame.dataset.pdfHeight) * 96 / 72;
        const scale = Math.min(1, available / width) * zoom;
        frame.style.width = (width * scale) + 'px';
        frame.style.height = (height * scale) + 'px';
        page.style.transform = 'scale(' + scale + ')';
      }
    };
    const schedule = () => requestAnimationFrame(update);
    new ResizeObserver(schedule).observe(main);
    const observer = new MutationObserver(schedule);
    for (let node = main; node; node = node.parentElement) observer.observe(node, { attributes:true, attributeFilter:['style','class'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('message', event => {
      if (event.data?.type !== 'axiologic-reader-settings') return;
      const pageZoom = Number(event.data.pageZoom);
      if (Number.isFinite(pageZoom) && pageZoom > 0) document.documentElement.style.setProperty('--pdf-page-zoom', String(pageZoom));
      else {
        const size = Number(event.data.fontSize);
        if (Number.isFinite(size) && size > 0) document.documentElement.style.setProperty('--standalone-size', (${bodySize.toFixed(4)} * size) + 'pt');
      }
      if (event.data.theme) document.documentElement.dataset.theme = event.data.theme;
      schedule();
    });
    update();
  })();`;
}

export function applyFixedLayout($, main, evidence) {
  $(main).attr({ 'data-reader-content':'', 'data-pdf-layout':'fixed', 'data-pdf-body-size':String(evidence.typography.body_size_pt) });
  $('body').attr('data-pdf-fidelity','fixed-layout');
  const tables = sourceTables(evidence), usedTables = new Set();
  for (const page of evidence.pages) {
    const section = $(main).find(`section[data-source-page="${page.page_number}"]`).first()[0];
    if (!section) continue;
    const mapped = alignment(page, section);
    const images = [...page.images].sort((a, b) => a.top - b.top || a.x0 - b.x0);
    let imageIndex = 0;
    for (const child of $(section).children().toArray()) {
      const table = matchingTable($, child, tables.filter(item => item.page === page.page_number), usedTables);
      let box;
      if (child.name === 'figure' && images[imageIndex]) {
        const image = images[imageIndex++];
        box = { left:image.x0, right:image.x1, top:image.top, bottom:image.bottom };
        const picture = $(child).find('img').first()[0];
        if (picture) {
          setStyle(picture, 'width', `${(image.x1 - image.x0).toFixed(2)}pt`);
          setStyle(picture, 'height', `${(image.bottom - image.top).toFixed(2)}pt`);
        }
      } else if (table) {
        box = { left:table.leftPt, right:table.leftPt + table.widthPt, top:table.topPt, bottom:table.bottomPt };
        styleTable($, child, table);
      }
      if (!box) {
        const words = blockWords(child, page, mapped);
        if (words.length) {
          const ink = bounds(words), size = median(words.map(word => word.size_pt).filter(Number.isFinite));
          box = { ...ink, right:Math.min(page.width_pt, ink.right + Math.max(2, size)), bottom:ink.bottom + Math.max(1, size * 0.25) };
        }
      }
      if (!box) box = provenanceBox($, child, page);
      if (!box || !place(child, box, page)) $(child).attr('data-pdf-position-unresolved', '');
    }
    $(section).attr({ 'data-pdf-width':String(page.width_pt), 'data-pdf-height':String(page.height_pt) });
    setStyle(section, '--pdf-reader-size', `${evidence.typography.body_size_pt.toFixed(2)}pt`);
    setStyle(section, 'font-size', 'var(--pdf-reader-size)');
    setStyle(section, 'width', `${page.width_pt.toFixed(2)}pt`);
    setStyle(section, 'height', `${page.height_pt.toFixed(2)}pt`);
    $(section).wrap(`<div class="pdf-page-frame" data-pdf-width="${page.width_pt}" data-pdf-height="${page.height_pt}" style="--pdf-page-width:${page.width_pt.toFixed(2)}pt;--pdf-page-height:${page.height_pt.toFixed(2)}pt"></div>`);
  }
  $('#pdf2html-reader-bridge').remove();
  $('body').append($('<script id="pdf2html-reader-bridge"></script>').text(readerScript(evidence.typography.body_size_pt)));
}

export const fixedStyles = `
body { max-width: min(800px, var(--pdf-page-width)); }
.pdf-page-frame { position: relative; margin: 0 auto 1.5rem; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.12); }
.pdf-page-frame .source-page { position: relative; aspect-ratio: auto; padding: 0; margin: 0; transform-origin: top left; box-shadow: none; }
.pdf-page-frame .source-page::after { content: none; }
.pdf-page-frame .source-page > * { box-sizing: border-box; }
.pdf-page-frame p, .pdf-page-frame h1, .pdf-page-frame h2, .pdf-page-frame h3, .pdf-page-frame h4, .pdf-page-frame h5, .pdf-page-frame h6 { margin: 0; }
.pdf-page-frame figure { margin: 0; }
.pdf-page-frame img { max-width: none; margin: 0; object-fit: fill; }
.pdf-page-frame .table-scroll { max-width: none; overflow: visible; }
.pdf-page-frame table { margin: 0; }
.pdf-page-frame :is(h1,h2,h3,h4,h5,h6,p,li,td,th,caption,figcaption) { overflow-wrap: normal; }
@media print {
  .pdf-page-frame { width: var(--pdf-page-width) !important; height: var(--pdf-page-height) !important; margin: 0; box-shadow: none; break-after: page; }
  .pdf-page-frame .source-page { transform: none !important; }
}
`;
