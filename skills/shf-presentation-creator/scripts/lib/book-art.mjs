/** Restrained book illustrations: coherent binding, page block and cover. No cast shadow. */
function pen(id){let i=0;const n=(type,attrs={},text)=>({id:id+'.detail'+(++i),type,attrs,...(text===undefined?{}:{text})});return {
 r:(x,y,width,height,fill,rx=2)=>n('rect',{x,y,width,height,fill,rx}),
 p:(d,fill,stroke='none',w=1)=>n('path',{d,fill,stroke,'stroke-width':w,'stroke-linejoin':'round','stroke-linecap':'round'}),
 t:(x,y,text,size,fill)=>n('text',{x,y,'font-size':size,'font-weight':600,'text-anchor':'middle',fill},text),
 g:(part,children)=>({id:id+'.'+part,type:'g',attrs:{},children})};}
export function closedBookVisual(id,{color='$teal',title=''}={}){
 const d=pen(id);
 return {id,type:'g',attrs:{},anchors:{left:[-76,-102],right:[76,-102],top:[0,-211],bottom:[0,5],center:[0,-104]},children:[
 d.r(-76,-211,152,218,color,5),d.r(-67,-6,143,10,'$page',2),
 d.p('M-76 -203 Q-76 -211 -65 -211 L-54 -211 L-54 -7 L-65 -7 Q-76 -7 -76 2 Z','$coatShade'),
 d.p('M-52 -203 L-52 -15','none','$gold',1),d.r(-76,3,155,5,color,2),
 d.p('M-62 -2 L70 -2','none','$pageLine',1),
 d.p('M37 -6 L37 24 L44 18 L51 24 L51 -6 Z','$coral'),
 ...(title?[d.t(11,-116,title,title.length>12?17:23,'$white'),d.r(-9,-92,40,2,'$gold',1)]:[d.r(-14,-145,56,3,'$gold',1),d.r(-4,-134,36,2,'$gold',1)])]};
}
export function openBookVisual(id,{color='$teal'}={}){
 const d=pen(id),side=sign=>{
 const p=(left,right)=>sign<0?left:right;
 return [
 d.p(p('M0 -44 Q-72 -67 -155 -47 L-155 68 Q-72 47 0 73 Z','M0 -44 Q72 -67 155 -47 L155 68 Q72 47 0 73 Z'),color),
 d.p(p('M0 -53 Q-69 -76 -147 -56 L-147 58 Q-69 38 0 66 Z','M0 -53 Q69 -76 147 -56 L147 58 Q69 38 0 66 Z'),'$page'),
 d.p(p('M-9 -44 Q-67 -61 -131 -46 M-9 56 Q-67 39 -139 55','M9 -44 Q67 -61 131 -46 M9 56 Q67 39 139 55'),'none','$pageLine',1),
 ...[-24,-9,6,21,36].map((y,i)=>d.p(sign<0?`M-124 ${y} Q-75 ${y-10} -25 ${y+3}`:`M25 ${y+3} Q75 ${y-10} ${i===4?103:124} ${y}`,'none','$pageLine',2))];};
 return {id,type:'g',attrs:{},anchors:{left:[-155,0],right:[155,0],top:[0,-74],center:[0,0],spine:[0,65]},children:[d.g('left',side(-1)),d.g('right',side(1)),d.p('M0 -53 L0 65','none','$pageLine',2),d.p('M96 49 L96 85 L104 79 L112 85 L112 47 Z','$coral')]};
}
