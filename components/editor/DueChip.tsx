import { AlarmClock, Check, Repeat, X } from 'lucide-react';
import { formatDue, isDone, isOverdue } from '../../lib/due';
import { repeatText } from '../../lib/repeat';
import { useNow } from '../../lib/time';
import type { Due } from '../../lib/types';
import IconButton from '../ui/IconButton';
import styles from './DueChip.module.css';

type Props = {
  due: Due;
  readOnly: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMarkDone: () => void;
  onReopen: () => void;
};

const DueChip = ({ due, readOnly, onEdit, onRemove, onMarkDone, onReopen }: Props) => {
  const now = useNow();
  const done = isDone(due);
  const state = done ? 'done' : isOverdue(due, now) ? 'overdue' : undefined;
  const text = `${state === 'overdue' ? 'Overdue · ' : done ? 'Done · ' : ''}${formatDue(due, now)}${
    due.repeat ? ` · ${repeatText(due.repeat)}` : ''
  }`;
  const content = (
    <>
      {done ? <Check size={16} aria-hidden /> : <AlarmClock size={16} aria-hidden />}
      {text}
      {due.repeat && <Repeat size={14} aria-hidden />}
    </>
  );
  if (readOnly) {
    return (
      <div className={styles.row}>
        <p className={styles.chip} data-state={state}>
          {content}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.row}>
      <button type='button' className={styles.chip} data-state={state} onClick={onEdit}>
        <span className={styles.srOnly}>Change date:</span>{' '}
        {content}
      </button>
      <IconButton label='Remove date' onClick={onRemove}>
        <X size={16} aria-hidden />
      </IconButton>
      {done ? (
        <button type='button' className={styles.action} aria-label='Undo done' onClick={onReopen}>
          Undo
        </button>
      ) : (
        <button type='button' className={styles.action} onClick={onMarkDone}>
          <Check size={16} aria-hidden />
          Mark done
        </button>
      )}
    </div>
  );
};

export default DueChip;
