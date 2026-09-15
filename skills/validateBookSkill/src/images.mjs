import {issue} from './layout-checks.mjs';

// Translated artwork may contain localized lettering. Keep its URL and pixels;
// transfer the English display box independently of the asset's native ratio.
export function compareImageStyles(english,target,language) {
  const key=r=>r.sourceId?'source:'+r.sourceId:r.id?'id:'+r.id:r.imageRole;
  const sources=english.records.filter(r=>r.tag==='img'),images=target.records.filter(r=>r.tag==='img');
  const actions=[],findings=[],matched=new Set();
  for(const r of sources){
    const k=key(r),peers=sources.filter(x=>key(x)===k),candidates=images.filter(x=>key(x)===k);
    if(!k||peers.length!==1||candidates.length!==1){findings.push(issue(language,'image_style_unmapped',r.selector,'Image needs a unique shared image or figure identity before transferring English presentation.'));continue;}
    const t=candidates[0];matched.add(t);
    const sw=r.bounds.right-r.bounds.left,sh=r.bounds.bottom-r.bounds.top,tw=t.bounds.right-t.bounds.left,th=t.bounds.bottom-t.bounds.top;
    const a=r.imageBox,b=t.imageBox;
    if(!(sw>0&&sh>0&&a?.parentWidth>0&&b?.parentWidth>0)){findings.push(issue(language,'image_geometry_unavailable',t.selector,'Visible source and target image bounds are required.'));continue;}
    const properties={width:100*sw/a.parentWidth+'%',height:'auto','aspect-ratio':sw+' / '+sh,'max-height':'none','object-fit':a.objectFit,'object-position':a.objectPosition,display:a.display,'border-radius':a.borderRadius,border:a.border,'box-sizing':a.boxSizing,padding:a.padding,margin:a.margin};
    actions.push({kind:'presentation',selector:t.selector,properties});
    if(Math.abs(tw/b.parentWidth-sw/a.parentWidth)>.005||Math.abs(th-tw*sh/sw)>2||['objectFit','objectPosition','display','borderRadius','border','padding','margin'].some(k=>a[k]!==b[k]))
      findings.push(issue(language,'image_style_difference',t.selector,'Image display dimensions or styling differ from the English counterpart.',{width:target.width,sourceRatio:sw/sh,targetRatio:tw/th}));
  }
  for(const r of images)if(!matched.has(r))findings.push(issue(language,'translated_image_unmapped',r.selector,'Translated image has no unique English presentation counterpart.'));
  return {actions,findings};
}
