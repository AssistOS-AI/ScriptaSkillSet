#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { doctor, prepare, report } from '../src/audit.mjs';
import { workflow } from '../src/workflow.mjs';
import { complete, planComplete, completeStatus } from '../src/complete.mjs';

const help = `validatebook doctor --chromium FILE --pdftotext FILE --pdffonts FILE --pdfimages FILE
validatebook prepare BOOK_ROOT [--languages en,ro,...] [--filename full_content.html]
  [--pdf FILE --english FILE --job-dir DIR] [--auto-correct] [--patches PLAN_JSON]
  [--chromium FILE --pdftotext FILE --pdffonts FILE --pdfimages FILE --pdftohtml FILE]
  --pdf2html FILE [--word-spacing source|natural] [--paginate]
validatebook complete BOOK_ROOT [--job-dir DIR] [same native tool options as prepare]
validatebook status JOB | report JOB | next HISTORY_JSON
validatebook complete-plan BOOK_ROOT [--job-dir DIR] | complete-status COMPLETE_JSON
Local layout/structure checks and text-only reports. No screenshots, editorial review,
humanisation, translation rewriting, summaries, metadata or font +/− tests.
Tool paths also accept VALIDATEBOOK_CHROMIUM/PDFTOTEXT/PDFFONTS/PDFIMAGES.`;
try {
  const { positionals: [command, input, ...extra], values } = parseArgs({ allowPositionals: true, options: {
    pdf2html: { type: 'string' }, 'reviewed-differences': { type: 'string' }, paginate: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, chromium: { type: 'string' }, pdftotext: { type: 'string' }, pdffonts: { type: 'string' }, pdfimages: { type: 'string' }, pdftohtml: { type: 'string' }, 'word-spacing': { type: 'string' }, filename: { type: 'string' }, languages: { type: 'string' }, pdf: { type: 'string' }, english: { type: 'string' }, patches: { type: 'string' }, 'job-dir': { type: 'string' }, 'auto-correct': { type: 'boolean' }
  } });
  if (values.help) console.log(help);
  else {
    if (extra.length || !['doctor', 'complete', 'prepare', 'status', 'report', 'next', 'complete-plan', 'complete-status'].includes(command) || (command === 'doctor' ? !!input : !input)) throw Error(help);
    const result = command === 'complete' ? await complete(input, { ...values, jobDir:values['job-dir'], wordSpacing:values['word-spacing'] }) : command === 'complete-plan' ? await planComplete(input, { jobDir: values['job-dir'] }) : command === 'complete-status' ? await completeStatus(input) : command === 'doctor' ? await doctor(values) : command === 'next' ? await workflow(input) : command === 'prepare' ? await prepare(input, { ...values, jobDir: values['job-dir'], autoCorrect: values['auto-correct'], wordSpacing:values['word-spacing'] }) : await report(input);
    const output=['prepare','complete'].includes(command)?{status:result.status,scope:result.scope,job:result.job,documents:result.documents.map(d=>({language:d.language,blocks:d.blocks,viewports:d.viewports})),coverage:result.coverage,corrections:result.corrections.length,findings:result.findings.length,reportText:result.reportText}:result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = ['needs_attention', 'failed', 'incomplete'].includes(result.status) ? 3 : 0;
  }
} catch (error) { console.error('validatebook: ' + error.message); process.exitCode = 2; }
