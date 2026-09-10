export function canonicalTag(tag) {
  try {
    if (typeof tag !== 'string' || !tag.trim()) throw new Error('empty tag');
    return new Intl.Locale(tag.trim()).toString();
  } catch {
    throw new Error('Invalid BCP 47 language tag: ' + JSON.stringify(tag));
  }
}
