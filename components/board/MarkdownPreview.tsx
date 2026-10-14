import type { Token } from 'marked';
import { Fragment, type ReactNode } from 'react';
import { decodeEntities, parseMarkdown } from '../../lib/markdown';
import styles from './MarkdownPreview.module.css';

const textOf = (token: Token) => decodeEntities('text' in token && typeof token.text === 'string' ? token.text : token.raw);

const inline = (tokens: Token[] | undefined): ReactNode =>
  (tokens ?? []).map((token, index) => <Fragment key={index}>{inlineToken(token)}</Fragment>);

const inlineToken = (token: Token): ReactNode => {
  switch (token.type) {
    case 'strong':
      return <strong>{inline(token.tokens)}</strong>;
    case 'em':
      return <em>{inline(token.tokens)}</em>;
    case 'del':
      return <s>{inline(token.tokens)}</s>;
    case 'codespan':
      return <code>{token.text}</code>;
    case 'br':
      return <br />;
    // A click anywhere on a card opens the note, so links are shown, not followed.
    case 'link':
      return <span className={styles.link}>{inline(token.tokens)}</span>;
    case 'escape':
      return token.text;
    default:
      return 'tokens' in token && token.tokens ? inline(token.tokens) : textOf(token);
  }
};

const blocks = (tokens: Token[]): ReactNode =>
  tokens.map((token, index) => <Fragment key={index}>{block(token)}</Fragment>);

const block = (token: Token): ReactNode => {
  switch (token.type) {
    case 'space':
    case 'def':
      return null;
    // Not real headings: the card title is the heading.
    case 'heading':
      return (
        <p className={styles.heading} data-level={token.depth}>
          {inline(token.tokens)}
        </p>
      );
    case 'paragraph':
      return <p>{inline(token.tokens)}</p>;
    case 'text':
      return 'tokens' in token && token.tokens ? inline(token.tokens) : textOf(token);
    case 'list': {
      const items = token.items.map((item: { tokens: Token[] }, index: number) => <li key={index}>{blocks(item.tokens)}</li>);
      return token.ordered ? <ol start={typeof token.start === 'number' ? token.start : undefined}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'blockquote':
      return <blockquote>{blocks(token.tokens ?? [])}</blockquote>;
    case 'code':
      return (
        <pre>
          <code>{token.text}</code>
        </pre>
      );
    case 'hr':
      return <hr />;
    default:
      return <p>{decodeEntities(token.raw)}</p>;
  }
};

const read = (markdown: string): Token[] | null => {
  try {
    return parseMarkdown(markdown);
  } catch {
    return null;
  }
};

type Props = { markdown: string; id?: string; className?: string };

// Renders Markdown from tokens to elements; nothing goes through innerHTML.
const MarkdownPreview = ({ markdown, id, className }: Props) => {
  const tokens = read(markdown);
  return (
    <div id={id} className={className ? `${styles.preview} ${className}` : styles.preview}>
      {tokens ? blocks(tokens) : <p>{markdown}</p>}
    </div>
  );
};

export default MarkdownPreview;
