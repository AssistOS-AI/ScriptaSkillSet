import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { navigate, importReaderArticle } from './layout-browser.mjs';
import { inspectLayout, checkDisplay } from './layout-checks.mjs';
import { pagePaddingDifferences, pageHeightDifferences } from './pagination.mjs';

export const blockingDeliveryCategories = new Set(['reader_root_incomplete', 'page_spacing_ownership_conflict', 'overlapping_pages', 'overlapping_blocks', 'duplicate_id', 'hidden_content', 'clipped_content', 'outside_content', 'horizontal_overflow', 'reader_page_geometry_override', 'broken_image', 'font_load_failed']);

// Same-directory candidates resolve author assets exactly as installed HTML does.
// The canonical HTML/CSS remain untouched until both delivery paths pass.
export async function guardInstallation(browser, item, result, presentation, profile) {
  const stem='.validatebook-'+randomUUID();
  const html=path.join(path.dirname(item.file),stem+'.html');
  const css=path.join(path.dirname(item.file),stem+'.css');
  try {
    await fs.writeFile(css,result.stylesheet.css,{flag:'wx'});
    await fs.writeFile(html,result.html.replace(/href="validatebook-layout\.css"/,`href="${path.basename(css)}"`),{flag:'wx'});
    const findings=[];
    for(const imported of [false,...(presentation?.articleContract?[true]:[])]){
      await navigate(browser,html);
      if(imported)await browser.evaluate(`(${importReaderArticle.toString()})(${JSON.stringify(presentation.articleContract)})`);
      else if(presentation?.standaloneSizeRem)await browser.evaluate(`document.documentElement.style.setProperty('--standalone-size',${JSON.stringify(presentation.standaloneSizeRem+'rem')})`);
      for(let i=0;i<100;i++){
        if(await browser.evaluate('document.fonts.status === "loaded" && [...document.querySelectorAll("link[rel=stylesheet]")].every(n=>n.sheet)'))break;
        if(i===99)throw Error('Candidate styles failed to load');
        await new Promise(r=>setTimeout(r,50));
      }
      for(const width of [1440,1024,390]){
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
        findings.push(...checkDisplay(layout,item.language).filter(f=>blockingDeliveryCategories.has(f.category)));
        findings.push(...pagePaddingDifferences(layout,profile,item.language).map(f=>({category:'source_page_padding_difference',...f})));
        findings.push(...pageHeightDifferences(layout,profile).map(f=>({category:'page_height_below_minimum',...f})));
      }
    }
    const blocking=findings.filter(f=>!(item.language!=='en'&&f.category==='horizontal_overflow'));
    if(blocking.length){
      const overflow=blocking.find(f=>f.category==='horizontal_overflow'&&f.overflowing?.length);
      if(overflow)console.error('validatebook overflow diagnostic: '+JSON.stringify(overflow.overflowing));
      const geometry=blocking.find(f=>f.category==='reader_page_geometry_override');
      if(geometry)console.error('validatebook geometry diagnostic: '+JSON.stringify({width:geometry.width,actual:geometry.actual,expected:geometry.expected}));
      const error=Error('Candidate installation rejected: '+[...new Set(blocking.map(f=>f.category))].join(', ')+(overflow?' ['+overflow.overflowing.map(n=>n.tag+':'+n.selector+' w='+n.width+' right='+n.right).join(' | ')+']':''));
      error.findings=blocking;throw error;
    }
  } finally {
    await fs.rm(html,{force:true});await fs.rm(css,{force:true});
  }
}
