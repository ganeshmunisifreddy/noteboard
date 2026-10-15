import { Check, EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import { COLUMN_NAME_MAX } from '../../lib/boards';
import type { Column } from '../../lib/types';
import IconButton from '../ui/IconButton';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './Board.module.css';
import InlineName from './InlineName';

type Props = {
  column: Column;
  headingId: string;
  count: number;
  first: boolean;
  last: boolean;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onSetDone: (done: boolean) => void;
  onDelete: () => void;
};

const ColumnHeader = ({ column, headingId, count, first, last, onRename, onMove, onSetDone, onDelete }: Props) => {
  const [renaming, setRenaming] = useState(false);
  const items: MenuItem[] = [{ label: 'Rename', onSelect: () => setRenaming(true) }];
  if (!first) items.push({ label: 'Move left', onSelect: () => onMove(-1) });
  if (!last) items.push({ label: 'Move right', onSelect: () => onMove(1) });
  items.push(
    column.done
      ? { label: 'Not a Done column', onSelect: () => onSetDone(false) }
      : { label: 'Set as Done column', onSelect: () => onSetDone(true) },
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
            setRenaming(false);
            onRename(name);
          }}
          onCancel={() => setRenaming(false)}
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
      <span className={styles.count}>{count}</span>
      <Menu
        items={items}
        trigger={
          <IconButton label={`Column actions for ${column.name}`}>
            <EllipsisVertical size={16} aria-hidden />
          </IconButton>
        }
      />
    </header>
  );
};

export default ColumnHeader;
