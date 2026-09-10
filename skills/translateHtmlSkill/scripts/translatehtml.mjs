#!/usr/bin/env node
import { parseArgs } from 'node:util';
const help =
  'Usage: translatehtml doctor | prepare INPUT --to TAG [--from TAG] [--output FILE] [--job-dir DIR] | status JOB | build JOB [--overwrite] | validate SOURCE --html FILE --to TAG';
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
      to: { type: 'string' },
      from: { type: 'string' },
      output: { type: 'string' },
      'job-dir': { type: 'string' }
    },
    build: { overwrite: { type: 'boolean' } },
    validate: { to: { type: 'string' }, html: { type: 'string' } }
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
    if (['prepare', 'validate'].includes(command) && !values.to)
      throw Error('--to is required.');
  } catch (error) {
    console.error('translatehtml: ' + error.message);
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
      translationModel: 'provided by the active LLM session'
    };
  else if (command === 'prepare')
    result = await core.prepareJob(input, {
      targetLanguage: values.to,
      sourceLanguage: values.from,
      output: values.output,
      jobDir: values['job-dir']
    });
  else if (command === 'status') result = await core.jobStatus(input);
  else if (command === 'build')
    result = await core.buildJob(input, { overwrite: values.overwrite });
  else
    result = await validation.validateTranslation(input, values.html, {
      targetLanguage: core.normalizeLanguage(values.to)
    });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'failed' ? 1 : 0;
} catch (error) {
  console.error('translatehtml: ' + error.message);
  process.exitCode = 1;
}
