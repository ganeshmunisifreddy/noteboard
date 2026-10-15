import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ListChecks, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BoardImages } from '../../lib/attachments';
import {
  addColumn,
  COLUMN_NAME_MAX,
  deleteColumn,
  moveColumn,
  renameColumn,
  restoreColumn,
  setDoneColumn,
  type BoardData,
} from '../../lib/boards';
import { moveIndex, moveInColumns, placeNote, putBackPlace, type CardMove, type PlaceResult } from '../../lib/cards';
import { moveToIndex, neighbors } from '../../lib/order';
import type { NoteKind } from '../../lib/types';
import IconButton from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import styles from './Board.module.css';
import CardMoveMenu from './CardMoveMenu';
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

// A card that can be dragged and dropped on (dnd-kit). The whole card is the
// drag handle: a mouse drag starts after 5px, a touch drag after a 250ms press.
const DraggableCard = ({ id, children }: { id: string; children: ReactNode }) => {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef } = useDroppable({ id: `card:${id}` });
  const ref = useCallback(
    (el: HTMLLIElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );
  // Pointer only: the card's own buttons (Open, Move) are the keyboard way in,
  // so dnd-kit's focusable "button" attributes aren't applied.
  return (
    <li ref={ref} className={isDragging ? styles.dragging : undefined} {...listeners}>
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

const targetOf = (id: string | number | undefined) => {
  const key = String(id ?? '');
  if (key.startsWith('card:')) return { type: 'card' as const, id: key.slice(5) };
  if (key.startsWith('column:')) return { type: 'column' as const, id: key.slice(7) };
  return null;
};

const BoardColumns = ({ data, labelNames, images, onOpen, onAddCard, startAddingColumn = false }: Props) => {
  const toast = useToast();
  const [adding, setAdding] = useState(startAddingColumn);
  const scroller = useRef<HTMLDivElement>(null);
  const { board, columns, cards } = data;
  const [announcement, setAnnouncement] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  // The order shown while dragging or saving, as on the main board: kept while
  // moves are saved, then until the stored order changes after the last save,
  // so the live query catching up never makes a card jump back.
  const [preview, setPreview] = useState<{ base: string | null; order: Record<string, string[]> } | null>(null);
  const [saving, setSaving] = useState(0);
  const refocusId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const stored: Record<string, string[]> = Object.fromEntries(
    columns.map((c) => [c.id, (cards.get(c.id) ?? []).map((n) => n.id)]),
  );
  const storedKey = JSON.stringify(stored);
  if (preview && preview.base === null && saving === 0) setPreview({ ...preview, base: storedKey });
  const shown =
    preview && (saving > 0 || preview.base === null || preview.base === storedKey) ? preview.order : stored;
  const notesById = new Map([...cards.values()].flat().map((n) => [n.id, n]));
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const titleOf = (id: string) => notesById.get(id)?.title || 'Untitled';

  // Back from a card: the board scrolls sideways to where it was.
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(scrollKey(board.id)));
    if (scroller.current && saved > 0) scroller.current.scrollLeft = saved;
  }, [board.id]);

  // After a move the card's Move button may be in another column: focus it again.
  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    const button = document.querySelector<HTMLElement>(`[data-card-move="${CSS.escape(id)}"]`);
    if (button) {
      refocusId.current = null;
      button.focus();
    }
  });

  const save = async (noteId: string, columnId: string, ids: string[]) => {
    const { beforeId, afterId } = neighbors(ids, noteId);
    setAnnouncement(
      `Moved ${titleOf(noteId)} to ${columnName.get(columnId)}, position ${ids.indexOf(noteId) + 1} of ${ids.length}`,
    );
    setSaving((n) => n + 1);
    let result: PlaceResult | undefined;
    try {
      result = await placeNote(noteId, columnId, beforeId, afterId);
    } catch {
      toast({ message: 'Couldn’t move the card.' });
    } finally {
      setSaving((n) => n - 1);
      setPreview((p) => p && { ...p, base: null });
    }
    if (result?.dateChanged) {
      const before = result.before;
      toast({
        message: before.due?.doneAt === null ? 'Marked done' : 'Date reopened',
        actionLabel: 'Undo',
        onAction: () => void putBackPlace(before),
      });
    }
  };

  // Menu moves start from the order on screen: an earlier move may not be saved yet.
  const moveWithin = (noteId: string, columnId: string, move: CardMove) => {
    const ids = shown[columnId] ?? [];
    const index = moveIndex(ids, noteId, move);
    if (index === null) return;
    const next = moveToIndex(ids, noteId, index);
    setPreview({ base: null, order: { ...shown, [columnId]: next } });
    refocusId.current = noteId;
    void save(noteId, columnId, next);
  };

  const moveToColumn = (noteId: string, columnId: string) => {
    const from = Object.keys(shown).find((key) => shown[key].includes(noteId));
    const next = { ...shown, [columnId]: [...(shown[columnId] ?? []).filter((id) => id !== noteId), noteId] };
    if (from) next[from] = shown[from].filter((id) => id !== noteId);
    setPreview({ base: null, order: next });
    refocusId.current = noteId;
    void save(noteId, columnId, next[columnId]);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setPreview({ base: null, order: shown });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const target = targetOf(over?.id);
    if (!target) return;
    setPreview((p) => ({ base: p?.base ?? null, order: moveInColumns(p?.order ?? shown, String(active.id), target) }));
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    setActiveId(null);
    const id = String(active.id);
    const order = shown;
    const columnId = Object.keys(order).find((key) => order[key].includes(id));
    const was = Object.keys(stored).find((key) => stored[key].includes(id));
    if (!columnId || (columnId === was && order[columnId].indexOf(id) === stored[columnId].indexOf(id))) {
      setPreview(null);
      return;
    }
    void save(id, columnId, order[columnId]);
  };

  const removeColumn = async (columnId: string, name: string, count: number) => {
    if (count > 0 && !window.confirm(`Delete the column “${name}”? Its notes move to the next column.`)) return;
    const snapshot = await deleteColumn(columnId);
    if (snapshot) {
      toast({ message: 'Column deleted', actionLabel: 'Undo', onAction: () => void restoreColumn(snapshot) });
    }
  };

  const active = activeId ? notesById.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setPreview(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active: card }) => `Picked up ${titleOf(String(card.id))}`,
          onDragOver: () => undefined,
          onDragMove: () => undefined,
          onDragEnd: ({ active: card }) => `Dropped ${titleOf(String(card.id))}`,
          onDragCancel: ({ active: card }) => `Stopped moving ${titleOf(String(card.id))}`,
        },
      }}
    >
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
          const ids = shown[column.id] ?? [];
          const headingId = `column-${column.id}`;
          return (
            <section key={column.id} className={styles.column} aria-labelledby={headingId}>
              <ColumnHeader
                column={column}
                headingId={headingId}
                count={ids.length}
                first={index === 0}
                last={index === columns.length - 1}
                onRename={(name) => void renameColumn(column.id, name)}
                onMove={(direction) => void moveColumn(column.id, direction)}
                onSetDone={(done) => void setDoneColumn(column.id, done)}
                onDelete={() => void removeColumn(column.id, column.name, ids.length)}
              />
              <ColumnDrop id={column.id}>
                <ol className={styles.cards}>
                  {ids.map((noteId) => {
                    const note = notesById.get(noteId);
                    if (!note) return null;
                    return (
                      <DraggableCard key={noteId} id={noteId}>
                        <KanbanCard
                          note={note}
                          labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((n): n is string => !!n)}
                          imageCount={images?.get(note.id)?.total ?? 0}
                          onOpen={onOpen}
                          moveMenu={
                            <CardMoveMenu
                              title={note.title || 'Untitled'}
                              buttonId={note.id}
                              columns={columns.filter((c) => c.id !== column.id).map((c) => ({ id: c.id, name: c.name }))}
                              canMove={(move) => moveIndex(ids, noteId, move) !== null}
                              onMove={(move) => moveWithin(noteId, column.id, move)}
                              onMoveTo={(columnId) => moveToColumn(noteId, columnId)}
                            />
                          }
                        />
                      </DraggableCard>
                    );
                  })}
                </ol>
                {ids.length === 0 && <p className={styles.noCards}>No cards</p>}
              </ColumnDrop>
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
      <DragOverlay>
        {active ? (
          <div className={styles.overlay} aria-hidden inert>
            <KanbanCard note={active} labelNames={[]} imageCount={0} onOpen={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
      <p role='status' className={styles.srOnly}>
        {announcement}
      </p>
    </DndContext>
  );
};

export default BoardColumns;
