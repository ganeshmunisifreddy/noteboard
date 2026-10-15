import { ListChecks, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BoardImages } from '../../lib/attachments';
import { addColumn, COLUMN_NAME_MAX, deleteColumn, moveColumn, renameColumn, restoreColumn, setDoneColumn, type BoardData } from '../../lib/boards';
import type { NoteKind } from '../../lib/types';
import IconButton from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import styles from './Board.module.css';
import ColumnHeader from './ColumnHeader';
import InlineName from './InlineName';
import KanbanCard from './KanbanCard';

type Props = {
  data: BoardData;
  labelNames: Map<string, string>;
  images?: Map<string, BoardImages>;
  onOpen: (id: string) => void;
  onAddCard: (columnId: string, kind: NoteKind) => void;
  startAddingColumn?: boolean; // the board menu's "Add column"
};

const scrollKey = (boardId: string) => `boardScrollX:${boardId}`;

const BoardColumns = ({ data, labelNames, images, onOpen, onAddCard, startAddingColumn = false }: Props) => {
  const toast = useToast();
  const [adding, setAdding] = useState(startAddingColumn);
  const scroller = useRef<HTMLDivElement>(null);
  const { board, columns, cards } = data;

  // Back from a card: the board scrolls sideways to where it was.
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(scrollKey(board.id)));
    if (scroller.current && saved > 0) scroller.current.scrollLeft = saved;
  }, [board.id]);

  const removeColumn = async (columnId: string, name: string, count: number) => {
    if (count > 0 && !window.confirm(`Delete the column “${name}”? Its notes move to the next column.`)) return;
    const snapshot = await deleteColumn(columnId);
    if (snapshot) {
      toast({ message: 'Column deleted', actionLabel: 'Undo', onAction: () => void restoreColumn(snapshot) });
    }
  };

  return (
    <div
      ref={scroller}
      className={styles.columns}
      onScroll={(e) => {
        try {
          sessionStorage.setItem(scrollKey(board.id), String(e.currentTarget.scrollLeft));
        } catch {
          // Only a convenience.
        }
      }}
    >
      {columns.map((column, index) => {
        const list = cards.get(column.id) ?? [];
        const headingId = `column-${column.id}`;
        return (
          <section key={column.id} className={styles.column} aria-labelledby={headingId}>
            <ColumnHeader
              column={column}
              headingId={headingId}
              count={list.length}
              first={index === 0}
              last={index === columns.length - 1}
              onRename={(name) => void renameColumn(column.id, name)}
              onMove={(direction) => void moveColumn(column.id, direction)}
              onSetDone={(done) => void setDoneColumn(column.id, done)}
              onDelete={() => void removeColumn(column.id, column.name, list.length)}
            />
            <ol className={styles.cards}>
              {list.map((note) => (
                <li key={note.id}>
                  <KanbanCard
                    note={note}
                    labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((n): n is string => !!n)}
                    imageCount={images?.get(note.id)?.total ?? 0}
                    onOpen={onOpen}
                  />
                </li>
              ))}
            </ol>
            {list.length === 0 && <p className={styles.noCards}>No cards</p>}
            <div className={styles.addRow}>
              <button
                type='button'
                className={styles.addCard}
                aria-label={`Add card to ${column.name}`}
                onClick={() => onAddCard(column.id, 'note')}
              >
                <Plus size={16} aria-hidden />
                Add card
              </button>
              <IconButton label={`Add a list to ${column.name}`} onClick={() => onAddCard(column.id, 'list')}>
                <ListChecks size={16} aria-hidden />
              </IconButton>
            </div>
          </section>
        );
      })}
      <div className={styles.newColumn}>
        {adding ? (
          <InlineName
            label='Column name'
            initial=''
            maxLength={COLUMN_NAME_MAX}
            onSave={(name) => {
              setAdding(false);
              void addColumn(board.id, name);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type='button' className={styles.addColumn} onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            Add column
          </button>
        )}
      </div>
    </div>
  );
};

export default BoardColumns;
