import { issue, normalizeText } from './layout-checks.mjs';
import { familyKey, pageScale } from './typography.mjs';

const compact = text => normalizeText(text).replaceAll(' ', '');
const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ') + ')';

export function validateTableEvidence(tables) {
  if (!Array.isArray(tables)) throw Error('Source presentation provider must include table evidence');
  for (const t of tables) {
    if(t.pageWidthPt!==undefined&&(!Number.isFinite(t.pageWidthPt)||t.pageWidthPt<=0))throw Error('Invalid source table page width');
    if (!Number.isInteger(t.page) || t.page<1 || !Number.isInteger(t.rows) || t.rows<1 || !Number.isInteger(t.columns) || t.columns<1 || !(t.widthPt>0) || !Number.isFinite(t.widthPt) || !Array.isArray(t.cells) || !t.cells.length) throw Error('Invalid source table');
    const occupied=new Set();
    for (const c of t.cells) {
      if (![c.row,c.col,c.rowspan,c.colspan].every(Number.isInteger) || c.row<0 || c.col<0 || c.rowspan<1 || c.colspan<1 || c.row+c.rowspan>t.rows || c.col+c.colspan>t.columns || typeof c.text!=='string' || !Number.isFinite(c.widthPt) || c.widthPt<=0 || !/^#[\da-f]{6}$/i.test(c.background)) throw Error('Invalid source table cell');
      for(let r=c.row;r<c.row+c.rowspan;r++)for(let col=c.col;col<c.col+c.colspan;col++){
        const key=r+','+col;if(occupied.has(key))throw Error('Overlapping source table cells');occupied.add(key);
      }
      for(const side of ['top','right','bottom','left'])if(!/^(0|\d+(?:\.\d+)?pt solid #[\da-f]{6})$/i.test(c.borders?.[side]))throw Error('Invalid source table border');
      const f=c.typography;
      if(f?.verticalAlign!==undefined&&!['top','middle','bottom'].includes(f.verticalAlign))throw Error('Invalid source table vertical alignment');
      if(f && (typeof f.name!=='string' || typeof f.family!=='string' || !(f.sizePt>0) || !Number.isFinite(f.sizePt) || !/^#[\da-f]{6}$/i.test(f.color) || ![400,700].includes(f.weight) || !['normal','italic'].includes(f.style) || !['left','center'].includes(f.align) || !Array.isArray(f.paddingPt) || f.paddingPt.length!==4 || !f.paddingPt.every(n=>Number.isFinite(n)&&n>=0) || !Number.isFinite(f.indentPt) || f.indentPt<0 || (f.leadingPt!==null&&(!Number.isFinite(f.leadingPt)||f.leadingPt<=0))))throw Error('Invalid source table typography');
    }
    if(occupied.size!==t.rows*t.columns)throw Error('Incomplete source table grid');
  }
}

// Match whole tables and every cell, including spans. Never use token overlap
// to transfer presentation onto different content or guess ambiguous grids.
export function compareTables(profile, document, {sourceFontMap={},defaultSizePx=16,language='en'}={}) {
  const findings=[],actions=[],matches=[];
  const tables=document.records.filter(r=>r.tag==='table');
  const matched=new Set();
  for (const source of profile) {
    if(source.unmappedTranslation){findings.push(issue(language,'translated_table_unmapped','PDF page '+source.page,'Table has no unique translated counterpart; source styling cannot be certified.'));continue;}
    const candidates=tables.filter(t => (!t.page||Number(t.page)===source.page) && t.cells?.length===source.cells.length &&
      source.cells.every((c,i)=>c.row===t.cells[i].row && c.col===t.cells[i].col && c.rowspan===t.cells[i].rowspan && c.colspan===t.cells[i].colspan && compact(c.text)===compact(t.cells[i].text)));
    if(candidates.length!==1){findings.push(issue(language,'source_table_unmapped','PDF page '+source.page,'Source table has no unique complete cell/text/span mapping.'));continue;}
    const table=candidates[0];
    if(matched.has(table.selector)){findings.push(issue(language,'source_table_ambiguous',table.selector,'Multiple source tables map to this HTML table.'));continue;}
    matched.add(table.selector);matches.push({source,table});
    const tableWidth=table.bounds.right-table.bounds.left, scale=pageScale(table,source.pageWidthPt);
    let differs=false;
    const cellActions=[];
    for(let i=0;i<source.cells.length;i++){
      const c=source.cells[i], actual=table.cells[i], f=c.typography;
      if(c.text&&!f){findings.push(issue(language,'source_table_typography_unmapped',actual.selector,'Mixed or missing source cell typography cannot be transferred as one style.'));continue;}
      const properties={'background-color':c.background,width:(100*c.widthPt/source.widthPt).toFixed(3)+'%','vertical-align':f?.verticalAlign||'top','box-sizing':'border-box'};
      let wrong=actual.background!==rgb(c.background) || Math.abs(actual.width/tableWidth-c.widthPt/source.widthPt)>.015;
      if(f?.verticalAlign&&actual.verticalAlign!==f.verticalAlign)wrong=true;
      for(const side of ['top','right','bottom','left']){
        const b=c.borders[side], got=actual.borders?.[side];
        properties['border-'+side]=f&&b!=='0'?b.replace(/^([\d.]+)pt/,(_,n)=>(Number(n)/f.sizePt)+'em'):b;
        const expected=b==='0'?0:parseFloat(b)*(f?parseFloat(actual.font.size)/f.sizePt:4/3);
        if(!got || (expected===0?got.width!==0:got.width<=0||Math.abs(got.width-expected)>=1||got.style!=='solid'||got.color!==rgb(b.slice(-7))))wrong=true;
      }
      if(f){
        const stack=sourceFontMap[f.name]||sourceFontMap[familyKey(f.name)]||sourceFontMap[familyKey(f.family)];
        const face=stack?.match(/"([^"]+)"/)?.[1];
        const samples=(document.platformFonts||[]).filter(s=>s.selector===actual.selector&&(!s.width||s.width===document.width));
        const key=s=>familyKey(s.replace(/MT$/i,''));
        const rendered=samples.some(s=>s.fonts.some(font=>font.glyphCount>0&&key(font.familyName)===key(f.name)));
        const familyOK=face?actual.font.family.includes(face)&&(document.platformFonts===undefined||rendered):rendered;
        if(!stack&&!familyOK)findings.push(issue(language,'source_table_font_unmapped',actual.selector,'Source cell font has no verified local font mapping.'));
        if(stack)properties['font-family']=stack;
        properties['font-size']=`calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${f.sizePt*4/3/defaultSizePx})`;
        Object.assign(properties,{'font-weight':String(f.weight),'font-style':f.style,color:f.color,'text-align':f.align,'text-indent':(f.indentPt/f.sizePt)+'em',padding:f.paddingPt.map(n=>(n/f.sizePt)+'em').join(' ')});
        if(f.leadingPt)properties['line-height']=String(f.leadingPt/f.sizePt);
        const size=parseFloat(actual.font.size);
        const sourceSize=f.sizePt*scale;
        if(Math.abs(size-sourceSize*4/3)>1 || !familyOK || actual.font.weight!==String(f.weight) || actual.font.style!==f.style || actual.color!==rgb(f.color) || actual.textAlign!==f.align || Math.abs(actual.indent-size*f.indentPt/f.sizePt)>.2 || actual.padding.some((p,j)=>Math.abs(p-size*f.paddingPt[j]/f.sizePt)>.2) || (f.leadingPt&&Math.abs(parseFloat(actual.lineHeight)-size*f.leadingPt/f.sizePt)>.2))wrong=true;
      }
      if(wrong){differs=true;findings.push(issue(language,'source_table_cell_difference',actual.selector,'Table cell fill, border, column proportion or typography differs from the PDF.',{page:source.page,width:document.width,expected:c,actual}));cellActions.push({kind:'presentation',selector:actual.selector,properties});}
    }
    if(differs){actions.push({kind:'presentation',selector:table.selector,properties:{'table-layout':'fixed','border-collapse':'collapse',width:'100%'}},...cellActions);}
  }
  for(const table of tables)if(!matched.has(table.selector))findings.push(issue(language,'html_table_unmapped',table.selector,'HTML table has no certified source grid; unsupported or ambiguous tables require a native handler.'));
  // A collision invalidates all repair actions: do not let source iteration
  // order select which duplicate table wins.
  if(findings.some(f=>f.category==='source_table_ambiguous'))return {findings,actions:[],matches:[]};
  return {findings,actions,matches};
}

export function translatedTables(profile, english, target, structure) {
  const result=[];
  for(const {source,table} of compareTables(profile,english).matches){
    const selector=structure.matches.find(m=>m.source===table.selector)?.target;
    const sameGrid=r=>r.tag==='table'&&r.cells?.length===source.cells.length&&source.cells.every((c,i)=>['row','col','rowspan','colspan'].every(k=>c[k]===r.cells[i][k]));
    const peers=english.records.filter(r=>sameGrid(r)&&r.roleContext===table.roleContext);
    const candidates=target.records.filter(r=>sameGrid(r)&&(selector?r.selector===selector:table.roleContext&&r.roleContext===table.roleContext));
    const translated=candidates.length===1&&(selector||peers.length===1)?candidates[0]:null;
    if(!translated){result.push({...source,unmappedTranslation:true});continue;}
    result.push({...source,page:Number(translated.page)||source.page,cells:source.cells.map((c,i)=>({...c,text:translated.cells[i].text}))});
  }
  return result;
}
