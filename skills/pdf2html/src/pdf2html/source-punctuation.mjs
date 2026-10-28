import { contentText } from './dom.mjs';
import { restorationPlan } from './text-fidelity.mjs';

export function restoreSourcePunctuation(section, page, vocabulary) {
  const result = restorationPlan(page.source_text ?? page.lines.map(line => line.text).join('\n'), contentText(section), { page, vocabulary });
  if (!result.edits.length) return;
  const edits = new Map(result.edits.map(edit => [edit.index, edit.value]));
  const nodes = [], parts = [];
  function collect(node) {
    if (['script', 'style'].includes(node.name)) return;
    if (node.type === 'text') {
      nodes.push(node);
      parts.push(...(node.data.match(/[\p{L}\p{M}\p{N}_]+|[^\s]/gu) ?? []));
    }
    for (const child of node.children ?? []) collect(child);
  }
  collect(section);
  // Cross-node words and Unicode expansions cannot be safely mapped back
  // through these offsets. Preserve the converted text instead of guessing replacement offsets.
  if (parts.length !== result.actual.length || parts.some((value, i) => value !== result.actual[i])) return;
  let index = 0;
  for (const node of nodes) node.data = node.data.replace(/[\p{L}\p{M}\p{N}_]+|[^\s]/gu, value => edits.get(index++) ?? value);
}
