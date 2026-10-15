import type { Token, Tokens } from 'marked';
import { parseMarkdown, unescapeTaskMarkers } from './markdown';

// Tick-box lines in a text note's Markdown ("- [ ] milk"), so a card can tick
// one without opening the editor. The boxes are the ones marked reads (the
// same tokens the card draws), in order, so ticking box n always flips the
// line drawn as box n. Numbered lists don't get tick boxes (the editor has
// none there). Notes saved before tick boxes existed have the brackets
// escaped ("\[ \]"); ticking saves them unescaped.
const MARKER = /^((?:\s*>)*\s*[-+*]\s+)\\?\[([ xX])\\?\]/;

// The first line of each tick-box item, in document order.
const taskStarts = (tokens: Token[]): string[] =>
  tokens.flatMap((token): string[] => {
    if (token.type === 'blockquote') return taskStarts(token.tokens ?? []);
    if (token.type !== 'list') return [];
    const list = token as Tokens.List;
    return list.items.flatMap((item) => [
      ...(!list.ordered && item.task ? [item.raw.split('\n')[0].trim()] : []),
      ...taskStarts(item.tokens),
    ]);
  });

export const taskLines = (markdown: string): number[] => {
  const lines = unescapeTaskMarkers(markdown).split('\n');
  const found: number[] = [];
  let from = 0;
  for (const start of taskStarts(parseMarkdown(markdown))) {
    const index = lines.findIndex((line, i) => i >= from && MARKER.test(line) && line.includes(start));
    if (index < 0) continue;
    found.push(index);
    from = index + 1;
  }
  return found;
};

export const toggleTask = (markdown: string, index: number): string => {
  const line = taskLines(markdown)[index];
  if (line === undefined) return markdown;
  const lines = markdown.split('\n');
  lines[line] = lines[line].replace(MARKER, (_all, prefix: string, mark: string) => `${prefix}[${mark === ' ' ? 'x' : ' '}]`);
  return lines.join('\n');
};
