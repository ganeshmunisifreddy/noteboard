import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ListChecks, Plus } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { BoardImages } from '../../lib/attachments';
import type { Column, Note, NoteKind } from '../../lib/types';
import IconButton from '../ui/IconButton';
import type { MenuItem } from '../ui/Menu';
import styles from './Board.module.css';
import ColumnHeader from './ColumnHeader';
import KanbanCard from './KanbanCard';
import { ownListeners, ownPress } from './ownPress';
import QuickAdd from './QuickAdd';

// A card that can be dragged and dropped on (dnd-kit). The whole card is the
// drag handle: a mouse drag starts after 5px, a touch drag after a 250ms press.
const DraggableCard = ({ id, onMenu, children }: { id: string; onMenu: () => void; children: ReactNode }) => {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef } = useDroppable({ id: `card:${id}` });
  const ref = useCallback(
    (el: HTMLLIElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );
  const pointer = useRef('mouse');
  // Pointer only: the card's own buttons (Open, Card actions) are the keyboard
  // way in, so dnd-kit's focusable "button" attributes aren't applied.
  return (
    <li
      ref={ref}
      className={isDragging ? styles.dragging : undefined}
      {...ownListeners(listeners)}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
      }}
      onContextMenu={(e) => {
        // A touch long-press stays a drag; only a mouse right-click opens the menu.
        if (pointer.current !== 'mouse' || !ownPress(e)) return;
        e.preventDefault();
        onMenu();
      }}
    >
      {children}
    </li>
  );
};

// A column's empty space, so a card can be dropped at its end.
const ColumnDrop = ({ id, children }: { id: string; children: ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}` });
  return (
    <div ref={setNodeRef} className={isOver ? `${styles.drop} ${styles.over}` : styles.drop}>
      {children}
    </div>
  );
};

type Props = {
  column: Column;
  ids: string[]; // the cards shown, in order
  total: number; // cards in the column, shown or not
  first: boolean;
  last: boolean;
  notesById: Map<string, Note>;
  labelNames: Map<string, string>;
  images?: Map<string, BoardImages>;
  bulkItems: MenuItem[];
  onOpen: (id: string) => void;
  onAddCard: (columnId: string, kind: NoteKind) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onQuickOpen: (columnId: string, title: string) => void;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onSetDone: (done: boolean) => void;
  onDelete: () => void;
  cardMenu: (note: Note) => ReactNode;
  onCardMenu: (noteId: string) => void; // right-click
};

const BoardColumn = ({
  column,
  ids,
  total,
  first,
  last,
  notesById,
  labelNames,
  images,
  bulkItems,
  onOpen,
  onAddCard,
  onQuickAdd,
  onQuickOpen,
  onRename,
  onMove,
  onSetDone,
  onDelete,
  cardMenu,
  onCardMenu,
}: Props) => {
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const headingId = `column-${column.id}`;
  // The column is a drop slot for other columns, dragged by its header.
  const { setNodeRef: setSlotRef } = useDroppable({ id: `col-slot:${column.id}` });
  const { setNodeRef: setHandleRef, listeners, isDragging } = useDraggable({ id: `col:${column.id}` });
  const stopAdding = (refocus: boolean) => {
    setAdding(false);
    if (refocus) requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <section
      ref={setSlotRef}
      className={isDragging ? `${styles.column} ${styles.dragging}` : styles.column}
      aria-labelledby={headingId}
    >
      <div ref={setHandleRef} className={styles.columnGrab} {...ownListeners(listeners)}>
        <ColumnHeader
          column={column}
          headingId={headingId}
          count={ids.length}
          total={total}
          first={first}
          last={last}
          bulkItems={bulkItems}
          onRename={onRename}
          onMove={onMove}
          onSetDone={onSetDone}
          onDelete={onDelete}
        />
      </div>
      <ColumnDrop id={column.id}>
        <ol className={styles.cards}>
          {ids.map((noteId) => {
            const note = notesById.get(noteId);
            if (!note) return null;
            return (
              <DraggableCard key={noteId} id={noteId} onMenu={() => onCardMenu(noteId)}>
                <KanbanCard
                  note={note}
                  labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((n): n is string => !!n)}
                  imageCount={images?.get(note.id)?.total ?? 0}
                  onOpen={onOpen}
                  moveMenu={cardMenu(note)}
                />
              </DraggableCard>
            );
          })}
        </ol>
        {/* An empty column stays quiet; only a filter hiding its cards is worth saying. */}
        {ids.length === 0 && total > 0 && <p className={styles.noCards}>No matching cards</p>}
      </ColumnDrop>
      <div className={styles.addRow}>
        {adding ? (
          <QuickAdd
            columnName={column.name}
            onAdd={(title) => onQuickAdd(column.id, title)}
            onOpenEditor={(title) => onQuickOpen(column.id, title)}
            onClose={stopAdding}
          />
        ) : (
          <button
            ref={addButton}
            type='button'
            className={styles.addCard}
            aria-label={`Add card to ${column.name}`}
            data-add-card={column.id}
            onClick={() => setAdding(true)}
          >
            <Plus size={16} aria-hidden />
            Add card
          </button>
        )}
        <IconButton label={`Add a list to ${column.name}`} onClick={() => onAddCard(column.id, 'list')}>
          <ListChecks size={16} aria-hidden />
        </IconButton>
      </div>
    </section>
  );
};

export default BoardColumn;
