import { Image as ImageIcon, ListChecks } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { Note } from '../../lib/types';
import CardDue from '../board/CardDue';
import styles from './Board.module.css';

type Props = {
  note: Note;
  labelNames: string[];
  imageCount: number;
  onOpen: (id: string) => void;
  moveMenu?: ReactNode;
};

const KanbanCard = ({ note, labelNames, imageCount, onOpen, moveMenu }: Props) => {
  const id = useId();
  const done = note.items.filter((item) => item.done).length;
  const listed = note.kind === 'list' && note.items.length > 0;
  const summary = [
    listed && `${done} of ${note.items.length} done`,
    imageCount > 0 && `${imageCount} ${imageCount === 1 ? 'image' : 'images'}`,
    labelNames.length > 0 && `labels ${labelNames.join(', ')}`,
  ]
    .filter(Boolean)
    .join(', ');
  const describedBy = [summary && `${id}-summary`, note.due && `${id}-due`].filter(Boolean).join(' ');
  return (
    <article className={styles.card} data-color={note.color}>
      <button
        type='button'
        className={styles.open}
        aria-label={`Open note: ${note.title || 'Untitled'}`}
        aria-describedby={describedBy || undefined}
        onClick={() => onOpen(note.id)}
      />
      <h3 className={styles.cardTitle}>{note.title || 'Untitled'}</h3>
      {(listed || imageCount > 0 || labelNames.length > 0) && (
        <p className={styles.markers} aria-hidden>
          {listed && (
            <span className={styles.marker}>
              <ListChecks size={14} />
              {`${done}/${note.items.length}`}
            </span>
          )}
          {imageCount > 0 && (
            <span className={styles.marker}>
              <ImageIcon size={14} />
              {imageCount}
            </span>
          )}
          {labelNames.map((name) => (
            <span key={name} className={styles.label}>
              {name}
            </span>
          ))}
        </p>
      )}
      {summary && (
        <span id={`${id}-summary`} className={styles.srOnly}>
          {summary}
        </span>
      )}
      {note.due && <CardDue due={note.due} id={`${id}-due`} />}
      {moveMenu && <div className={styles.cardMenu}>{moveMenu}</div>}
    </article>
  );
};

export default KanbanCard;
