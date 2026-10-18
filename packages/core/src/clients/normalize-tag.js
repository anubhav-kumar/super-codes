// F4: tag normalization. NFKC, trim, lowercase, internal whitespace collapsed to '-'.
// Letters and digits from any script are allowed (Arabic tags work); combining marks are
// allowed after the first character so vowelled Arabic or accented Latin survive NFKC.
export const TAG_MAX_LENGTH = 32;
export const TAG_REGEX = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,31}$/u;

export function normalizeTag(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '-');
}

export function isValidTag(tag) {
  return typeof tag === 'string' && TAG_REGEX.test(tag);
}

// DynamoDB String Sets come back from the document client as a JS Set (and JSON-serialize to
// {}), so every chat leaving core carries tags as a sorted array instead.
export function tagsToArray(tags) {
  if (!tags) return [];
  return [...tags].sort((a, b) => a.localeCompare(b));
}

// Chat item as it leaves core: tags as a sorted array (never a Set), profileVersion as a
// number (0 when never set). Other F4 fields pass through (absent when never set).
export function withClientAttributes(item) {
  if (!item) return item;
  return { ...item, tags: tagsToArray(item.tags), profileVersion: Number(item.profileVersion ?? 0) };
}
