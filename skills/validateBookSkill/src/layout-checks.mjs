import { hash } from './storage.mjs';

export const normalizeText = value => String(value).normalize('NFKC').replace(/\u00ad/gu, '').replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
export function issue(language, category, location, detail, extra = {}) {
  return { id: hash(JSON.stringify([language, category, location, detail])).slice(0, 20), language, category, location, detail, severity: 'error', provenance: 'local_code', ...extra };
}

// Runs inside Chromium. Text is read, never evaluated as instructions.
export function inspectLayout() {
  const nodes = [...document.querySelectorAll('*')], index = new Map(nodes.map((n, i) => [n, i]));
  const selector = n => {
    if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) return '#' + CSS.escape(n.id);
    const parts = [];
    for (let e = n; e; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + ':nth-child(' + (e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1) + ')');
    return parts.join(' > ');
  };
  function measureWordSpacing(node,style) {
    if(!node.matches('p,li,blockquote,figcaption'))return null;
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),words=[];let leaf;
    while((leaf=walker.nextNode())&&words.length<48){for(const match of leaf.textContent.matchAll(/\S+/gu)){const range=document.createRange();range.setStart(leaf,match.index);range.setEnd(leaf,match.index+match[0].length);const r=range.getBoundingClientRect();if(r.width)words.push({left:r.left,right:r.right,top:r.top});if(words.length>=48)break;}}
    const gaps=[];for(let i=1;i<words.length;i++)if(Math.abs(words[i].top-words[i-1].top)<2){const gap=words[i].left-words[i-1].right;if(gap>0)gaps.push(gap);}
    const sorted=gaps.sort((a,b)=>a-b),size=parseFloat(style.fontSize);const p90=sorted[Math.floor(sorted.length*.9)]||0;
    const tops=[...new Set(words.map(w=>Math.round(w.top*10)/10))].sort((a,b)=>a-b),advances=tops.slice(1).map((top,i)=>top-tops[i]).filter(delta=>delta>size*.8&&delta<size*3).sort((a,b)=>a-b);
    return {lineAdvancePx:advances.length?advances[Math.floor(advances.length/2)]:null,sampleWords:words.length,gapP90Px:p90,gapP90Em:p90/size,excessive:sorted.length>=3&&p90/size>.65&&style.textAlign==='justify'};
  }
  const records = [], ids = new Set(), duplicates = [], links = [], resources = [], localLinks = [];
  let chapter = 'front';
  for (const n of nodes) {
    if (n.id) { if (ids.has(n.id)) duplicates.push(n.id); ids.add(n.id); }
    if (n.closest('script,style,template,noscript,head')) continue;
    if (/^H[1-6]$/.test(n.tagName) && n.id) chapter = n.id;
    if (!n.matches('p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,table,th,td,img')) continue;
    const s = getComputedStyle(n), r = n.getBoundingClientRect(), text = (n.textContent || '').trim();
    const range = document.createRange(); range.selectNodeContents(n);
    const textRects = [...range.getClientRects()].filter(v => v.width && v.height);
    const clipped = [...function* () { for (let e = n; e; e = e.parentElement) yield e; }()].some(e => {
      const cs = getComputedStyle(e), box = e.getBoundingClientRect();
      return /hidden|clip/.test(cs.overflowX) && textRects.some(v => v.left < box.left - 2 || v.right > box.right + 2) || /hidden|clip/.test(cs.overflowY) && textRects.some(v => v.top < box.top - 2 || v.bottom > box.bottom + 2);
    });
    records.push({ selector: selector(n), nodeIndex: index.get(n), id: n.id || null, sourceId: n.getAttribute('data-unit-id') || n.getAttribute('data-source-id'), chapter, tag: n.tagName.toLowerCase(), text, classes: n.className || '', page: n.closest('[data-source-page]')?.getAttribute('data-source-page') || null,
      hidden: Boolean(text && (s.display === 'none' || s.visibility !== 'visible' || [...function*(){for(let e=n;e;e=e.parentElement)yield e;}()].some(e=>Number(getComputedStyle(e).opacity)===0) || !textRects.length)), clipped,
      outside: (r.left < -2 || r.right > innerWidth + 2) && ![...function*(){for(let e=n;e;e=e.parentElement)yield e;}()].some(e=>{const box=e.getBoundingClientRect(),ox=getComputedStyle(e).overflowX;return /auto|scroll/.test(ox)&&box.right<=innerWidth+2&&box.left>=-2;}), font: { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, style: s.fontStyle },
      bounds: {left:r.left,right:r.right,top:r.top,bottom:r.bottom}, ancestors:[...function*(){for(let e=n.parentElement;e;e=e.parentElement)yield index.get(e);}()],
      style: { marginTop:parseFloat(s.marginTop), lineHeight: s.lineHeight, textAlign: s.textAlign, textIndent: s.textIndent, marginBottom:parseFloat(s.marginBottom), wordSpacing:s.wordSpacing, letterSpacing:s.letterSpacing, color:s.color },
      displayGroup:n.getAttribute('data-source-display-group'),displayLines:n.querySelectorAll('br').length+1,
      ...(n.hasAttribute('data-source-display-group')?{displayAvailableWidth:n.parentElement.clientWidth-parseFloat(getComputedStyle(n.parentElement).paddingLeft)-parseFloat(getComputedStyle(n.parentElement).paddingRight),displayRule:{width:parseFloat(s.borderBottomWidth),color:s.borderBottomColor}}:{}),
      roleContext:[...function*(){for(let e=n.parentElement;e;e=e.parentElement)if(e.matches('section,article,main')&&e.className&&!e.classList.contains('pdf-source-page')&&!e.classList.contains('reader-html-content'))yield e.className;}()].join('/'),
      pageWidth:n.closest('.pdf-source-page')?.getBoundingClientRect().width||null,
      pageScale:parseFloat(s.getPropertyValue('--validatebook-page-scale'))||1,
      spacing: measureWordSpacing(n,s),
      decoration: { width:parseFloat(s.borderLeftWidth), style:s.borderLeftStyle, color:s.borderLeftColor, padding:parseFloat(s.paddingLeft), margin:parseFloat(s.marginLeft), indent:parseFloat(s.textIndent) },
      ...(n.tagName === 'TABLE' ? { rows: [...n.rows].map(row => [...row.cells].map(c => ({ tag: c.tagName.toLowerCase(), colspan: c.colSpan, rowspan: c.rowSpan }))) } : {}),
      ...(n.tagName === 'TABLE' ? { cells: (()=>{
        const occupied=new Set();
        return [...n.rows].flatMap((row,r)=>{let col=0;return [...row.cells].map(c=>{
          while(occupied.has(r+','+col))col++;
          const start=col;for(let y=r;y<r+c.rowSpan;y++)for(let x=col;x<col+c.colSpan;x++)occupied.add(y+','+x);col+=c.colSpan;
          const s=getComputedStyle(c),box=c.getBoundingClientRect();
          return {selector:selector(c),row:r,col:start,rowspan:c.rowSpan,colspan:c.colSpan,text:c.textContent,width:box.width,verticalAlign:s.verticalAlign,
            background:s.backgroundColor,color:s.color,font:{family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,style:s.fontStyle},lineHeight:s.lineHeight,textAlign:s.textAlign,indent:parseFloat(s.textIndent),padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].map(parseFloat),
            borders:Object.fromEntries(['Top','Right','Bottom','Left'].map(side=>[side.toLowerCase(),{width:parseFloat(s['border'+side+'Width']),style:s['border'+side+'Style'],color:s['border'+side+'Color']}]))};
        });});
      })() } : {}),
      ...(n.tagName === 'IMG' ? { src: n.getAttribute('src'), broken: !n.complete || !n.naturalWidth, naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight,
        imageRole:n.closest('figure')?.id==='page_1'?'cover':n.closest('figure[id]')?.id&&!/^page_\d+$/.test(n.closest('figure[id]').id)?'figure:'+n.closest('figure[id]').id:null,
        imageBox:{parentWidth:n.parentElement.getBoundingClientRect().width,objectFit:s.objectFit,objectPosition:s.objectPosition,display:s.display,borderRadius:s.borderRadius,border:s.border,boxSizing:s.boxSizing,padding:s.padding,margin:s.margin}
      } : {}) });
  }
  for (const n of document.querySelectorAll('a[href]')) {
    const href = n.getAttribute('href');
    if(n.href.startsWith('file:') && !href.startsWith('#'))localLinks.push(n.href);
    if (href.startsWith('#') && href.length > 1) { let id; try { id = decodeURIComponent(href.slice(1)); } catch { id = null; } if (!id || !document.getElementById(id)) links.push(href); }
  }
  for (const n of document.querySelectorAll('[src],link[rel="stylesheet"]')) resources.push({ tag: n.tagName.toLowerCase(), url: n.src || n.href });
  const bodyText = document.body?.textContent || '';
  const pageAnchors=[...document.querySelectorAll('[id]')].filter(n=>/^page_\d+$/.test(n.id));
  const pagination={anchors:pageAnchors.length,pages:[...document.querySelectorAll('section.pdf-source-page[data-reader-page]')].map(n=>{const r=n.getBoundingClientRect();const style=getComputedStyle(n);return {number:Number(n.getAttribute('data-reader-page')),top:r.top,bottom:r.bottom,width:r.width,height:r.height,padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft].map(parseFloat),cover:!!n.querySelector(':scope > figure#page_1')};}),misplacedAnchors:pageAnchors.filter(n=>n.closest('section.pdf-source-page')&&Number(n.id.slice(5))!==Number(n.closest('section.pdf-source-page').getAttribute('data-reader-page'))).map(n=>n.id)};
  // Inspect the entire container chain, not just the generated page box.
  // Author spacing is not reset speculatively: conflicting ownership blocks
  // installation until a source-supported handler can resolve it.
  for(const page of pagination.pages){
    const node=document.querySelector('section.pdf-source-page[data-reader-page="'+page.number+'"]');
    page.cover=!!node.querySelector('figure#page_1');
    page.nestedSpacing=[...node.querySelectorAll('main,article,section,div')].filter(n=>!n.matches('.pdf-table-wrap')&&n.querySelector('p,h1,h2,h3,h4,h5,h6,figure,img,table')).flatMap(n=>{
      const s=getComputedStyle(n);
      const values=['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft'].map(k=>parseFloat(s[k])||0);
      return values.some(v=>Math.abs(v)>.5)?[{selector:selector(n),values}]:[];
    });
  }
  const selected=document.querySelector('[data-reader-content], article, main, .edition-reading')||document.body;
  const readerOmittedPages=[...document.querySelectorAll('section.pdf-source-page[data-reader-page]')].filter(n=>!selected.contains(n)).map(n=>n.getAttribute('data-reader-page'));
  let readerPage;
  const article=document.querySelector('article.reader-html-content');
  if(article){
    const style=getComputedStyle(article),probe=document.createElement('div');
    probe.className='reader-html-content';
    probe.setAttribute('data-reader-host-probe','');
    for(const key of ['font-size','font-family','font-weight','font-style'])probe.style.setProperty(key,style.getPropertyValue(key));
    article.parentElement.append(probe);
    const expected=getComputedStyle(probe),actualBox=article.getBoundingClientRect(),expectedBox=probe.getBoundingClientRect();
    readerPage={actual:{width:actualBox.width,left:actualBox.left,padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft]},expected:{width:expectedBox.width,left:expectedBox.left,padding:[expected.paddingTop,expected.paddingRight,expected.paddingBottom,expected.paddingLeft]}};
    probe.remove();
  }
  return { language: document.documentElement.lang, title: document.title, records, duplicates, brokenLinks: links, resources, localLinks,
    readerPage, readerOmittedPages,
    pagination,
    loadedResources: performance.getEntriesByType('resource').map(e => e.name), fontFaces: [...document.fonts].map(f => ({ family: f.family, status: f.status })),
    text: document.body ? (() => {
      const c=document.body.cloneNode(true);c.querySelectorAll('script,style,template,noscript').forEach(n=>n.remove());
      for(const n of c.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,div,section,br')) n.after(document.createTextNode('\n'));
      return c.textContent;
    })() : bodyText,
    presentation:{contentSelector:'body',bodyFontSize:parseFloat(getComputedStyle(document.body).fontSize),rootFontSize:parseFloat(getComputedStyle(document.documentElement).fontSize),fidelity:document.body.matches('[data-pdf-fidelity], [data-validatebook-root]'),fidelityMarker:document.body.getAttribute('data-pdf-fidelity')},
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
}

export function checkDisplay(document, language) {
  const findings = [];
  if(document.readerOmittedPages?.length)findings.push(issue(language,'reader_root_incomplete','document','The host reading root omits page containers.',{pages:document.readerOmittedPages}));
  for(const page of document.pagination?.pages||[]){
    if(page.nestedSpacing?.length && (page.cover || page.padding?.some(v=>v>.5)))findings.push(issue(language,'page_spacing_ownership_conflict','page '+page.number,'Generated page padding overlaps author container spacing; automatic installation is blocked.',{containers:page.nestedSpacing}));
  }
  if(document.pagination){
    const p=document.pagination;
    if(language==='en'&&p.anchors>1&&!p.pages.length)findings.push(issue(language,'missing_page_containers','document','Page anchors exist but cover, title and subsequent pages still form continuous HTML. Use source-bound pagination.'));
    if(language==='en')for(const id of p.misplacedAnchors)findings.push(issue(language,'misplaced_page_anchor',id,'Page anchor is outside its corresponding page container.'));
    for(let i=1;i<p.pages.length;i++)if(p.pages[i].top<p.pages[i-1].bottom)findings.push(issue(language,'overlapping_pages','page '+p.pages[i].number,'Source page containers overlap.'));
  }
  if(document.readerPage){
    const {actual,expected}=document.readerPage;
    if(Math.abs(actual.width-expected.width)>.1||Math.abs(actual.left-expected.left)>.1||actual.padding.some((value,i)=>Math.abs(parseFloat(value)-parseFloat(expected.padding[i]))>.1))findings.push(issue(language,'reader_page_geometry_override','article.reader-html-content','Book styles override the host reader page width, centering or padding.',{width:document.width,actual,expected}));
  }
  if (document.language.toLowerCase() !== language.toLowerCase()) findings.push(issue(language, 'language_tag', 'html', document.language, { repair: { kind: 'language_tag', language } }));
  for (const id of document.duplicates) findings.push(issue(language, 'duplicate_id', id, 'Anchor is not unique; automatic renaming could break references.'));
  for (const href of document.brokenLinks) findings.push(issue(language, 'broken_anchor', href, 'Contents/reference destination does not exist.'));
  if (document.scrollWidth > document.width + 2) findings.push(issue(language, 'horizontal_overflow', 'document', `Content width ${document.scrollWidth}, viewport ${document.width}.`));
  for (const r of document.records) {
    for (const type of ['hidden', 'clipped', 'outside', 'broken']) if (r[type]) findings.push(issue(language, type === 'broken' ? 'broken_image' : type + '_content', r.selector, r.text.slice(0, 160) || r.src || r.tag, { width: document.width }));
    if(r.tag==='figcaption'&&/^figure from pdf page \d+$/i.test(normalizeText(r.text)))findings.push(issue(language,'generated_figure_caption',r.selector,'A converter placeholder is visible as book content although it does not occur in the PDF.',{repair:{kind:'remove_generated_caption',selector:r.selector,text:r.text}}));
    if(r.spacing?.excessive)findings.push(issue(language,'excessive_word_spacing',r.selector,'Justified word gaps exceed 0.65 em in sampled rendered lines.',{width:document.width,spacing:r.spacing,repair:{kind:'presentation',selector:r.selector,properties:{'text-align':'left','word-spacing':'normal','letter-spacing':'normal'}}}));
    if (/[\uFFFD\uE000-\uF8FF]/u.test(r.text)) findings.push(issue(language, 'suspect_character', r.selector, 'Replacement/private-use character. Preserve until its source mapping is established.', { excerpt: r.text.slice(0, 200) }));
  }
  const placed = document.records.filter(r=>r.text && r.tag!=='table' && r.bounds && !r.hidden).sort((a,b)=>a.bounds.top-b.bounds.top);
  for(let i=0;i<placed.length;i++) for(let j=i+1;j<placed.length && placed[j].bounds.top < placed[i].bounds.bottom-2;j++) {
    const a=placed[i],b=placed[j];
    if(a.ancestors?.includes(b.nodeIndex)||b.ancestors?.includes(a.nodeIndex))continue;
    if(Math.min(a.bounds.right,b.bounds.right)-Math.max(a.bounds.left,b.bounds.left)>2) findings.push(issue(language,'overlapping_blocks',a.selector+' / '+b.selector,'Text block boxes overlap; inspect positioned content.',{width:document.width}));
  }
  for (const f of document.fontFaces) if (f.status === 'error') findings.push(issue(language, 'font_load_failed', f.family, 'Declared font did not load.'));
  return findings;
}

export function readingPages(pages) {
  const headers=new Map();
  for(const p of pages){const first=p.text.trim().split('\n')[0].trim();if(first)headers.set(first,(headers.get(first)||0)+1);}
  return pages.map(p=>{
    const lines=p.text.trim().split('\n');
    if(headers.get(lines[0]?.trim())>=3)lines.shift();
    while(lines.length&&!lines.at(-1).trim())lines.pop();
    if(/^\d+$/.test(lines.at(-1)?.trim()||''))lines.pop();
    return {...p,text:lines.join('\n')};
  });
}

export const tokens = value => [...new Set(normalizeText(value).split(' ').filter(token => token.length >= 4))];
export const coverageRatio = (parts, haystack) => {
  if (!parts.length) return 1;
  const present = parts.filter(token => haystack.includes(token)).length;
  return present / parts.length;
};

export function compareEnglish(pages, document) {
  pages=readingPages(pages);
  const full = normalizeText(document.text), findings = [], coverage = [];
  // Contiguous normalized lines catch omissions without requiring fixed HTML/PDF paragraph boundaries.
  for (const p of pages) {
    const lines = p.text.split('\n').map(normalizeText).filter(s => s.length >= 24);
    const missing = lines.filter(line => !full.includes(line)).map(line => ({line, ratio: coverageRatio(tokens(line), full)})).filter(item => item.ratio < .7);
    coverage.push({ page: p.page, checkedLines: lines.length, unmatchedLines: missing.length, textPresent: Boolean(p.text.trim()) });
    const errors = missing.filter(item => item.ratio < .6);
    const warnings = missing.filter(item => item.ratio >= .6);
    if (errors.length) findings.push(issue('en', 'source_text_unmatched', `PDF page ${p.page}`, 'Source lines are not present in normalized HTML and cannot be restored deterministically from the current structural mapping.', { excerpts: errors.map(item => item.line) }));
    if (warnings.length) findings.push(issue('en', 'source_text_unmatched', `PDF page ${p.page}`, 'Source lines differ from HTML by a high-overlap substitution and are retained as a warning.', { excerpts: warnings.map(item => item.line), severity: 'warning' }));
    if (!p.text.trim()) coverage.at(-1).limitation = 'No extractable text: image-only/blank page requires source-asset evidence; no OCR.';
  }
  const source = normalizeText(pages.map(p => p.text).join('\n'));
  for (const r of document.records.filter(r => ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption'].includes(r.tag))) {
    const text = normalizeText(r.text);
    if (text.length >= 24 && !source.includes(text)) {
      const ratio = coverageRatio(tokens(text), source);
      if (ratio < .6) findings.push(issue('en', 'html_text_unmatched', r.selector, 'HTML passage differs from source extraction and has no deterministic source mapping.', { excerpt: r.text }));
      else if (ratio < .7) findings.push(issue('en', 'html_text_unmatched', r.selector, 'HTML passage differs from source extraction by a high-overlap substitution and is retained as a warning.', { excerpt: r.text, severity: 'warning' }));
    }
  }
  return { findings, coverage };
}

export function compareStructure(english, target, language) {
  const findings = [], matches = [];
  const key = r => r.sourceId ? 'source:' + r.sourceId : r.id && !/^page_\d+$/.test(r.id) ? 'id:' + r.id : null;
  const map = new Map();
  for (const r of target.records) { const k = key(r); if (k) map.set(k, map.has(k) ? null : r); }
  for (const r of english.records) {
    const k = key(r); if (!k) continue;
    const t = map.get(k);
    if (!t) { findings.push(issue(language, 'missing_structural_anchor', k, `English ${r.tag} has no unique target counterpart. The local checker cannot create translated text.`, {})); continue; }
    matches.push({ source: r.selector, target: t.selector, key: k });
    if (r.tag !== t.tag) findings.push(issue(language, 'structural_tag', t.selector, `${t.tag} differs from English ${r.tag}.`, { repair: { kind: 'tag', selector: t.selector, expectedTag: t.tag, tag: r.tag, sourceSelector: r.selector } }));
    if (r.rows && JSON.stringify(r.rows) !== JSON.stringify(t.rows)) {
      const spans = rows => rows?.map(row=>row.map(({colspan,rowspan})=>({colspan,rowspan})));
      const safe = JSON.stringify(spans(r.rows)) === JSON.stringify(spans(t.rows));
      findings.push(issue(language, 'table_structure', t.selector, 'Row, cell, header or span structure differs from English.', safe ? {repair:{kind:'table_headers',selector:t.selector,rows:r.rows}} : {}));
    }
    if (r.classes !== t.classes) findings.push(issue(language,'presentation_classes',t.selector,'English presentation classes differ.',{repair:{kind:'classes',selector:t.selector,classes:r.classes}}));
    if (JSON.stringify(r.font) !== JSON.stringify(t.font)) findings.push(issue(language, 'font_style_difference', t.selector, 'Computed typography differs from the English counterpart; language-specific glyph fallback may be legitimate.', { source: r.font, target: t.font, severity: 'warning' }));
  }
  const signature = d => d.records.filter(r => r.tag !== 'img').map(r => /^h\d$/.test(r.tag) ? 'heading' : r.tag);
  const a = signature(english), b = signature(target);
  if (JSON.stringify(a) !== JSON.stringify(b)) findings.push(issue(language, 'block_sequence_difference', 'document', 'Paragraph/heading/table/list sequence differs. Independently paginated translations are not rewritten to the English sequence.', { english: a, translation: b, severity: 'warning' }));
  const images = d => d.records.filter(r => r.tag === 'img').length;
  if (images(english) !== images(target)) findings.push(issue(language, 'image_count_difference', 'document', `${images(english)} English images; ${images(target)} translated images.`));
  return { findings, matches, limitation: 'Structural comparison only. Matching sequences do not prove translation meaning or detect a substituted paragraph of the same shape.' };
}

export function comparePdfFonts(inventory, rendered, sourceFonts = []) {
  const canonical = name => name.replace(/^[A-Z]{6}\+/, '').replace(/(regular|roman|bold|italic|oblique|medium|semibold|psmt|mt)/gi, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const source = [...new Set(inventory.split('\n').filter(line => /\s(?:yes|no)\s/.test(line)).map(line => line.trim().split(/\s+/)[0]))];
  const actual = [...new Set(rendered.flatMap(r => r.fonts.filter(f => f.glyphCount > 0).flatMap(f => [f.familyName, f.postScriptName].filter(Boolean))))];
  const installed = new Set(sourceFonts.filter(font => actual.some(name => name === font.css_family || canonical(name) === canonical(font.css_family) || (font.source_name && canonical(name) === canonical(font.source_name)))).map(font => canonical(font.source_name)));
  return source.filter(font => !actual.some(name => canonical(font) === canonical(name)) && !installed.has(canonical(font))).map(font => issue('en', 'source_font_family_unmatched', font, 'PDF font family was not found among actual rendered HTML fonts or the deterministic subset-name mapping.', { rendered: actual }));
}

// Poppler bbox XHTML is parsed by the already running browser, without rendering it.
export function parsePdfGeometry(xml) {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw Error('Invalid PDF bounding-box evidence');
  const number = (n, k) => Number(n.getAttribute(k));
  return [...d.getElementsByTagName('page')].map((page, i) => ({ page: i + 1, width: number(page, 'width'), height: number(page, 'height'),
    blocks: [...page.getElementsByTagName('block')].map(block => {
      const lines = [...block.getElementsByTagName('line')].map(line => ({ text: [...line.getElementsByTagName('word')].map(w => w.textContent).join(' '), left: number(line, 'xMin'), right: number(line, 'xMax'), top: number(line, 'yMin'), bottom: number(line, 'yMax') }));
      return { text: lines.map(l => l.text).join('\n'), lines, left: number(block, 'xMin'), right: number(block, 'xMax'), top: number(block, 'yMin'), bottom: number(block, 'yMax') };
    }) }));
}
export function comparePdfGeometry(pages, document) {
  const median = values => { const v = values.filter(n => n > 0).sort((a,b) => a-b); return v[Math.floor(v.length/2)] || 0; };
  const sourceBlocks = pages.flatMap(p => p.blocks.map(b => ({ ...b, page: p.page })));
  const bodyHeight = median(sourceBlocks.filter(b => b.text.length > 100).flatMap(b => b.lines.map(l => l.bottom-l.top)));
  const htmlBodySize = median(document.records.filter(r => r.tag === 'p' && r.text.length > 100).map(r => parseFloat(r.font.size)));
  // Exact source typography is measured from PDF font declarations and is the
  // authoritative comparison. Glyph bounding boxes are font-specific, so they
  // must not contradict an already verified absolute font-size mapping.
  const verifiedTypography = new Set((document.typography?.mappings || []).map(mapping => mapping.selector));
  const mappings = [], findings = [];
  for (const r of document.records.filter(r => /^(p|h[1-6]|figcaption)$/.test(r.tag) && r.displayGroup==null && normalizeText(r.text).length > 20)) {
    const matches = sourceBlocks.filter(b => normalizeText(b.text) === normalizeText(r.text));
    if (matches.length !== 1) continue;
    const b = matches[0], sourceHeight = median(b.lines.map(l => l.bottom-l.top));
    mappings.push({ selector:r.selector, page:b.page, source:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,lineHeight:sourceHeight}, html:{font:r.font,bounds:r.bounds} });
    // Heading glyph boxes vary with capitals, weight, and the PDF's line-box
    // construction. Their declared source typography is checked separately.
    if (bodyHeight && htmlBodySize && sourceHeight && !verifiedTypography.has(r.selector) && !(document.typography && /^h[1-6]$/.test(r.tag))) {
      const sourceRatio=sourceHeight/bodyHeight, htmlRatio=parseFloat(r.font.size)/htmlBodySize;
      if (Math.abs(sourceRatio-htmlRatio) > 0.4) findings.push(issue('en','source_type_scale_difference',r.selector,'The relative text size differs from its uniquely matched PDF block.',{page:b.page,sourceRatio,htmlRatio}));
    }
  }
  return { mappings, findings, limitation:'Only unique exact-text PDF block matches support geometry comparison. Relative line-box height is a typography signal, not an exact font-size identity. Unmapped blocks are not certified geometrically.' };
}
