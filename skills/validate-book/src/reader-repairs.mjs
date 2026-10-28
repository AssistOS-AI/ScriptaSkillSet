// Preserve the standalone presentation when the host replaces body with article.
// Source typography actions run afterwards and take precedence.
// Runs in the imported reader. Preserve authored responsive host geometry,
// never sampled pixel widths, while insulating it from edition root rules.
export function readerGeometryCss(readerCss) {
  const article=document.querySelector('article.reader-html-content');
  const sheet=new CSSStyleSheet();sheet.replaceSync(readerCss);
  if(!article)throw Error('Reader geometry root unavailable');
  const probe=document.createElement('article');probe.className='reader-html-content';
  probe.setAttribute('data-pdf-fidelity','');probe.setAttribute('data-validatebook-root','');
  // Mirror the real article: if the edition is paginated, the probe must contain
  // a source page box so page-aware reader rules match and continuous-edition
  // geometry is not baked into a paginated edition.
  if(article.querySelector('.pdf-source-page')){const box=document.createElement('section');box.className='pdf-source-page';probe.append(box);}
  document.body.append(probe);
  const selector='article.reader-html-content'+'[data-validatebook-root]'.repeat(16);
  const geometry=new Set(['width','min-width','max-width','height','min-height','max-height','margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','box-sizing']);
  function visit(rules){return [...rules].map(rule=>{
    if(rule.selectorText&&probe.matches(rule.selectorText)){
      const declarations=[...rule.style].filter(k=>geometry.has(k)).map(k=>k+':'+rule.style.getPropertyValue(k)+'!important').join(';');
      return declarations?selector+'{'+declarations+'}':'';
    }
    if(rule.cssRules && (rule.type===CSSRule.MEDIA_RULE||rule.type===CSSRule.SUPPORTS_RULE))return rule.cssText.slice(0,rule.cssText.indexOf('{')+1)+visit(rule.cssRules)+'}';
    return '';
  }).join('\n');}
  try{return '/* validateBook host geometry */\n'+selector+'{width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;box-sizing:content-box!important}\n'+visit(sheet.cssRules);}
  finally{probe.remove();}
}

export function readerTypographyRepairs(standalone, article, defaultSizePx) {
  const actions=[], deferred=new Set();
  for(let v=0;v<standalone.layouts.length;v++){
    const source=standalone.layouts[v].records,target=article.layouts[v]?.records;
    if(!target||source.length!==target.length)throw Error('Reader import changes block structure; typography cannot be mapped by order');
    for(let i=0;i<source.length;i++){
      const a=source[i],b=target[i];
      if(a.text!==b.text||a.tag!==b.tag)throw Error('Reader import changes block text or order');
      if(a.displayGroup!=null||a.tag==='img'||!a.text)continue;
      const properties={};
      const aScale=a.pageScale||1,bScale=b.pageScale||1;
      const aSize=parseFloat(a.font.size)/aScale,bSize=parseFloat(b.font.size)/bScale;
      if(a.font.family!==b.font.family)properties['font-family']=a.font.family;
      if(Math.abs(aSize-bSize)>.1)properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${aSize/defaultSizePx})`;
      if(Math.abs(parseFloat(a.style.lineHeight)/aScale-parseFloat(b.style.lineHeight)/bScale)>.1){
        const leading=parseFloat(a.style.lineHeight);
        properties['line-height']=Number.isFinite(leading)?String(leading/parseFloat(a.font.size)):'normal';
      }
      if(Object.keys(properties).length){
        const prior=actions.find(x=>x.selector===a.selector);
        if(prior&&JSON.stringify(prior.properties)!==JSON.stringify(properties)){deferred.add(a.selector);continue;}
        if(!prior)actions.push({kind:'presentation',selector:a.selector,properties});
      }
    }
  }
  // A fixed declaration cannot reproduce a responsive rule. Leave that block
  // to source-aware repairs and final parity findings; keep independent repairs.
  return actions.filter(action=>!deferred.has(action.selector));
}
