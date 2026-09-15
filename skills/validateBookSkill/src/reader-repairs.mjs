// Preserve the standalone presentation when the host replaces body with article.
// Source typography actions run afterwards and take precedence.
export function readerTypographyRepairs(standalone, article, defaultSizePx) {
  const actions=[];
  for(let v=0;v<standalone.layouts.length;v++){
    const source=standalone.layouts[v].records,target=article.layouts[v]?.records;
    if(!target||source.length!==target.length)throw Error('Reader import changes block structure; typography cannot be mapped by order');
    for(let i=0;i<source.length;i++){
      const a=source[i],b=target[i];
      if(a.text!==b.text||a.tag!==b.tag)throw Error('Reader import changes block text or order');
      if(a.displayGroup!=null)continue;
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
        if(prior&&JSON.stringify(prior.properties)!==JSON.stringify(properties))throw Error(`Reader typography changes across viewports at ${a.selector}; requires responsive presentation repair`);
        if(!prior)actions.push({kind:'presentation',selector:a.selector,properties});
      }
    }
  }
  return actions;
}
