import { fail } from './util.mjs';
// Small, intentionally bounded JSON Schema interpreter. Only the vocabulary used in the shipped schema is supported.
export function validateSchema(value, schema, root = schema, at = '$') {
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/')) fail('Only internal schema references are supported');
    const target = schema.$ref.slice(2).split('/').reduce((o, key) => o?.[key], root);
    if (!target) fail(`Invalid schema reference ${schema.$ref}`);
    return validateSchema(value, target, root, at);
  }
  if (schema.oneOf) {
    let matches = 0; const errors = [];
    for (const variant of schema.oneOf) { try { validateSchema(value, variant, root, at); matches++; } catch (e) { errors.push(e.message); } }
    if (matches !== 1) fail(`${at}: expected one valid variant. ${errors.slice(0, 3).join(' | ')}`);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) fail(`${at}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`${at}: expected one of ${schema.enum.join(', ')}`);
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}: expected object`);
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`${at}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.propertyNames) validateSchema(key, schema.propertyNames, root, `${at} key`);
      const sub = schema.properties?.[key];
      if (sub) validateSchema(v, sub, root, `${at}.${key}`);
      else if (schema.additionalProperties === false) fail(`${at}: unknown field ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateSchema(v, schema.additionalProperties, root, `${at}.${key}`);
    }
    if (schema.minProperties && Object.keys(value).length < schema.minProperties) fail(`${at}: not enough properties`);
  } else if (type === 'array') {
    if (!Array.isArray(value)) fail(`${at}: expected array`);
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) fail(`${at}: invalid item count`);
    value.forEach((v, i) => validateSchema(v, schema.items, root, `${at}[${i}]`));
  } else if (type === 'string') {
    if (typeof value !== 'string') fail(`${at}: expected string`);
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) fail(`${at}: invalid string length`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`${at}: does not match ${schema.pattern}`);
  } else if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) fail(`${at}: expected finite ${type}`);
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail(`${at}: out of range`);
  } else if (type === 'boolean' && typeof value !== 'boolean') fail(`${at}: expected boolean`);
}
export function validateScore(score, schema) {
  validateSchema(score, schema);
  const ids = new Set();
  for (const item of [...score.beats, ...(score.effects || []), ...(score.beds || []), ...(score.visuals || [])]) {
    if (ids.has(item.id)) fail(`Duplicate id: ${item.id}`); ids.add(item.id);
  }
  const beats = new Map(score.beats.map(b => [b.id, b]));
  for (const beat of score.beats) if (beat.type === 'speech') {
    if (!score.voices[beat.speaker]) fail(`Unknown speaker ${beat.speaker} in ${beat.id}`);
    if (!beat.text.trim()) fail(`${beat.id}: empty speech text`);
    if (beat.sourceSpan) {
      if (typeof score.sourceText !== 'string') fail(`${beat.id}: sourceSpan requires sourceText`);
      if (beat.sourceSpan.end <= beat.sourceSpan.start || beat.sourceSpan.end > score.sourceText.length) fail(`${beat.id}: invalid sourceSpan`);
      if (score.sourceText.slice(beat.sourceSpan.start, beat.sourceSpan.end) !== beat.text) fail(`${beat.id}: sourceSpan must reproduce the exact spoken text`);
    }
    if (beat.selectedTake !== undefined && beat.selectedTake >= (beat.takes ?? score.settings?.takes ?? 1)) fail(`${beat.id}: selectedTake is zero-based and must be smaller than takes`);
    const mids = new Set();
    for (const marker of beat.markers || []) { if (mids.has(marker.id)) fail(`${beat.id}: duplicate marker ${marker.id}`); mids.add(marker.id); }
  }
  for (const item of [...score.beats, ...(score.effects || []), ...(score.visuals || [])]) {
    if (item.at && typeof item.at === 'object') {
      const target = beats.get(item.at.beat);
      if (!target) fail(`${item.id}: unknown beat anchor ${item.at.beat}`);
      if (item.at.edge === 'marker' && !(target.markers || []).some(m => m.id === item.at.marker)) fail(`${item.id}: missing marker ${item.at.marker}`);
      if (item.at.edge !== 'marker' && item.at.marker !== undefined) fail(`${item.id}: marker is valid only for edge=marker`);
    }
  }
  for (const sound of [...(score.effects || []), ...(score.beds || [])]) {
    if (Boolean(sound.preset) === Boolean(sound.file)) fail(`${sound.id}: specify exactly one of preset or file`);
    if (sound.preset && !sound.seconds) fail(`${sound.id}: preset requires seconds`);
    if (sound.file && sound.seconds !== undefined) fail(`${sound.id}: file duration is measured; omit seconds`);
  }
  const visited = new Set(), active = new Set();
  function visit(i) {
    const b = score.beats[i];
    if (visited.has(b.id)) return;
    if (active.has(b.id)) fail(`Timing dependency cycle at ${b.id}`);
    active.add(b.id);
    if (b.at === undefined && i > 0) visit(i - 1);
    else if (b.at && typeof b.at === 'object') visit(score.beats.findIndex(x => x.id === b.at.beat));
    active.delete(b.id); visited.add(b.id);
  }
  score.beats.forEach((_, i) => visit(i));
  return score;
}
