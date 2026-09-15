import { ruledGrids } from './table-recovery.mjs';
import { sourceBorder } from './tables.mjs';

// Alternating cell fills can specify columns without any vertical strokes.
// Require complete fill partitions, horizontal row boundaries and text inside
// every inferred column. A decorative rectangle alone is never a table.
export function filledGrids(page) {
  const groups=[];
  for(const s of page.strokes||[]){
    if(s.bottom-s.top>1||s.x1-s.x0<20)continue;
    let group=groups.find(g=>Math.abs(g.left-s.x0)<1&&Math.abs(g.right-s.x1)<1);
    if(!group){group={left:s.x0,right:s.x1,lines:[]};groups.push(group);}
    group.lines.push(s.top);
  }
  const result=[];
  for(const g of groups){
    const ys=[...new Set(g.lines.map(y=>Math.round(y*10)/10))].sort((a,b)=>a-b);
    const bands=ys.slice(1).map((bottom,i)=>{
      const top=ys[i];
      const fills=(page.rectangles||[]).filter(r=>Math.abs(r.top-top)<1&&Math.abs(r.bottom-bottom)<1&&r.x0>=g.left-1&&r.x1<=g.right+1).sort((a,b)=>a.x0-b.x0);
      const partition=fills.length>=2&&Math.abs(fills[0].x0-g.left)<1&&Math.abs(fills.at(-1).x1-g.right)<1&&fills.slice(1).every((r,j)=>Math.abs(r.x0-fills[j].x1)<1);
      return {top,bottom,xs:partition?[g.left,...fills.slice(1).map(r=>r.x0),g.right]:null};
    });
    for(let i=0;i<bands.length;i++){
      if(!bands[i].xs)continue;
      const xs=bands[i].xs, rows=[];
      const valid=band=>{
        if(band.bottom-band.top>100)return false;
        if(band.xs&&(band.xs.length!==xs.length||band.xs.some((x,k)=>Math.abs(x-xs[k])>1)))return false;
        const words=page.words.filter(w=>w.top>=band.top-1&&w.bottom<=band.bottom+1&&w.x0>=g.left-1&&w.x1<=g.right+1);
        return words.length&&words.every(w=>xs.slice(1).some((x,k)=>w.x0>=xs[k]-1&&w.x1<=x+1))&&xs.slice(1).every((x,k)=>words.some(w=>(w.x0+w.x1)/2>xs[k]&&(w.x0+w.x1)/2<x));
      };
      if(!valid(bands[i]))continue;
      while(i<bands.length&&valid(bands[i]))rows.push(bands[i++]);
      i--;
      if(rows.length<2)continue;
      result.push({bbox:{l:g.left,r:g.right,t:rows[0].top,b:rows.at(-1).bottom},num_rows:rows.length,num_cols:xs.length-1,table_cells:rows.flatMap((r,row)=>xs.slice(1).map((right,col)=>({start_row_offset_idx:row,start_col_offset_idx:col,row_span:1,col_span:1,bbox:{l:xs[col],r:right,t:r.top,b:r.bottom}})))});
    }
  }
  return result;
}

// Export source evidence, not HTML or an executable repair plan. Reuse the
// converter's closed-grid recognizer and per-edge stroke matching.
export function sourceTables(evidence) {
  const tables = [];
  for (const page of evidence.pages) for (const grid of (()=>{
    const ruled=ruledGrids(page.strokes||[]);
    return [...ruled,...filledGrids(page).filter(g=>!ruled.some(r=>g.bbox.l<r.bbox.r&&g.bbox.r>r.bbox.l&&g.bbox.t<r.bbox.b&&g.bbox.b>r.bbox.t))];
  })()) {
    const cells = grid.table_cells.map(cell => {
      const b = cell.bbox;
      const words = page.words.filter(w => {
        const x = (w.x0 + w.x1) / 2, y = (w.top + w.bottom) / 2;
        return x > b.l && x < b.r && y > b.t && y < b.b;
      }).sort((a,b) => Math.abs(a.top-b.top) > 1 ? a.top-b.top : a.x0-b.x0);
      const fills = (page.rectangles || []).filter(r => r.x0 <= b.l+1 && r.x1 >= b.r-1 && r.top <= b.t+1 && r.bottom >= b.b-1)
        .sort((a,b) => (a.x1-a.x0)*(a.bottom-a.top)-(b.x1-b.x0)*(b.bottom-b.top));
      const sample = words[0];
      const uniform = sample && words.every(w => w.font_name === sample.font_name && Math.abs(w.size_pt-sample.size_pt)<.1 && w.color===sample.color && !!w.bold===!!sample.bold && !!w.italic===!!sample.italic);
      const lines = [];
      for (const w of words) {
        let line = lines.find(l => Math.abs(l.top-w.top)<1);
        if (!line) { line={top:w.top,left:w.x0,right:w.x1}; lines.push(line); }
        line.left=Math.min(line.left,w.x0);
        line.right=Math.max(line.right,w.x1);
      }
      const advances=lines.slice(1).map((l,i)=>l.top-lines[i].top).sort((a,b)=>a-b);
      const left=words.length?Math.min(...words.map(w=>w.x0)):b.l;
      return { row:cell.start_row_offset_idx, col:cell.start_col_offset_idx, rowspan:cell.row_span, colspan:cell.col_span,
        text:words.map(w=>w.text).join(' '), widthPt:b.r-b.l,
        background:fills[0]?.fill_color || '#ffffff',
        borders:Object.fromEntries([['top',b.t,b.l,b.r],['right',b.r,b.t,b.b],['bottom',b.b,b.l,b.r],['left',b.l,b.t,b.b]].map(([side,pos,start,end])=>[side,sourceBorder(page.strokes,side,pos,start,end)])),
        typography:uniform?{family:sample.font_family,name:sample.font_name,sizePt:sample.size_pt,color:sample.color,weight:sample.bold?700:400,style:sample.italic?'italic':'normal',
          align:lines.every(l=>Math.abs((l.left-b.l)-(b.r-l.right))<1.5)?'center':'left',
          verticalAlign:Math.abs((Math.min(...words.map(w=>w.top))-b.t)-(b.b-Math.max(...words.map(w=>w.bottom))))<2?'middle':'top',
          leadingPt:advances.length?advances[Math.floor(advances.length/2)]:null,
          indentPt:lines.length>1?Math.max(0,lines[0].left-left):0,
          paddingPt:[Math.max(0,Math.min(...words.map(w=>w.top))-b.t),Math.max(0,left-b.l),Math.max(0,b.b-Math.max(...words.map(w=>w.bottom))),Math.max(0,left-b.l)]}:null };
    });
    tables.push({page:page.page_number,pageWidthPt:page.width_pt,rows:grid.num_rows,columns:grid.num_cols,widthPt:grid.bbox.r-grid.bbox.l,cells});
  }
  return tables;
}
