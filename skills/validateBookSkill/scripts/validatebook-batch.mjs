#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SKILL_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_VALIDATEBOOK = path.join(SKILL_ROOT, 'scripts', 'validatebook');
const DEFAULT_PDF2HTML = '/Users/adrianganga/Desktop/devWorkNou/workspace/.agents/skills/pdf2htmlSkill/scripts/pdf2html';

function usage() {
  return `Usage:
  validatebook-batch --books-root DIR --all
  validatebook-batch --manifest FILE
  validatebook-batch BOOK_ROOT [BOOK_ROOT...]

Options:
  --books-root DIR             Repository or docs/books directory used for --all and relative paths.
  --all                        Process every **/manifest.json under --books-root.
  --manifest FILE              JSON or text file with book roots or manifest paths.
  --out DIR                    Output directory. Default: ./tmp/validatebook-batch/<timestamp>
  --limit N                    Process at most N books.
  --skip N                     Skip the first N discovered books. Default: 0.
  --max-rounds N               Automatically rerun books while validateBook installs corrections. Default: 3.
  --concurrency N              Process independent books concurrently. Default: 1.
  --dry-run                    Discover and write the plan without running validateBook.
  --validatebook FILE          validateBook launcher. Default: sibling scripts/validatebook.
  --pdf2html FILE              pdf2html launcher passed to validateBook.
  --word-spacing source|natural
  --paginate
  --languages en,ro

Environment:
  VALIDATEBOOK_CHROMIUM, VALIDATEBOOK_PDFTOTEXT, VALIDATEBOOK_PDFFONTS,
  VALIDATEBOOK_PDFIMAGES and VALIDATEBOOK_PDFTOHTML are passed through when set.
  VALIDATEBOOK_BIN and VALIDATEBOOK_PDF2HTML override launcher defaults.`;
}

function parseArgs(argv) {
  const options = {
    all: false,
    bookRoots: [],
    booksRoot: process.cwd(),
    dryRun: false,
    limit: Infinity,
    skip: 0,
    maxRounds: 3,
    concurrency: 1,
    out: '',
    manifest: '',
    validatebook: process.env.VALIDATEBOOK_BIN || DEFAULT_VALIDATEBOOK,
    pdf2html: process.env.VALIDATEBOOK_PDF2HTML || DEFAULT_PDF2HTML,
    wordSpacing: '',
    paginate: false,
    languages: '',
    invocationRoot: process.cwd(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--paginate') options.paginate = true;
    else if (arg === '--books-root') options.booksRoot = requireValue(argv, ++i, arg);
    else if (arg === '--manifest') options.manifest = requireValue(argv, ++i, arg);
    else if (arg === '--out') options.out = requireValue(argv, ++i, arg);
    else if (arg === '--limit') options.limit = Number(requireValue(argv, ++i, arg));
    else if (arg === '--skip') options.skip = Number(requireValue(argv, ++i, arg));
    else if (arg === '--max-rounds') options.maxRounds = Number(requireValue(argv, ++i, arg));
    else if (arg === '--concurrency') options.concurrency = Number(requireValue(argv, ++i, arg));
    else if (arg === '--validatebook') options.validatebook = requireValue(argv, ++i, arg);
    else if (arg === '--pdf2html') options.pdf2html = requireValue(argv, ++i, arg);
    else if (arg === '--word-spacing') options.wordSpacing = requireValue(argv, ++i, arg);
    else if (arg === '--languages') options.languages = requireValue(argv, ++i, arg);
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.bookRoots.push(arg);
  }
  if (options.limit !== Infinity && (!Number.isFinite(options.limit) || options.limit < 1)) throw new Error('--limit must be a positive number');
  if (!Number.isInteger(options.skip) || options.skip < 0) throw new Error('--skip must be a non-negative integer');
  if (!Number.isInteger(options.maxRounds) || options.maxRounds < 1) throw new Error('--max-rounds must be a positive integer');
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be a positive integer');
  if (!options.all && !options.manifest && options.bookRoots.length === 0) throw new Error(usage());
  options.booksRoot = path.resolve(options.invocationRoot, options.booksRoot);
  return options;
}

function requireValue(argv, index, optionName) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value`);
  return value;
}

async function discoverManifestRoots(startDir) {
  const roots = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) {
      roots.push(dir);
      return;
    }
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(dir, entry.name))));
  }
  await walk(startDir);
  return roots.sort();
}

async function rootsFromManifest(file, baseDir) {
  const absolute = path.resolve(baseDir, file);
  const text = await readFile(absolute, 'utf8');
  const manifestDir = path.dirname(absolute);
  let values;
  if (absolute.endsWith('.json')) {
    const parsed = JSON.parse(text);
    values = Array.isArray(parsed) ? parsed : parsed.books || parsed.bookRoots || [];
  } else {
    values = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return values.map((value) => normalizeBookRoot(String(value), manifestDir));
}

function normalizeBookRoot(value, baseDir) {
  const resolved = path.resolve(baseDir, value);
  return path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
}

async function assertBookRoot(root) {
  const manifest = path.join(root, 'manifest.json');
  const info = await stat(manifest).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing manifest.json in ${root}`);
  return root;
}

function slugFor(root, booksRoot) {
  const relative = path.relative(booksRoot, root);
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 8);
  return `${relative.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${hash}`;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: 2, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function processBook(root, options, outDir) {
  const slug = slugFor(root, options.booksRoot);
  const bookOut = path.join(outDir, 'books', slug);
  await mkdir(bookOut, { recursive: true });
  const round = options.round || 1;
  const jobDir = path.join(bookOut, `round-${round}`, 'job');
  const args = ['complete', root, '--job-dir', jobDir, '--pdf2html', options.pdf2html];
  if (options.wordSpacing) args.push('--word-spacing', options.wordSpacing);
  if (options.paginate) args.push('--paginate');
  if (options.languages) args.push('--languages', options.languages);

  if (options.dryRun) {
    return {
      root,
      slug,
      status: 'planned',
      exitCode: 0,
      command: [options.validatebook, ...args],
      report: path.join(root, 'RAPORT-CORECTII.md'),
      out: bookOut,
      round,
    };
  }

  await mkdir(path.dirname(jobDir), { recursive: true });
  const startedAt = new Date().toISOString();
  const result = await run(options.validatebook, args, { cwd: options.booksRoot });
  const finishedAt = new Date().toISOString();
  const roundOut = path.dirname(jobDir);
  await writeFile(path.join(roundOut, 'stdout.json'), result.stdout);
  await writeFile(path.join(roundOut, 'stderr.log'), result.stderr);
  await writeFile(path.join(bookOut, 'stdout.json'), result.stdout);
  await writeFile(path.join(bookOut, 'stderr.log'), result.stderr);

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
    await writeFile(path.join(roundOut, 'validatebook-result.json'), JSON.stringify(parsed, null, 2));
    await writeFile(path.join(bookOut, 'validatebook-result.json'), JSON.stringify(parsed, null, 2));
  } catch {
    parsed = { status: result.code === 0 ? 'unknown_success' : 'runtime_error' };
  }

  const correctionReport = path.join(root, 'RAPORT-CORECTII.md');
  const reportText = await readFile(correctionReport, 'utf8').catch(() => '');
  if (reportText) {
    await writeFile(path.join(roundOut, 'RAPORT-CORECTII.md'), reportText);
    await writeFile(path.join(bookOut, 'RAPORT-CORECTII.md'), reportText);
  }

  return {
    root,
    slug,
    startedAt,
    finishedAt,
    status: parsed.status || 'unknown',
    exitCode: result.code,
    round,
    installed: parsed.installed ?? false,
    findings: parsed.findings ?? null,
    corrections: parsed.corrections ?? null,
    report: correctionReport,
    copiedReport: reportText ? path.join(bookOut, 'RAPORT-CORECTII.md') : '',
    out: bookOut,
  };
}

function needsFollowup(record) {
  return !['passed', 'passed_with_warnings', 'planned'].includes(record.status);
}

function shouldContinueRounds(record) {
  return record.exitCode !== 2 && record.installed === true && Number(record.corrections || 0) > 0 && record.round < record.maxRounds && needsFollowup(record);
}

async function writeSummaries(outDir, records, options) {
  const summary = {
    createdAt: new Date().toISOString(),
    skillRoot: SKILL_ROOT,
    booksRoot: options.booksRoot,
    dryRun: options.dryRun,
    totals: {
      books: records.length,
      passed: records.filter((record) => record.status === 'passed').length,
      passedWithWarnings: records.filter((record) => record.status === 'passed_with_warnings').length,
      needsFollowup: records.filter(needsFollowup).length,
      runtimeErrors: records.filter((record) => record.exitCode === 2).length,
    },
    maxRounds: options.maxRounds,
    records,
  };
  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(outDir, 'SUMMARY.md'), renderSummary(summary));
  await writeFile(path.join(outDir, 'AGENT-FOLLOWUP.md'), renderFollowup(summary));
}

function renderSummary(summary) {
  const lines = [
    '# validateBook batch summary',
    '',
    `Created: ${summary.createdAt}`,
    `Books root: ${summary.booksRoot}`,
    `Books: ${summary.totals.books}`,
    `Passed: ${summary.totals.passed}`,
    `Passed with warnings: ${summary.totals.passedWithWarnings}`,
    `Needs follow-up: ${summary.totals.needsFollowup}`,
    `Runtime errors: ${summary.totals.runtimeErrors}`,
    `Max rounds: ${summary.maxRounds}`,
    '',
    '| Status | Round | Findings | Corrections | Book | Report |',
    '| --- | ---: | ---: | ---: | --- | --- |',
  ];
  for (const record of summary.records) {
    lines.push(`| ${record.status} | ${record.round ?? ''} | ${record.findings ?? ''} | ${record.corrections ?? ''} | ${record.root} | ${record.report} |`);
  }
  return `${lines.join('\n')}\n`;
}

function renderFollowup(summary) {
  const records = summary.records.filter(needsFollowup);
  const lines = [
    '# Agent follow-up packet',
    '',
    'Use this file after validateBook has completed its native correction pass.',
    '',
    'Rules for the agent:',
    '',
    '- Treat validateBook as the authority for layout and structural fidelity.',
    '- Read each book root `RAPORT-CORECTII.md` before editing.',
    '- Prefer fixing the native validateBook handler when the report identifies a deterministic layout/structure defect that the skill should own.',
    '- For book-local edits, change the smallest possible set of files and preserve reader text unless the issue is explicitly editorial or metadata-related.',
    '- Do not invent missing translated prose, source pages, images, tables or PDF evidence.',
    '- After every agent edit, rerun this batch command for that book and keep the new report.',
    '',
  ];
  if (!records.length) {
    lines.push('No books need agent follow-up.');
  } else {
    for (const record of records) {
      lines.push(`## ${record.slug}`);
      lines.push('');
      lines.push(`Book root: ${record.root}`);
      lines.push(`Status: ${record.status}`);
      lines.push(`Exit code: ${record.exitCode}`);
      lines.push(`Validator report: ${record.report}`);
      if (record.copiedReport) lines.push(`Copied report: ${record.copiedReport}`);
      lines.push('');
      lines.push('Agent task: inspect the report, decide whether the fix belongs in book files or in validateBook native code, apply only scoped corrections, then rerun validation.');
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(options.invocationRoot, options.out || path.join('tmp', 'validatebook-batch', timestamp));
  const roots = [
    ...(options.all ? await discoverManifestRoots(options.booksRoot) : []),
    ...(options.manifest ? await rootsFromManifest(options.manifest, options.booksRoot) : []),
    ...options.bookRoots.map((root) => normalizeBookRoot(root, options.invocationRoot)),
  ];
  const uniqueRoots = [...new Set(roots)].slice(options.skip, options.limit === Infinity ? undefined : options.skip + options.limit);
  const verifiedRoots = [];
  for (const root of uniqueRoots) verifiedRoots.push(await assertBookRoot(root));

  await mkdir(outDir, { recursive: true });
  const records = new Array(verifiedRoots.length);
  let nextIndex = 0;
  let summaryWrite = Promise.resolve();
  async function worker() {
    while (nextIndex < verifiedRoots.length) {
      const index = nextIndex++;
      const root = verifiedRoots[index];
      let record;
      for (let round = 1; round <= options.maxRounds; round += 1) {
        console.error(`[${index + 1}/${verifiedRoots.length}] validateBook round ${round}/${options.maxRounds} ${root}`);
        record = await processBook(root, { ...options, round }, outDir);
        record.maxRounds = options.maxRounds;
        if (!shouldContinueRounds(record)) break;
      }
      records[index] = record;
      summaryWrite = summaryWrite.then(() => writeSummaries(outDir, records.filter(Boolean), options));
      await summaryWrite;
    }
  }
  const workerCount = Math.min(options.concurrency, Math.max(1, verifiedRoots.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  await writeSummaries(outDir, records, options);
  console.log(path.join(outDir, 'SUMMARY.md'));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
