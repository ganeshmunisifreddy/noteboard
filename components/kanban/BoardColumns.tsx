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
  type CollisionDetection,
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
  moveColumnTo,
  renameColumn,
  restoreColumn,
  setDoneColumn,
  type BoardData,
} from '../../lib/boards';
import {
  archiveCards,
  columnOver,
  moveCards,
  moveIndex,
  moveInColumns,
  moveShown,
  placeAtEnd,
  placeNote,
  putBackCards,
  putBackPlace,
  quickAddCard,
  type CardMove,
  type PlaceResult,
} from '../../lib/cards';
import { putBackDue, removeDue, setDue, trashNote, undoTrash, updateNote, useLabels } from '../../lib/notes';
import { moveId, neighbors } from '../../lib/order';
import type { Board, Column, Note, NoteKind, Repeat } from '../../lib/types';
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
  visibleIds?: Set<string> | null; // the cards a filter shows; null when not filtering
  onOpen: (id: string) => void;
  onAddCard: (columnId: string, kind: NoteKind) => void;
  startAddingColumn?: boolean; // the board menu's "Add column"
  onKeepShown?: (id: string) => void; // a card added or edited here stays shown while filtering
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
  visibleIds = null,
  onOpen,
  onAddCard,
  startAddingColumn = false,
  onKeepShown,
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
  const filtering = visibleIds !== null;
  const visible = (columnId: string) => {
    const ids = shown[columnId] ?? [];
    return visibleIds ? ids.filter((id) => visibleIds.has(id)) : ids;
  };

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
    const seen = visibleIds ? ids.filter((id) => visibleIds.has(id) || id === noteId) : ids;
    setAnnouncement(
      `Moved ${titleOf(noteId)} to ${columnName.get(columnId)}, position ${seen.indexOf(noteId) + 1} of ${seen.length}`,
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

  // Menu moves start from the order on screen (an earlier move may not be saved
  // yet) and pass the next shown card; hidden cards keep their order.
  const moveWithin = (noteId: string, columnId: string, move: CardMove) => {
    const next = moveShown(shown[columnId] ?? [], visible(columnId), noteId, move);
    if (!next) return;
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

  const [columnPreview, setColumnPreview] = useState<string[] | null>(null);
  const storedColumns = columns.map((c) => c.id);
  // A dragged column's new order shows until the stored one catches up.
  if (columnPreview && !activeId && columnPreview.join() === storedColumns.join()) setColumnPreview(null);
  const columnById = new Map(columns.map((c) => [c.id, c]));
  const orderedColumns = (columnPreview ?? storedColumns)
    .map((id) => columnById.get(id))
    .filter((c): c is Column => !!c);
  const isColumnDrag = (id: string | number) => String(id).startsWith('col:');
  const columnOfCard = (cardId: string) => Object.keys(shown).find((key) => shown[key].includes(cardId));
  const nameOf = (id: string | number) =>
    isColumnDrag(id) ? `column ${columnById.get(String(id).slice(4))?.name}` : titleOf(String(id));

  // Cards only land on cards and lists; columns only on column slots.
  const collisions: CollisionDetection = (args) =>
    closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => String(c.id).startsWith('col-slot:') === isColumnDrag(args.active.id),
      ),
    });

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    if (isColumnDrag(active.id)) return setColumnPreview(storedColumns);
    setPreview({ base: null, order: shown });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (isColumnDrag(active.id)) {
      const column = over ? columnOver(String(over.id), columnOfCard) : null;
      if (column) setColumnPreview((p) => moveId(p ?? storedColumns, String(active.id).slice(4), column));
      return;
    }
    const target = targetOf(over?.id);
    if (!target) return;
    setPreview((p) => ({ base: p?.base ?? null, order: moveInColumns(p?.order ?? shown, String(active.id), target) }));
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    setActiveId(null);
    if (isColumnDrag(active.id)) {
      const columnId = String(active.id).slice(4);
      const index = (columnPreview ?? storedColumns).indexOf(columnId);
      if (index < 0 || index === storedColumns.indexOf(columnId)) return setColumnPreview(null);
      setAnnouncement(`Moved column ${columnById.get(columnId)?.name} to position ${index + 1} of ${storedColumns.length}`);
      moveColumnTo(columnId, index).catch(() => {
        setColumnPreview(null);
        toast({ message: 'Couldn’t move the column.' });
      });
      return;
    }
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
    const ids = visible(columnId);
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

  // Toasts announce themselves (Radix), so these don't use the board's live region too.
  const archive = async (noteId: string, columnId: string) => {
    leave(noteId, columnId);
    const states = await archiveCards([noteId]);
    toast({ message: 'Note archived', actionLabel: 'Undo', onAction: () => void putBackCards(states) });
  };

  const remove = async (noteId: string, columnId: string) => {
    leave(noteId, columnId);
    await trashNote(noteId);
    toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(noteId) });
  };

  const moveToBoard = async (noteId: string, columnId: string, fromColumn: string) => {
    leave(noteId, fromColumn);
    const result = await placeAtEnd(noteId, columnId).catch(() => undefined);
    if (!result) {
      // Nothing moved (the column was deleted meanwhile): focus stays on the card.
      leaving.current = null;
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-card-move="${CSS.escape(noteId)}"]`)?.focus(),
      );
      return;
    }
    // Where it landed: a repeat leaving the Done column goes to the first column.
    const target = otherBoards.find((b) => b.columns.some((c) => c.id === result.columnId));
    const where = `${target?.board.name} · ${target?.columns.find((c) => c.id === result.columnId)?.name}`;
    toast({ message: `Moved to ${where}`, actionLabel: 'Undo', onAction: () => void putBackPlace(result.before) });
  };

  // An edit from the card's menu keeps the card shown while filtering, so it
  // (and focus on its menu button) doesn't vanish under the person editing it.
  const edit = (noteId: string, changes: Parameters<typeof updateNote>[1]) => {
    onKeepShown?.(noteId);
    void updateNote(noteId, changes);
  };

  const saveDate = (noteId: string, date: string, time: string | null, repeat: Repeat | null) => {
    onKeepShown?.(noteId);
    void setDue(noteId, date, time, repeat);
  };

  const removeDate = async (noteId: string) => {
    const before = notesById.get(noteId)?.due ?? null;
    if (!before) return;
    onKeepShown?.(noteId);
    await removeDue(noteId);
    toast({ message: 'Date removed', actionLabel: 'Undo', onAction: () => void putBackDue(noteId, before) });
  };

  const toggleLabel = (note: Note, labelId: string) =>
    edit(note.id, {
      labelIds: note.labelIds.includes(labelId)
        ? note.labelIds.filter((id) => id !== labelId)
        : [...note.labelIds, labelId],
    });

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
        onKeepShown?.(note.id);
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
      collisionDetection={collisions}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setPreview(null);
        setColumnPreview(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active: item }) => `Picked up ${nameOf(item.id)}`,
          onDragOver: () => undefined,
          onDragMove: () => undefined,
          onDragEnd: ({ active: item }) => `Dropped ${nameOf(item.id)}`,
          onDragCancel: ({ active: item }) => `Stopped moving ${nameOf(item.id)}`,
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
        {orderedColumns.map((column, index) => {
          const ids = visible(column.id);
          const all = shown[column.id] ?? [];
          return (
            <BoardColumn
              key={column.id}
              column={column}
              ids={ids}
              total={all.length}
              first={index === 0}
              last={index === orderedColumns.length - 1}
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
              onDelete={() => void removeColumn(column.id, column.name, all.length)}
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
                  onColor={(color) => edit(note.id, { color })}
                  onToggleLabel={(labelId) => toggleLabel(note, labelId)}
                  onSaveDate={(date, time, repeat) => saveDate(note.id, date, time, repeat)}
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
        ) : activeId && isColumnDrag(activeId) ? (
          <div className={styles.columnOverlay} aria-hidden inert>
            {columnById.get(activeId.slice(4))?.name}
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
