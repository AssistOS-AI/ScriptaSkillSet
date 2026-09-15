import { pathToFileURL } from 'node:url';
import { inspectLayout } from './layout-checks.mjs';

export async function navigate(browser, file) {
  const url = pathToFileURL(file).href;
  await browser.send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`)) break;
    if (i === 99) throw Error('Document loading timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await browser.evaluate('Array.from(document.images, image => image.loading = "eager")');
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate('document.fonts.status === "loaded" && Array.from(document.images).every(image => image.complete)')) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Font/image loading did not finish; cannot certify display');
}

export async function measure(browser, file, presentation = null) {
  await navigate(browser, file);
  if(presentation?.importedArticle){
    await browser.evaluate(`(${importReaderArticle.toString()})(${JSON.stringify(presentation.importedArticle)})`);
    for(let i=0;i<100;i++){
      if(await browser.evaluate('Array.from(document.querySelectorAll("link[rel=stylesheet]")).every(n=>n.sheet) && document.fonts.status === "loaded"'))break;
      if(i===99)throw Error('Imported reader styles did not load');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  if(presentation?.standaloneSizeRem)await browser.evaluate(`document.documentElement.style.setProperty("--standalone-size", ${JSON.stringify(presentation.standaloneSizeRem+"rem")})`);
  const layouts = [], fonts = [];
  await browser.send('DOM.enable'); await browser.send('CSS.enable');
  const root = await browser.send('DOM.getDocument');
  for (const width of [1440, 1024, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    const d = await browser.evaluate(`(${inspectLayout.toString()})()`);
    layouts.push(d);
    // Every nonempty text block at each viewport; no screenshots or LLM batches.
    for (const record of d.records.filter(r => r.text && r.tag !== 'table' && r.tag !== 'img')) {
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.root.nodeId, selector: record.selector });
      if (!nodeId) continue;
      const result = await browser.send('CSS.getPlatformFontsForNode', { nodeId });
      // CDP does not traverse descendant flex formatting contexts. Inspect the
      // actual descendants before declaring a visible contents entry unrendered.
      if(!result.fonts.some(font=>font.glyphCount>0)){
        const descendants=await browser.send('DOM.querySelectorAll',{nodeId,selector:'*'});
        for(const child of descendants.nodeIds){const measured=await browser.send('CSS.getPlatformFontsForNode',{nodeId:child});result.fonts.push(...measured.fonts);}
      }
      fonts.push({ selector: record.selector, width, fonts: result.fonts });
    }
  }
  return { ...layouts[0], layouts, platformFonts: fonts, scriptsDisabled: true, remoteResourcesBlocked: true };
}

// Model the supported host DOM import contract without running host or book scripts.
export function importReaderArticle(settings) {
  const original=document.querySelector('[data-reader-content], article, main, .edition-reading')||document.body;
  const article=document.createElement('article');article.className='reader-html-content';
  article.setAttribute('data-pdf-fidelity',original.getAttribute('data-pdf-fidelity'));
  const managed=document.querySelector('link[data-validatebook-presentation]');
  const managedHref=managed?.href;
  const bookStyles=settings.generic?[...document.querySelectorAll('link[rel~="stylesheet"][href]')].map(n=>n.href).filter(href=>href.startsWith(settings.booksRoot)):[];
  if(settings.generic)article.classList.add(...original.classList);
  const clone=original.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,iframe,form,nav,header,footer').forEach(n=>n.remove());
  article.append(...clone.childNodes);
  document.querySelectorAll('style,link[rel=stylesheet]').forEach(n=>n.remove());
  const add=href=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);};
  add(settings.readerCss);
  if(settings.managed && managedHref && original.hasAttribute('data-validatebook-root')){
    article.setAttribute('data-validatebook-root','');
    if(original.hasAttribute('data-vb-style'))article.setAttribute('data-vb-style',original.getAttribute('data-vb-style'));
    if(!settings.generic)add(managedHref);
  }
  if(settings.generic)bookStyles.forEach(add);
  else if(settings.sourceCss)add(settings.sourceCss);
  document.body.removeAttribute('style');document.body.removeAttribute('class');document.body.removeAttribute('data-pdf-fidelity');document.body.removeAttribute('data-validatebook-root');document.body.removeAttribute('data-vb-style');
  document.body.replaceChildren(article);
  document.documentElement.style.setProperty('--reader-font-size',settings.defaultRem+'rem');
}

// Never accept arbitrary JavaScript or prose replacements in a repair plan.
export function applyDomRepairs(actions) {
  const text = () => { const c = document.body.cloneNode(true); c.querySelectorAll('script,style,template,noscript').forEach(n => n.remove()); return c.textContent; };
  const before = text(), changes = [];
  let stylesheet;
  for (const a of actions) {
    if (a.kind === 'consolidate_styles') {
      if(a.href!=='validatebook-layout.css')throw Error('Unexpected managed stylesheet path');
      const old=document.querySelector('link[data-validatebook-presentation]');
      const previous=new Map();
      if(old){
        if(!a.previousCss?.startsWith('/* validateBook managed presentation;'))throw Error('Existing managed CSS must be supplied from its hash-checked local file');
        const parsed=new CSSStyleSheet();parsed.replaceSync(a.previousCss);
        for(const rule of parsed.cssRules){const id=rule.selectorText?.match(/data-vb-style="([^"]+)"/);if(id&&rule.style)previous.set(id[1],rule.style.cssText);}
      }
      const nodes=[...document.querySelectorAll('[style],[data-vb-style]')];
      const signatures=new Map(),expected=[],assignments=[],inlineIds=new Map(),inlineTags=new Map();
      for(const n of nodes){
        const declaration=document.createElement('span').style;
        declaration.cssText=previous.get(n.getAttribute('data-vb-style'))||'';
        for(const key of n.style)declaration.setProperty(key,n.style.getPropertyValue(key),n.style.getPropertyPriority(key));
        const size=declaration.getPropertyValue('font-size');
        if(!size.includes('--validatebook-font-size'))declaration.setProperty('font-size',size.replace(/var\(--reader-font-size,\s*var\(--standalone-size,\s*[\d.]+px\)\)/g,'var(--validatebook-font-size, $&)'),declaration.getPropertyPriority('font-size'));
        const signature=declaration.cssText;if(!signature){n.removeAttribute('style');continue;}
        const computed=getComputedStyle(n);expected.push({node:n,values:Object.fromEntries([...declaration].map(key=>[key,computed.getPropertyValue(key)]))});
        let id=signatures.get(signature);if(!id){id='s'+(signatures.size+1);signatures.set(signature,id);}
        assignments.push([n,id]);
        if(n.getAttribute('style')){
          if(n.id&&CSS.escape(n.id)===n.id){
            const ids=inlineIds.get(signature)||[];
            if(!ids.includes(n.id))ids.push(n.id);
            inlineIds.set(signature,ids);
          }
          const tags=inlineTags.get(signature)||[];
          const tag=n.tagName.toLowerCase();
          if(!tags.includes(tag))tags.push(tag);
          inlineTags.set(signature,tags);
        }
      }
      for(const [n,id] of assignments)n.setAttribute('data-vb-style',id);
      document.body.setAttribute('data-validatebook-root','');
      const scope='[data-validatebook-root]'.repeat(8);
      const extra='[data-validatebook-root]'.repeat(12);
      if(a.importedFontRatio!==undefined&&(!Number.isFinite(a.importedFontRatio)||a.importedFontRatio<=0))throw Error('Invalid imported font unit ratio');
      const imported=a.importedFontRatio?scope+'.reader-html-content { --validatebook-font-size: calc(var(--reader-font-size) * '+a.importedFontRatio+'); }\n':'';
      const pageStyle=a.previousCss?.includes('/* validateBook source pagination */')?'/* validateBook source pagination */'+a.previousCss.split('/* validateBook source pagination */')[1]:'';
      const css='/* validateBook managed presentation; generated from verified declarations */\n'+imported+[...signatures].map(([declaration,id])=>{
        const selectors=[scope+'[data-vb-style="'+id+'"]',scope+' [data-vb-style="'+id+'"]'];
        for(const tag of inlineTags.get(declaration)||[]){
          selectors.push(extra+' '+tag+'[data-vb-style="'+id+'"]',extra+' [data-reader-page] > '+tag+'[data-vb-style="'+id+'"]');
        }
        for(const elementId of inlineIds.get(declaration)||[]){
          selectors.push(extra+'#'+elementId+'[data-vb-style="'+id+'"]',extra+' #'+elementId+'[data-vb-style="'+id+'"]');
        }
        return ':is('+selectors.join(', ')+') { '+declaration+' }';
      }).join('\n')+'\n'+pageStyle;
      const temporary=document.createElement('style');temporary.textContent=css;document.head.append(temporary);
      nodes.forEach(n=>n.removeAttribute('style'));old?.remove();
      for(const check of expected)for(const [key,value] of Object.entries(check.values)){
        const actual=getComputedStyle(check.node).getPropertyValue(key);
        const rounding=/^-?[\d.]+px$/.test(actual)&&/^-?[\d.]+px$/.test(value)&&Math.abs(parseFloat(actual)-parseFloat(value))<.001;
        if(actual!==value&&!rounding)throw Error('CSS consolidation changed computed '+key+' from '+value+' to '+actual+' on '+check.node.tagName+' '+check.node.textContent.slice(0,80));
      }
      temporary.remove();
      const link=document.createElement('link');link.rel='stylesheet';link.setAttribute('data-validatebook-presentation','');link.setAttribute('href',a.href);document.head.append(link);
      stylesheet={href:a.href,css};changes.push({kind:a.kind,before:nodes.length+' inline/managed elements',after:signatures.size+' shared CSS declaration groups; no inline style attributes'});continue;
    }
    if (a.kind === 'language_tag') { const old = document.documentElement.lang; document.documentElement.lang = a.language; changes.push({ kind: a.kind, before: old, after: a.language }); continue; }
    if (a.kind === 'stylesheet') {
      const old = document.querySelector('style[data-validatebook-layout]');
      if (old?.textContent === a.css) continue;
      const n = old || document.createElement('style'); n.setAttribute('data-validatebook-layout', ''); n.textContent = a.css; if (!old) document.head.append(n);
      changes.push({ kind: a.kind, before: old ? 'previous repair stylesheet' : '', after: a.css }); continue;
    }
    if (a.kind === 'inherit_styles') {
      const current = [...document.querySelectorAll('[data-validatebook-inherited]')].map(n => n.tagName === 'LINK' ? {href:n.getAttribute('href')} : {css:n.textContent});
      const bodyBefore=Object.fromEntries(['class','data-pdf-fidelity'].map(k=>[k,document.body.getAttribute(k)]));
      for (const name of ['class','data-pdf-fidelity']) if (a.bodyAttributes?.[name]) document.body.setAttribute(name, a.bodyAttributes[name]);
      const bodyAfter=Object.fromEntries(['class','data-pdf-fidelity'].map(k=>[k,document.body.getAttribute(k)]));
      if (JSON.stringify(current) === JSON.stringify(a.sheets) && JSON.stringify(bodyBefore) === JSON.stringify(bodyAfter)) continue;
      document.querySelectorAll('[data-validatebook-inherited]').forEach(n => n.remove());
      for (const sheet of a.sheets) { const n = document.createElement(sheet.href ? 'link' : 'style'); n.setAttribute('data-validatebook-inherited', ''); if (sheet.href) { n.rel = 'stylesheet'; n.setAttribute('href', sheet.href); } else n.textContent = sheet.css; document.head.append(n); }
      changes.push({ kind: a.kind, before: 'target text/styles retained', after: a.sheets }); continue;
    }
    const nodes = document.querySelectorAll(a.selector);
    if (nodes.length !== 1) throw Error('Repair selector must match exactly one element: ' + a.selector);
    const n = nodes[0], old = n.outerHTML;
    if (a.kind === 'tag') {
      if (!/^(p|h[1-6]|th|td|figcaption)$/.test(a.tag) || n.tagName.toLowerCase() !== a.expectedTag) throw Error('Unsafe or stale tag repair');
      const replacement = document.createElement(a.tag); for (const attr of n.attributes) replacement.setAttribute(attr.name, attr.value); while (n.firstChild) replacement.append(n.firstChild); n.replaceWith(replacement);
      changes.push({ kind: a.kind, selector: a.selector, before: old, after: replacement.outerHTML });
    } else if (a.kind === 'classes') {
      n.setAttribute('class', a.classes);
      changes.push({ kind:a.kind, selector:a.selector, before:old, after:n.outerHTML });
    } else if (a.kind === 'image_source') {
      if (n.tagName !== 'IMG' || /^(https?:|javascript:)/i.test(a.src)) throw Error('Unsafe image source repair');
      n.setAttribute('src', a.src);
      if (a.width && a.height) { n.setAttribute('width', String(a.width)); n.setAttribute('height', String(a.height)); }
      changes.push({ kind:a.kind, selector:a.selector, before:old, after:n.outerHTML });
    } else if (a.kind === 'table_headers') {
      if (n.tagName !== 'TABLE' || n.rows.length !== a.rows.length) throw Error('Stale table repair');
      for (let i=0;i<n.rows.length;i++) {
        const cells=[...n.rows[i].cells];
        if(cells.length !== a.rows[i].length) throw Error('Table cell count differs');
        for(let j=0;j<cells.length;j++) { const c=cells[j], expected=a.rows[i][j];
          if(c.colSpan !== expected.colspan || c.rowSpan !== expected.rowspan || !['th','td'].includes(expected.tag)) throw Error('Ambiguous table span');
          if(c.tagName.toLowerCase() !== expected.tag) { const replacement=document.createElement(expected.tag); for(const attr of c.attributes)replacement.setAttribute(attr.name,attr.value);while(c.firstChild)replacement.append(c.firstChild);c.replaceWith(replacement); }
        }
      }
      changes.push({kind:a.kind, selector:a.selector, before:old, after:n.outerHTML});
    } else if (a.kind === 'presentation') {
      const allowed = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'text-indent', 'margin-top', 'margin-bottom', 'margin-left', 'padding-left', 'border-left', 'padding', 'max-width', 'width', 'height', 'overflow-wrap', 'white-space', 'border-collapse', 'table-layout', 'word-spacing', 'letter-spacing']);
      const beforeProperties=Object.fromEntries(Object.keys(a.properties).map(key=>[key,n.style.getPropertyValue(key)]));
      for (const [key, value] of Object.entries(a.properties)) { if (!allowed.has(key) || /url\(|expression\(|[{};]/i.test(value)) throw Error('Unsupported presentation property'); n.style.setProperty(key, value); }
      changes.push({ kind: a.kind, selector: a.selector, before: beforeProperties, after: Object.fromEntries(Object.keys(a.properties).map(key=>[key,n.style.getPropertyValue(key)])) });
    } else throw Error('Unsupported repair kind: ' + a.kind);
  }
  if (text() !== before) throw Error('Repair changed text; layout-only changes must preserve prose exactly');
  const dt = document.doctype;
  const doctype = dt ? '<!DOCTYPE ' + dt.name + (dt.publicId ? ' PUBLIC "' + dt.publicId + '"' : '') + (dt.systemId ? (dt.publicId ? '' : ' SYSTEM') + ' "' + dt.systemId + '"' : '') + '>\n' : '';
  return { html: doctype + document.documentElement.outerHTML, changes, stylesheet };
}
