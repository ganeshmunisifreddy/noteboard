import { Fragment } from 'react';
import { splitMatches } from '../../lib/highlight';
import styles from './NoteCard.module.css';

// Text with the search query's matches marked.
const Highlight = ({ text, query }: { text: string; query?: string }) =>
  query
    ? splitMatches(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )
    : text;

export default Highlight;
