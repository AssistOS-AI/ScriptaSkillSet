import { pathToFileURL } from 'node:url';
import { inspectLayout } from './layout-checks.mjs';

async function platformFonts(browser,nodeId) {
  try{return await browser.send('CSS.getPlatformFontsForNode',{nodeId});}
  catch(error){
    // This query is read-only and the document stays fixed. Retry a transient
    // renderer stall once; never replace missing evidence with an empty result.
    if(error.message!=='CDP timeout: CSS.getPlatformFontsForNode')throw error;
    return browser.send('CSS.getPlatformFontsForNode',{nodeId});
  }
}

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
      const result = await platformFonts(browser,nodeId);
      // CDP does not traverse descendant flex formatting contexts. Inspect the
      // actual descendants before declaring a visible contents entry unrendered.
      if(!result.fonts.some(font=>font.glyphCount>0)){
        const descendants=await browser.send('DOM.querySelectorAll',{nodeId,selector:'*'});
        for(const child of descendants.nodeIds){const measured=await platformFonts(browser,child);result.fonts.push(...measured.fonts);}
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
  const managedRoot=original.hasAttribute('data-validatebook-root')?original:null;
  if(settings.managed && managedHref && managedRoot){
    article.setAttribute('data-validatebook-root','');
    const styleSource=original.hasAttribute('data-vb-style')?original:managedRoot;
    if(styleSource.hasAttribute('data-vb-style'))article.setAttribute('data-vb-style',styleSource.getAttribute('data-vb-style'));
    if(!settings.generic)add(managedHref);
  }
  if(settings.generic)bookStyles.forEach(add);
  else if(settings.sourceCss)add(settings.sourceCss);
  document.body.removeAttribute('style');document.body.removeAttribute('class');document.body.removeAttribute('data-pdf-fidelity');document.body.removeAttribute('data-validatebook-root');document.body.removeAttribute('data-vb-style');
  document.body.replaceChildren(article);
  document.documentElement.style.setProperty('--reader-font-size',settings.defaultRem+'rem');
}

// Never accept arbitrary JavaScript or prose replacement actions.
export function applyDomRepairs(actions) {
  const text = () => { const c = document.body.cloneNode(true); c.querySelectorAll('script,style,template,noscript').forEach(n => n.remove()); return c.textContent; };
  const characterInventory=value=>[...value].filter(c=>!/\s/u.test(c)).sort().join('');
  const applyReadableTableColumns=(table,columns=[30,70])=>{
    table.style.setProperty('width','100%');
    table.style.setProperty('table-layout','fixed');
    table.style.setProperty('border-collapse','collapse');
    const rows=[...table.rows];
    if(columns.length===2&&rows[0]?.cells.length===2){
      for(const row of rows){
        if(row.cells[0])row.cells[0].style.setProperty('width',columns[0]+'%');
        if(row.cells[1])row.cells[1].style.setProperty('width',columns[1]+'%');
      }
    }
    for(const cell of table.querySelectorAll('th,td')){
      cell.style.setProperty('white-space','normal');
      cell.style.setProperty('overflow-wrap','break-word');
      cell.style.setProperty('word-break','normal');
      cell.style.setProperty('vertical-align','top');
      cell.style.setProperty('padding','0.22em 0.65em 0.42em 0');
    }
  };
  const before = text(), changes = [];
  let stylesheet,tableReflow=false,editorialReflow=false;const removedGenerated=[],removedRunning=[],removedTableHeaders=[],addedTableHeaders=[];
  for (const a of actions) {
    if (a.kind === 'consolidate_styles') {
      if(a.href!=='validatebook-layout.css')throw Error('Unexpected managed stylesheet path');
      document.body.setAttribute('data-validatebook-root','');
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
        // Persist selector strength after inline declarations become managed
        // CSS. Otherwise reruns alternately lose and restore source overrides.
        if(n.getAttribute('style') || n.hasAttribute('data-vb-style')){
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
      if(a.standaloneSizeRem!==undefined&&(!Number.isFinite(a.standaloneSizeRem)||a.standaloneSizeRem<=0))throw Error('Invalid standalone size');
      const rootFont=getComputedStyle(document.body).fontFamily;
      if(/[{};]/.test(rootFont))throw Error('Invalid root font family');
      const imported=a.importedFontRatio?scope+'.reader-html-content, .reader-html-content[data-validatebook-root] { --validatebook-font-size: calc(var(--reader-font-size) * '+a.importedFontRatio+'); font-family: '+rootFont+'; }\n':'';
      const standalone=a.standaloneSizeRem?scope+', html:has(>'+scope+'){--standalone-size:'+a.standaloneSizeRem+'rem}\n':'';
      const pageStyle=a.previousCss?.includes('/* validateBook source pagination */')?'/* validateBook source pagination */'+a.previousCss.split('/* validateBook source pagination */')[1]:a.previousCss?.includes('/* validateBook translated flow */')?'/* validateBook translated flow */'+a.previousCss.split('/* validateBook translated flow */')[1]:'';
      const css='/* validateBook managed presentation; generated from verified declarations */\n'+standalone+imported+[...signatures].map(([declaration,id])=>{
        const selectors=[scope+'[data-vb-style="'+id+'"]',scope+' [data-vb-style="'+id+'"]'];
        for(const tag of inlineTags.get(declaration)||[]){
          selectors.push(extra+' '+tag+'[data-vb-style="'+id+'"]',extra+' [data-reader-page] > '+tag+'[data-vb-style="'+id+'"]');
        }
        for(const elementId of inlineIds.get(declaration)||[]){
          selectors.push(extra+'#'+elementId+'[data-vb-style="'+id+'"]',extra+' #'+elementId+'[data-vb-style="'+id+'"]');
        }
        return ':is(#validatebook-managed-priority#validatebook-managed-priority#validatebook-managed-priority, '+selectors.join(', ')+') { '+declaration+' }';
      }).join('\n')+'\n'+pageStyle;
      const temporary=document.createElement('style');temporary.textContent=css;document.head.append(temporary);
      nodes.forEach(n=>n.removeAttribute('style'));old?.remove();
      const pxNumeric=text=>{const number=typeof text==='string'&&text.endsWith('px')?Number.parseFloat(text):NaN;return Number.isFinite(number)?number:NaN;};
      for(const check of expected)for(const [key,value] of Object.entries(check.values)){
        const actual=getComputedStyle(check.node).getPropertyValue(key);
        const actualPx=pxNumeric(actual),valuePx=pxNumeric(value);
        const comparablePx=Number.isFinite(actualPx)&&Number.isFinite(valuePx);
        const rounding=comparablePx&&Math.abs(actualPx-valuePx)<=.01;
        const descendingDefaultFallback=comparablePx&&actualPx<=valuePx;
        const textlessMediaTypography=['font-size','line-height','font-family','font-weight','font-style','font-stretch','font-variant'].includes(key)&&!check.node.textContent.trim()&&['IMG','PICTURE','SVG','VIDEO','CANVAS','SOURCE'].includes(check.node.tagName);
        if(actual!==value&&!rounding&&!descendingDefaultFallback&&!textlessMediaTypography)throw Error('CSS consolidation changed computed '+key+' from '+value+' to '+actual+' on '+check.node.tagName+' '+check.node.textContent.slice(0,80));
      }
      temporary.remove();
      const link=document.createElement('link');link.rel='stylesheet';link.setAttribute('data-validatebook-presentation','');link.setAttribute('href',a.href);document.head.append(link);
      stylesheet={href:a.href,css};changes.push({kind:a.kind,before:nodes.length+' inline/managed elements',after:signatures.size+' shared CSS declaration groups; no inline style attributes'});continue;
    }
    if (a.kind === 'source_fidelity') { if(!document.body.hasAttribute('data-pdf-fidelity')){document.body.setAttribute('data-pdf-fidelity','validatebook');changes.push({kind:a.kind,before:null,after:'validatebook'});}continue; }
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
    if(a.kind==='resegment_run'){
      if(!Array.isArray(a.runs)||!a.runs.length)throw Error('Invalid resegment run');
      const language=a.language||'en';
      const segment=text=>[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text)];
      let changed=false;
      // Process runs from last to first so position-based selectors of earlier
      // runs stay valid while later runs rebuild their paragraphs.
      for(const run of [...a.runs].reverse()){
        const counts=(run.counts||[]).filter(count=>Number.isInteger(count)&&count>0);
        if(!counts.length)continue;
        const paragraphs=(run.paragraphs||[]).map(selector=>{const matches=document.querySelectorAll(selector);return matches.length===1?matches[0]:null;});
        if(!paragraphs.length||paragraphs.some(node=>!node))continue;
        const parent=paragraphs[0].parentElement;
        if(!parent||paragraphs.some(node=>node.parentElement!==parent))continue;
        // Separate paragraphs so a missing inter-paragraph space cannot merge
        // two sentences across the boundary.
        for(let index=0;index<paragraphs.length-1;index++){
          const last=paragraphs[index].lastChild;
          if(!last||!(last.nodeType===3&&/\s$/.test(last.textContent)))paragraphs[index].append(document.createTextNode(' '));
        }
        // Record paragraph anchors by absolute start offset. The punctuation
        // edits below replace exactly one character, so offsets stay valid.
        const anchors=[];let anchorOffset=0;
        for(const paragraph of paragraphs){if(paragraph.id)anchors.push({id:paragraph.id,offset:anchorOffset});anchorOffset+=paragraph.textContent.length;}
        const textNodes=[];
        const collect=node=>{for(const child of node.childNodes){if(child.nodeType===3)textNodes.push(child);else if(child.nodeType===1)collect(child);}};
        paragraphs.forEach(collect);
        if(!textNodes.length)continue;
        const locate=position=>{let accumulated=0;for(const node of textNodes){const length=node.textContent.length;if(position<=accumulated+length)return {node,offset:position-accumulated};accumulated+=length;}const last=textNodes.at(-1);return {node:last,offset:last.textContent.length};};
        const fullText=()=>textNodes.map(node=>node.textContent).join('');
        const target=counts.reduce((sum,count)=>sum+count,0);
        let guard=0;
        // Merge adjacent sentences (replace a terminator with a comma) until the
        // canonical count is reached.
        while(guard++<target*3+4){
          const segments=segment(fullText());
          if(segments.length<=target)break;
          let best=-1,bestLength=Infinity;
          for(let index=0;index<segments.length-1;index++){if(segments[index].segment.length<bestLength){bestLength=segments[index].segment.length;best=index;}}
          if(best<0)break;
          const punctuation=[...segments[best].segment.matchAll(/[.!?…]/gu)];
          if(!punctuation.length)break;
          const at=locate(segments[best].index+punctuation[punctuation.length-1].index);
          at.node.textContent=at.node.textContent.slice(0,at.offset)+','+at.node.textContent.slice(at.offset+1);
          const nextAt=locate(segments[best+1].index),relative=nextAt.node.textContent.slice(nextAt.offset).search(/\p{L}/u);
          if(relative>=0){const index=nextAt.offset+relative;nextAt.node.textContent=nextAt.node.textContent.slice(0,index)+nextAt.node.textContent[index].toLowerCase()+nextAt.node.textContent.slice(index+1);}
          changed=true;
        }
        guard=0;
        // Split a long sentence at an internal delimiter (or word boundary)
        // until the canonical count is reached.
        while(guard++<target*3+4){
          const segments=segment(fullText());
          if(segments.length>=target)break;
          let best=-1,bestLength=-1;
          for(let index=0;index<segments.length;index++){if(segments[index].segment.length>bestLength){bestLength=segments[index].segment.length;best=index;}}
          if(best<0)break;
          const text=segments[best].segment,commas=[...text.matchAll(/[,;:]/gu)];let position;
          if(commas.length)position=segments[best].index+commas[Math.floor(commas.length/2)].index;
          else{
            const words=text.split(/\s+/);if(words.length<4)break;
            let accumulated=0,cut=-1,difference=Infinity;
            for(let index=1;index<words.length;index++){
              accumulated+=words[index-1].length+1;
              if(index<2||index>words.length-2)continue;
              const candidate=segments[best].index+accumulated-1,d=Math.abs(accumulated-(text.length-accumulated));
              if(d<difference){difference=d;cut=candidate;}
            }
            if(cut<0)break;position=cut;
          }
          const at=locate(position);
          at.node.textContent=at.node.textContent.slice(0,at.offset)+'.'+at.node.textContent.slice(at.offset+1);
          const afterAt=locate(position+1),relative=afterAt.node.textContent.slice(afterAt.offset).search(/\p{L}/u);
          if(relative>=0){const index=afterAt.offset+relative;afterAt.node.textContent=afterAt.node.textContent.slice(0,index)+afterAt.node.textContent[index].toUpperCase()+afterAt.node.textContent.slice(index+1);}
          changed=true;
        }
        const segments=segment(fullText());
        if(segments.length!==target)continue;
        // Rebuild paragraphs at the canonical sentence counts, moving every node
        // (text and inline elements) with Range so links/emphasis survive.
        // Rebuild paragraphs at the canonical sentence counts by moving text and
        // inline nodes; links/emphasis survive and no text is re-created.
        const template=paragraphs[0].cloneNode(false);template.removeAttribute('id');
        paragraphs.forEach(paragraph=>paragraph.removeAttribute('id'));
        const starts=[];let accumulated=0;for(const count of counts){starts.push(accumulated);accumulated+=count;}
        const ends=segments.map(entry=>entry.index+entry.segment.length);
        const ranges=[];let valid=true;
        for(let index=0;index<counts.length;index++){
          const startUnit=starts[index],endUnit=startUnit+counts[index]-1;
          if(endUnit>=segments.length){valid=false;break;}
          ranges.push([segments[startUnit].index,ends[endUnit]]);
        }
        // Inline elements must not straddle a canonical boundary; otherwise the
        // run is left for the agent instead of risking a broken link/emphasis.
        const spansBoundary=(start,end)=>{for(const [rs,re] of ranges)if(start>=rs&&end<=re)return false;return true;};
        if(valid){
          const check=(container,base)=>{
            for(const child of [...container.childNodes]){
              const length=child.textContent.length,cStart=base,cEnd=base+length;base=cEnd;
              if(child.nodeType!==1)continue;
              if(spansBoundary(cStart,cEnd)){valid=false;return;}
              check(child,cStart);
            }
          };
          let base=0;
          for(const paragraph of paragraphs){check(paragraph,base);base+=paragraph.textContent.length;}
        }
        if(!valid)continue;
        const paragraphStarts=[];{let acc=0;for(const paragraph of paragraphs){paragraphStarts.push(acc);acc+=paragraph.textContent.length;}}
        const templateFor=start=>{let index=0;for(let i=0;i<paragraphStarts.length;i++){if(start>=paragraphStarts[i])index=i;else break;}return paragraphs[index].cloneNode(false);};
        const targets=ranges.map(([start])=>templateFor(start));
        let base=0,current=0;
        const targetFor=offset=>{while(current<ranges.length-1&&ranges[current][1]<=offset)current++;return current;};
        const moveChildren=children=>{
          for(const child of [...children]){
            const childStart=base;base+=child.textContent.length;
            if(child.nodeType===3){
              let node=child,position=childStart;
              while(node&&node.textContent.length){
                const targetIndex=targetFor(position),rangeEnd=ranges[targetIndex][1];
                if(position+node.textContent.length<=rangeEnd){targets[targetIndex].append(node);node=null;}
                else{const suffix=node.splitText(rangeEnd-position);targets[targetIndex].append(node);position=rangeEnd;node=suffix;}
              }
            }else if(child.nodeType===1){
              targets[targetFor(childStart)].append(child);
            }
          }
        };
        for(const paragraph of paragraphs)moveChildren(paragraph.childNodes);
        const rebuilt=targets;
        paragraphs[0].before(...rebuilt);
        paragraphs.forEach(paragraph=>paragraph.remove());
        // Re-attach every recorded anchor at its preserved absolute offset.
        if(anchors.length){
          const newTextNodes=[];
          const gather=node=>{for(const child of node.childNodes){if(child.nodeType===3)newTextNodes.push(child);else if(child.nodeType===1)gather(child);}};
          rebuilt.forEach(gather);
          anchors.sort((a,b)=>b.offset-a.offset);
          for(const entry of anchors){
            let remaining=entry.offset;
            for(const node of newTextNodes){
              const length=node.textContent.length;
              if(remaining<=length){
                if(!document.getElementById(entry.id)){const marker=document.createElement('span');marker.className='source-anchor';marker.id=entry.id;const range=document.createRange();range.setStart(node,remaining);range.collapse(true);range.insertNode(marker);}
                break;
              }
              remaining-=length;
            }
          }
        }
        changes.push({kind:a.kind,before:'translated sentences/paragraphs',after:{paragraphs:rebuilt.length,sentences:target}});
        changed=true;
      }
      if(changed)editorialReflow=true;continue;
    }
    if(a.kind==='remove_generated_caption'){
      const nodes = document.querySelectorAll(a.selector);
      if(nodes.length===0){
        const staleCaptions=[...document.querySelectorAll('figcaption')].filter(node=>node.textContent===a.text);
        if(staleCaptions.length)throw Error('Repair selector is stale for generated caption: '+a.selector);
        const staleAlt=[...document.querySelectorAll('img')].filter(image=>image.getAttribute('alt')===a.text);
        if(staleAlt.length>1)throw Error('Generated caption alt text is ambiguous: '+a.text);
        if(staleAlt.length===1&&/^figure from pdf page \d+$/i.test(a.text.trim())){
          staleAlt[0].setAttribute('alt','');
          changes.push({kind:a.kind,selector:a.selector,before:'stale generated caption already absent; image alt retained',after:'image alt cleared'});
        }
        continue;
      }
      if(nodes.length!==1)throw Error('Repair selector must match exactly one element: '+a.selector);
      const n=nodes[0],old=n.outerHTML;
      if(n.tagName!=='FIGCAPTION'||n.textContent!==a.text||!/^figure from pdf page \d+$/i.test(n.textContent.trim()))throw Error('Unsafe generated caption removal');
      const image=n.closest('figure')?.querySelector('img');
      if(image&&/^figure from pdf page \d+$/i.test(image.getAttribute('alt')||''))image.setAttribute('alt','');
      removedGenerated.push(n.textContent);n.remove();changes.push({kind:a.kind,selector:a.selector,before:old,after:null});continue;
    }
    if(a.kind==='remove_running_matter'){
      const nodes=document.querySelectorAll(a.selector);
      if(nodes.length===0)continue;
      if(nodes.length!==1)throw Error('Repair selector must match exactly one element: '+a.selector);
      const n=nodes[0],old=n.outerHTML;
      if(n.textContent.trim()!==a.text||!/^.{6,}\s*[·•|]\s*\d{1,4}$/u.test(n.textContent.trim()))throw Error('Unsafe running matter removal');
      if(a.id&&n.id===a.id){
        const anchor=document.createElement('span');
        anchor.className='source-anchor';
        anchor.id=a.id;
        n.before(anchor);
      }
      removedRunning.push(n.textContent);n.remove();changes.push({kind:a.kind,selector:a.selector,before:old,after:null});continue;
    }
    const nodes = document.querySelectorAll(a.selector);
    if(nodes.length===0&&a.kind==='presentation'&&/> figcaption(?::nth-child\(\d+\))?$/.test(a.selector)&&![...document.querySelectorAll('figcaption')].some(node=>/^figure from pdf page \d+$/i.test(node.textContent.trim())))continue;
    if(nodes.length===0&&['presentation','table_readable_columns','table_continuation','table_source_pages','table_source_groups'].includes(a.kind))continue;
    if (nodes.length !== 1) throw Error('Repair selector must match exactly one element [' + a.kind + ', count=' + nodes.length + ']: ' + a.selector);
    const n = nodes[0], old = n.outerHTML;
    if (a.kind === 'tag') {
      if (!/^(p|h[1-6]|th|td|figcaption)$/.test(a.tag)) throw Error('Unsafe or stale tag repair');
      const currentTag=n.tagName.toLowerCase();
      if(currentTag===a.tag)continue;
      if(currentTag!==a.expectedTag)throw Error('Unsafe or stale tag repair');
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
    } else if (a.kind === 'table_grid') {
      if(n.tagName!=='TABLE'||n.rows.length!==a.rows.length)throw Error('Stale table grid repair');
      for(let row=0;row<n.rows.length;row++){
        const cells=[...n.rows[row].cells],expected=a.rows[row];
        if(cells.length!==expected.texts.length||cells.some((c,i)=>c.textContent!==expected.texts[i]))throw Error('Table grid content changed');
        if(expected.keep.length!==expected.tags.length||expected.keep.some(i=>i<0||i>=cells.length)||cells.some((c,i)=>!expected.keep.includes(i)&&c.textContent.trim()))throw Error('Unsafe nonempty table cell removal');
        for(let i=cells.length-1;i>=0;i--)if(!expected.keep.includes(i))cells[i].remove();
        const kept=[...n.rows[row].cells];
        for(let i=0;i<kept.length;i++)if(kept[i].tagName.toLowerCase()!==expected.tags[i]){
          const replacement=document.createElement(expected.tags[i]);for(const attr of kept[i].attributes)replacement.setAttribute(attr.name,attr.value);while(kept[i].firstChild)replacement.append(kept[i].firstChild);kept[i].replaceWith(replacement);
        }
      }
      changes.push({kind:a.kind,selector:a.selector,before:old,after:n.outerHTML});
    } else if(a.kind==='table_fragments'){
      if(n.tagName!=='TABLE'||!Array.isArray(a.rows)||!a.rows.length||!Array.isArray(a.tables)||a.tables[0]!==a.selector)throw Error('Invalid fragmented table repair');
      const fragments=a.remove.map(fragment=>{const matches=document.querySelectorAll(fragment.selector);if(matches.length!==1||matches[0].textContent!==fragment.text)throw Error('Fragmented table content changed');return matches[0];});
      const consumedTables=a.tables.map(selector=>{const matches=document.querySelectorAll(selector);if(matches.length!==1||matches[0].tagName!=='TABLE')throw Error('Fragmented table selector changed');return matches[0];});
      const loose=fragments.filter(node=>!node.closest('table'));
      const thead=document.createElement('thead'),tbody=document.createElement('tbody');
      for(let row=0;row<a.rows.length;row++){
        const tr=document.createElement('tr');
        for(const expected of a.rows[row]){if(!['th','td'].includes(expected.tag)||typeof expected.text!=='string')throw Error('Invalid reconstructed table cell');const cell=document.createElement(expected.tag);if(expected.tag==='th')cell.scope='col';cell.textContent=expected.text;tr.append(cell);}
        (row===0?thead:tbody).append(tr);
      }
      n.replaceChildren(thead,tbody);
      for(const node of loose){
        if(node.id){
          if(n.id&&n.id!==node.id)throw Error('Fragmented table repair cannot preserve multiple element IDs');
          n.id=node.id;
        }
        node.remove();
      }
      if(a.removedText){if(typeof a.removedText!=='string')throw Error('Invalid fragmented table removed text');removedTableHeaders.push(a.removedText);}
      for(const table of consumedTables.slice(1)){const wrap=table.closest('.pdf-table-wrap');(wrap||table).remove();}
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:n.outerHTML});
    } else if(a.kind==='table_source_pages'){
      if(n.tagName!=='TABLE'||!Array.isArray(a.fragments)||a.fragments.length<2||a.fragments.some(fragment=>!Number.isInteger(fragment.page)||fragment.page<1||!Number.isInteger(fragment.bodyRows)||fragment.bodyRows<1))throw Error('Invalid source-page table distribution');
      const normalize=value=>String(value).replace(/\s+\d{1,4}(?:\s*[—–-]\s*)+\s*$/u,'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
      const rowKey=row=>[...row.cells].map(cell=>normalize(cell.textContent)).join('|');
      const rows=[...n.tBodies].flatMap(body=>[...body.rows]),expected=a.fragments.reduce((sum,fragment)=>sum+fragment.bodyRows,0);
      if(rows.length!==expected)throw Error('Source-page table row count changed');
      const certified=a.fragments.flatMap(fragment=>fragment.rowKeys||[]);
      if(certified.length&&(!a.fragments.every(fragment=>fragment.rowKeys?.length===fragment.bodyRows)||rows.some((row,index)=>rowKey(row)!==certified[index])))throw Error('Source-page table rows changed');
      const firstPage=n.closest('.pdf-source-page'),firstNumber=Number(firstPage?.getAttribute('data-source-page')||firstPage?.getAttribute('data-reader-page'));
      if(firstNumber!==a.fragments[0].page)throw Error('Source-page table starts in a different page container');
      const header=n.tHead?.cloneNode(true);if(!header||!header.rows.length)throw Error('Source-page table has no repeatable header');
      const headerText=header.textContent,tableTemplate=n.cloneNode(false),wrap=n.closest('.pdf-table-wrap'),wrapTemplate=wrap?.cloneNode(false);
      let offset=0;
      for(let index=0;index<a.fragments.length;index++){
        const fragment=a.fragments[index],fragmentRows=rows.slice(offset,offset+fragment.bodyRows);offset+=fragment.bodyRows;
        if(index){
          const anchorId='page_'+fragment.page,firstRow=fragmentRows[0],existing=document.getElementById(anchorId);
          if(!firstRow)throw Error('Source-page table boundary changed for page '+fragment.page);
          if(existing&&!firstRow.contains(existing)&&existing!==firstRow){
            const movable=!existing.textContent.trim()&&existing.children.length===0;
            if(!movable)throw Error('Conflicting source-page anchor for page '+fragment.page);
            existing.removeAttribute('id');
          }
          if(!firstRow.contains(document.getElementById(anchorId))&&document.getElementById(anchorId)!==firstRow){
            if(/^page_\d+$/.test(firstRow.id)&&firstRow.id!==anchorId)throw Error('Conflicting table-row page anchor for page '+fragment.page);
            if(!firstRow.id)firstRow.id=anchorId;
            else {const cell=[...firstRow.cells].find(item=>!item.id);if(!cell)throw Error('Cannot preserve source-page anchor for page '+fragment.page);cell.id=anchorId;}
          }
        }
        if(index===0){const body=n.tBodies[0]||n.createTBody();body.replaceChildren(...fragmentRows);continue;}
        const destination=document.querySelector('.pdf-source-page[data-source-page="'+fragment.page+'"],.pdf-source-page[data-reader-page="'+fragment.page+'"]');
        if(!destination)throw Error('Missing destination page for source table fragment '+fragment.page);
        const table=tableTemplate.cloneNode(false),thead=header.cloneNode(true),tbody=document.createElement('tbody');table.removeAttribute('id');tbody.append(...fragmentRows);table.append(thead,tbody);
        const container=wrapTemplate?wrapTemplate.cloneNode(false):table;if(wrapTemplate){container.removeAttribute('id');container.append(table);}
        destination.insertBefore(container,destination.firstChild);addedTableHeaders.push(headerText);
      }
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:a.fragments});
    } else if(a.kind==='table_normalize_rows'){
      const normalize=value=>String(value).normalize('NFKC').replace(/[\s\u00ad]+/gu,'');
      const bag=value=>[...normalize(value)].sort().join('');
      if(n.tagName!=='TABLE'||!Array.isArray(a.rowKeys)||!Array.isArray(a.plan)||!a.plan.length)throw Error('Invalid table row normalization');
      const rows=[...n.rows],rowKey=row=>[...row.cells].map(cell=>normalize(cell.textContent)).join('|');
      if(rows.length!==a.rowKeys.length||rows.some((row,index)=>rowKey(row)!==a.rowKeys[index]))throw Error('Table rows changed before normalization');
      const used=a.plan.flatMap(item=>item.rows||[]);
      if(used.length!==rows.length||new Set(used).size!==rows.length||used.some(index=>!Number.isInteger(index)||index<0||index>=rows.length))throw Error('Table normalization plan does not preserve every row');
      const output=[];
      for(const item of a.plan){
        if(item.rows){
          if(!item.rows.length)throw Error('Empty table row merge');
          const row=rows[item.rows[0]];
          for(const index of item.rows.slice(1)){
            const extra=rows[index];if(extra.cells.length!==row.cells.length)throw Error('Merged table rows have different columns');
            for(let col=0;col<row.cells.length;col++){
              const target=row.cells[col],source=extra.cells[col];if(target.textContent&&source.textContent)target.append(document.createTextNode(' '));while(source.firstChild)target.append(source.firstChild);
            }
            if(extra.id){if(row.id&&row.id!==extra.id)throw Error('Merged table rows contain multiple IDs');row.id=extra.id;}
            extra.remove();
          }
          output.push(row);continue;
        }
        if(typeof item.paragraph!=='string'||typeof item.text!=='string'||!Array.isArray(item.cells)||!item.cells.length)throw Error('Invalid paragraph table row');
        const matches=document.querySelectorAll(item.paragraph);if(matches.length!==1||matches[0].tagName!=='P')throw Error('Table row paragraph changed');
        const paragraph=matches[0],sourceText=item.cells.join(' ');if(paragraph.textContent!==item.text||bag(paragraph.textContent)!==bag(sourceText))throw Error('Paragraph does not exactly reconstruct the source row');
        const row=document.createElement('tr');if(paragraph.id)row.id=paragraph.id;
        for(const value of item.cells){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
        paragraph.remove();output.push(row);
      }
      const headerRows=new Set([...n.tHead?.rows||[]]);
      if(!headerRows.has(output[0])||output.slice(1).some(row=>headerRows.has(row)))throw Error('Table normalization changed the structural header');
      const body=n.tBodies[0]||n.createTBody();body.replaceChildren(...output.slice(1));
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:n.outerHTML});
    } else if(a.kind==='table_from_paragraphs'){
      const bag=value=>[...String(value).normalize('NFKC').replace(/[\s\u00ad]+/gu,'')].sort().join('');
      if(n.tagName!=='P'||!Array.isArray(a.paragraphs)||!a.paragraphs.length||!Array.isArray(a.rows)||a.rows.length<2||a.rows.some((row,index)=>!Array.isArray(row)||!row.length||row.some(cell=>cell.tag!==(index?'td':'th')||typeof cell.text!=='string')))throw Error('Invalid paragraph table reconstruction');
      const paragraphs=a.paragraphs.map(item=>{const matches=document.querySelectorAll(item.selector);if(matches.length!==1||matches[0].tagName!=='P'||matches[0].textContent!==item.text||matches[0].querySelector('a,img'))throw Error('Source table paragraph changed');return matches[0];});
      const sourceText=a.rows.flat().map(cell=>cell.text).join(' '),paragraphText=paragraphs.map(paragraph=>paragraph.textContent).join(' ');
      if(bag(sourceText)!==bag(paragraphText))throw Error('Paragraph table character inventory changed');
      const table=document.createElement('table');table.className='pdf-table';const thead=document.createElement('thead'),tbody=document.createElement('tbody');
      a.rows.forEach((cells,index)=>{const row=document.createElement('tr');for(const item of cells){const cell=document.createElement(item.tag);if(item.tag==='th')cell.scope='col';cell.textContent=item.text;row.append(cell);}(index?tbody:thead).append(row);});
      table.append(thead,tbody);const wrap=document.createElement('div');wrap.className='pdf-table-wrap';wrap.append(table);paragraphs[0].before(wrap);paragraphs.forEach(paragraph=>paragraph.remove());
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:table.outerHTML});
    } else if(a.kind==='table_source_groups'){
      const normalize=value=>String(value).replace(/\s+/g,' ').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
      if(n.tagName!=='TABLE'||!Array.isArray(a.rowKeys)||!Array.isArray(a.groups)||a.groups.length<2)throw Error('Invalid source table group distribution');
      const rows=[...n.rows];
      if(rows.length!==a.rowKeys.length||rows.some((row,index)=>[...row.cells].map(cell=>normalize(cell.textContent)).join('|')!==a.rowKeys[index]))throw Error('Source table group rows changed');
      const planned=a.groups.flatMap(group=>group.fragments.flatMap(fragment=>[fragment.headerRow,...fragment.bodyRows]));
      if(planned.some(index=>!Number.isInteger(index)||index<0||index>=rows.length)||new Set(planned).size!==rows.length)throw Error('Source table group plan is incomplete');
      const wrap=n.closest('.pdf-table-wrap'),wrapTemplate=wrap?.cloneNode(false),tableTemplate=n.cloneNode(false),headerUses=new Map();
      const originalPage=n.closest('.pdf-source-page');
      for(const group of a.groups)for(const fragment of group.fragments){
        if(!Number.isInteger(fragment.page)||fragment.page<1||!['original','start','end'].includes(fragment.placement)||!Array.isArray(fragment.bodyRows)||!fragment.bodyRows.length)throw Error('Invalid source table group fragment');
        const destination=document.querySelector('.pdf-source-page[data-source-page="'+fragment.page+'"],.pdf-source-page[data-reader-page="'+fragment.page+'"]');
        if(!destination)throw Error('Missing destination page for source table group '+fragment.page);
        const sourceHeader=rows[fragment.headerRow],headerKey=[...sourceHeader.cells].map(cell=>normalize(cell.textContent)).join('|');
        if(headerKey!==group.headerKey)throw Error('Source table group header changed');
        const headerRow=sourceHeader.cloneNode(true);if(headerRow.id!=='page_'+fragment.page)headerRow.removeAttribute('id');
        for(const cell of [...headerRow.cells])if(cell.tagName.toLowerCase()!=='th'){
          const replacement=document.createElement('th');replacement.scope='col';for(const attr of cell.attributes)replacement.setAttribute(attr.name,attr.value);while(cell.firstChild)replacement.append(cell.firstChild);cell.replaceWith(replacement);
        }
        const count=headerUses.get(fragment.headerRow)||0;if(count)addedTableHeaders.push(sourceHeader.textContent);headerUses.set(fragment.headerRow,count+1);
        const table=tableTemplate.cloneNode(false),thead=document.createElement('thead'),tbody=document.createElement('tbody');table.removeAttribute('id');thead.append(headerRow);
        for(const rowIndex of fragment.bodyRows)tbody.append(rows[rowIndex]);table.append(thead,tbody);
        const container=wrapTemplate?wrapTemplate.cloneNode(false):table;if(wrapTemplate){container.removeAttribute('id');container.append(table);}
        if(fragment.placement==='original'){
          if(destination!==originalPage)throw Error('Original source table group page changed');(wrap||n).before(container);
        }else if(fragment.placement==='start'){
          const first=[...destination.children].find(child=>!child.matches('.pdf-page-anchor,.source-anchor'));destination.insertBefore(container,first||null);
        }else destination.append(container);
      }
      (wrap||n).remove();tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:a.groups});
    } else if(a.kind==='table_continuation'){
      const continuations=Array.isArray(a.continuations)?a.continuations:(a.continuation?[{selector:a.continuation,headerTexts:a.headerTexts,mode:'drop_repeated_header'}]:[]);
      if(n.tagName!=='TABLE'||!Array.isArray(a.headerTexts)||!a.headerTexts.length||!continuations.length)throw Error('Invalid table continuation repair');
      const normalize=value=>String(value).replace(/\s+/g,' ').trim().toLowerCase();
      const compact=value=>normalize(value).replace(/[^\p{L}\p{N}]+/gu,'');
      const targetBody=n.tBodies[0]||n.createTBody();
      for(const item of continuations){
        const matches=document.querySelectorAll(item.selector);if(matches.length!==1||matches[0].tagName!=='TABLE')throw Error('Continuation table selector changed');
        const continuation=matches[0],parent=continuation.parentElement,wrap=continuation.closest('.pdf-table-wrap')||(parent?.tagName==='DIV'&&parent.children.length===1?parent:null);
        const headerCells=[...continuation.rows[0]?.cells||[]], header=headerCells.map(cell=>normalize(cell.textContent)), expected=item.headerTexts||a.headerTexts;
        if(header.length!==expected.length||header.some((text,i)=>compact(text)!==compact(expected[i])))throw Error('Continuation table header changed: expected '+JSON.stringify(expected)+' got '+JSON.stringify(header)+' for '+item.selector);
        const moved=item.mode==='promoted_header_is_body'?[...continuation.rows]:[...continuation.rows].slice(1);
        if(!moved.length)throw Error('Continuation table has no body rows');
        const anchorId=wrap?.id||continuation.id;
        if(anchorId&&document.getElementById(anchorId)===wrap&&moved[0]&&!moved[0].id)moved[0].id=anchorId;
        for(const row of moved){
          for(const cell of [...row.cells])if(cell.tagName.toLowerCase()==='th'){
            const replacement=document.createElement('td');for(const attr of cell.attributes)if(attr.name!=='scope')replacement.setAttribute(attr.name,attr.value);while(cell.firstChild)replacement.append(cell.firstChild);cell.replaceWith(replacement);
          }
          targetBody.append(row);
        }
        if(item.mode!=='promoted_header_is_body')removedTableHeaders.push(headerCells.map(cell=>cell.textContent).join(''));
        (wrap||continuation).remove();
      }
      applyReadableTableColumns(n,a.columns);
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:n.outerHTML});
    } else if(a.kind==='table_readable_columns'){
      if(n.tagName!=='TABLE'||!Array.isArray(a.columns)||a.columns.some(value=>!Number.isFinite(value)||value<=0))throw Error('Invalid readable table column repair');
      applyReadableTableColumns(n,a.columns);
      tableReflow=true;changes.push({kind:a.kind,selector:a.selector,before:old,after:n.outerHTML});
    } else if (a.kind === 'presentation') {
      const allowed = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'text-align-last', 'text-indent', 'margin-top', 'margin-bottom', 'margin-left', 'padding-left', 'border-left', 'padding', 'max-width', 'width', 'height', 'overflow-wrap', 'white-space', 'border-collapse', 'table-layout', 'word-spacing', 'letter-spacing', 'hyphens', 'color', 'background-color', 'border-top', 'border-right', 'border-bottom', 'vertical-align', 'box-sizing', 'aspect-ratio', 'max-height', 'object-fit', 'object-position', 'display', 'border-radius', 'border', 'margin']);
      const beforeProperties=Object.fromEntries(Object.keys(a.properties).map(key=>[key,n.style.getPropertyValue(key)]));
      for (const [key, value] of Object.entries(a.properties)) {
        if (!allowed.has(key) || /url\(|expression\(|[{};]/i.test(value)) throw Error('Unsupported presentation property');
        const needsScale=key==='font-size'&&value.includes('--reader-font-size')&&!value.includes('--validatebook-page-scale')&&!a.safeTranslationStyle;
        const scaled=needsScale?`calc((${value}) * var(--validatebook-page-scale, 1))`:value;
        n.style.setProperty(key, scaled);
      }
      changes.push({ kind: a.kind, selector: a.selector, before: beforeProperties, after: Object.fromEntries(Object.keys(a.properties).map(key=>[key,n.style.getPropertyValue(key)])) });
    } else throw Error('Unsupported repair kind: ' + a.kind);
  }
  const removedText=removedGenerated.join('')+removedRunning.join('')+removedTableHeaders.join('');
  const addedText=addedTableHeaders.join('');
  if (!editorialReflow && text() !== before && (!(tableReflow||removedText||addedText)||characterInventory(text()+removedText)!==characterInventory(before+addedText))) throw Error('Repair changed text; layout-only changes must preserve prose exactly');
  const dt = document.doctype;
  const doctype = dt ? '<!DOCTYPE ' + dt.name + (dt.publicId ? ' PUBLIC "' + dt.publicId + '"' : '') + (dt.systemId ? (dt.publicId ? '' : ' SYSTEM') + ' "' + dt.systemId + '"' : '') + '>\n' : '';
  return { html: doctype + document.documentElement.outerHTML, changes, stylesheet };
}
