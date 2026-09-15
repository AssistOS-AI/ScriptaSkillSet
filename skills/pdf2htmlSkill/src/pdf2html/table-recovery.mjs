import { tokens } from './common.mjs';
const tolerance = 1;
const cluster = values => {
  const groups=[];
  for(const value of values.sort((a,b)=>a-b)) {
    if(!groups.length || value-groups.at(-1).at(-1)>tolerance) groups.push([value]);else groups.at(-1).push(value);
  }
  return groups.map(group=>group.reduce((a,b)=>a+b,0)/group.length);
};
function covered(segments,start,end) {
  let cursor=start;
  for(const [left,right] of segments.sort((a,b)=>a[0]-b[0])) {if(left>cursor+tolerance) break;if(right>=cursor-tolerance) cursor=Math.max(cursor,right);}
  return cursor>=end-tolerance;
}
function intersects(a,b) {return a.x0<=b.x1+tolerance && b.x0<=a.x1+tolerance && a.top<=b.bottom+tolerance && b.top<=a.bottom+tolerance;}
export function ruledGrids(strokes) {
  const pending=strokes.filter(line=>(line.x1-line.x0>8 && line.bottom-line.top<tolerance)||(line.bottom-line.top>8 && line.x1-line.x0<tolerance)),groups=[];
  while(pending.length) {
    const group=[pending.pop()];
    for(let index=0;index<group.length;index++) for(let cursor=pending.length-1;cursor>=0;cursor--) if(intersects(group[index],pending[cursor])) group.push(...pending.splice(cursor,1));
    groups.push(group);
  }
  return groups.flatMap(group=>{
    const horizontal=group.filter(line=>line.bottom-line.top<tolerance),vertical=group.filter(line=>line.x1-line.x0<tolerance);
    const xs=cluster(vertical.map(line=>line.x0)),ys=cluster(horizontal.map(line=>line.top));
    if(xs.length<3 || ys.length<3 || xs.length*ys.length>10000) return [];
    const h=(y,left,right)=>covered(horizontal.filter(line=>Math.abs(line.top-y)<=tolerance).map(line=>[line.x0,line.x1]),left,right);
    const v=(x,top,bottom)=>covered(vertical.filter(line=>Math.abs(line.x0-x)<=tolerance).map(line=>[line.top,line.bottom]),top,bottom);
    if(!h(ys[0],xs[0],xs.at(-1)) || !h(ys.at(-1),xs[0],xs.at(-1)) || !v(xs[0],ys[0],ys.at(-1)) || !v(xs.at(-1),ys[0],ys.at(-1))) return [];
    const rows=ys.length-1,cols=xs.length-1,seen=new Set(),cells=[];
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      const key=`${row},${col}`;if(seen.has(key))continue;
      const queue=[[row,col]];seen.add(key);
      for(let i=0;i<queue.length;i++) {
        const [r,c]=queue[i],next=[];
        if(c>0&&!v(xs[c],ys[r],ys[r+1]))next.push([r,c-1]);
        if(c+1<cols&&!v(xs[c+1],ys[r],ys[r+1]))next.push([r,c+1]);
        if(r>0&&!h(ys[r],xs[c],xs[c+1]))next.push([r-1,c]);
        if(r+1<rows&&!h(ys[r+1],xs[c],xs[c+1]))next.push([r+1,c]);
        for(const [nr,nc] of next)if(!seen.has(`${nr},${nc}`)){seen.add(`${nr},${nc}`);queue.push([nr,nc]);}
      }
      const firstRow=Math.min(...queue.map(([r])=>r)),lastRow=Math.max(...queue.map(([r])=>r))+1,firstCol=Math.min(...queue.map(([,c])=>c)),lastCol=Math.max(...queue.map(([,c])=>c))+1;
      if(queue.length!==(lastRow-firstRow)*(lastCol-firstCol))return [];
      cells.push({start_row_offset_idx:firstRow,end_row_offset_idx:lastRow,start_col_offset_idx:firstCol,end_col_offset_idx:lastCol,row_span:lastRow-firstRow,col_span:lastCol-firstCol,text:'',column_header:false,row_header:false,row_section:false,bbox:{l:xs[firstCol],t:ys[firstRow],r:xs[lastCol],b:ys[lastRow],coord_origin:'TOPLEFT'}});
    }
    if(cells.length<3)return [];
    return [{bbox:{l:xs[0],t:ys[0],r:xs.at(-1),b:ys.at(-1),coord_origin:'TOPLEFT'},num_rows:rows,num_cols:cols,table_cells:cells}];
  });
}
function location(item,page) {
  const p=item.prov?.[0];if(p?.page_no!==page.page_number)return null;
  const b=p.bbox;return b.coord_origin==='BOTTOMLEFT'?{l:b.l,r:b.r,t:page.height_pt-b.t,b:page.height_pt-b.b}:b;
}
const contains=(outer,inner,padding=2)=>inner.l>=outer.l-padding&&inner.r<=outer.r+padding&&inner.t>=outer.t-padding&&inner.b<=outer.b+padding;
const overlaps=(a,b)=>a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;
/** Recover only fully ruled grids whose existing semantic text can be assigned without loss. */
export function recoverRuledTables(document,evidence) {
  for(const page of evidence.pages) for(const grid of ruledGrids(page.strokes)) {
    if(document.tables.some(table=>{const box=location(table,page);return box&&overlaps(box,grid.bbox);}))continue;
    const items=document.texts.filter(item=>{
      const box=location(item,page);return box&&contains(grid.bbox,box)&&(!item.content_layer||item.content_layer==='body')&&!item.children?.length;
    });
    if(items.length<2 || items.some(item=>item.parent?.$ref!==items[0].parent?.$ref))continue;
    const assignments=items.map(item=>grid.table_cells.find(cell=>contains(cell.bbox,location(item,page))));
    if(assignments.some(cell=>!cell))continue;
    const source=page.words.filter(word=>contains(grid.bbox,{l:word.x0,r:word.x1,t:word.top,b:word.bottom}));
    const sourceTokens=source.map(word=>word.token).sort(),itemTokens=tokens(items.map(item=>item.text).join(' ')).sort();
    if(sourceTokens.join(' ')!==itemTokens.join(' '))continue;
    const parentRef=items[0].parent.$ref,parent=parentRef.split('/').slice(1).reduce((value,key)=>value?.[key],document);
    if(!parent?.children)continue;
    const ids=new Set(items.map(item=>item.self_ref)),positions=parent.children.flatMap((ref,index)=>ids.has(ref.$ref)?[index]:[]);
    if(positions.length!==items.length || positions.at(-1)-positions[0]+1!==positions.length)continue;
    for(let i=0;i<items.length;i++)assignments[i].text+=(assignments[i].text?' ':'')+items[i].text;
    const ref=`#/tables/${document.tables.length}`,table={self_ref:ref,parent:{$ref:parentRef},children:[],content_layer:'body',label:'table',prov:[{page_no:page.page_number,bbox:grid.bbox,charspan:[0,0]}],captions:[],references:[],footnotes:[],data:grid};
    document.tables.push(table);parent.children.splice(positions[0],positions.length,{$ref:ref});
  }
  return document;
}
