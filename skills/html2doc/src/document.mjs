import fs from 'node:fs';
import path from 'node:path';
import { html, select, escape as e, imageSize } from './runtime.mjs';
import { StyleResolver, points, color, localAsset } from './css.mjs';
export const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PR='http://schemas.openxmlformats.org/package/2006/relationships';
export const text=n=>html.DomUtils.textContent(n).trim().replace(/\s+/gu,' ');
export const tokens=s=>(s.toLowerCase().replaceAll('\u00ad','').match(/[\p{L}\p{N}_]+/gu)||[]);
export const hidden=n=>['script','style','noscript','template'].includes(n.name)||Object.hasOwn(n.attribs||{},'hidden')||n.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attribs?.style||'');
const inside=(n,parent)=>{for(let p=n;p;p=p.parent)if(p===parent)return true;return false;};
const pageOf=n=>{for(let p=n;p;p=p.parent)if(p.name==='section'&&(p.attribs.class||'').split(/\s+/).includes('source-page'))return p;return null;};
export function analyze(source){
 const doc=html.parseDocument(fs.readFileSync(source,'utf8')),root=select.selectOne('main[data-reader-content]',doc);
 if(!root)throw new Error('Input is not Scripta HTML: main[data-reader-content] is missing.');
 for(const node of select.selectAll('*',root).filter(hidden))html.DomUtils.removeElement(node);
 const all=select.selectAll('*',root), headings=select.selectAll('h1,h2,h3,h4,h5,h6',root);
 const toc=select.selectOne('table.toc-table, nav.contents-list',root)||(()=>{const h=headings.find(h=>/^(contents|table of contents)$/i.test(text(h)));return h?pageOf(h)||h:null;})();
 const firstPage=select.selectOne('section.source-page',root);
 const cover=firstPage&&((firstPage.attribs.class||'').includes('source-page-full-image')||(select.selectOne('h1',firstPage)&&firstPage.children.filter(n=>['h1','h2','p','figure'].includes(n.name)).length<=5))?firstPage:null;
 const body=headings.filter(h=>['h1','h2'].includes(h.name)).find(h=>toc?all.indexOf(h)>Math.max(...all.filter(n=>inside(n,toc)).map(n=>all.indexOf(n))):!cover||!inside(h,cover));
 const entries=body?headings.filter(h=>['h1','h2','h3'].includes(h.name)&&headings.indexOf(h)>=headings.indexOf(body)):[];
 for(const [i,h] of entries.entries())h.attribs.id ||= `html2doc-heading-${String(i+1).padStart(4,'0')}`;
 const labelHeading=toc&&(/h[1-3]/.test(toc.name)?toc:select.selectOne('h1,h2,h3',toc));
 const label=labelHeading&&/^(contents|table of contents)$/i.test(text(labelHeading))?text(labelHeading):toc&&/^(nav|table)$/.test(toc.name)&&toc.attribs['aria-label']&&!/^PDF page \d+$/i.test(toc.attribs['aria-label'])?toc.attribs['aria-label']:'Contents';
 const candidates=toc?select.selectAll('p,li',toc):[];let cursor=0;
 const boldness=entries.map(h=>{const wanted=tokens(text(h));let collected=[],bold=0,total=0,matched=false,j=cursor;while(j<candidates.length){const c=candidates[j++],ts=tokens(text(c));if(!ts.length)continue;const proposed=[...collected,...ts];if(JSON.stringify(wanted.slice(0,proposed.length))!==JSON.stringify(proposed)){if(!collected.length)continue;break;}collected=proposed;total+=ts.length;bold+=select.selectAll('strong,b',c).reduce((s,n)=>s+tokens(text(n)).length,0);if(collected.length===wanted.length){matched=true;cursor=j;break;}}return matched&&total?bold/total>=.6:h.name==='h1';});
 const visible=n=>!toc||!inside(n,toc);
 const notes=new Map(select.selectAll('[role=doc-footnote],[role=doc-endnote]',root).map(n=>[n.attribs.id,{kind:n.attribs.role==='doc-footnote'?'footnote':'endnote',text:text(n)}]));
 for(const ref of select.selectAll('a[role=doc-noteref]',root))if(!notes.has((ref.attribs.href||'').slice(1)))throw new Error('Semantic note reference targets a missing footnote/endnote.');
 const sourceParts=[];const collect=n=>{if(n===toc||['doc-noteref','doc-footnote','doc-endnote'].includes(n.attribs?.role))return;if(n.type==='text'&&n.data.trim())sourceParts.push(n.data.trim());for(const child of n.children||[])collect(child);};collect(root);
 for(const kind of ['footnote','endnote'])for(const note of notes.values())if(note.kind===kind)sourceParts.push(note.text);
 return {doc,root,toc,body,cover,entries,boldness,label,notes,headings:headings.filter(visible).filter(h=>!(toc&&['nav','table'].includes(toc.name)&&/^(contents|table of contents)$/i.test(text(h)))),sourceTokens:tokens(sourceParts.join(' ')),images:select.selectAll('img',root).filter(visible).length,tables:select.selectAll('table',root).filter(visible).length,links:select.selectAll('a[href]',root).filter(visible).filter(n=>n.attribs.role!=='doc-noteref'&&!select.selectOne('a[href]',n)).length};
}
const twip=value=>Math.round(value*20);
const bookMark=s=>'b_'+String(s).replace(/[^\p{L}\p{N}_]/gu,'_').slice(0,38);
export function generate(source,options={}){
 const a=analyze(source),css=new StyleResolver(a.doc,source),rootStyle=css.style(select.selectOne('html',a.doc)),bodyNode=select.selectOne('body',a.doc);
 const firstTitle=select.selectOne('h1',a.root),titlePage=pageOf(firstTitle);
 const width=points(rootStyle['--pdf-page-width'])||595.28,height=points(rootStyle['--pdf-page-height'])||841.89;
 const base=Math.max(8,Math.min(14,points(css.resolve(bodyNode,'font-size'))||points(rootStyle['--pdf-body-size'])||11));
 let family=(css.resolve(bodyNode,'font-family')||'Georgia').split(',')[0].replace(/["']/g,'').trim();if(['serif','sans-serif','system-ui'].includes(family))family=family==='serif'?'Georgia':'Arial';
 const margins=select.selectAll('section.source-page',a.root).flatMap(n=>['--pdf-page-left','--pdf-page-right','--pdf-page-top'].map(k=>points(css.style(n)[k],base,width))).filter(n=>n>=18&&n<=width*.25).sort((a,b)=>a-b),margin=margins.length?margins[Math.floor(margins.length/2)]:72;
 const metadata={title:options.title||text(firstTitle||select.selectOne('title',a.doc)||a.root)||path.basename(path.dirname(source)),author:options.author??select.selectOne('meta[name=author]',a.doc)?.attribs.content??'',language:options.language||select.selectOne('html',a.doc)?.attribs.lang||'und',width,height,margin,base,family};
 const relationships=[],media=[],notes={footnote:[],endnote:[]};let bookmarkId=0,body=false,tocDone=false,pagePending=false,frontPages=0;
 let blocks=[],pending=[];
 const relation=(type,target,external=false)=>{const id=`rScripta${relationships.length+1}`;relationships.push(`<Relationship Id="${id}" Type="${R}/${type}" Target="${e(target)}"${external?' TargetMode="External"':''}/>`);return id;};
 const knownBookmarks=new Set();
 const bookmark=id=>{if(!id||knownBookmarks.has(id))return '';knownBookmarks.add(id);const num=++bookmarkId;return `<w:bookmarkStart w:id="${num}" w:name="${e(bookMark(id))}"/><w:bookmarkEnd w:id="${num}"/>`;};
 const sect=(fmt)=>`<w:sectPr><w:footerReference w:type="default" r:id="rScriptaFooter"/><w:type w:val="nextPage"/><w:pgSz w:w="${twip(width)}" w:h="${twip(height)}"${width>height?' w:orient="landscape"':''}/><w:pgMar w:top="${twip(margin)}" w:right="${twip(margin)}" w:bottom="${twip(margin)}" w:left="${twip(margin)}" w:header="560" w:footer="560" w:gutter="0"/><w:pgNumType w:fmt="${fmt}" w:start="1"/></w:sectPr>`;
 const run=(value,style='')=>`<w:r><w:rPr>${style}${/<w:b(?:\s|\/|>)/.test(style)?'':'<w:b w:val="0"/>'}${/<w:i(?:\s|\/|>)/.test(style)?'':'<w:i w:val="0"/>'}</w:rPr><w:t xml:space="preserve">${e(value)}</w:t></w:r>`;
 function picture(n){const file=localAsset(source,n.attribs.src||''),data=fs.readFileSync(file);const ext=path.extname(file).slice(1).toLowerCase();if(!['png','jpg','jpeg','gif','bmp','tif','tiff'].includes(ext))throw new Error(`Unsupported image type: ${ext}`);const dimensions=imageSize(data);if(!dimensions.width||!dimensions.height)throw new Error('Invalid image dimensions.');
 const available=width-2*margin,w=Math.max(36,Math.min(available,points(css.resolve(n,'width'),base,available)||dimensions.width*.75)),h=w*dimensions.height/dimensions.width;
 const name=`image${media.length+1}.${ext}`,id=relation('image',`media/${name}`);media.push({name,data,ext});const num=media.length;
 return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(w*12700)}" cy="${Math.round(h*12700)}"/><wp:docPr id="${num}" name="${name}" descr="${e(n.attribs.alt||'')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${num}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w*12700)}" cy="${Math.round(h*12700)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;}
 function inline(n,style='',code=false){if(n.type==='text')return run(code?n.data:n.data.replace(/\s+/gu,' '),style);if(!n.name||hidden(n))return '';if(n.name==='br')return '<w:r><w:br/></w:r>';if(n.name==='img')return picture(n);
 if(n.name==='a'){const href=n.attribs.href||'';if(n.attribs.role==='doc-noteref'){const note=a.notes.get(href.slice(1));const id=notes[note.kind].push(note.text);return `<w:r><w:rPr><w:rStyle w:val="${note.kind==='footnote'?'FootnoteReference':'EndnoteReference'}"/></w:rPr><w:${note.kind}Reference w:id="${id}"/></w:r>`;}const content=(n.children||[]).map(c=>inline(c,style,code)).join('');return !href?content:href.startsWith('#')?`<w:hyperlink w:anchor="${e(bookMark(href.slice(1)))}">${content}</w:hyperlink>`:`<w:hyperlink r:id="${relation('hyperlink',href,true)}">${content}</w:hyperlink>`;}
 const tags={strong:'<w:b/>',b:'<w:b/>',em:'<w:i/>',i:'<w:i/>',cite:'<w:i/>',u:'<w:u w:val="single"/>',s:'<w:strike/>',del:'<w:strike/>',sup:'<w:vertAlign w:val="superscript"/>',sub:'<w:vertAlign w:val="subscript"/>',code:'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/>'};
 return (n.children||[]).map(c=>inline(c,style+(tags[n.name]||''),code||n.name==='code')).join('');}
 function paragraph(n,style='Normal',extra='',content=null){const resolve=k=>css.resolve(n,k),props=[`<w:pStyle w:val="${style}"/>`];if(pagePending){props.push('<w:pageBreakBefore/>');pagePending=false;}
 const alignment={start:'left',end:'right',justify:'both'}[resolve('text-align')]||resolve('text-align');if(alignment)props.push(`<w:jc w:val="${e(alignment)}"/>`);
 const indent=[];for(const [k,attr] of [['text-indent','firstLine'],['margin-left','left'],['margin-right','right']]){const v=points(resolve(k),base,width);if(v!==null&&Math.abs(v)<=width/2)indent.push(`w:${attr}="${twip(v)}"`);}if(indent.length)props.push(`<w:ind ${indent.join(' ')}/>`);
 const spacing=[];for(const [k,attr] of [['margin-top','before'],['margin-bottom','after']]){const v=points(resolve(k),base,width);if(v!==null&&Math.abs(v)<=width/2)spacing.push(`w:${attr}="${twip(v)}"`);}if(/^\d*\.?\d+$/.test(resolve('line-height')||''))spacing.push(`w:line="${Math.round(240*Math.max(.8,Math.min(/^h/.test(n.name)?1.15:3,Number(resolve('line-height')))))}" w:lineRule="auto"`);if(spacing.length)props.push(`<w:spacing ${spacing.join(' ')}/>`);
 if(['page','always'].includes(resolve('break-before')||resolve('page-break-before')))props.push('<w:pageBreakBefore/>');
 let rpr='';const c=color(resolve('color')),size=points(resolve('font-size'),base),font=resolve('font-family')?.split(',')[0].replace(/["']/g,'').trim();if(c)rpr+=`<w:color w:val="${c}"/>`;if(size)rpr+=`<w:sz w:val="${Math.round(Math.max(6,Math.min(72,size))*2)}"/>`;if(font)rpr+=`<w:rFonts w:ascii="${e(font)}" w:hAnsi="${e(font)}"/>`;if(/^(bold|bolder|[6-9]00)$/.test(resolve('font-weight')||''))rpr+='<w:b/>';if(/^(italic|oblique)$/.test(resolve('font-style')||''))rpr+='<w:i/>';
 const marks=[...pending,n.attribs?.id].map(bookmark).join('');pending=[];
 return `<w:p><w:pPr>${props.join('')}${extra}</w:pPr>${marks}${content??(n.children||[]).map(c=>inline(c,rpr)).join('')}</w:p>`;}
 function toc(){if(tocDone)return;tocDone=true;const previous=blocks.at(-1)||'';if(previous.includes(`>${e(a.label)}</w:t>`)&&!previous.includes('<w:hyperlink'))blocks[blocks.length-1]=previous.replace(/<w:pStyle w:val="[^"]+"\/>/,'<w:pStyle w:val="TOCHeading"/>');else {pagePending=blocks.length>0;blocks.push(paragraph({name:'h1',attribs:{},children:[]},'TOCHeading','',run(a.label)));}pagePending=false;
 for(const [i,h] of a.entries.entries())blocks.push(paragraph({name:'p',attribs:{},children:[]},`ScriptaTOC${h.name[1]}`,'',`<w:hyperlink w:anchor="${e(bookMark(h.attribs.id))}">${run(text(h),a.boldness[i]?'<w:b/>':'')}</w:hyperlink>`));}
 function table(n){const caption=select.selectOne('caption',n);if(caption)blocks.push(paragraph(caption,'Caption'));const rows=select.selectAll('tr',n).filter(r=>{let p=r.parent;while(p&&p!==n){if(p.name==='table')return false;p=p.parent;}return true;});if(!rows.length)return;
 if(pending.length||pagePending)blocks.push(paragraph({name:'p',attribs:{},children:[]}));const grid=[],rendered=[];let cols=0;
 for(const [ri,row] of rows.entries()){grid[ri]||=[];let col=0;for(const cell of row.children.filter(c=>['td','th'].includes(c.name))){while(grid[ri][col])col++;const cs=Math.max(1,Number(cell.attribs.colspan)||1),rs=Math.min(rows.length-ri,Math.max(1,Number(cell.attribs.rowspan)||1));for(let y=ri;y<ri+rs;y++){grid[y]||=[];for(let x=col;x<col+cs;x++)grid[y][x]={cell,start:y===ri&&x===col,continuation:y>ri&&x===col,cs,rs};}col+=cs;cols=Math.max(cols,col);}}
 for(const [ri,row] of rows.entries()){const cells=[];for(let ci=0;ci<cols;ci++){const item=grid[ri]?.[ci];if(item&&!item.start&&!item.continuation)continue;const c=item?.cell;const fill=c?color(css.resolve(c,'background-color')):null;let props='<w:vAlign w:val="top"/>';if(item?.cs>1)props+=`<w:gridSpan w:val="${item.cs}"/>`;if(item?.rs>1)props+=`<w:vMerge${item.start?' w:val="restart"':''}/>`;if(fill)props+=`<w:shd w:fill="${fill}"/>`;cells.push(`<w:tc><w:tcPr>${props}</w:tcPr><w:p>${item?.start?(c.children||[]).map(n=>inline(n,c.name==='th'?'<w:b/>':'')).join(''):''}</w:p></w:tc>`);}rendered.push(`<w:tr>${row.children.some(c=>c.name==='th')?'<w:trPr><w:tblHeader/></w:trPr>':''}${cells.join('')}</w:tr>`);}
 blocks.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:jc w:val="center"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(k=>`<w:${k} w:val="single" w:sz="4" w:color="auto"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({length:cols},()=>`<w:gridCol w:w="${twip((width-margin*2)/cols)}"/>`).join('')}</w:tblGrid>${rendered.join('')}</w:tbl>`);}
 const blockNames=new Set(['address','blockquote','dd','div','dl','dt','figcaption','figure','h1','h2','h3','h4','h5','h6','hr','li','nav','ol','p','pre','section','table','ul']);
 function emit(n,level=0){if(!n.name||hidden(n)||['doc-footnote','doc-endnote'].includes(n.attribs.role))return;
 if((n.attribs.class||'').split(/\s+/).includes('source-page')&&!body&&n!==pageOf(a.toc)&&n!==pageOf(a.body)){if(frontPages++)pagePending=true;}
 if(n===a.toc){toc();return;}if(n===a.body){toc();blocks.push(`<w:p><w:pPr>${sect('lowerRoman')}</w:pPr></w:p>`);body=true;pagePending=false;}
 if(/^h[1-6]$/.test(n.name)){blocks.push(paragraph(n,n===firstTitle?'ScriptaBookTitle':`Heading${n.name[1]}`,body&&n.name==='h1'&&n!==a.body?'<w:pageBreakBefore/>':''));return;}
 if(n.name==='p'){blocks.push(paragraph(n,titlePage&&pageOf(n)===titlePage?'ScriptaBookSubtitle':'Normal'));return;}
 if(n.name==='blockquote'){const ps=n.children.filter(c=>c.name==='p');for(const p of ps.length?ps:[n])blocks.push(paragraph(p,'BookQuote'));return;}
 if(n.name==='pre'){blocks.push(paragraph(n,'CodeBlock','',n.children.map(c=>inline(c,'',true)).join('')));return;}
 if(n.name==='img'){blocks.push(paragraph(n,'Normal','<w:jc w:val="center"/>',picture(n)));return;}
 if(n.name==='figure'){const img=select.selectOne('img',n);if(img)emit(img);const cap=select.selectOne('figcaption',n);if(cap)blocks.push(paragraph(cap,'Caption'));return;}
 if(n.name==='table'){table(n);return;}
 if(['ol','ul'].includes(n.name)){for(const li of n.children.filter(c=>c.name==='li')){blocks.push(paragraph(li,'Normal',`<w:numPr><w:ilvl w:val="${Math.min(8,level)}"/><w:numId w:val="${n.name==='ol'?2:1}"/></w:numPr>`,li.children.filter(c=>!['ul','ol'].includes(c.name)).map(c=>inline(c)).join('')));for(const nested of li.children.filter(c=>['ol','ul'].includes(c.name)))emit(nested,level+1);}return;}
 if(n.name==='hr'){blocks.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');return;}
 if(!['main','body','html'].includes(n.name)&&!n.children.some(c=>blockNames.has(c.name))&&text(n)){blocks.push(paragraph(n,n.name==='dt'?'Heading6':n.name==='dd'?'BookQuote':'Normal'));return;}
 if(n.attribs.id)pending.push(n.attribs.id);for(const child of n.children||[])emit(child,level);}
 if(!a.body&&!a.toc)toc();emit(a.root);toc();
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${blocks.join('')}${sect(body?'decimal':'lowerRoman')}</w:body></w:document>`;
 return {analysis:a,metadata,document,relationships,media,notes,body,warnings:css.warnings};
}
