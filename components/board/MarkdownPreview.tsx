import type { Token, Tokens } from 'marked';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { decodeEntities, parseMarkdown } from '../../lib/markdown';
import styles from './MarkdownPreview.module.css';

const textOf = (token: Token) => decodeEntities('text' in token && typeof token.text === 'string' ? token.text : token.raw);

type RenderOptions = { onToggleTask?: (index: number) => void; highlight?: string };

const renderer = ({ onToggleTask }: RenderOptions) => {
  let task = 0; // tick boxes are numbered in document order, as lib/tasks counts them

  const text = (value: string): ReactNode => value;

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
        return 'tokens' in token && token.tokens ? inline(token.tokens) : text(textOf(token));
    }
  };

  const blocks = (tokens: Token[]): ReactNode =>
    tokens.map((token, index) => <Fragment key={index}>{block(token)}</Fragment>);

  const listItem = (item: Tokens.ListItem, index: number) => {
    if (!item.task) return <li key={index}>{blocks(item.tokens)}</li>;
    const number = task++;
    const label = item.text.replace(/^\s*\[[ xX]\]\s*/, '').split('\n')[0] || 'item';
    // marked puts a checkbox token first in the item; draw a real one instead.
    const rest = item.tokens.filter((token) => token.type !== 'checkbox');
    return (
      <li key={index} className={styles.task} data-checked={item.checked ? 'true' : undefined}>
        <input
          type='checkbox'
          checked={!!item.checked}
          disabled={!onToggleTask}
          aria-label={`Mark ‘${label}’ ${item.checked ? 'not done' : 'done'}`}
          onChange={() => onToggleTask?.(number)}
        />
        <span>{blocks(rest)}</span>
      </li>
    );
  };

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
        return 'tokens' in token && token.tokens ? inline(token.tokens) : text(textOf(token));
      case 'list': {
        const list = token as Tokens.List;
        const items = list.items.map(listItem);
        return list.ordered ? (
          <ol start={typeof list.start === 'number' ? list.start : undefined}>{items}</ol>
        ) : (
          <ul className={list.items.some((item) => item.task) ? styles.tasks : undefined}>{items}</ul>
        );
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

  return { blocks };
};

const read = (markdown: string): Token[] | null => {
  try {
    return parseMarkdown(markdown);
  } catch {
    return null;
  }
};

// clamp: the parent caps the height; the last visible line fades out when
// the text doesn't fit.
type Props = {
  markdown: string;
  id?: string;
  className?: string;
  clamp?: boolean;
  onToggleTask?: (index: number) => void; // tick boxes are tickable when given
  highlight?: string; // search text to mark
};

// Renders Markdown from tokens to elements; nothing goes through innerHTML.
const MarkdownPreview = ({ markdown, id, className, clamp = false, onToggleTask, highlight }: Props) => {
  const tokens = read(markdown);
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!clamp || !element || typeof ResizeObserver === 'undefined') return;
    // The first call comes as soon as the element is observed.
    const observer = new ResizeObserver(() => setClamped(element.scrollHeight > element.clientHeight + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [clamp, markdown]);

  return (
    <div
      ref={ref}
      id={id}
      className={className ? `${styles.preview} ${className}` : styles.preview}
      data-clamped={clamp && clamped ? 'true' : undefined}
    >
      {tokens ? renderer({ onToggleTask, highlight }).blocks(tokens) : <p>{markdown}</p>}
    </div>
  );
};

export default MarkdownPreview;
