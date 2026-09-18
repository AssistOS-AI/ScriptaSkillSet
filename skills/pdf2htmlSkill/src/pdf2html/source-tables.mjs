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

const sameLine = (a,b) => Math.abs(a.top-b.top) < 1.5;
const normalized = text => String(text).replace(/\s+/g,' ').trim().toLowerCase();
const darkColor = hex => {
  const [r,g,b]=hex.match(/[\da-f]{2}/gi).map(value=>parseInt(value,16));
  return .2126*r+.7152*g+.0722*b<96;
};
function textLines(page) {
  const lines=[];
  for(const item of [...(page.text_items||[])].sort((a,b)=>a.top-b.top||a.x0-b.x0)){
    let line=lines.find(candidate=>sameLine(candidate,item));
    if(!line){line={top:item.top,bottom:item.bottom,items:[]};lines.push(line);}
    line.top=Math.min(line.top,item.top);line.bottom=Math.max(line.bottom,item.bottom);line.items.push(item);
  }
  return lines.map(line=>({...line,items:line.items.sort((a,b)=>a.x0-b.x0)}));
}
function splitLine(line,pageWidth,rectangles=[]) {
  let best=null;
  for(let i=1;i<line.items.length;i++){
    const gap=line.items[i].x0-line.items[i-1].x1;
    if(gap>=Math.max(40,pageWidth*.065)&&(!best||gap>best.gap))best={gap,index:i};
  }
  let left,right;
  if(best){left=line.items.slice(0,best.index);right=line.items.slice(best.index);}
  else {
    const middle=(line.top+line.bottom)/2;
    const fills=rectangles.filter(rect=>rect.top<=middle&&rect.bottom>=middle).sort((a,b)=>a.x0-b.x0);
    const pair=fills.slice(0,-1).map((fill,index)=>[fill,fills[index+1]]).find(([a,b])=>Math.abs(a.x1-b.x0)<1);
    if(!pair)return null;
    const split=pair[0].x1;
    left=line.items.filter(item=>(item.x0+item.x1)/2<split);
    right=line.items.filter(item=>(item.x0+item.x1)/2>=split);
    if(!left.length||!right.length)return null;
  }
  return {left,right,leftX:left[0].x0,rightX:right[0].x0,
    leftText:normalized(left.map(item=>item.text).join(' ')),rightText:normalized(right.map(item=>item.text).join(' '))};
}
function borderlessCandidate(page,lines,headerIndex,minRows) {
  const header=splitLine(lines[headerIndex],page.width_pt,page.rectangles||[]);
  if(!header||header.rightX-header.leftX<35||!header.leftText||!header.rightText)return null;
  const rows=[];let current=null,bodySize=null;
  for(let index=headerIndex+1;index<lines.length;index++){
    const line=lines[index];
    if(line.top-lines[Math.max(headerIndex,index-1)].bottom>36)break;
    if(line.items.some(item=>item.x0<header.rightX-2&&item.x1>header.rightX+2))break;
    const left=line.items.filter(item=>item.x0<header.rightX-2),right=line.items.filter(item=>item.x0>=header.rightX-2);
    const sizes=line.items.map(item=>item.size_pt).filter(Number.isFinite).sort((a,b)=>a-b);
    const lineSize=sizes.length?sizes[Math.floor(sizes.length/2)]:null;
    const sameBodyScale=bodySize===null||lineSize===null||Math.abs(lineSize-bodySize)<=Math.max(1,bodySize*.2);
    const previous=current?.lines.at(-1),lineHeight=Math.max(line.bottom-line.top,previous?previous.bottom-previous.top:0);
    const startsRow=left.length&&right.length&&sameBodyScale&&Math.abs(left[0].x0-header.leftX)<8&&Math.abs(right[0].x0-header.rightX)<8;
    const advance=previous?line.top-previous.top:Infinity;
    const continues=current&&advance<=Math.max(3,lineHeight*1.75)&&!(startsRow&&advance<lineHeight*.75)&&(left.length||right.length);
    // Inline links and superscripts can have a slightly shifted baseline and
    // begin later inside the right column. They still belong to the current
    // cell as long as no text crosses back into the left column.
    if(continues)current.lines.push(line);
    else if(startsRow){bodySize??=lineSize;current={lines:[line]};rows.push(current);}
    else break;
  }
  if(rows.length<minRows)return null;
  const all=[lines[headerIndex],...rows.flatMap(row=>row.lines)],textRight=Math.max(...all.flatMap(line=>line.items.map(item=>item.x1)));
  const headerFills=(page.rectangles||[]).filter(rect=>rect.x0<=header.leftX&&rect.x1>=header.leftX&&rect.top<=lines[headerIndex].top+1&&rect.bottom>=lines[headerIndex].bottom-1).sort((a,b)=>a.x0-b.x0);
  const firstFill=headerFills.find(rect=>rect.x0<=header.leftX&&rect.x1<header.rightX);
  const secondFill=firstFill&&(page.rectangles||[]).find(rect=>Math.abs(rect.x0-firstFill.x1)<1&&rect.x0<=header.rightX&&rect.x1>=header.rightX&&Math.abs(rect.top-firstFill.top)<1&&Math.abs(rect.bottom-firstFill.bottom)<1);
  const left=firstFill?.x0??header.leftX,split=firstFill?.x1??header.rightX,right=secondFill?.x1??textRight;
  if(right-left<page.width_pt*.45)return null;
  const groups=[{lines:[lines[headerIndex]]},...rows],tops=groups.map(group=>group.lines[0].top);
  const bottoms=groups.map((group,index)=>index+1<groups.length?(group.lines.at(-1).bottom+tops[index+1])/2:group.lines.at(-1).bottom+3);
  const cells=groups.flatMap((group,row)=>[left,split].map((cellLeft,col)=>({start_row_offset_idx:row,start_col_offset_idx:col,row_span:1,col_span:1,bbox:{l:cellLeft,r:col?right:split,t:row?bottoms[row-1]:tops[0]-3,b:bottoms[row]}})));
  return {kind:'borderless',header:[header.leftText,header.rightText],bbox:{l:left,r:right,t:tops[0]-3,b:bottoms.at(-1)},num_rows:groups.length,num_cols:2,table_cells:cells};
}
export function borderlessGrids(pages) {
  const result=new Map(),previous=[],pending=[];
  for(const page of pages){
    const lines=textLines(page),accepted=[];
    for(let i=0;i<lines.length;i++){
      let candidate=borderlessCandidate(page,lines,i,2);
      if(!candidate){
        const continuation=borderlessCandidate(page,lines,i,1);
        const prior=previous.find(grid=>grid.page===page.page_number-1&&continuation&&grid.header.every((text,index)=>text===continuation.header[index])&&Math.abs((grid.bbox.r-grid.bbox.l)-(continuation.bbox.r-continuation.bbox.l))<.5);
        if(prior)candidate=continuation;
        else if(continuation)pending.push({...continuation,page:page.page_number});
      }
      if(!candidate||accepted.some(grid=>candidate.bbox.t<grid.bbox.b&&candidate.bbox.b>grid.bbox.t))continue;
      accepted.push(candidate);previous.push({...candidate,page:page.page_number});
      // A multipage table may start with only one body row. Certify that
      // pending fragment once the next page establishes the repeated grid.
      const predecessor=pending.find(grid=>grid.page===page.page_number-1&&grid.header.every((text,index)=>text===candidate.header[index])&&Math.abs((grid.bbox.r-grid.bbox.l)-(candidate.bbox.r-candidate.bbox.l))<.5);
      if(predecessor){
        const priorAccepted=result.get(predecessor.page)||[];
        if(!priorAccepted.some(grid=>predecessor.bbox.t<grid.bbox.b&&predecessor.bbox.b>grid.bbox.t))priorAccepted.push(predecessor);
        result.set(predecessor.page,priorAccepted);previous.push(predecessor);
      }
    }
    result.set(page.page_number,accepted);
  }
  return result;
}

// Export source evidence, not HTML or an executable repair plan. Reuse the
// converter's closed-grid recognizer and per-edge stroke matching.
export function sourceTables(evidence) {
  const tables = [];
  const borderless=borderlessGrids(evidence.pages);
  for (const page of evidence.pages) for (const grid of (()=>{
    const ruled=ruledGrids(page.strokes||[]);
    const certified=[...ruled,...filledGrids(page).filter(g=>!ruled.some(r=>g.bbox.l<r.bbox.r&&g.bbox.r>r.bbox.l&&g.bbox.t<r.bbox.b&&g.bbox.b>r.bbox.t))];
    return [...certified,...(borderless.get(page.page_number)||[]).filter(g=>!certified.some(r=>g.bbox.l<r.bbox.r&&g.bbox.r>r.bbox.l&&g.bbox.t<r.bbox.b&&g.bbox.b>r.bbox.t))];
  })()) {
    const cells = grid.table_cells.map(cell => {
      const b = cell.bbox;
      const words = (grid.kind==='borderless'?page.text_items:page.words).filter(w => {
        const x = (w.x0 + w.x1) / 2, y = (w.top + w.bottom) / 2;
        return x > b.l && x < b.r && y > b.t && y < b.b;
      // Link annotations and split glyph runs can sit a couple of points off
      // the surrounding baseline. Keep visual-line reading order before
      // moving to the next line.
      }).sort((a,b) => Math.abs(a.top-b.top) > 2.5 ? a.top-b.top : a.x0-b.x0);
      const fills = (page.rectangles || []).filter(r => grid.kind==='borderless'
        ? r.x0 <= (b.l+b.r)/2 && r.x1 >= (b.l+b.r)/2 && r.top <= (b.t+b.b)/2 && r.bottom >= (b.t+b.b)/2
        : r.x0 <= b.l+1 && r.x1 >= b.r-1 && r.top <= b.t+1 && r.bottom >= b.b-1)
        .sort((a,b) => (a.x1-a.x0)*(a.bottom-a.top)-(b.x1-b.x0)*(b.bottom-b.top));
      const styleKey=w=>[w.font_name,Math.round(w.size_pt*10),w.color,!!w.bold,!!w.italic].join('|');
      const styles=new Map();
      for(const word of words){const key=styleKey(word),entry=styles.get(key)||{count:0,sample:word};entry.count++;styles.set(key,entry);}
      const dominant=[...styles.values()].sort((a,b)=>b.count-a.count)[0];
      // A trailing link may have a larger annotation font while the cell's
      // paragraph typography is otherwise uniform. Transfer that dominant
      // base style; genuinely mixed cells remain explicit.
      const sample=dominant&&dominant.count/words.length>=.8?dominant.sample:null;
      const lines = [];
      for (const w of words) {
        let line = lines.find(l => Math.abs(l.top-w.top)<1);
        if (!line) { line={top:w.top,left:w.x0,right:w.x1}; lines.push(line); }
        line.left=Math.min(line.left,w.x0);
        line.right=Math.max(line.right,w.x1);
      }
      const advances=lines.slice(1).map((l,i)=>l.top-lines[i].top).sort((a,b)=>a-b);
      const left=words.length?Math.min(...words.map(w=>w.x0)):b.l;
      const background=fills[0]?.fill_color || '#ffffff';
      return { row:cell.start_row_offset_idx, col:cell.start_col_offset_idx, rowspan:cell.row_span, colspan:cell.col_span,
        text:words.map(w=>w.text).join(' '), widthPt:b.r-b.l,
        background,
        borders:Object.fromEntries([['top',b.t,b.l,b.r],['right',b.r,b.t,b.b],['bottom',b.b,b.l,b.r],['left',b.l,b.t,b.b]].map(([side,pos,start,end])=>[side,sourceBorder(page.strokes,side,pos,start,end)])),
        typography:sample?{family:sample.font_family,name:sample.font_name,sizePt:sample.size_pt,color:darkColor(background)?'#ffffff':sample.color,weight:sample.bold?700:400,style:sample.italic?'italic':'normal',
          align:lines.every(l=>Math.abs((l.left-b.l)-(b.r-l.right))<1.5)?'center':'left',
          verticalAlign:Math.abs((Math.min(...words.map(w=>w.top))-b.t)-(b.b-Math.max(...words.map(w=>w.bottom))))<2?'middle':'top',
          leadingPt:advances.length?advances[Math.floor(advances.length/2)]:null,
          indentPt:lines.length>1?Math.max(0,lines[0].left-left):0,
          // The empty area below short text is row height supplied by the
          // adjacent cell, not CSS bottom padding. Use the observed top inset
          // symmetrically so responsive rows can size to their content.
          paddingPt:[Math.max(0,Math.min(...words.map(w=>w.top))-b.t),Math.max(0,left-b.l),Math.max(0,Math.min(...words.map(w=>w.top))-b.t),Math.max(0,left-b.l)]}:null };
    });
    tables.push({page:page.page_number,pageWidthPt:page.width_pt,topPt:grid.bbox.t,bottomPt:grid.bbox.b,rows:grid.num_rows,columns:grid.num_cols,widthPt:grid.bbox.r-grid.bbox.l,cells});
  }
  return tables;
}
