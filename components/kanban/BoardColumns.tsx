import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import {
  archiveCards,
  moveCards,
  moveIndex,
  moveInColumns,
  placeAtEnd,
  placeNote,
  putBackCards,
  putBackPlace,
  quickAddCard,
  type CardMove,
  type PlaceResult,
} from '../../lib/cards';
import { putBackDue, removeDue, setDue, trashNote, undoTrash, updateNote, useLabels } from '../../lib/notes';
import { moveToIndex, neighbors } from '../../lib/order';
import type { Board, Column, Note, NoteKind } from '../../lib/types';
import type { MenuItem } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import styles from './Board.module.css';
import BoardColumn from './BoardColumn';
import CardMenu from './CardMenu';
import InlineName from './InlineName';
import KanbanCard from './KanbanCard';

type Props = {
  data: BoardData;
  labelNames: Map<string, string>;
  images?: Map<string, BoardImages>;
  boards: { board: Board; columns: Column[] }[]; // every board, for Move to board
  onOpen: (id: string) => void;
  onAddCard: (columnId: string, kind: NoteKind) => void;
  startAddingColumn?: boolean; // the board menu's "Add column"
  onCardAdded?: (id: string) => void;
};

const scrollKey = (boardId: string) => `boardScrollX:${boardId}`;

const targetOf = (id: string | number | undefined) => {
  const key = String(id ?? '');
  if (key.startsWith('card:')) return { type: 'card' as const, id: key.slice(5) };
  if (key.startsWith('column:')) return { type: 'column' as const, id: key.slice(7) };
  return null;
};

const BoardColumns = ({
  data,
  labelNames,
  images,
  boards,
  onOpen,
  onAddCard,
  startAddingColumn = false,
  onCardAdded,
}: Props) => {
  const toast = useToast();
  const [adding, setAdding] = useState(startAddingColumn);
  const scroller = useRef<HTMLDivElement>(null);
  const addColumnButton = useRef<HTMLButtonElement>(null);
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
      // Nothing saved, or the card went elsewhere (a repeat leaving the Done
      // column): show what's stored rather than the hoped-for order.
      if (!result || result.columnId !== columnId) setPreview(null);
      else setPreview((p) => p && { ...p, base: null });
    }
    if (result && result.columnId !== columnId) {
      setAnnouncement(`Marked ${titleOf(noteId)} done; its next date moved it to ${columnName.get(result.columnId)}`);
      // Its Move button is remounted in the other column: keep focus on it.
      if (document.activeElement?.getAttribute('data-card-move') === noteId) refocusId.current = noteId;
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
    // The order as dragged, even if the stored order changed meanwhile.
    const order = preview?.order ?? shown;
    const columnId = Object.keys(order).find((key) => order[key].includes(id));
    const was = Object.keys(stored).find((key) => stored[key].includes(id));
    if (!columnId || (columnId === was && order[columnId].indexOf(id) === stored[columnId].indexOf(id))) {
      setPreview(null);
      return;
    }
    void save(id, columnId, order[columnId]);
  };

  const labels = useLabels() ?? [];
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // A card leaving the board (archived, deleted, moved away): where focus goes instead.
  const leaving = useRef<{ id: string; next: string } | null>(null);
  const otherBoards = boards.filter((b) => b.board.id !== board.id);

  const nextFocus = (noteId: string, columnId: string) => {
    const ids = shown[columnId] ?? [];
    const index = ids.indexOf(noteId);
    const other = ids[index + 1] ?? ids[index - 1];
    return other ? `[data-card-move="${CSS.escape(other)}"]` : `[data-add-card="${CSS.escape(columnId)}"]`;
  };

  const leave = (noteId: string, columnId: string) => {
    leaving.current = { id: noteId, next: nextFocus(noteId, columnId) };
  };

  const focusAfterMenu = (noteId: string) => {
    const left = leaving.current?.id === noteId ? leaving.current : null;
    leaving.current = null;
    document.querySelector<HTMLElement>(left ? left.next : `[data-card-move="${CSS.escape(noteId)}"]`)?.focus();
  };

  const archive = async (noteId: string, columnId: string) => {
    leave(noteId, columnId);
    const states = await archiveCards([noteId]);
    setAnnouncement(`Archived ${titleOf(noteId)}`);
    toast({ message: 'Note archived', actionLabel: 'Undo', onAction: () => void putBackCards(states) });
  };

  const remove = async (noteId: string, columnId: string) => {
    leave(noteId, columnId);
    await trashNote(noteId);
    setAnnouncement(`Moved ${titleOf(noteId)} to trash`);
    toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(noteId) });
  };

  const moveToBoard = async (noteId: string, columnId: string, fromColumn: string) => {
    const target = otherBoards.find((b) => b.columns.some((c) => c.id === columnId));
    const where = `${target?.board.name} · ${target?.columns.find((c) => c.id === columnId)?.name}`;
    leave(noteId, fromColumn);
    const result = await placeAtEnd(noteId, columnId);
    if (!result) return;
    setAnnouncement(`Moved ${titleOf(noteId)} to ${where}`);
    toast({ message: `Moved to ${where}`, actionLabel: 'Undo', onAction: () => void putBackPlace(result.before) });
  };

  const removeDate = async (noteId: string) => {
    const before = notesById.get(noteId)?.due ?? null;
    if (!before) return;
    await removeDue(noteId);
    toast({ message: 'Date removed', actionLabel: 'Undo', onAction: () => void putBackDue(noteId, before) });
  };

  const toggleLabel = (note: Note, labelId: string) =>
    void updateNote(note.id, {
      labelIds: note.labelIds.includes(labelId)
        ? note.labelIds.filter((id) => id !== labelId)
        : [...note.labelIds, labelId],
    });

  const filtering = false;
  const cardsWord = (n: number) => (n === 1 ? '1 card' : `${n} cards`);

  // Their toasts announce themselves (Radix), so no board announcement too.
  const archiveAll = async (ids: string[]) => {
    const states = await archiveCards(ids);
    if (states.length === 0) return;
    toast({
      message: `Archived ${cardsWord(states.length)}`,
      actionLabel: 'Undo',
      onAction: () => void putBackCards(states),
    });
  };

  const moveAll = async (ids: string[], columnId: string, where: string) => {
    const states = await moveCards(ids, columnId);
    if (states.length === 0) return;
    toast({
      message: `Moved ${cardsWord(states.length)} to ${where}`,
      actionLabel: 'Undo',
      onAction: () => void putBackCards(states),
    });
  };

  // The column menu's actions on every card it shows; none when it shows none.
  const bulkItems = (columnId: string, ids: string[]): MenuItem[] => {
    if (ids.length === 0) return [];
    const here: MenuItem[] = columns
      .filter((c) => c.id !== columnId)
      .map((c) => ({ key: c.id, label: c.name, onSelect: () => void moveAll(ids, c.id, c.name) }));
    const elsewhere: MenuItem[] = otherBoards
      .filter((b) => b.columns.length > 0)
      .map(({ board: other, columns: otherColumns }) => ({
        key: other.id,
        label: other.name,
        items: otherColumns.map((c) => ({
          key: c.id,
          label: c.name,
          onSelect: () => void moveAll(ids, c.id, `${other.name} · ${c.name}`),
        })),
      }));
    const targets = elsewhere.length > 0 ? [...here, { key: 'other-boards', label: 'Other boards', items: elsewhere }] : here;
    return [
      {
        label: filtering ? `Archive ${ids.length} shown ${ids.length === 1 ? 'card' : 'cards'}` : 'Archive all cards',
        onSelect: () => void archiveAll(ids),
      },
      ...(targets.length > 0 ? [{ label: filtering ? 'Move shown cards to' : 'Move all cards to', items: targets }] : []),
    ];
  };

  const quickAdd = async (columnId: string, title: string) => {
    try {
      const note = await quickAddCard(columnId, board.id, title);
      if (note) {
        onCardAdded?.(note.id);
        setAnnouncement(`Added ${note.title} to ${columnName.get(note.columnId ?? '') ?? 'the board'}`);
      }
    } catch {
      toast({ message: 'Couldn’t add the card.' });
    }
  };

  // With a title, the card is saved first and opened; without, a new card opens.
  const quickOpen = async (columnId: string, title: string) => {
    if (!title.trim()) return onAddCard(columnId, 'note');
    const note = await quickAddCard(columnId, board.id, title).catch(() => undefined);
    if (note) onOpen(note.id);
  };

  // Its notes go to the column on the left (or right), or back to the main board.
  const removeColumn = async (columnId: string, name: string, count: number) => {
    const index = columns.findIndex((c) => c.id === columnId);
    const target = columns[index - 1] ?? columns[index + 1] ?? null;
    const where = target ? `Its notes move to “${target.name}”.` : 'Its notes go back to your main board.';
    if (count > 0 && !window.confirm(`Delete the column “${name}”? ${where}`)) return;
    const snapshot = await deleteColumn(columnId);
    if (!snapshot) return;
    requestAnimationFrame(() => {
      const next = target && document.querySelector<HTMLElement>(`[data-column-actions="${CSS.escape(target.id)}"]`);
      (next ?? addColumnButton.current)?.focus();
    });
    toast({ message: 'Column deleted', actionLabel: 'Undo', onAction: () => void restoreColumn(snapshot) });
  };

  const stopAdding = () => {
    setAdding(false);
    requestAnimationFrame(() => addColumnButton.current?.focus());
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
        // Snapping would fight the board's scrolling at its edges while dragging.
        data-dragging={activeId ? '' : undefined}
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
          return (
            <BoardColumn
              key={column.id}
              column={column}
              ids={ids}
              total={ids.length}
              first={index === 0}
              last={index === columns.length - 1}
              notesById={notesById}
              labelNames={labelNames}
              images={images}
              bulkItems={bulkItems(column.id, ids)}
              onOpen={onOpen}
              onAddCard={onAddCard}
              onQuickAdd={(columnId, title) => void quickAdd(columnId, title)}
              onQuickOpen={(columnId, title) => void quickOpen(columnId, title)}
              onRename={(name) => void renameColumn(column.id, name)}
              onMove={(direction) => void moveColumn(column.id, direction)}
              onSetDone={(done) => void setDoneColumn(column.id, done)}
              onDelete={() => void removeColumn(column.id, column.name, ids.length)}
              onCardMenu={setMenuFor}
              cardMenu={(note) => (
                <CardMenu
                  note={note}
                  labels={labels}
                  columns={columns.filter((c) => c.id !== column.id).map((c) => ({ id: c.id, name: c.name }))}
                  boards={otherBoards}
                  open={menuFor === note.id}
                  onOpenChange={(isOpen) => setMenuFor(isOpen ? note.id : null)}
                  canMove={(move) => moveIndex(ids, note.id, move) !== null}
                  onMove={(move) => moveWithin(note.id, column.id, move)}
                  onMoveTo={(columnId) => moveToColumn(note.id, columnId)}
                  onMoveToBoard={(columnId) => void moveToBoard(note.id, columnId, column.id)}
                  onColor={(color) => void updateNote(note.id, { color })}
                  onToggleLabel={(labelId) => toggleLabel(note, labelId)}
                  onSaveDate={(date, time, repeat) => void setDue(note.id, date, time, repeat)}
                  onRemoveDate={() => void removeDate(note.id)}
                  onArchive={() => void archive(note.id, column.id)}
                  onDelete={() => void remove(note.id, column.id)}
                  onCloseFocus={() => focusAfterMenu(note.id)}
                />
              )}
            />
          );
        })}
        <div className={styles.newColumn}>
          {adding ? (
            <InlineName
              label='Column name'
              initial=''
              maxLength={COLUMN_NAME_MAX}
              onSave={(name) => {
                stopAdding();
                void addColumn(board.id, name);
              }}
              onCancel={stopAdding}
            />
          ) : (
            <button ref={addColumnButton} type='button' className={styles.addColumn} onClick={() => setAdding(true)}>
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
