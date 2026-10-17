import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { EllipsisVertical, Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { moveBoardTo, orderInGroup, starBoard, useBoardSummaries, type BoardSummary } from '../../lib/boards';
import { boardHref } from '../../lib/routes';
import IconButton from '../ui/IconButton';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './BoardTiles.module.css';
import NewBoardDialog from './NewBoardDialog';
import { ownListeners } from './ownPress';

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

// A tile is dragged by its body (mouse after 5px, touch after a 250ms press)
// and is a drop target for the other tiles in its group.
const DraggableTile = ({ id, children }: { id: string; children: ReactNode }) => {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef } = useDroppable({ id: `tile:${id}` });
  const ref = useCallback(
    (el: HTMLLIElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );
  return (
    <li ref={ref} className={isDragging ? `${styles.item} ${styles.dragging}` : styles.item} {...ownListeners(listeners)}>
      {children}
    </li>
  );
};

const BoardTiles = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const summaries = useBoardSummaries();
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragged = useRef(false);
  // Starring moves a tile to the other group (a new element): focus its star again.
  const refocusStar = useRef<{ id: string; starred: boolean } | null>(null);
  useEffect(() => {
    const target = refocusStar.current;
    const star = target && document.querySelector<HTMLElement>(`[data-star="${CSS.escape(target.id)}"]`);
    if (star && star.getAttribute('aria-pressed') === String(target.starred)) {
      refocusStar.current = null;
      star.focus();
    }
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  if (!summaries) return null;

  const stored = summaries.map((s) => s.board.id);
  // A dragged tile's new order shows until the stored one catches up.
  if (preview && preview.join() === stored.join()) setPreview(null);
  const byId = new Map(summaries.map((s) => [s.board.id, s]));
  const ordered = (preview ?? stored).map((id) => byId.get(id)).filter((s): s is BoardSummary => !!s);
  const starred = ordered.filter((s) => s.board.starred);
  const rest = ordered.filter((s) => !s.board.starred);
  const groupOf = (id: string) => (byId.get(id)?.board.starred ? starred : rest).map((s) => s.board.id);

  const nameOf = (id: string) => byId.get(id)?.board.name ?? 'board';

  const move = (id: string, index: number) => {
    const others = groupOf(id).filter((other) => other !== id);
    setAnnouncement(index === 0 ? `Moved ${nameOf(id)} first` : `Moved ${nameOf(id)} after ${nameOf(others[index - 1])}`);
    moveBoardTo(id, index).catch(() => setPreview(null));
  };

  // Tiles move only within their group; starring moves a board between groups.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const overId = String(over?.id ?? '');
    if (!overId.startsWith('tile:')) return;
    const target = overId.slice(5);
    const id = String(active.id);
    if (target === id || byId.get(target)?.board.starred !== byId.get(id)?.board.starred) return;
    // Built the way moveBoardTo saves it, so the preview clears once it's stored.
    setPreview((p) => {
      const boards = (p ?? stored).map((b) => ({ id: b, starred: !!byId.get(b)?.board.starred }));
      const group = boards.filter((b) => b.starred === byId.get(id)?.board.starred).map((b) => b.id);
      return orderInGroup(boards, id, group.indexOf(target));
    });
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    // The click that may follow this drop isn't a click on the tile.
    dragged.current = true;
    setTimeout(() => {
      dragged.current = false;
    }, 0);
    const id = String(active.id);
    const index = groupOf(id).indexOf(id);
    const was = summaries
      .filter((s) => s.board.starred === byId.get(id)?.board.starred)
      .findIndex((s) => s.board.id === id);
    if (index < 0 || index === was) return setPreview(null);
    move(id, index);
  };

  const tile = ({ board, columns, total }: BoardSummary, index: number, group: BoardSummary[]) => {
    const items: MenuItem[] = [];
    if (index > 0) items.push({ label: 'Move earlier', onSelect: () => move(board.id, index - 1) });
    if (index < group.length - 1) items.push({ label: 'Move later', onSelect: () => move(board.id, index + 1) });
    return (
      <DraggableTile key={board.id} id={board.id}>
        <Link
          href={boardHref(board.id)}
          className={styles.tile}
          onClickCapture={(e) => {
            if (dragged.current) e.preventDefault();
          }}
        >
          <span className={styles.name}>{board.name}</span>
          <span className={styles.meta}>
            {plural(columns.length, 'column')} · {plural(total, 'card')}
          </span>
          <span className={styles.bars} aria-hidden>
            {columns.map((c) => (
              <span key={c.id} className={styles.bar}>
                <span className={styles.fill} style={{ height: `${total ? (c.count / total) * 100 : 0}%` }} />
              </span>
            ))}
          </span>
        </Link>
        <div className={styles.actions}>
          <IconButton
            label={`Star ${board.name}`}
            aria-pressed={board.starred}
            data-star={board.id}
            className={board.starred ? styles.starred : undefined}
            onClick={() => {
              setAnnouncement(board.starred ? `Unstarred ${board.name}` : `Starred ${board.name}`);
              refocusStar.current = { id: board.id, starred: !board.starred };
              void starBoard(board.id, !board.starred);
            }}
          >
            <Star size={16} aria-hidden fill={board.starred ? 'currentColor' : 'none'} />
          </IconButton>
          {items.length > 0 && (
            <Menu
              items={items}
              trigger={
                <IconButton label={`Board actions for ${board.name}`}>
                  <EllipsisVertical size={16} aria-hidden />
                </IconButton>
              }
            />
          )}
        </div>
      </DraggableTile>
    );
  };

  return (
    <>
      {summaries.length === 0 && (
        <p className={styles.empty}>No boards yet. Create one to organise notes into columns.</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setPreview(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${nameOf(String(active.id))}`,
            onDragOver: () => undefined,
            onDragMove: () => undefined,
            onDragEnd: ({ active }) => `Dropped ${nameOf(String(active.id))}`,
            onDragCancel: ({ active }) => `Stopped moving ${nameOf(String(active.id))}`,
          },
        }}
      >
        {starred.length > 0 && (
          <>
            <h2 className={styles.heading} id='starred-boards'>
              Starred
            </h2>
            <ul className={styles.tiles} aria-labelledby='starred-boards'>
              {starred.map((s, i) => tile(s, i, starred))}
            </ul>
            <h2 className={styles.heading} id='all-boards'>
              All boards
            </h2>
          </>
        )}
        <ul
          className={styles.tiles}
          {...(starred.length > 0 ? { 'aria-labelledby': 'all-boards' } : { 'aria-label': 'Boards' })}
        >
          {rest.map((s, i) => tile(s, i, rest))}
          <li>
            <button type='button' className={`${styles.tile} ${styles.new}`} onClick={() => setCreating(true)}>
              <Plus size={18} aria-hidden />
              New board
            </button>
          </li>
        </ul>
      </DndContext>
      <p role='status' className={styles.srOnly}>
        {announcement}
      </p>
      <NewBoardDialog open={creating} onOpenChange={setCreating} onCreated={(board) => onOpen(board.id)} />
    </>
  );
};

export default BoardTiles;
