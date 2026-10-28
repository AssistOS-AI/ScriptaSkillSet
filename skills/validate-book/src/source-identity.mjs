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
  const allSource=pages.map(p=>p.text).join('\n');
  const project=(allSource.match(/\b([A-Z][A-Z0-9-]+)\s+PROJECT CONTEXT\b/)||allSource.match(/\bsurrounding\s+([A-Z][A-Z0-9-]+)\s+-\s+Human-Centred\b/i)||allSource.match(/\bwithin the\s+([A-Z][A-Za-z0-9-]+)\s+research project\b/i))?.[1];
  const projectTitle=project?project.charAt(0).toUpperCase()+project.slice(1).toLowerCase():null;
  const sourceUrl=new URL(/^[a-z]+:\/\//i.test(siteLabel)?siteLabel:'https://'+siteLabel);
  if(!['http:','https:'].includes(sourceUrl.protocol))throw Error('Unsupported source publisher URL');
  const copyright=[...document.querySelectorAll('p')].filter(n=>/©\s*\[?\d{4}\]?/.test(n.textContent)&&n.textContent.length<180);
  if(copyright.length!==1)throw Error('A unique HTML copyright paragraph is required');
  const target=copyright[0],match=target.textContent.match(/©\s*\[?\d{4}\]?\s*(.+)$/);
  const oldBrand=match?.[1].replace(/\s*All rights reserved\.?\s*$/i,'').trim();
  if(!oldBrand)throw Error('HTML copyright identity is missing');
  if(oldBrand===brand)return [];
  const scope=target.closest('section');
  const paragraphs=scope?[...scope.querySelectorAll('p')]:(()=>{
    const result=[];let node=target;
    while(node&&node.nodeType===Node.ELEMENT_NODE){
      if(node!==target&&(/^H[1-6]$/.test(node.tagName)||/^page_\d+$/.test(node.id||'')))break;
      if(node.matches('p')&&(/copyright|rights|website|available/i.test(node.textContent)||[...node.querySelectorAll('a[href]')].some(a=>a.textContent.toLowerCase().includes(oldBrand.toLowerCase()))))result.push(node);
      node=node.nextElementSibling;
    }
    return result;
  })();
  if(!paragraphs.length)throw Error('Publisher restoration requires a bounded copyright section');
  const changes=[];
  const replaceText=(root,replacements,kind='authorized_source_publisher_restoration')=>{
    const before=root.outerHTML;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))for(const [from,to] of replacements)if(node.textContent.includes(from))node.textContent=node.textContent.split(from).join(to);
    if(root.outerHTML!==before){changes.push({kind,page:source[0].page,before,after:root.outerHTML,sourceBrand:brand,sourceWebsite:siteLabel});return true;}
    return false;
  };
  if(project&&projectTitle){
    const replacements=[
      [oldBrand+'AgentLib',projectTitle+'AgentLib'],
      [oldBrand+' PROJECT CONTEXT',project+' PROJECT CONTEXT'],
      [oldBrand+' - Human-Centred',project+' - Human-Centred'],
      [oldBrand+' consortium',project+' consortium'],
      [oldBrand+' direction',project+' direction'],
      [oldBrand+' enters',project+' enters'],
      [oldBrand+' question',projectTitle+' question'],
      [oldBrand+' approach',projectTitle+' approach'],
      [oldBrand+' contribution',project+' contribution'],
      [oldBrand+' and AssistOS',project+' and AssistOS'],
      [oldBrand+' Project Fact Sheet',project+' Project Fact Sheet'],
      [oldBrand+' research project',projectTitle+' research project'],
      ['Axiologic Research research project',projectTitle+' research project'],
      ['umbrella of '+oldBrand,'umbrella of '+brand],
      ['surrounding '+oldBrand,'surrounding '+project],
      ['published by '+oldBrand+' as','published by '+brand+' as'],
      ['part of the research activity surrounding '+oldBrand,'part of the research activity surrounding '+project]
    ];
    for(const node of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,td,th,figcaption'))replaceText(node,replacements,'authorized_source_project_restoration');
  }
  for(const node of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,td,th,figcaption')){
    if(/[\ue088\ue092]/u.test(node.textContent))replaceText(node,[['\ue088','-'],['\ue092',':']],'source_punctuation_restoration');
  }
  for(const paragraph of paragraphs){
    const before=paragraph.outerHTML;
    const links=[...paragraph.querySelectorAll('a[href]')].filter(a=>a.textContent.toLowerCase().includes(oldBrand.toLowerCase()));
    const publisherSite=links.length===1;
    if(links.length>1)throw Error('Ambiguous publisher website');
    if(publisherSite){links[0].textContent=siteLabel;links[0].setAttribute('href',sourceUrl.href);}
    const replacements=publisherSite?[[oldBrand,siteName]]:[[oldBrand,brand]];
    if(/under the umbrella of/i.test(paragraph.textContent))replacements[0]=[oldBrand,brand];
    const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))for(const [from,to] of replacements)if(node.textContent.includes(from))node.textContent=node.textContent.split(from).join(to);
    if(paragraph.outerHTML!==before)changes.push({kind:'authorized_source_publisher_restoration',page:source[0].page,before,after:paragraph.outerHTML,sourceBrand:brand,sourceWebsite:siteLabel});
  }
  return changes;
}
