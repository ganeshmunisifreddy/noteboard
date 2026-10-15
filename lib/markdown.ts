import { Lexer, Marked, Tokenizer, type Token } from 'marked';

// Before tick boxes existed the editor saved "- [ ] milk" escaped
// ("- \\[ \\] milk") to keep it text; those lines are tick boxes now.
// Fenced code is left as it is.
export const unescapeTaskMarkers = (markdown: string) => {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const opener = /^ {0,3}(```|~~~)/.exec(line)?.[1];
      if (opener) {
        if (fence === null) fence = opener;
        else if (opener === fence) fence = null;
        return line;
      }
      return fence ? line : line.replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])[ \t]+)\\\[([ xX])\\\]/, '$1[$2]');
    })
    .join('\n');
};

class NoteLexer extends Lexer {
  lex(src: string) {
    return super.lex(unescapeTaskMarkers(src));
  }
}

// How Noteboard reads Markdown, shared by the editor, cards, search and
// conversion: GitHub-flavoured, a single line break is a line break,
// "- [ ]" lines are tick boxes, and indented text, raw HTML, reference
// definitions and pipe tables stay plain text (old notes are full of such
// lines). Returning undefined (not false) from a tokenizer switches that rule off.
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
        // Images aren't supported yet: "![photo](url)" reads as "!" and a
        // link, so the address survives an edit.
        link(src) {
          const token = Tokenizer.prototype.link.call(this, src);
          return token && token.type === 'image' ? undefined : token;
        },
      },
    },
  );
  // Tiptap creates lexers from instance.Lexer; marked's own lexer() doesn't.
  instance.Lexer = NoteLexer as typeof instance.Lexer;
  instance.lexer = (src, options) => new NoteLexer(options ?? instance.defaults).lex(src);
  return instance;
};

const reader = createMarked();

// Cards, search and conversion read the same notes over and over.
const parsed = new Map<string, Token[]>();
const PARSED_LIMIT = 500;

// The tokens are shared between callers; they must not be changed.
export const parseMarkdown = (markdown: string): Token[] => {
  const cached = parsed.get(markdown);
  if (cached) return cached;
  const tokens = reader.lexer(markdown);
  if (parsed.size >= PARSED_LIMIT) parsed.delete(parsed.keys().next().value as string);
  parsed.set(markdown, tokens);
  return tokens;
};

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

// Characters 128-159 as Windows-1252, as browsers (and the editor) read them.
const WINDOWS_1252 =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f' +
  '\u0090‘’“”•–—˜™š›œ\u009džŸ';

const fromCodePoint = (value: number) => {
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return '�';
  return value >= 128 && value <= 159 ? WINDOWS_1252[value - 128] : String.fromCodePoint(value);
};

// Text tokens keep HTML entities (the editor saves "<" as "&lt;"). Decodes
// exactly what the editor decodes, so cards and the editor show the same text.
export const decodeEntities = (text: string) =>
  text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(lt|gt|quot|amp));/g, (_match, dec, hex, name) => {
    if (dec !== undefined) return fromCodePoint(Number(dec));
    if (hex !== undefined) return fromCodePoint(parseInt(hex, 16));
    return NAMED[name];
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

// A bare list marker is an empty item (marked reads "- " alone as text).
const isBareMarker = (line: string) => /^([-*+]|\d+[.)])$/.test(line);

// One entry per line of text, in reading order.
const blockLines = (tokens: Token[]): string[] =>
  tokens.flatMap((token): string[] => {
    switch (token.type) {
      case 'space':
      case 'hr':
      case 'def':
      case 'checkbox': // a tick box's marker; its text follows
        return [];
      case 'code':
        return token.text.split('\n');
      case 'list':
        return token.items.flatMap((item: { tokens: Token[] }) => blockLines(item.tokens));
      case 'blockquote':
        return blockLines(token.tokens ?? []);
      default: {
        const text = 'tokens' in token && token.tokens ? inlineText(token.tokens) : decodeEntities(token.raw);
        return text.split('\n').filter((line) => !isBareMarker(line.trim()));
      }
    }
  });

const linkUrls = (tokens: Token[]): string[] =>
  tokens.flatMap((token): string[] => [
    ...(token.type === 'link' ? [token.href as string] : []),
    ...('tokens' in token && token.tokens ? linkUrls(token.tokens) : []),
    ...(token.type === 'list' ? token.items.flatMap((item: { tokens: Token[] }) => linkUrls(item.tokens)) : []),
  ]);

export const markdownLines = (markdown: string): string[] =>
  blockLines(parseMarkdown(markdown))
    .map((line) => line.trim())
    .filter((line) => line !== '');

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
