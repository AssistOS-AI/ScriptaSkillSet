import '../../runtime/themes.js';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderSVG(node,{theme='color',bounds=[-110,-210,220,230]}={}){
 const palette=globalThis.SHFThemes[theme];if(!palette)throw new Error('Unknown theme.');
 const paint=x=>typeof x==='string'&&x.startsWith('$')?palette[x.slice(1)]||'#d65a72':x;
 const element=n=>{if(n.visibleThemes&&!n.visibleThemes.includes(theme))return '';const attrs=Object.entries({...n.attrs,...n.themeAttrs?.[theme]}).map(([k,v])=>`${k}="${escape(paint(v))}"`).join(' '),t=n.transform||{};
  const body=`<${n.type} ${attrs}>${n.text?escape(n.text):''}${(n.children||[]).map(element).join('')}</${n.type}>`;
  return `<g id="${escape(n.id)}" opacity="${n.opacity??1}" transform="translate(${t.x||0} ${t.y||0}) rotate(${t.rotate||0}) scale(${(t.scale??1)*(t.scaleX??1)} ${(t.scale??1)*(t.scaleY??1)})">${body}</g>`;};
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.join(' ')}" role="img">${element(node)}</svg>`;
}
