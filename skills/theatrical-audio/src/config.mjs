import { EXTRA_ENGINES, EXTRA_ENV } from './providers.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readJSON, exists, fail } from './util.mjs';

export const ENGINES = ['piper', 'qwen', 'kokoro', 'openai', 'elevenlabs', 'azure', ...EXTRA_ENGINES, 'test-tone'];
export const CLOUD_ENGINES = ['openai', 'elevenlabs', 'azure', ...EXTRA_ENGINES];
export const VOICE_FIELDS = { piper: 'piperVoice', qwen: 'qwenSpeaker', kokoro: 'kokoroVoice', openai: 'openaiVoice', elevenlabs: 'elevenlabsVoice', azure: 'azureVoice', ...Object.fromEntries(EXTRA_ENGINES.map(e=>[e,e+'Voice'])) };
export const ENV_KEYS = new Set([...EXTRA_ENV, 'AUDIO_ENGINE', 'OPENAI_API_KEY', 'OPENAI_TTS_MODEL', 'OPENAI_TTS_VOICE',
  'ELEVENLABS_API_KEY', 'ELEVENLABS_MODEL_ID', 'ELEVENLABS_VOICE_ID', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'AZURE_TTS_VOICE']);

// Intentionally small .env syntax: no expansion, commands, multiline values or global environment mutation.
export async function loadEnvironment(file = path.join(ROOT, '.env'), env = process.env, { allowUnknown = false } = {}) {
  if (!(await exists(file))) return false;
  const text = await fs.readFile(file, 'utf8');
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !ENV_KEYS.has(match[1]) && allowUnknown) continue;
    if (!match || !ENV_KEYS.has(match[1])) fail(`Unsupported .env entry at line ${i + 1}; see .env.example. Values are not shown.`);
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      if (!value.endsWith(quote) || value.length < 2) fail(`Unclosed .env quote at line ${i + 1}`);
      value = value.slice(1, -1);
    } else value = value.replace(/\s+#.*$/, '').trim();
    if (env[match[1]] === undefined && value) env[match[1]] = value;
  }
  return true;
}


export async function findWorkspaceRoot(start = process.cwd(), env = process.env) {
  return path.resolve(start, env.THEATRICAL_AUDIO_WORKSPACE_ROOT || env.SHF_WORKSPACE_ROOT || '.');
}

// Credential files are opt-in. Never search parent projects or the installed skill.
export async function loadWorkspaceEnvironment(start = process.cwd(), env = process.env, options = {}) {
  const selectedRoot = options['workspace-root'] ?? env.THEATRICAL_AUDIO_WORKSPACE_ROOT ?? env.SHF_WORKSPACE_ROOT;
  const workspaceRoot = selectedRoot ? path.resolve(start, selectedRoot) : null;
  const loaded = [];
  if (options['credentials-file'] !== undefined) {
    const file = path.resolve(start, options['credentials-file']);
    if (!(await loadEnvironment(file, env))) fail(`Missing environment file: ${file}`);
    loaded.push(file);
  }
  if (workspaceRoot) {
    const apikeys = path.join(workspaceRoot, '.apikeys');
    if (await loadEnvironment(apikeys, env, { allowUnknown: true })) loaded.push(apikeys);
  }
  return { workspaceRoot, loadedFiles: loaded };
}

export async function resolveOptions(options = {}, env = process.env) {
  if (options._resolved) return options;
  const file = typeof options.settings === 'string' ? path.resolve(options.settings) : path.resolve('audio.config.json');
  if (options.settings !== undefined && typeof options.settings !== 'string') fail('--settings requires a JSON path');
  const settings = await exists(file) ? await readJSON(file) : {};
  if (options.settings && !(await exists(file))) fail(`Missing settings: ${file}`);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) fail('Settings must be an object');
  for (const key of Object.keys(settings)) if (!['engine', 'providers'].includes(key)) fail(`Unknown settings field: ${key}. Credentials belong in environment variables, not JSON.`);
  if (settings.providers !== undefined && (!settings.providers || typeof settings.providers !== 'object' || Array.isArray(settings.providers))) fail('providers must be an object');
  for (const [provider, config] of Object.entries(settings.providers ?? {})) {
    if (!CLOUD_ENGINES.includes(provider)) fail(`Unknown provider settings: ${provider}; local runtimes use runtime/*.json`);
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail(`Invalid ${provider} configuration`);
    const allowed = ['model', 'voice', 'baseUrl', 'region', 'timeoutMs', 'cacheSalt', 'accountId', 'project', 'apiVersion'];
    for (const key of Object.keys(config)) if (!allowed.includes(key)) fail(`Unknown ${provider} setting: ${key}; do not put secrets in JSON`);
    for (const key of ['model','voice','baseUrl','region','cacheSalt','accountId','project','apiVersion']) if (config[key] !== undefined && typeof config[key] !== 'string') fail(`${provider}.${key} must be a string`);
  }
  const engine = options.engine ?? env.AUDIO_ENGINE ?? settings.engine ?? 'piper';
  if (!ENGINES.includes(engine)) fail(`Unknown engine ${String(engine)}; choose ${ENGINES.join(', ')}`);
  if (options.model !== undefined && !CLOUD_ENGINES.includes(engine)) fail('--model is a cloud option; local model choice comes from runtime config');
  if (options.offline && CLOUD_ENGINES.includes(engine)) fail(`--offline forbids the ${engine} cloud backend. Select piper, qwen or kokoro.`);
  return { ...options, engine, _resolved: true, _provider: settings.providers?.[engine] ?? {} };
}
