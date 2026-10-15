import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  MeasuringStrategy,
  closestCenter,
  getClientRect,
  useDraggable,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type Announcements,
  type DragStartEvent,
  type MeasuringConfiguration,
} from '@dnd-kit/core';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, GripVertical } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { assignColumns, columnCountFor, gapFor } from '../../lib/masonry';
import { moveNote } from '../../lib/notes';
import { moveId, moveToIndex, neighbors } from '../../lib/order';
import type { BoardImages } from '../../lib/attachments';
import type { Note } from '../../lib/types';
import IconButton from '../ui/IconButton';
import Menu, { type MenuItem } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import NoteCard, { type CardMode } from './NoteCard';
import styles from './NoteGrid.module.css';

type Size = { width: number; height: number };
type Measure = (el: HTMLElement | null) => (() => void) | undefined;

const GRID_KEY = '__grid';

export const withoutSize = (sizes: Record<string, Size>, key: string): Record<string, Size> => {
  if (!(key in sizes)) return sizes;
  const next = { ...sizes };
  delete next[key];
  return next;
};

// One ResizeObserver measures the grid and every card. Updates are flushed
// synchronously (observers run before paint) so cards never paint in a
// stale position.
const useSizes = (): [Record<string, Size>, Measure] => {
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const observer = useMemo(() => {
    if (typeof ResizeObserver === 'undefined') return null;
    return new ResizeObserver((entries) => {
      flushSync(() =>
        setSizes((prev) => {
          let next = prev;
          for (const entry of entries) {
            const key = (entry.target as HTMLElement).dataset.size;
            if (!key) continue;
            const box = entry.borderBoxSize?.[0];
            const size = {
              width: box?.inlineSize ?? entry.contentRect.width,
              height: box?.blockSize ?? entry.contentRect.height,
            };
            const old = prev[key];
            if (old && old.width === size.width && old.height === size.height) continue;
            if (next === prev) next = { ...prev };
            next[key] = size;
          }
          return next;
        }),
      );
    });
  }, []);
  const measure = useCallback<Measure>(
    (el) => {
      if (!el || !observer) return undefined;
      observer.observe(el);
      return () => {
        observer.unobserve(el);
        const key = el.dataset.size;
        if (key) setSizes((prev) => withoutSize(prev, key));
      };
    },
    [observer],
  );
  return [sizes, measure];
};

type CellProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  animate: boolean;
  reorderable: boolean;
  dragging: boolean;
  measure: Measure;
  children: ReactNode;
};

const Cell = ({ id, x, y, width, animate, reorderable, dragging, measure, children }: CellProps) => {
  const { setNodeRef: setDragRef, listeners } = useDraggable({ id, disabled: !reorderable });
  const { setNodeRef: setDropRef } = useDroppable({ id, disabled: !reorderable });
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el);
      setDropRef(el);
      const stop = measure(el);
      return () => {
        stop?.();
        setDragRef(null);
        setDropRef(null);
      };
    },
    [setDragRef, setDropRef, measure],
  );
  return (
    <motion.div
      ref={ref}
      data-size={id}
      className={styles.cell}
      style={{ width: width || '100%' }}
      initial={{ opacity: 0, x, y }}
      animate={{ opacity: dragging ? 0.35 : 1, x, y }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={animate ? { duration: 0.2 } : { duration: 0 }}
      {...(reorderable ? listeners : {})}
    >
      {children}
    </motion.div>
  );
};

// The card that follows the pointer is only a picture of the real one, so
// its buttons must not be reachable.
export const DragPreview = ({ width, children }: { width: number; children: ReactNode }) => (
  <div className={styles.overlay} style={{ width: width || undefined }} aria-hidden inert>
    {children}
  </div>
);

type Props = {
  notes: Note[];
  labelNames: Map<string, string>;
  mode: CardMode;
  onOpen: (id: string) => void;
  reorderable: boolean;
  images?: Map<string, BoardImages>;
  placeNames?: Map<string, string>; // columnId → "Board · Column"
};

// dnd-kit's defaults read out note ids; these use titles. Keyboard moves
// are announced by the grid's own status region instead.
export const dragAnnouncements = (title: (id: string) => string): Required<Announcements> => ({
  onDragStart: ({ active }) => `Picked up ${title(String(active.id))}`,
  onDragMove: () => undefined,
  onDragOver: ({ active, over }) =>
    over
      ? `${title(String(active.id))} is over ${title(String(over.id))}`
      : `${title(String(active.id))} is no longer over another note`,
  onDragEnd: ({ active }) => `Dropped ${title(String(active.id))}`,
  onDragCancel: ({ active }) => `Stopped moving ${title(String(active.id))}`,
});

type Box = { x: number; y: number; width: number; height: number };

// Cards are placed with transforms, which dnd-kit's default measuring
// ignores. Drop targets are read from the computed layout instead (relative
// to the grid), so they match where cards are going, not where they are
// mid-animation.
export const layoutMeasuring = (boxesKey: string): MeasuringConfiguration => {
  const boxes = new Map<string, Box>(JSON.parse(boxesKey));
  return {
    draggable: { measure: getClientRect },
    droppable: {
      strategy: MeasuringStrategy.WhileDragging,
      measure: (el) => {
        const box = boxes.get(el.dataset.size ?? '');
        const grid = el.parentElement;
        if (!box || !grid) return getClientRect(el);
        const { top, left } = grid.getBoundingClientRect();
        return {
          top: top + box.y,
          left: left + box.x,
          width: box.width,
          height: box.height,
          right: left + box.x + box.width,
          bottom: top + box.y + box.height,
        };
      },
    },
  };
};

// dnd-kit measures drop targets once when a drag starts. While dragging, the
// shown order changes, so they are measured again to match it.
export const RemeasureDroppables = ({ layoutKey }: { layoutKey: string }) => {
  const { active, measureDroppableContainers } = useDndContext();
  const dragging = active !== null;
  useEffect(() => {
    if (dragging) measureDroppableContainers([]);
  }, [layoutKey, dragging, measureDroppableContainers]);
  return null;
};

const useLayoutMeasuring = (boxesKey: string) => useMemo(() => layoutMeasuring(boxesKey), [boxesKey]);

const KEY_TARGETS: Record<string, (index: number, last: number) => number> = {
  ArrowUp: (i) => i - 1,
  ArrowLeft: (i) => i - 1,
  ArrowDown: (i) => i + 1,
  ArrowRight: (i) => i + 1,
  Home: () => 0,
  End: (_, last) => last,
};

const NoteGrid = ({ notes, labelNames, mode, onOpen, reorderable, images, placeNames }: Props) => {
  const toast = useToast();
  const hintId = useId();
  const [sizes, measure] = useSizes();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Order shown while dragging or saving. It is kept while moves are being
  // saved (`notes` can still hold an older order), then until `notes`
  // changes after the last save. A null base means "since now".
  const [preview, setPreview] = useState<{ base: Note[] | null; ids: string[] } | null>(null);
  const [saving, setSaving] = useState(0);
  if (preview && preview.base === null && saving === 0) setPreview({ ...preview, base: notes });
  const [announcement, setAnnouncement] = useState('');
  // Reordering moves the card's DOM node, which drops focus; the grip that
  // was used is focused again in the render that moves it, and only then.
  const refocusId = useRef<string | null>(null);
  useEffect(() => {
    refocusId.current = null;
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold, so a normal swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const ids = notes.map((n) => n.id);
  const sameNotes = !!preview && preview.ids.length === ids.length && preview.ids.every((id) => byId.has(id));
  const shownIds = preview && sameNotes && (saving > 0 || preview.base === notes) ? preview.ids : ids;
  const ordered = shownIds.map((id) => byId.get(id)).filter((n): n is Note => !!n);

  const width = sizes[GRID_KEY]?.width ?? 0;
  const count = columnCountFor(width);
  const gap = gapFor(width);
  const columnWidth = width > 0 ? (width - gap * (count - 1)) / count : 0;
  const placed = new Map<string, { x: number; y: number }>();
  let height = 0;
  assignColumns(
    ordered.map((n) => sizes[n.id]?.height ?? 0),
    count,
    gap,
  ).forEach((column, c) => {
    let y = 0;
    for (const index of column) {
      const note = ordered[index];
      placed.set(note.id, { x: c * (columnWidth + gap), y });
      y += (sizes[note.id]?.height ?? 0) + gap;
    }
    height = Math.max(height, y - gap);
  });
  // Animate only once every card was measured at the current column width;
  // until then heights are stale and cards would visibly slide on load.
  const settled =
    width > 0 && ordered.every((n) => Math.abs((sizes[n.id]?.width ?? -1) - columnWidth) < 1);
  const boxesKey = JSON.stringify(
    ordered.map((n) => {
      const at = placed.get(n.id) ?? { x: 0, y: 0 };
      return [n.id, { ...at, width: columnWidth, height: sizes[n.id]?.height ?? 0 }];
    }),
  );
  const measuring = useLayoutMeasuring(boxesKey);
  const reducedMotion = useReducedMotion();

  const title = (id: string) => byId.get(id)?.title || 'Untitled';

  const save = async (nextIds: string[], movedId: string) => {
    setAnnouncement(`Moved ${title(movedId)} to position ${nextIds.indexOf(movedId) + 1} of ${nextIds.length}`);
    const { beforeId, afterId } = neighbors(nextIds, movedId);
    setSaving((n) => n + 1);
    try {
      await moveNote(movedId, beforeId, afterId);
    } catch {
      setPreview(null);
      toast({ message: 'Couldn’t save the new order.' });
    } finally {
      setSaving((n) => n - 1);
      setPreview((p) => p && { ...p, base: null });
    }
  };

  // Start from the order on screen: an earlier move may not be saved yet.
  const moveTo = (id: string, next: number) => {
    const index = shownIds.indexOf(id);
    if (next < 0 || next >= shownIds.length || next === index) return false;
    const nextIds = moveToIndex(shownIds, id, next);
    setPreview({ base: notes, ids: nextIds });
    void save(nextIds, id);
    return true;
  };

  const onHandleKeyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = KEY_TARGETS[event.key];
    if (!target) return;
    // Also stops the menu opening on ArrowDown.
    event.preventDefault();
    if (moveTo(id, target(shownIds.indexOf(id), shownIds.length - 1))) refocusId.current = id;
  };

  // The grip's menu moves a note without dragging (WCAG 2.5.7). The menu
  // puts focus back on the grip itself when it closes.
  const moveItems = (id: string): MenuItem[] => {
    const index = shownIds.indexOf(id);
    const last = shownIds.length - 1;
    const items: MenuItem[] = [];
    if (index > 0) {
      items.push({ label: 'Move to start', icon: <ArrowUpToLine size={16} aria-hidden />, onSelect: () => moveTo(id, 0) });
      items.push({ label: 'Move earlier', icon: <ArrowUp size={16} aria-hidden />, onSelect: () => moveTo(id, index - 1) });
    }
    if (index < last) {
      items.push({ label: 'Move later', icon: <ArrowDown size={16} aria-hidden />, onSelect: () => moveTo(id, index + 1) });
      items.push({ label: 'Move to end', icon: <ArrowDownToLine size={16} aria-hidden />, onSelect: () => moveTo(id, last) });
    }
    return items;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setPreview({ base: notes, ids });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || over.id === active.id) return;
    setPreview((p) => (p ? { ...p, ids: moveId(p.ids, String(active.id), String(over.id)) } : p));
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    setActiveId(null);
    const id = String(active.id);
    if (!preview || preview.base !== notes) return;
    if (preview.ids.indexOf(id) === ids.indexOf(id)) {
      setPreview(null);
      return;
    }
    void save(preview.ids, id);
  };

  const card = (note: Note, withHandle: boolean) => (
    <NoteCard
      note={note}
      images={images?.get(note.id)?.shown}
      imageCount={images?.get(note.id)?.total}
      place={note.columnId ? placeNames?.get(note.columnId) : undefined}
      mode={mode}
      onOpen={onOpen}
      labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((name): name is string => !!name)}
      dragHandle={
        withHandle ? (
          <Menu
            align='start'
            items={moveItems(note.id)}
            trigger={
              <IconButton
                ref={(el) => {
                  if (el && refocusId.current === note.id && document.activeElement !== el) el.focus();
                }}
                label={`Move ${note.title || 'Untitled'}`}
                aria-describedby={hintId}
                className={styles.handle}
                onKeyDown={onHandleKeyDown(note.id)}
              >
                <GripVertical size={16} aria-hidden />
              </IconButton>
            }
          />
        ) : undefined
      }
    />
  );

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={measuring}
      accessibility={{ announcements: dragAnnouncements(title) }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setPreview(null);
      }}
    >
      <div ref={measure} data-size={GRID_KEY} className={styles.grid} style={{ height }}>
        <AnimatePresence initial={false}>
          {ordered.map((note) => {
            const at = placed.get(note.id) ?? { x: 0, y: 0 };
            return (
              <Cell
                key={note.id}
                id={note.id}
                x={at.x}
                y={at.y}
                width={columnWidth}
                animate={settled}
                reorderable={reorderable}
                dragging={note.id === activeId}
                measure={measure}
              >
                {card(note, reorderable && ordered.length > 1)}
              </Cell>
            );
          })}
        </AnimatePresence>
      </div>
      {/* No side effects: the default ones restore the card's inline opacity
          after the drop, undoing the fade-back animation. */}
      <RemeasureDroppables layoutKey={boxesKey} />
      <DragOverlay dropAnimation={reducedMotion ? null : { duration: 200, sideEffects: null }}>
        {active ? (
          <DragPreview width={columnWidth}>{card(active, false)}</DragPreview>
        ) : null}
      </DragOverlay>
      {reorderable && (
        <p id={hintId} className={styles.srOnly}>
          Opens a menu to move this note. The arrow keys also move it earlier or later.
        </p>
      )}
      <p role='status' className={styles.srOnly}>
        {announcement}
      </p>
    </DndContext>
  );
};

export default NoteGrid;
