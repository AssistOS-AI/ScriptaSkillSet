export function displayRowsCentered(rows, width) {
  const mid = width / 2;
  const left = Math.min(...rows.map(r => r.left));
  if (rows.every(r => r.left - left <= 18)) return false;
  const tolerance = Math.max(18, width * 0.045);
  const near = rows.filter(r => Math.abs(r.left + r.width / 2 - mid) <= tolerance).length;
  return near >= Math.max(2, rows.length - 1);
}

export function isContentsDisplayPage(rows) {
  const firstText = rows[0]?.text?.replace(/\s+/g, ' ').trim().toLowerCase();
  return firstText === 'contents' || firstText === 'table of contents';
}

export function displayPageProfiles(xml, decorations = {}) {
  const isContentsPage = rows => {
    const firstText = rows[0]?.text?.replace(/\s+/g, ' ').trim().toLowerCase();
    return firstText === 'contents' || firstText === 'table of contents';
  };
  const centeredRows = (rows, width) => {
    const mid = width / 2;
    const left = Math.min(...rows.map(r => r.left));
    if (rows.every(r => r.left - left <= 18)) return false;
    const tolerance = Math.max(18, width * 0.045);
    const near = rows.filter(r => Math.abs(r.left + r.width / 2 - mid) <= tolerance).length;
    return near >= Math.max(2, rows.length - 1);
  };
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const fonts = new Map([...doc.querySelectorAll('fontspec')].map(n => [n.getAttribute('id'), {
    size: Number(n.getAttribute('size')), family: n.getAttribute('family'), color: n.getAttribute('color')
  }]));
  const profiles = [];
  for (const page of doc.querySelectorAll('page')) {
    const width = Number(page.getAttribute('width')), height = Number(page.getAttribute('height'));
    const rows = [...page.querySelectorAll('text')].map(n => ({
      text: n.textContent.replace(/[\u200b\ufeff]/gu, '').trim(), top: Number(n.getAttribute('top')),
      left: Number(n.getAttribute('left')), width: Number(n.getAttribute('width')), height: Number(n.getAttribute('height')),
      ...fonts.get(n.getAttribute('font')), bold: !!n.querySelector('b'), italic: !!n.querySelector('i')
    })).filter(r => r.text && r.top >= height * .06 && r.top < height * .9);
    if (isContentsPage(rows)) continue;
    if (rows.length < 3 || rows.length > 14 || Math.max(...rows.map(r => r.size)) < 20) continue;
    const centered = centeredRows(rows, width);
    const left = Math.min(...rows.map(r => r.left)), right = Math.max(...rows.map(r => r.left + r.width));
    const leftAligned = rows.every(r => r.left - left <= 18);
    if (!centered && !leftAligned) continue;
    const groups = [];
    for (const row of rows) {
      const prior = groups.at(-1), last = prior?.lines.at(-1);
      if (prior && ['size','family','color','bold','italic'].every(k => prior[k] === row[k]) && row.top - last.top < row.size * 2) prior.lines.push(row);
      else groups.push({ ...row, lines: [row] });
    }
    if (groups.length < 2) continue;
    const pageNumber = Number(page.getAttribute('number'));
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      g.align = centered ? 'center' : 'left';
      g.leading = g.lines.length > 1 ? (g.lines.at(-1).top - g.top) / (g.lines.length - 1) : g.height;
      g.indent = centered ? 0 : g.lines[0].left - Math.min(...g.lines.map(r => r.left));
      g.inset = centered ? 0 : Math.min(...g.lines.map(r => r.left)) - left;
      g.gapBefore = i ? Math.max(0, g.top - (groups[i-1].top + groups[i-1].leading * groups[i-1].lines.length)) : 0;
      g.text = g.lines.map(r => r.text).join(' ');
      const end = g.top + g.leading * g.lines.length;
      const rules = (decorations.horizontalRules || []).filter(r => r.page === pageNumber && r.top >= end && r.top < (groups[i+1]?.top ?? end) && Math.abs(r.x0-left) < 3 && Math.abs(r.x1-right) < 5);
      if (rules.length === 1) { g.rule = rules[0]; g.paddingAfter = Math.max(0, g.rule.top - end); }
    }
    for (let i = 1; i < groups.length; i++) if (groups[i-1].rule) groups[i].gapBefore = Math.max(0, groups[i].gapBefore - groups[i-1].paddingAfter - groups[i-1].rule.width);
    profiles.push({ page: pageNumber, width, height, contentWidth: right-left, groups });
  }
  return profiles;
}

export function repairDisplayPages(profiles, fontMap, defaultSizePx) {
  const compact = s => s.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, '');
  const key = s => s.replace(/^[A-Z]{6}\+/, '').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman|mt)$/ig, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const resolveFamily = source => {
    if (typeof fontMap === 'string') return fontMap;
    const k = key(source);
    if (fontMap?.[k]) return fontMap[k];
    const hit = Object.entries(fontMap || {}).find(([name]) => name === k || name.startsWith(k) || k.startsWith(name));
    return hit?.[1];
  };
  const changes = [];
  if(typeof fontMap==='string'&&new Set(profiles.flatMap(p=>p.groups.map(g=>key(g.family)))).size>1)throw Error('Mixed display fonts require a family map');
  const plans = profiles.flatMap(profile => {
    const page = document.querySelector(`.pdf-source-page[data-reader-page="${profile.page}"]`);
    if (!page) throw Error(`Display page ${profile.page} requires a source page container`);
    const structuralTags = ['img','table','svg'].filter(tag => page.querySelector(tag));
    const structuralIds = [...page.querySelectorAll('[id]')].map(n => n.id).filter(id => id !== `page_${profile.page}`);
    if (structuralTags.length || structuralIds.length) {
      changes.push({kind:'source_display_page_unrepaired',page:profile.page,structuralTags,structuralIds});
      return [];
    }
    const sourceText=profile.groups.map(g => g.text).join(' ');
    const restoreText=compact(page.textContent) !== compact(sourceText);
    const flattenedLinks=[...page.querySelectorAll('a[href]')].map(link=>({text:link.textContent,href:link.getAttribute('href')}));
    const families = profile.groups.map(g => resolveFamily(g.family));
    if (families.some(f => !f)) throw Error('Display page requires a verified source family for every group');
    return [{profile,page,families,restoreText,flattenedLinks}];
  });
  for (const {profile,page,families,restoreText,flattenedLinks} of plans) {
    const before = page.innerHTML, original = page.textContent, fragment = document.createDocumentFragment();
    page.style.setProperty('container-type','inline-size');
    const maximum = Math.max(...profile.groups.map(g => g.size));
    for (let i = 0; i < profile.groups.length; i++) {
      const g = profile.groups[i], block = document.createElement(i === 0 && g.size === maximum ? 'h1' : 'p');
      if (i === 0) block.id = `page_${profile.page}`;
      block.setAttribute('data-source-display-group', String(i));
      block.setAttribute('data-source-display-width', String(profile.contentWidth || 0));
      g.lines.forEach((line,j) => { if(j) block.append(document.createTextNode(' '),document.createElement('br')); block.append(document.createTextNode(line.text)); });
      const calibrated = `calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${g.size*96/72/defaultSizePx} * var(--validatebook-page-scale, 1))`;
      const properties = {
        'font-family':families[i], 'font-size':profile.contentWidth ? `min(${calibrated}, ${g.size/profile.contentWidth*100}cqw)` : calibrated,
        'font-weight':g.bold?'700':'400', 'font-style':g.italic?'italic':'normal', 'line-height':String(g.leading/g.size),
        'text-align':g.align||'center', 'text-indent':`${(g.indent||0)/g.size}em`, 'margin-top':`${g.gapBefore/g.size}em`,
        'margin-bottom':'0', 'margin-left':`${(g.inset||0)/g.size}em`, 'padding':`0 0 ${(g.paddingAfter||0)/g.size}em`,
        'letter-spacing':'normal', 'word-spacing':'normal', 'border':'0'
      };
      if (g.color) properties.color = g.color;
      if (g.rule) properties['border-bottom'] = `${g.rule.width/g.size}em solid ${g.rule.color}`;
      for (const [name,value] of Object.entries(properties)) block.style.setProperty(name,value);
      fragment.append(block,document.createTextNode('\n'));
    }
    page.replaceChildren(fragment); page.setAttribute('data-source-display-page','');
    if (!restoreText && compact(original) !== compact(page.textContent)) throw Error('Display reconstruction changed source text');
    changes.push({kind:'source_display_page',page:profile.page,before,after:page.innerHTML,groups:profile.groups});
    if(flattenedLinks.length)changes.push({kind:'source_display_links_flattened',page:profile.page,links:flattenedLinks});
    if(restoreText)changes.push({kind:'source_display_text_restoration',page:profile.page,before:original,after:page.textContent,source:'pdf_display_groups'});
  }
  return changes;
}

export function checkDisplayPages(profiles, layouts, fontMap = {}) {
  const findings = [], key = s => s.replace(/^[A-Z]{6}\+/, '').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman|mt)$/ig, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const family = s => s.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
  const color = s => s?.startsWith('#') ? 'rgb('+s.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')+')' : s;
  for (const layout of layouts) for (const profile of profiles) {
    const blocks = layout.records.filter(r => Number(r.page) === profile.page && r.displayGroup != null);
    if (blocks.length !== profile.groups.length) { findings.push({page:profile.page,width:layout.width,detail:'Source display groups are merged, missing or unverified.'}); continue; }
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i], source = profile.groups[i];
      const pageScale=block.pageWidth&&profile.width?Math.max(1,block.pageWidth/(profile.width*96/72)):1;
      const scale = profile.contentWidth && block.displayAvailableWidth ? Math.min(96/72*pageScale,block.displayAvailableWidth/profile.contentWidth) : 96/72*pageScale;
      const size = source.size * scale;
      const actual = {size:parseFloat(block.font.size),leading:parseFloat(block.style.lineHeight),align:block.style.textAlign,weight:block.font.weight,italic:block.font.style,gap:block.style.marginTop,lines:block.displayLines};
      const expectedFamily = source.family && fontMap[key(source.family)];
      const wrongColor = source.color && color(block.style.color) !== color(source.color);
      const wrongFamily = expectedFamily && family(block.font.family) !== family(expectedFamily);
      const wrongRule = source.rule && (!block.displayRule || block.displayRule.width<=0 || Math.abs(block.displayRule.width-source.rule.width*scale)>1.01 || color(block.displayRule.color)!==color(source.rule.color));
      if (Math.abs(actual.size-size)>.15 || Math.abs(actual.leading-source.leading*scale)>.2 || actual.align!==(source.align||'center') || actual.weight!==(source.bold?'700':'400') || actual.italic!==(source.italic?'italic':'normal') || Math.abs(actual.gap-source.gapBefore*scale)>.2 || actual.lines!==source.lines.length || wrongColor || wrongFamily || wrongRule) findings.push({page:profile.page,width:layout.width,group:i,actual,expected:source,detail:'Display typography or source spacing differs from PDF.'});
    }
  }
  return findings;
}
