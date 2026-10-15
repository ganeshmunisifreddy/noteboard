const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The query's matches in a piece of text, for <mark> on search results.
// Matched case-insensitively on the text itself, so letters whose lower case
// is longer (like "İ") don't shift the marks.
export const splitMatches = (text: string, query: string): { text: string; match: boolean }[] => {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const pattern = new RegExp(escapeRegExp(needle), 'gi');
  let from = 0;
  for (const found of text.matchAll(pattern)) {
    const at = found.index ?? 0;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: found[0], match: true });
    from = at + found[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
};
