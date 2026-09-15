// Explicit opt-in only. Publisher entities come from the PDF, not a title or
// brand allowlist. Narrative and translated sentence structure stay intact.
export function restorePublisherIdentity(pages) {
  const source=pages.filter(p=>/Copyright\s*©/i.test(p.text));
  if(source.length!==1)throw Error('A unique PDF copyright page is required for publisher restoration');
  const text=source[0].text;
  const identity=text.match(/Copyright\s*©\s*(\[?\d{4}\]?)\s*([^\n]+)/i);
  const website=text.match(/Available for free on\s+(.+?)\s+website\s*\(([^)]+)\)/i);
  if(!identity||!website)throw Error('PDF publisher identity and website must be explicit');
  const brand=identity[2].trim(),siteName=website[1].trim(),siteLabel=website[2].trim();
  const sourceUrl=new URL(/^[a-z]+:\/\//i.test(siteLabel)?siteLabel:'https://'+siteLabel);
  if(!['http:','https:'].includes(sourceUrl.protocol))throw Error('Unsupported source publisher URL');
  const copyright=[...document.querySelectorAll('p')].filter(n=>/©\s*\[?\d{4}\]?/.test(n.textContent)&&n.textContent.length<180);
  if(copyright.length!==1)throw Error('A unique HTML copyright paragraph is required');
  const target=copyright[0],match=target.textContent.match(/©\s*\[?\d{4}\]?\s*(.+)$/);
  const oldBrand=match?.[1].trim();
  if(!oldBrand)throw Error('HTML copyright identity is missing');
  if(oldBrand===brand)return [];
  const scope=target.closest('section');
  if(!scope)throw Error('Publisher restoration requires a bounded copyright section');
  const changes=[];
  for(const paragraph of scope.querySelectorAll('p')){
    const before=paragraph.outerHTML;
    const links=[...paragraph.querySelectorAll('a[href]')].filter(a=>a.textContent.toLowerCase().includes(oldBrand.toLowerCase()));
    const publisherSite=links.length===1;
    if(links.length>1)throw Error('Ambiguous publisher website');
    if(publisherSite){links[0].textContent=siteLabel;links[0].setAttribute('href',sourceUrl.href);}
    const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if(node.textContent.includes(oldBrand))node.textContent=node.textContent.split(oldBrand).join(publisherSite?siteName:brand);
    if(paragraph.outerHTML!==before)changes.push({kind:'authorized_source_publisher_restoration',page:source[0].page,before,after:paragraph.outerHTML,sourceBrand:brand,sourceWebsite:siteLabel});
  }
  return changes;
}
