#!/usr/bin/env node
import { parseArgs } from 'node:util';
const help =
  'Usage: comprehensivesummary doctor | prepare INPUT --minutes N [--wpm N] [--language TAG] [--output FILE] [--job-dir DIR] | status JOB | build JOB [--overwrite] | validate SOURCE --html FILE [--language TAG]';
try {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw Error('Node.js >=22 is required. See dependencies.md.');
  let core, validation;
  try {
    core = await import('../src/core.mjs');
    validation = await import('../src/validation.mjs');
  } catch (error) {
    throw Error(
      'Bundled runtime is missing or incompatible. Restore external/html and assets from this skill release; see dependencies.md. ' +
        error.message
    );
  }
  const command = process.argv[2];
  if (['--help', '-h'].includes(command)) {
    console.log(help);
    process.exit(0);
  }
  const specs = {
    doctor: {},
    status: {},
    prepare: {
      language: { type: 'string' },
      minutes: { type: 'string' },
      wpm: { type: 'string' },
      output: { type: 'string' },
      'job-dir': { type: 'string' }
    },
    build: { overwrite: { type: 'boolean' } },
    validate: { language: { type: 'string' }, html: { type: 'string' } }
  };
  if (!Object.hasOwn(specs, command)) {
    console.error(help);
    process.exit(2);
  }
  let args;
  try {
    args = parseArgs({
      args: process.argv.slice(3),
      options: { ...specs[command], help: { type: 'boolean', short: 'h' } },
      allowPositionals: true
    });
    if (args.values.help) {
      console.log(help);
      process.exit(0);
    }
    const values = args.values;
    if (
      args.positionals.length !== (command === 'doctor' ? 0 : 1) ||
      (command === 'validate' && !values.html)
    )
      throw Error(help);
    if (
      command === 'prepare' &&
      (!values.minutes || !Number.isFinite(Number(values.minutes)))
    )
      throw Error('--minutes requires a number.');
    if (values.wpm !== undefined && !/^[+-]?\d+$/.test(values.wpm))
      throw Error('--wpm requires an integer.');
  } catch (error) {
    console.error('comprehensivesummary: ' + error.message);
    process.exit(2);
  }
  const {
    values,
    positionals: [input]
  } = args;
  let result;
  if (command === 'doctor')
    result = {
      ok: true,
      node: process.versions.node,
      htmlparser2: '10.0.0',
      analysisModel: 'provided by the active LLM session',
      defaultWordsPerMinute: 200,
      intermediateApprovals: false
    };
  else if (command === 'prepare')
    result = await core.prepareJob(input, {
      minutes: Number(values.minutes),
      wordsPerMinute: values.wpm === undefined ? 200 : Number(values.wpm),
      language: values.language,
      output: values.output,
      jobDir: values['job-dir']
    });
  else if (command === 'status') result = await core.jobStatus(input);
  else if (command === 'build')
    result = await core.buildJob(input, { overwrite: values.overwrite });
  else
    result = await validation.validateSummary(input, values.html, {
      expectedLanguage: values.language
    });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'failed' ? 1 : 0;
} catch (error) {
  console.error('comprehensivesummary: ' + error.message);
  process.exitCode = 1;
}
