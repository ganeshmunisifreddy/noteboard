import { Check, EllipsisVertical } from 'lucide-react';
import { useRef, useState } from 'react';
import { COLUMN_NAME_MAX } from '../../lib/boards';
import type { Column } from '../../lib/types';
import IconButton from '../ui/IconButton';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './Board.module.css';
import InlineName from './InlineName';

type Props = {
  column: Column;
  headingId: string;
  count: number; // cards shown
  total: number; // cards in the column
  first: boolean;
  last: boolean;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onSetDone: (done: boolean) => void;
  onDelete: () => void;
  bulkItems: MenuItem[]; // actions on every card shown
};

const ColumnHeader = ({
  column,
  headingId,
  count,
  total,
  first,
  last,
  onRename,
  onMove,
  onSetDone,
  onDelete,
  bulkItems,
}: Props) => {
  const [renaming, setRenaming] = useState(false);
  const actions = useRef<HTMLButtonElement>(null);
  // Back to the column's menu button once the name field closes.
  const stopRenaming = () => {
    setRenaming(false);
    requestAnimationFrame(() => actions.current?.focus());
  };
  const items: MenuItem[] = [{ label: 'Rename', keepFocus: true, onSelect: () => setRenaming(true) }];
  if (!first) items.push({ label: 'Move left', onSelect: () => onMove(-1) });
  if (!last) items.push({ label: 'Move right', onSelect: () => onMove(1) });
  items.push(
    column.done
      ? { label: 'Not a Done column', onSelect: () => onSetDone(false) }
      : { label: 'Set as Done column', onSelect: () => onSetDone(true) },
    ...bulkItems,
    { label: 'Delete column', danger: true, onSelect: onDelete },
  );
  return (
    <header className={styles.columnHeader}>
      {renaming ? (
        <InlineName
          label='Column name'
          initial={column.name}
          maxLength={COLUMN_NAME_MAX}
          onSave={(name) => {
            stopRenaming();
            onRename(name);
          }}
          onCancel={stopRenaming}
        />
      ) : (
        <h2 id={headingId} className={styles.columnTitle}>
          {column.name}
          {column.done && (
            <span className={styles.doneMark}>
              <Check size={14} aria-hidden />
              <span className={styles.srOnly}>, Done column</span>
            </span>
          )}
        </h2>
      )}
      <span className={styles.count} aria-hidden>
        {count === total ? count : `${count} of ${total}`}
      </span>
      <span className={styles.srOnly}>
        {count === total ? (count === 1 ? '1 card' : `${count} cards`) : `${count} of ${total} cards shown`}
      </span>
      <Menu
        items={items}
        trigger={
          <IconButton ref={actions} label={`Column actions for ${column.name}`} data-column-actions={column.id}>
            <EllipsisVertical size={16} aria-hidden />
          </IconButton>
        }
      />
    </header>
  );
};

export default ColumnHeader;
