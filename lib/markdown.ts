import { Lexer, Marked, type Token } from 'marked';

// Task-list markers ("- [ ] milk") stay text: the editor has no task items.
// Escaping the bracket keeps the line a plain list item. Fenced code is left
// as it is.
export const normalizeMarkdown = (markdown: string) => {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^ {0,3}(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : line.replace(/^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/, '$1\\[$2]');
    })
    .join('\n');
};

class NoteLexer extends Lexer {
  lex(src: string) {
    return super.lex(normalizeMarkdown(src));
  }
}

// How Noteboard reads Markdown, shared by the editor, cards, search and
// conversion: GitHub-flavoured, a single line break is a line break, and
// indented text, raw HTML, reference definitions, pipe tables and task
// markers stay plain text (old notes are full of such lines). Returning
// undefined (not false) from a tokenizer switches that rule off.
export const createMarked = () => {
  const instance = new Marked(
    { gfm: true, breaks: true },
    {
      tokenizer: {
        code: () => undefined,
        html: () => undefined,
        tag: () => undefined,
        def: () => undefined,
        table: () => undefined,
      },
    },
  );
  // Tiptap creates lexers from instance.Lexer; marked's own lexer() doesn't.
  instance.Lexer = NoteLexer as typeof instance.Lexer;
  instance.lexer = (src, options) => new NoteLexer(options ?? instance.defaults).lex(src);
  return instance;
};

const reader = createMarked();

export const parseMarkdown = (markdown: string): Token[] => reader.lexer(markdown);

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Text tokens keep HTML entities (the editor saves "<" as "&lt;").
export const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? match;
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });

// The words inline tokens show, without Markdown symbols.
const inlineText = (tokens: Token[] | undefined): string =>
  (tokens ?? [])
    .map((token): string => {
      switch (token.type) {
        case 'br':
          return '\n';
        case 'codespan':
        case 'escape':
          return token.text;
        default:
          if ('tokens' in token && token.tokens) return inlineText(token.tokens);
          return decodeEntities('text' in token && typeof token.text === 'string' ? token.text : token.raw);
      }
    })
    .join('');

// One entry per line of text, in reading order.
const blockLines = (tokens: Token[]): string[] =>
  tokens.flatMap((token): string[] => {
    switch (token.type) {
      case 'space':
      case 'hr':
      case 'def':
        return [];
      case 'code':
        return token.text.split('\n');
      case 'list':
        return token.items.flatMap((item: { tokens: Token[] }) => blockLines(item.tokens));
      case 'blockquote':
        return blockLines(token.tokens ?? []);
      default:
        if ('tokens' in token && token.tokens) return inlineText(token.tokens).split('\n');
        return decodeEntities(token.raw).split('\n');
    }
  });

const linkUrls = (tokens: Token[]): string[] =>
  tokens.flatMap((token): string[] => [
    ...(token.type === 'link' ? [token.href as string] : []),
    ...('tokens' in token && token.tokens ? linkUrls(token.tokens) : []),
    ...(token.type === 'list' ? token.items.flatMap((item: { tokens: Token[] }) => linkUrls(item.tokens)) : []),
  ]);

// A bare list marker is an empty item (marked reads "- " alone as text).
const isBareMarker = (line: string) => /^([-*+]|\d+[.)])$/.test(line);

export const markdownLines = (markdown: string): string[] =>
  blockLines(parseMarkdown(markdown))
    .map((line) => line.trim())
    .filter((line) => line !== '' && !isBareMarker(line));

// Text plus link addresses, so search finds "booking.com" in a link.
export const toPlainText = (markdown: string): string => {
  const tokens = parseMarkdown(markdown);
  return [...blockLines(tokens), ...linkUrls(tokens)].join('\n');
};

export const isMarkdownEmpty = (markdown: string) => markdownLines(markdown).length === 0;

// Item text is plain, so characters Markdown would read as formatting are
// escaped and the note shows exactly what was typed.
const escapeText = (text: string) =>
  text
    .trim()
    .replace(/[\\`*_~[\]<>&]/g, '\\$&')
    .replace(/^(-)(?=(\s*-){2,}\s*$)/, '\\$1')
    .replace(/^=/, '\\=')
    .replace(/^#/, '\\#')
    .replace(/^([-+])(?=\s)/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');

export const itemsToMarkdown = (items: { text: string }[]) =>
  items
    .filter((item) => item.text.trim() !== '')
    .map((item) => `- ${escapeText(item.text)}`)
    .join('\n');

// Only web and email links. An address without a scheme gets https://;
// "host:8080" is a port, not a scheme.
export const safeUrl = (input: string): string | null => {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'mailto:') return url.pathname.includes('@') ? candidate : null;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')) return candidate;
    return null;
  } catch {
    return null;
  }
};

export const looksLikeMarkdown = (text: string) =>
  /(^|\n) {0,3}(#{1,6} |[-*+] |\d+[.)] |> |```|---[ \t]*(\n|$))|\*\*\S[^*]*\*\*|~~\S[^~]*~~|\[[^\]]+\]\([^)\s]+\)|`[^`\n]+`/.test(
    text,
  );

// Starts of lines that Markdown would read as a heading, list, quote,
// divider or heading underline. Paragraph text that begins this way is
// escaped when saved, so it stays text.
export const escapeLineStarts = (text: string) =>
  text
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)([-+*>])(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)([-_])(?=(\s*\2){2,}\s*$)/, '$1\\$2')
        .replace(/^(\s*)(=+\s*)$/, '$1\\$2'),
    )
    .join('\n');

export const tidyMarkdown = (markdown: string) => markdown.replace(/\s+$/, '');
