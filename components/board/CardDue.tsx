import { AlarmClock, Check, Repeat } from 'lucide-react';
import { dueDescription, formatDue, isDone, isOverdue } from '../../lib/due';
import { useNow } from '../../lib/time';
import type { Due } from '../../lib/types';
import styles from './NoteCard.module.css';

// The chip is a visual summary; screen readers get the description (`id`)
// through the card's open button.
const CardDue = ({ due, id }: { due: Due; id: string }) => {
  const now = useNow();
  const done = isDone(due);
  const overdue = isOverdue(due, now);
  return (
    <>
      <p className={styles.due} data-state={done ? 'done' : overdue ? 'overdue' : undefined} aria-hidden>
        {done ? <Check size={14} /> : <AlarmClock size={14} />}
        {overdue ? 'Overdue · ' : done ? 'Done · ' : ''}
        {formatDue(due, now)}
        {due.repeat && <Repeat size={14} />}
      </p>
      <span id={id} className={styles.srOnly}>
        {dueDescription(due, now)}
      </span>
    </>
  );
};

export default CardDue;
