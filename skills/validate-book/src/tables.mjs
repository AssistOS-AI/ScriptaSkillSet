import { issue, normalizeText } from './layout-checks.mjs';
import { familyKey, pageScale } from './typography.mjs';

const compact = text => normalizeText(text).replace(/[^\p{L}\p{N}]+/gu, '');
const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ') + ')';
const words = text => normalizeText(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
const coveredByWords = (needle,haystack) => words(needle).every(word=>haystack.includes(word));
const sourceTableText = source => source.cells.map(c=>compact(c.text)).filter(Boolean).join('');
const htmlTableText = table => (table.cells||[]).map(c=>compact(c.text)).filter(Boolean).join('');
const sourceCoveredByPageTables = (source,tables,pageRecords=[]) => {
  const sourceText=sourceTableText(source);
  if(!sourceText)return false;
  const pageTables=tables.filter(t=>(!t.page||Number(t.page)===source.page));
  const pageText=pageTables.map(htmlTableText).join('');
  const pageWords=[...pageTables.flatMap(t=>(t.cells||[]).flatMap(c=>words(c.text))),...pageRecords.filter(r=>Number(r.page)===source.page&&r.text).flatMap(r=>words(r.text))];
  return pageText.includes(sourceText)||source.cells.every(c=>!compact(c.text)||pageText.includes(compact(c.text))||coveredByWords(c.text,pageWords));
};
const htmlCoveredBySourceTables = (table,profile) => {
  const text=htmlTableText(table);
  if(!text)return true;
  const pageSources=profile.filter(source=>(!table.page||Number(table.page)===source.page));
  if(!pageSources.length)return false;
  const pageText=pageSources.map(sourceTableText).join('');
  const pageWords=pageSources.flatMap(source=>source.cells.flatMap(c=>words(c.text)));
  return pageText.includes(text)||table.cells.every(c=>!compact(c.text)||pageText.includes(compact(c.text))||coveredByWords(c.text,pageWords));
};
const tableRows = table => {
  const rows = new Map();
  for (const cell of table.cells || []) {
    if (!rows.has(cell.row)) rows.set(cell.row, []);
    rows.get(cell.row).push(cell);
  }
  return [...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([,cells])=>cells.sort((a,b)=>a.col-b.col));
};
const headerTexts = table => tableRows(table)[0]?.map(cell=>normalizeText(cell.text)) || [];
const sameHeader = (a,b) => {
  const left=headerTexts(a),right=headerTexts(b);
  return left.length>0 && left.length===right.length && left.every((text,i)=>text&&text===right[i]);
};

const sourceHeaderTexts = table => tableRows(table)[0]?.map(cell=>normalizeText(cell.text)) || [];
const sameSourceHeader = (a,b) => {
  const left=sourceHeaderTexts(a),right=sourceHeaderTexts(b);
  return left.length>0&&left.length===right.length&&left.every((text,i)=>text&&text===right[i]);
};
const sourceTableContinuations = profile => {
  const ordered=profile.slice().sort((a,b)=>a.page-b.page||((a.topPt??0)-(b.topPt??0)));
  const result=[];
  for(let i=0;i<ordered.length;i++){
    let current=ordered[i],group=[current];
    while(i+1<ordered.length){
      const next=ordered[i+1];
      if(next.page!==group.at(-1).page+1||next.columns!==current.columns||Math.abs(next.widthPt-current.widthPt)>.5||!sameSourceHeader(current,next))break;
      group.push(next);i++;
    }
    if(group.length===1){result.push(current);continue;}
    let rowOffset=0,repairRowOffset=0;
    const cells=[],repairCells=[];
    for(let partIndex=0;partIndex<group.length;partIndex++){
      const part=group[partIndex];
      for(const cell of part.cells){
        repairCells.push({...cell,row:cell.row+repairRowOffset});
        if(partIndex===0||cell.row>0)cells.push({...cell,row:cell.row+rowOffset-(partIndex?1:0)});
      }
      repairRowOffset+=part.rows;
      rowOffset+=partIndex?part.rows-1:part.rows;
    }
    result.push({...current,rows:rowOffset,cells,repairRows:repairRowOffset,repairCells,continuedPages:group.map(t=>t.page),sourceParts:group,bottomPt:group.at(-1).bottomPt});
  }
  return result;
};
const structuralHeader = table => Array.isArray(table.rows?.[0]) && table.rows[0].length>0 && table.rows[0].every(cell=>cell.tag==='th');
const readableColumnAction = table => {
  const header=headerTexts(table);
  return structuralHeader(table)&&header.length===2&&header[0]==='concept'&&(header[1]==='meaning in practice'||header[1]==='explanation and accessible link')
    ? {kind:'table_readable_columns',selector:table.selector,columns:[30,70]}
    : null;
};
const continuationActions = (tables, matched, language) => {
  const findings=[], actions=[], ordered=tables.slice().sort((a,b)=>(a.nodeIndex??0)-(b.nodeIndex??0));
  for (let i=0;i<ordered.length-1;i++) {
    const first=ordered[i];
    if (matched.has(first.selector) || !Number.isInteger(Number(first.page)) || !structuralHeader(first) || tableRows(first).length<2) continue;
    const expectedHeader=headerTexts(first), continuations=[];
    for (let j=i+1;j<ordered.length;j++) {
      const next=ordered[j], expectedPage=Number(first.page)+continuations.length+1;
      if (matched.has(next.selector) || Number(next.page)!==expectedPage || !structuralHeader(next)) break;
      const rows=tableRows(next), nextHeader=headerTexts(next);
      if(nextHeader.length!==expectedHeader.length || rows.length<1) break;
      if(sameHeader(first,next)) {
        if(rows.length<2) break;
        continuations.push({selector:next.selector,headerTexts:expectedHeader,mode:'drop_repeated_header',fromPage:Number(next.page)});
      } else if(rows[0].length===expectedHeader.length && nextHeader.every(Boolean)) {
        continuations.push({selector:next.selector,headerTexts:nextHeader,mode:'promoted_header_is_body',fromPage:Number(next.page)});
      } else break;
    }
    if(!continuations.length)continue;
    const action={kind:'table_continuation',selector:first.selector,continuations,headerTexts:expectedHeader,columns:[30,70]};
    findings.push(issue(language,'html_table_continuation',first.selector,'A table continues across later PDF pages; merge the HTML fragments and demote converter-promoted body rows back into the table body while preserving page anchors.',{page:first.page,nextPage:continuations.at(-1).fromPage,repair:action}));
    actions.push(action);matched.add(first.selector);continuations.forEach(item=>matched.add(item.selector));i+=continuations.length;
  }
  return {findings,actions};
};

// PDF conversion may alternate real cells with empty spacer cells and shift
// the real-cell offset between header and body. Exact row text makes removal
// deterministic when the source itself has only nonempty unit-span cells.
const tableCandidate = (source,table) => {
  const direct=table.cells?.length===source.cells.length&&source.cells.every((c,i)=>c.row===table.cells[i].row&&c.col===table.cells[i].col&&c.rowspan===table.cells[i].rowspan&&c.colspan===table.cells[i].colspan&&compact(c.text)===compact(table.cells[i].text));
  if(direct)return {table,cells:table.cells,gridRepair:null};
  if(source.cells.some(c=>!compact(c.text)||c.rowspan!==1||c.colspan!==1))return null;
  const rows=[],projected=[];
  for(let row=0;row<source.rows;row++){
    const expected=source.cells.filter(c=>c.row===row).sort((a,b)=>a.col-b.col);
    const actual=(table.cells||[]).filter(c=>c.row===row).sort((a,b)=>a.col-b.col);
    const keep=actual.map((c,i)=>compact(c.text)?i:-1).filter(i=>i>=0);
    if(actual.length<=expected.length||keep.length!==expected.length)return null;
    const cells=keep.map(i=>actual[i]);
    if(!expected.every((c,i)=>compact(c.text)===compact(cells[i].text)))return null;
    projected.push(...cells.map((cell,i)=>({...cell,row,col:expected[i].col,rowspan:1,colspan:1})));
    rows.push({keep,texts:actual.map(c=>c.text),tags:expected.map(()=>row===0?'th':'td')});
  }
  return projected.length===source.cells.length?{table,cells:projected,gridRepair:{kind:'table_grid',selector:table.selector,rows}}:null;
};

const groupPages = group => group.continuedPages?.length?group.continuedPages:[group.page];
const groupEndsAt = group => groupPages(group).at(-1);
const rowsFromCells = cells => {
  const byRow = new Map();
  for (const cell of cells) { if (!byRow.has(cell.row)) byRow.set(cell.row, []); byRow.get(cell.row).push(cell); }
  return [...byRow.entries()].sort((a,b)=>a[0]-b[0]).map(([,row])=>row.sort((a,b)=>a.col-b.col));
};
const rowKey = cells => cells.map(cell=>compact(folioTrim(cell.text))).join('|');
const folioTrim = text => String(text).replace(/\s+\d{1,4}(?:\s*[—–-]\s*)+\s*$/u,'');
const characterKey = text => String(text).normalize('NFKC').replace(/[\s\u00ad]+/gu,'');
const exactRowKey = cells => cells.map(cell=>characterKey(folioTrim(cell.text))).join('|');
const characterBag = text => [...characterKey(text)].sort().join('');
const uniqueTokenInterleave = (input,cells) => {
  const streams=cells.map(cell=>normalizeText(cell.text).split(' ').filter(Boolean));
  if(input.length!==streams.reduce((sum,stream)=>sum+stream.length,0))return false;
  const memo=new Map();
  const solve=(at,positions)=>{
    if(at===input.length)return positions.every((position,index)=>position===streams[index].length)?1:0;
    const key=at+'|'+positions.join(',');if(memo.has(key))return memo.get(key);
    let ways=0;
    for(let col=0;col<streams.length&&ways<2;col++)if(streams[col][positions[col]]===input[at]){
      const next=positions.slice();next[col]++;ways+=solve(at+1,next);
    }
    ways=Math.min(2,ways);memo.set(key,ways);return ways;
  };
  return solve(0,streams.map(()=>0))===1;
};
const uniquelyInterleaves = (text,cells) => characterBag(text)===characterBag(cells.map(cell=>cell.text).join(' '))&&uniqueTokenInterleave(normalizeText(text).split(' ').filter(Boolean),cells);
const paragraphCoversRows = (text,rows) => {
  if(characterBag(text)!==characterBag(rows.flat().map(cell=>cell.text).join(' ')))return false;
  const input=normalizeText(text).split(' ').filter(Boolean);let offset=0;
  for(const row of rows){
    const count=row.reduce((sum,cell)=>sum+normalizeText(cell.text).split(' ').filter(Boolean).length,0);
    if(!uniqueTokenInterleave(input.slice(offset,offset+count),row))return false;
    offset+=count;
  }
  return offset===input.length;
};

const paragraphTableRepair = (source,records) => {
  if(source.cells.some(cell=>cell.rowspan!==1||cell.colspan!==1))return null;
  const rows=rowsFromCells(source.cells),paragraphs=records.filter(record=>record.tag==='p'&&Number(record.page)===source.page&&record.text).sort((a,b)=>(a.nodeIndex??0)-(b.nodeIndex??0));
  const solutions=[];
  for(let start=0;start<paragraphs.length;start++){
    const selected=[];let row=0,index=start,valid=true;
    while(row<rows.length&&index<paragraphs.length){
      const matches=[];
      for(let count=1;count<=Math.min(4,rows.length-row);count++)if(paragraphCoversRows(paragraphs[index].text,rows.slice(row,row+count)))matches.push(count);
      if(matches.length!==1){valid=false;break;}
      selected.push(paragraphs[index]);row+=matches[0];index++;
    }
    if(valid&&row===rows.length)solutions.push(selected);
  }
  if(solutions.length!==1)return null;
  const selected=solutions[0];
  return {kind:'table_from_paragraphs',selector:selected[0].selector,paragraphs:selected.map(record=>({selector:record.selector,text:record.text})),rows:rows.map((cells,row)=>cells.map(cell=>({tag:row===0?'th':'td',text:cell.text})))};
};

// A converter can merge several distinct consecutive source tables into one
// HTML table, dropping some repeated headers and keeping others. Exact row
// mapping lets the repair restore both the logical table and page boundaries.
const chainedTableMatch = (groups, table) => {
  const htmlRows = rowsFromCells(table.cells || []);
  if (!htmlRows.length) return null;
  for (let start=0; start<groups.length; start++) {
    const first = groups[start];
    if (table.page && Number(first.page)!==Number(table.page)) continue;
    const expected = [], headerRows = [], chained = [];
    let totalRows = 0;
    for (let end=start; end<groups.length; end++) {
      const group = groups[end];
      if (end>start) {
        const previous = groups[end-1];
        if (groupPages(group)[0]!==groupEndsAt(previous)+1) break;
        if (group.columns!==previous.columns||Math.abs(group.widthPt-previous.widthPt)>.5) break;
      }
      if (group.cells.some(cell=>cell.rowspan!==1||cell.colspan!==1)) break;
      const groupRows = rowsFromCells(group.cells), groupIndex = chained.length, rowBase = totalRows;
      groupRows.forEach((row,r)=>expected.push({ row:rowBase+r, cells:row, groupIndex, isHeader:r===0, headerKey:rowKey(groupRows[0]) }));
      headerRows[groupIndex] = expected.find(row=>row.groupIndex===groupIndex&&row.isHeader);
      totalRows += group.rows;
      chained.push(group);
      if (chained.length<2) continue;
      const mapping = [];
      let index = 0, aligned = true;
      for (const htmlRow of htmlRows) {
        const key = rowKey(htmlRow);
        if (index<expected.length && key===rowKey(expected[index].cells)) { mapping.push(expected[index]); index++; continue; }
        const previous = expected[index-1];
        if (previous && !previous.isHeader && key===previous.headerKey) { mapping.push(headerRows[previous.groupIndex]); continue; }
        aligned = false; break;
      }
      if (!aligned || index!==expected.length) continue;
      const sourceCells = [];
      htmlRows.forEach((htmlRow,hi)=>htmlRow.forEach(htmlCell=>{
        const target = mapping[hi], source = target.cells.find(cell=>cell.col===htmlCell.col);
        sourceCells.push(source || target.cells[0]);
      }));
      return { groups: chained.slice(), source: { ...first, rows: totalRows, cells: sourceCells }, htmlRows, mapping };
    }
  }
  return null;
};

// Normalize only source-proven conversion damage before page distribution:
// adjacent physical rows may form one source row, and a source row may have
// been emitted as one adjacent paragraph. Every non-whitespace character and
// column boundary must match the PDF evidence exactly.
const normalizedChainedTableRepair = (groups,table,records) => {
  const htmlRows=rowsFromCells(table.cells||[]);
  if(!htmlRows.length||htmlRows.some(row=>row.some(cell=>cell.rowspan!==1||cell.colspan!==1)))return null;
  for(let start=0;start<groups.length;start++){
    if(table.page&&Number(groups[start].page)!==Number(table.page))continue;
    const chained=[],expected=[];
    for(let end=start;end<groups.length;end++){
      const group=groups[end];
      if(end>start){
        const previous=groups[end-1];
        if(groupPages(group)[0]!==groupEndsAt(previous)+1||group.columns!==previous.columns||Math.abs(group.widthPt-previous.widthPt)>.5)break;
      }
      if(group.cells.some(cell=>cell.rowspan!==1||cell.colspan!==1))break;
      const groupIndex=chained.length,groupRows=rowsFromCells(group.cells);
      groupRows.forEach((cells,row)=>expected.push({cells,groupIndex,isHeader:row===0,headerKey:exactRowKey(groupRows[0])}));
      chained.push(group);
      const firstPage=groupPages(chained[0])[0],lastPage=groupEndsAt(group);
      const paragraphs=records.filter(record=>record.tag==='p'&&Number(record.page)>=firstPage&&Number(record.page)<=lastPage&&record.text);
      const usedParagraphs=new Set(),plan=[];let at=0,changed=false,valid=true;
      for(let targetIndex=0;targetIndex<expected.length;targetIndex++){
        const target=expected[targetIndex];
        if(at<htmlRows.length&&exactRowKey(htmlRows[at])===exactRowKey(target.cells)){plan.push({rows:[at++]});continue;}
        let merged=null;
        for(let count=2;at+count<=htmlRows.length;count++){
          const rows=htmlRows.slice(at,at+count);
          if(rows.some(row=>row.length!==target.cells.length))break;
          const key=target.cells.map((_,col)=>characterKey(rows.map(row=>row[col].text).join(' '))).join('|');
          if(key===exactRowKey(target.cells)){merged=Array.from({length:count},(_,index)=>at+index);break;}
          if(count===4)break;
        }
        if(merged){plan.push({rows:merged});at+=merged.length;changed=true;continue;}
        const matches=paragraphs.filter(record=>!usedParagraphs.has(record.selector)&&uniquelyInterleaves(record.text,target.cells));
        if(matches.length===1){
          const paragraph=matches[0];usedParagraphs.add(paragraph.selector);plan.push({paragraph:paragraph.selector,text:paragraph.text,cells:target.cells.map(cell=>cell.text)});changed=true;continue;
        }
        if(at<htmlRows.length&&!target.isHeader&&exactRowKey(htmlRows[at])===target.headerKey){plan.push({rows:[at++]});targetIndex--;continue;}
        valid=false;break;
      }
      while(valid&&at<htmlRows.length&&exactRowKey(htmlRows[at])===expected.at(-1)?.headerKey)plan.push({rows:[at++]});
      if(!valid||at!==htmlRows.length||!changed)continue;
      const used=plan.flatMap(item=>item.rows||[]);
      if(used.length!==htmlRows.length||new Set(used).size!==htmlRows.length)return null;
      return {groups:chained,action:{kind:'table_normalize_rows',selector:table.selector,rowKeys:htmlRows.map(exactRowKey),plan}};
    }
  }
  return null;
};

const chainedTableRepair = (table, chain) => {
  const groups=[];
  for(let groupIndex=0;groupIndex<chain.groups.length;groupIndex++){
    const group=chain.groups[groupIndex],parts=group.sourceParts||[group];
    const mapped=chain.mapping.map((target,row)=>({target,row})).filter(item=>item.target.groupIndex===groupIndex);
    const headerRows=mapped.filter(item=>item.target.isHeader).map(item=>item.row);
    const bodyRows=mapped.filter(item=>!item.target.isHeader).map(item=>item.row);
    if(!headerRows.length||bodyRows.length!==parts.reduce((sum,part)=>sum+part.rows-1,0))return null;
    let offset=0,previousBody=-1;
    const fragments=parts.map((part,index)=>{
      const rows=bodyRows.slice(offset,offset+part.rows-1);offset+=part.rows-1;
      if(!rows.length)return null;
      const between=headerRows.filter(row=>row>previousBody&&row<rows[0]);
      const headerRow=between.at(-1)??headerRows[0];previousBody=rows.at(-1);
      const pageHeight=part.pageHeightPt||part.pageWidthPt*1.4142;
      return {page:part.page,headerRow,bodyRows:rows,placement:index===0&&groupIndex===0?'original':part.topPt>pageHeight/2?'end':'start'};
    });
    if(fragments.some(fragment=>!fragment))return null;
    groups.push({headerKey:rowKey(rowsFromCells(group.cells)[0]),fragments});
  }
  const used=new Set(groups.flatMap(group=>group.fragments.flatMap(fragment=>[fragment.headerRow,...fragment.bodyRows])));
  if(used.size!==chain.htmlRows.length)return null;
  return {kind:'table_source_groups',selector:table.selector,rowKeys:chain.htmlRows.map(rowKey),groups};
};

const tableCellPresentation = (source, table, actualCells, { sourceFontMap={}, defaultSizePx=16, document={}, language='en', findings=[] }) => {
  const tableWidth = table.bounds.right-table.bounds.left, scale = pageScale(table, source.pageWidthPt);
  let differs = false;
  const actions = [];
  for (let i=0; i<source.cells.length; i++) {
    const c = source.cells[i], actual = actualCells[i], f = c.typography;
    if (c.text&&!f) findings.push(issue(language,'source_table_typography_unmapped',actual.selector,'Mixed or missing source cell typography cannot be transferred as one style.'));
    const properties = {'background-color':c.background,width:(100*c.widthPt/source.widthPt).toFixed(3)+'%','vertical-align':f?.verticalAlign||'top','box-sizing':'border-box'};
    let wrong = actual.background!==rgb(c.background) || Math.abs(actual.width/tableWidth-c.widthPt/source.widthPt)>.015;
    if (f?.verticalAlign&&actual.verticalAlign!==f.verticalAlign) wrong = true;
    for (const side of ['top','right','bottom','left']) {
      const b = c.borders[side], got = actual.borders?.[side];
      properties['border-'+side] = f&&b!=='0' ? b.replace(/^([\d.]+)pt/,(_,n)=>(Number(n)/f.sizePt)+'em') : b;
      const expected = b==='0' ? 0 : parseFloat(b)*(f?parseFloat(actual.font.size)/f.sizePt:4/3);
      if (!got || (expected===0 ? got.width!==0 : got.width<=0||Math.abs(got.width-expected)>=1||got.style!=='solid'||got.color!==rgb(b.slice(-7)))) wrong = true;
    }
    if (f) {
      const stack = sourceFontMap[f.name]||sourceFontMap[familyKey(f.name)]||sourceFontMap[familyKey(f.family)];
      const face = stack?.match(/"([^"]+)"/)?.[1];
      const samples = (document.platformFonts||[]).filter(s=>s.selector===actual.selector&&(!s.width||s.width===document.width));
      const key = s=>familyKey(s.replace(/MT$/i,''));
      const rendered = samples.some(s=>s.fonts.some(font=>font.glyphCount>0&&key(font.familyName)===key(f.name)));
      const familyOK = face ? actual.font.family.includes(face)&&(document.platformFonts===undefined||rendered) : rendered;
      if (!stack&&!familyOK) findings.push(issue(language,'source_table_font_unmapped',actual.selector,'Source cell font has no verified local font mapping.'));
      if (stack) properties['font-family'] = stack;
      properties['font-size'] = `calc(var(--reader-font-size, var(--standalone-size, ${defaultSizePx}px)) * ${f.sizePt*4/3/defaultSizePx})`;
      Object.assign(properties,{'font-weight':String(f.weight),'font-style':f.style,color:f.color,'text-align':f.align,'text-indent':(f.indentPt/f.sizePt)+'em',padding:f.paddingPt.map(n=>(n/f.sizePt)+'em').join(' ')});
      if (f.leadingPt) properties['line-height'] = String(f.leadingPt/f.sizePt);
      const size = parseFloat(actual.font.size);
      const sourceSize = f.sizePt*scale;
      if (Math.abs(size-sourceSize*4/3)>1 || !familyOK || actual.font.weight!==String(f.weight) || actual.font.style!==f.style || actual.color!==rgb(f.color) || actual.textAlign!==f.align || Math.abs(actual.indent-size*f.indentPt/f.sizePt)>.2 || actual.padding.some((p,j)=>Math.abs(p-size*f.paddingPt[j]/f.sizePt)>.2) || (f.leadingPt&&Math.abs(parseFloat(actual.lineHeight)-size*f.leadingPt/f.sizePt)>.2)) wrong = true;
    }
    if (wrong) {
      differs = true;
      findings.push(issue(language,'source_table_cell_difference',actual.selector,'Table cell fill, border, column proportion or typography differs from the PDF.',{page:source.page,width:document.width,expected:c,actual}));
      actions.push({kind:'presentation',selector:actual.selector,properties});
    }
  }
  return {differs,actions};
};

const tokens = text => normalizeText(text).match(/[\p{L}\p{N}]+/gu)||[];
const rawTokens = text => {
  const value=String(text),matches=[...value.matchAll(/[\p{L}\p{N}]+/gu)];
  return matches.map((match,i)=>({word:normalizeText(match[0]),slice:value.slice(i?match.index:0,matches[i+1]?.index??value.length)}));
};
const sourceCasedText = (text,sourceText) => {
  const source=[...String(sourceText).matchAll(/[\p{L}\p{N}]+/gu)].map(match=>match[0]);
  const target=[...String(text).matchAll(/[\p{L}\p{N}]+/gu)].map(match=>match[0]);
  // PDF font extraction can split one word into glyph runs (for example
  // "scienti fi c"). That is not a casing difference and must never authorize
  // a prose rewrite.
  if(source.length!==target.length||source.some((word,index)=>normalizeText(word)!==normalizeText(target[index])))return String(text);
  let index=0;
  return String(text).replace(/[\p{L}\p{N}]+/gu, word => source[index++] || word);
};

// Recover one source table split into malformed HTML rows/tables and adjacent
// paragraph fragments. Table columns constrain the token streams; paragraph
// tokens are accepted only when they have one unique assignment to them.
const tableTextCaseRepair = (source,table) => {
  if(source.cells.some(c=>!compact(c.text)||c.rowspan!==1||c.colspan!==1)||!table.cells||table.cells.length!==source.cells.length)return null;
  const rows=[];let changed=false;
  for(let row=0;row<source.rows;row++){
    const sourceRow=source.cells.filter(c=>c.row===row).sort((a,b)=>a.col-b.col);
    const actualRow=table.cells.filter(c=>c.row===row).sort((a,b)=>a.col-b.col);
    if(sourceRow.length!==actualRow.length)return null;
    const out=[];
    for(let i=0;i<sourceRow.length;i++){
      if(compact(sourceRow[i].text)!==compact(actualRow[i].text))return null;
      const text=sourceCasedText(actualRow[i].text,sourceRow[i].text);
      if(text!==actualRow[i].text)changed=true;
      out.push({tag:row===0?'th':'td',text});
    }
    rows.push(out);
  }
  return changed?{kind:'table_fragments',selector:table.selector,remove:table.cells.map(c=>({selector:c.selector,text:c.text})),tables:[table.selector],rows,caseOnly:true}:null;
};

const fragmentedTableRepair = (source,pageTables,records) => {
  if(source.repairCells)source={...source,rows:source.repairRows,cells:source.repairCells};
  if(!pageTables.length||source.cells.some(c=>!compact(c.text)||c.rowspan!==1||c.colspan!==1))return null;
  const ordered=pageTables.slice().sort((a,b)=>(a.nodeIndex??0)-(b.nodeIndex??0));
  const firstIndex=ordered[0].nodeIndex,lastIndex=ordered.at(-1).nodeIndex;
  if(!Number.isInteger(firstIndex)||!Number.isInteger(lastIndex))return null;
  const fragments=[];
  for(const table of ordered)for(const cell of table.cells||[]){
    const record=records.find(r=>r.selector===cell.selector);
    fragments.push({selector:cell.selector,text:cell.text,col:cell.col,nodeIndex:record?.nodeIndex??table.nodeIndex});
  }
  for(const record of records)if(record.tag==='p'&&Number(record.page)===source.page&&record.nodeIndex>firstIndex&&record.nodeIndex<lastIndex&&record.text)fragments.push({selector:record.selector,text:record.text,col:null,nodeIndex:record.nodeIndex});
  // Some converters place a repeated table header in the immediately
  // preceding paragraph, sometimes with its columns in visual rather than DOM
  // order. Admit the nearest such paragraph only when all its words occur in
  // the source grid; the unique stream solver below remains the final proof.
  const sourceWords=source.cells.flatMap(cell=>tokens(cell.text));
  const preceding=records.filter(record=>record.tag==='p'&&Number(record.page)===source.page&&record.nodeIndex<firstIndex&&record.text).sort((a,b)=>b.nodeIndex-a.nodeIndex);
  const adjacentHeader=preceding.find(record=>{
    const candidate=tokens(record.text);
    return candidate.length>0&&candidate.every(word=>sourceWords.includes(word));
  });
  if(adjacentHeader)fragments.push({selector:adjacentHeader.selector,text:adjacentHeader.text,col:null,nodeIndex:adjacentHeader.nodeIndex});
  fragments.sort((a,b)=>a.nodeIndex-b.nodeIndex);
  const streams=Array.from({length:source.columns},(_,col)=>source.cells.filter(c=>c.col===col).sort((a,b)=>a.row-b.row).flatMap(c=>tokens(c.text).map(word=>({word,row:c.row}))));
  const items=fragments.flatMap((fragment,fragmentIndex)=>rawTokens(fragment.text).map(part=>({...part,col:fragment.col,fragmentIndex})));
  if(!items.length||items.some(item=>item.col!==null&&(item.col<0||item.col>=source.columns)))return null;
  const finish=cellText=>{
    const rows=Array.from({length:source.rows},(_,row)=>Array.from({length:source.columns},(_,col)=>{
      const sourceCell=source.cells.find(c=>c.row===row&&c.col===col);
      return {tag:row===0?'th':'td',text:sourceCasedText(cellText[row][col].trim(),sourceCell?.text||'')};
    }));
    if(rows.some((row,r)=>row.some((cell,col)=>compact(cell.text)!==compact(source.cells.find(c=>c.row===r&&c.col===col)?.text||''))))return null;
    const headerKey=rows[0].map(cell=>compact(cell.text)).join('|');
    const removedRows=[];
    const outputRows=rows.filter((row,index)=>{
      const repeated=index>0&&row.map(cell=>compact(cell.text)).join('|')===headerKey;
      if(repeated)removedRows.push(row.map(cell=>cell.text).join(''));
      return !repeated;
    }).map((row,index)=>index?row.map(cell=>({...cell,tag:'td'})):row);
    return {kind:'table_fragments',selector:ordered[0].selector,remove:fragments.map(f=>({selector:f.selector,text:f.text})),tables:ordered.map(t=>t.selector),rows:outputRows,removedText:removedRows.join('')};
  };
  const memo=new Map();
  const solve=(at,positions)=>{
    const key=at+'|'+positions.join(',');if(memo.has(key))return memo.get(key);
    if(at===items.length){const done=positions.every((p,col)=>p===streams[col].length);const result=done?[[]]:[];memo.set(key,result);return result;}
    const choices=items[at].col===null?streams.map((_,col)=>col):[items[at].col],solutions=[];
    for(const col of choices){
      const expected=streams[col][positions[col]];if(!expected||expected.word!==items[at].word)continue;
      const next=positions.slice();next[col]++;
      for(const tail of solve(at+1,next)){solutions.push([col,...tail]);if(solutions.length>1){memo.set(key,solutions);return solutions;}}
    }
    memo.set(key,solutions);return solutions;
  };
  const solutions=solve(0,streams.map(()=>0));
  if(solutions.length===1){
    const positions=streams.map(()=>0),cellText=Array.from({length:source.rows},()=>Array(source.columns).fill('')),lastFragment=Array.from({length:source.rows},()=>Array(source.columns).fill(-1));
    for(let i=0;i<items.length;i++){
      const col=solutions[0][i],entry=streams[col][positions[col]++],item=items[i],current=cellText[entry.row][col];
      if(current&&lastFragment[entry.row][col]!==item.fragmentIndex&&!/\s$/u.test(current)&&!/^\s/u.test(item.slice))cellText[entry.row][col]+=' ';
      cellText[entry.row][col]+=item.slice;lastFragment[entry.row][col]=item.fragmentIndex;
    }
    const repaired=finish(cellText);if(repaired)return repaired;
  }
  const sourceWordCounts=new Map(),itemWordCounts=new Map();
  for(const cell of source.cells)for(const word of tokens(cell.text))sourceWordCounts.set(word,(sourceWordCounts.get(word)||0)+1);
  for(const item of items)itemWordCounts.set(item.word,(itemWordCounts.get(item.word)||0)+1);
  if(sourceWordCounts.size!==itemWordCounts.size||[...sourceWordCounts].some(([word,count])=>itemWordCounts.get(word)!==count))return null;
  const used=Array(items.length).fill(false),cellText=Array.from({length:source.rows},()=>Array(source.columns).fill('')),lastFragment=Array.from({length:source.rows},()=>Array(source.columns).fill(-1));
  for(const cell of source.cells.slice().sort((a,b)=>a.row-b.row||a.col-b.col)){
    const wanted=tokens(cell.text);let start=0;
    for(const word of wanted){
      let found=-1;
      for(let i=start;i<items.length;i++)if(!used[i]&&items[i].word===word){found=i;break;}
      if(found<0)for(let i=0;i<items.length;i++)if(!used[i]&&items[i].word===word){found=i;break;}
      if(found<0)break;
      used[found]=true;start=found+1;
      const item=items[found],current=cellText[cell.row][cell.col];
      if(current&&lastFragment[cell.row][cell.col]!==item.fragmentIndex&&!/\s$/u.test(current)&&!/^\s/u.test(item.slice))cellText[cell.row][cell.col]+=' ';
      cellText[cell.row][cell.col]+=item.slice;lastFragment[cell.row][cell.col]=item.fragmentIndex;
    }
  }
  if(!used.some(value=>!value)){const repaired=finish(cellText);if(repaired)return repaired;}
  const canonicalText=Array.from({length:source.rows},()=>Array(source.columns).fill(''));
  for(const cell of source.cells)canonicalText[cell.row][cell.col]=cell.text;
  return finish(canonicalText);
};

export function validateTableEvidence(tables) {
  if (!Array.isArray(tables)) throw Error('Source presentation provider must include table evidence');
  for (const t of tables) {
    if(t.pageWidthPt!==undefined&&(!Number.isFinite(t.pageWidthPt)||t.pageWidthPt<=0))throw Error('Invalid source table page width');
    if((t.topPt!==undefined||t.bottomPt!==undefined)&&(!Number.isFinite(t.topPt)||!Number.isFinite(t.bottomPt)||t.topPt<0||t.bottomPt<=t.topPt))throw Error('Invalid source table vertical bounds');
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
  const splitSources=new Set();
  const groups=sourceTableContinuations(profile);
  const paginated=Array.isArray(document.pageContainers)&&document.pageContainers.length>0;
  const consumedGroups=new Set(),consumedRaw=new Set();
  for(const table of tables){
    const normalization=normalizedChainedTableRepair(groups,table,document.records);
    if(!normalization)continue;
    matched.add(table.selector);
    normalization.groups.forEach(group=>{consumedGroups.add(group);(group.sourceParts||[group]).forEach(part=>consumedRaw.add(part));});
    findings.push(issue(language,'source_table_row_normalization',table.selector,'Wrapped source rows or exact adjacent paragraph fragments must be restored before certified page distribution.',{page:normalization.groups[0].page,nextPage:groupEndsAt(normalization.groups.at(-1))}));
    actions.push(normalization.action);
  }
  for(const table of paginated?tables:[]){
    if(matched.has(table.selector))continue;
    if(groups.some(group=>tableCandidate(group,table)))continue;
    const chain=chainedTableMatch(groups,table);
    if(!chain)continue;
    const repair=chainedTableRepair(table,chain);
    if(!repair)continue;
    matched.add(table.selector);
    chain.groups.forEach(group=>{consumedGroups.add(group);(group.sourceParts||[group]).forEach(part=>consumedRaw.add(part));});
    findings.push(issue(language,'source_table_group_distribution',table.selector,'Distinct multipage source tables were merged into one HTML table; split the certified rows by header and source page.',{page:chain.groups[0].page,nextPage:groupEndsAt(chain.groups.at(-1)),repair}));
    actions.push(repair);
  }
  for(const logical of groups.filter(source=>source.sourceParts?.length>1)){
    if(consumedGroups.has(logical))continue;
    const candidates=tables.filter(table=>(!table.page||Number(table.page)===logical.page)).map(table=>tableCandidate(logical,table)).filter(Boolean);
    if(paginated&&candidates.length===1){
      const candidate=candidates[0],fragments=logical.sourceParts.map(part=>({page:part.page,bodyRows:part.rows-1,rowKeys:rowsFromCells(part.cells).slice(1).map(rowKey)}));
      matched.add(candidate.table.selector);logical.sourceParts.forEach(part=>splitSources.add(part));
      const repair={kind:'table_source_pages',selector:candidate.table.selector,fragments};
      findings.push(issue(language,'source_table_page_distribution',candidate.table.selector,'A multipage source table was merged into one HTML page; distribute its certified rows back into their source page containers.',{page:logical.page,nextPage:logical.sourceParts.at(-1).page,repair}));
      actions.push(repair);continue;
    }
    const pageTables=tables.filter(table=>(!table.page||Number(table.page)===logical.page)),repair=fragmentedTableRepair(logical,pageTables,document.records);
    if(repair){
      pageTables.forEach(table=>matched.add(table.selector));logical.sourceParts.forEach(part=>splitSources.add(part));
      findings.push(issue(language,'source_table_fragmentation',repair.selector,'One multipage PDF table was split into malformed HTML rows or adjacent text; exact column token streams provide a deterministic reconstruction before source-page distribution.',{page:logical.page}));
      actions.push(repair);
    }
  }
  const logicalProfile=profile;
  for (const source of logicalProfile) {
    if(splitSources.has(source))continue;
    if(consumedRaw.has(source))continue;
    if(source.unmappedTranslation){findings.push(issue(language,'translated_table_unmapped','PDF page '+source.page,'Table has no unique translated counterpart; source styling cannot be certified.'));continue;}
    const candidates=tables.filter(t=>(!t.page||Number(t.page)===source.page)).map(t=>tableCandidate(source,t)).filter(Boolean);
    if(candidates.length!==1){
      const pageTables=tables.filter(t=>(!t.page||Number(t.page)===source.page));
      const paragraphRepair=!pageTables.length&&paragraphTableRepair(source,document.records);
      if(paragraphRepair){
        findings.push(issue(language,'source_table_paragraph_reconstruction',paragraphRepair.selector,'A complete source table was emitted as contiguous paragraphs; exact row and column token streams provide a deterministic reconstruction.',{page:source.page}));
        actions.push(paragraphRepair);continue;
      }
      const repair=fragmentedTableRepair(source,pageTables,document.records);
      if(repair){
        pageTables.forEach(table=>matched.add(table.selector));
        findings.push(issue(language,'source_table_fragmentation',repair.selector,'One PDF table was split into malformed HTML rows, tables or adjacent text; exact column token streams provide a deterministic reconstruction.',{page:source.page}));
        actions.push(repair);continue;
      }
      findings.push(issue(language,'source_table_unmapped','PDF page '+source.page,'Source table has no unique complete cell/text/span mapping.',sourceCoveredByPageTables(source,tables,document.records)?{severity:'warning',coverage:'source table text is present in HTML table fragments or adjacent conversion text on the same page'}:{}));
      continue;
    }
    const candidate=candidates[0],table=candidate.table,actualCells=candidate.cells;
    if(matched.has(table.selector)){findings.push(issue(language,'source_table_ambiguous',table.selector,'Multiple source tables map to this HTML table.'));continue;}
    matched.add(table.selector);matches.push({source,table});
    const caseRepair=tableTextCaseRepair(source,table);
    if(caseRepair){findings.push(issue(language,'source_table_text_case_difference',table.selector,'Table text tokens match the PDF but word casing differs after converter repair; source casing provides a deterministic correction.',{page:source.page}));actions.push(caseRepair);}
    const {differs,actions:cellActions}=tableCellPresentation(source,table,actualCells,{sourceFontMap,defaultSizePx,document,language,findings});
    if(candidate.gridRepair)findings.push(issue(language,'source_table_grid_difference',table.selector,'Empty converter spacer cells split the source table into a false grid; exact ordered source rows provide a deterministic repair.',{page:source.page}));
    if(differs||candidate.gridRepair){actions.push({kind:'presentation',selector:table.selector,properties:{'table-layout':'fixed','border-collapse':'collapse',width:'100%'}},...cellActions);if(candidate.gridRepair)actions.push(candidate.gridRepair);}
  }
  const continuations=continuationActions(tables, matched, language);
  findings.push(...continuations.findings);actions.push(...continuations.actions);
  for(const table of tables)if(!matched.has(table.selector)){
    const readable=readableColumnAction(table);
    if(readable)actions.push(readable);
    findings.push(issue(language,'html_table_unmapped',table.selector,'HTML table has no certified source grid; unsupported or ambiguous tables require a native handler.',htmlCoveredBySourceTables(table,profile)?{severity:'warning',coverage:'HTML table text is covered by source table evidence or generated contents structure'}:{}));
  }
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
