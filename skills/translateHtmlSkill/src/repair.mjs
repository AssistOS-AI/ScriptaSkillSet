import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function repairCommand(skill, argv) {
  const { values, positionals } = parseArgs({ args: argv, options: { report: { type: 'string' }, patches: { type: 'string' }, output: { type: 'string' } } });
  if (positionals.length || !values.report) throw Error('repair requires --report REPORT [--patches PATCHES --output HTML]');
  const reportBytes = await fs.readFile(values.report);
  const report = JSON.parse(reportBytes);
  if (!Array.isArray(report.sourceHashes) || !Array.isArray(report.findings)) throw Error('Expected validateBook report.json');
  for (const input of report.sourceHashes) {
    if (digest(await fs.readFile(input.file)) !== input.sha256) throw Error('Stale repair input: ' + input.file);
  }
  if (report.findings.some(f => f.severity === 'blocker')) throw Error('Resolve source-edition or missing-chapter blockers before correction');
  const tasks = report.findings.filter(f => f.skill === skill && f.severity !== 'blocker');
  if (!values.patches) return { status: 'awaiting_patches', skill, reportHash: digest(reportBytes), tasks, instruction: 'Use the active LLM to propose localized corrections. Replacements use {findingId,before,after}. Missing or partial units use {findingId,anchor,insert,position} to insert the translated sentences beside a unique anchor; keep the surrounding markup, ids and placeholders intact. Do not create a missing language or a whole missing chapter.' };
  if (!values.output) throw Error('--output is required with --patches');
  const proposal = JSON.parse(await fs.readFile(values.patches, 'utf8'));
  if (proposal.reportHash !== digest(reportBytes)) throw Error('Stale report hash');
  const source = await fs.realpath(proposal.file);
  if (!report.sourceHashes.some(i => i.file === source) || !source.endsWith('.html')) throw Error('Only an existing audited HTML file can be repaired');
  const destination = path.resolve(values.output);
  if (!destination.endsWith('.html') || destination === source) throw Error('Candidate must be a separate HTML file beside its source, preserving relative assets');
  if (await fs.realpath(path.dirname(destination)) !== path.dirname(source)) throw Error('Output directory alias rejected');
  if (!Array.isArray(proposal.patches) || !proposal.patches.length) throw Error('No patches');
  let candidate = await fs.readFile(source, 'utf8');
  const original = candidate;
  const seen = new Set();
  for (const patch of proposal.patches) {
    const finding = tasks.find(f => f.id === patch.findingId && path.resolve(f.file) === source);
    if (!finding || seen.has(patch.findingId)) throw Error('Unknown or repeated finding');
    seen.add(patch.findingId);
    if (!finding.location && !finding.evidence) throw Error('Finding has no location evidence');
    // A localized insertion fills a missing or partial translated unit: the
    // translated sentences are inserted beside one unique anchor, keeping all
    // surrounding markup, ids and placeholders intact.
    if (typeof patch.insert === 'string' && patch.insert.trim()) {
      if (typeof patch.anchor !== 'string' || !patch.anchor.trim()) throw Error('Insertion requires a unique anchor');
      if (patch.anchor.length > 12000 || patch.insert.length > 18000) throw Error('Repair exceeds localized unit limit');
      if (candidate.split(patch.anchor).length !== 2) throw Error('Anchor must match exactly one location');
      const position = patch.position === 'before' ? 'before' : 'after';
      candidate = candidate.replace(patch.anchor, match => position === 'before' ? patch.insert + match : match + patch.insert);
      continue;
    }
    if (typeof patch.before !== 'string' || !patch.before.trim() || typeof patch.after !== 'string' || !patch.after.trim() || patch.before === patch.after) throw Error('Invalid or empty replacement');
    if (patch.before.length > 12000 || patch.after.length > 18000) throw Error('Repair exceeds localized unit limit');
    if (candidate.split(patch.before).length !== 2) throw Error('Replacement must match exactly one location');
    // The report location is reviewed by the host. Unrelated changes cannot be bundled.
    candidate = candidate.replace(patch.before, () => patch.after);
  }
  if (candidate === original) throw Error('No progress');
  // An exclusive write can never overwrite either an original or an earlier candidate.
  await fs.writeFile(destination, candidate, { flag: 'wx' });
  return { status: 'needs_revalidation', candidate: destination, source, sourceHash: digest(original), candidateHash: digest(candidate), repairedFindings: [...seen], instruction: 'Run validateBook on the candidate with fresh hashes and new semantic/visual reviews. Do not mark findings resolved merely because a replacement was applied.' };
}

