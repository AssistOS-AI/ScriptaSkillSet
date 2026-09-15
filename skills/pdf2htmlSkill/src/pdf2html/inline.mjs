import { escapeHtml } from './common.mjs';

export function applyInline($, page, aligned) {
  const hrefs = new Map(), byNode = new Map();
  for (const link of page.links) for (const index of link.word_indexes) hrefs.set(index, link.href);
  for (const [source, html] of aligned.mapping) {
    const word = page.words[source], target = aligned.words[html], href = hrefs.get(source);
    if (!word.bold && !word.italic && !href) continue;
    if (!byNode.has(target.node)) byNode.set(target.node, []);
    byNode.get(target.node).push({ word, target, href });
  }
  for (const [node, words] of byNode) {
    let cursor = 0, output = '';
    for (const { word, target, href } of words.sort((a, b) => a.target.start - b.target.start)) {
      output += escapeHtml(node.data.slice(cursor, target.start));
      let content = escapeHtml(node.data.slice(target.start, target.end));
      if (word.italic) content = `<em>${content}</em>`;
      if (word.bold) content = `<strong>${content}</strong>`;
      if (href) content = `<a href="${escapeHtml(href)}">${content}</a>`;
      output += content; cursor = target.end;
    }
    output += escapeHtml(node.data.slice(cursor));
    $(node).replaceWith(output);
  }
}

export function mergeLinks($) {
  for (const parent of $('*').toArray()) {
    let anchor = $(parent).children('a').first()[0];
    while (anchor) {
      let sibling = anchor.next;
      const separators = [];
      while (sibling?.type === 'text' && !/[\p{L}\p{N}_]/u.test(sibling.data)) { separators.push(sibling); sibling = sibling.next; }
      if (sibling?.name === 'a' && sibling.attribs.href === anchor.attribs.href) {
        for (const separator of separators) $(anchor).append(separator);
        for (const child of [...sibling.children]) $(anchor).append(child);
        $(sibling).remove();
      } else anchor = $(anchor).nextAll('a').first()[0];
    }
  }
}
