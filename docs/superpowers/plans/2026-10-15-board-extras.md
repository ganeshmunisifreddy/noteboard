# Board Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quick add, a board filter, a full card menu, column bulk actions, moving cards between boards, column dragging, and starred/reorderable boards to Noteboard's kanban boards.

**Architecture:** Builds on round 5's modules. Data changes are one field (`Board.starred`, schema v6, backup v5). New pure logic lives in `lib/boardFilter.ts` and `lib/cards.ts`; ordering helpers in `lib/boards.ts`. UI: `BoardColumns.tsx` keeps drag state and handlers, and a new `BoardColumn.tsx` renders one column; new `QuickAdd`, `CardMenu` (replaces `CardMoveMenu`) and `FilterBar` components; `BoardTiles` gains groups, stars and dragging.

**Tech Stack:** Next.js 16 Pages Router, React 19 (React Compiler lint), TypeScript, Dexie 4 + dexie-react-hooks, dnd-kit core, Radix (`radix-ui`), CSS Modules, lucide-react, Vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-15-board-extras-design.md`

## Global Constraints

- No backend; everything in IndexedDB via Dexie; every record still syncs on its own (no cross-record derived data).
- WCAG 2.2 AA: everything works by keyboard and screen reader; every drag has a non-drag way (menus).
- Cards stay compact: new actions go in menus, never on the card face.
- Toast texts reuse the app's: "Note archived", "Moved to trash"; every destructive or moving action has Undo.
- Undo restores only place and done-state fields (`archived`, `boardId`, `columnId`, `boardPosition`, `due`, `items`, `trashedAt`), never other edits.
- Copy: "Filter", "Clear", "Overdue", "Next 7 days", "No date", "No cards match the filter", "Archive all cards", "Archive N shown cards", "Move all cards to", "Move shown cards to", "Other boards", "Starred", "All boards", "Star board", "Unstar board", "Move earlier", "Move later", "Open in editor", "Card actions for <title>".
- Drag activation as today: mouse after 5 px, touch after a 250 ms press (tolerance 5).
- Commits end with the two attribution lines (Co-Authored-By / Claude-Session) used on this repo.
- Don't run Prettier over files; match surrounding style (2 spaces, single quotes, JSX single quotes).
- Test command: `npx vitest run <files>`; full suite `npx vitest run`; types `npx tsc --noEmit`; lint `npm run lint`.

## Review Focus

1. Dragging or menu-moving a card while a filter hides others: hidden cards keep their order and positions (pinned by `moveShown` tests in Task 2 and the filtered-move test in Task 7).
2. Moving all cards into a Done column when some repeat: open dates marked done, repeats go to the first column, one Undo restores all (Task 3 `moveCards` test).
3. Undo after a card was edited in between: the edit survives (Task 3 `putBackCards` test).
4. Right-click on touch never opens the menu; a long press stays a drag (Task 5 test).
5. A board or column deleted while its submenu is open: choosing it is a no-op (Task 3 deleted-target test; Task 6 relies on it).

---

### Task 1: Starred boards, schema v6, backup v5, ordering helpers

**Files:**
- Modify: `lib/types.ts` (Board), `lib/db.ts` (v6), `lib/boards.ts` (createBoard, new `starBoard`, `moveBoardTo`, `moveColumnTo`), `lib/backup.ts` (`BACKUP_VERSION`, `toBoard`)
- Test: `lib/db.test.ts`, `lib/boards.test.ts`, `lib/backup.test.ts` (plus `starred: false` in any test `Board` literal that `tsc` flags)

**Interfaces:**
- Produces: `Board.starred: boolean`; `starBoard(id: string, starred: boolean): Promise<void>`; `moveBoardTo(id: string, index: number): Promise<void>` (index within the board's group: starred or not); `moveColumnTo(id: string, index: number): Promise<void>`; `BACKUP_VERSION = 5`.

- [ ] **Step 1: Write the failing tests**

`lib/db.test.ts`, inside the existing `describe`, after the v5 test:

```ts
  it('leaves existing boards unstarred in v6', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v5 = new Dexie('noteboard');
    v5.version(5).stores({
      notes: 'id, updatedAt, trashedAt, position, boardId, *labelIds',
      labels: 'id, &name',
      attachments: 'id, noteId',
      imageFiles: 'id',
      boards: 'id, position',
      columns: 'id, boardId',
    });
    await v5.table('boards').add({ id: 'b', name: 'Old', position: 0, createdAt: 1, updatedAt: 1 });
    v5.close();

    await db.open();
    expect(await db.boards.get('b')).toMatchObject({ name: 'Old', starred: false });
  });
```

`lib/boards.test.ts`: add `moveBoardTo, moveColumnTo, starBoard` to the import from `./boards`, then:

```ts
describe('ordering and stars', () => {
  const order = async () => (await db.boards.orderBy('position').toArray()).map((b) => b.name);

  it('starts boards unstarred and stars them as an edit', async () => {
    const board = await createBoard('A', 'empty');
    expect(board.starred).toBe(false);
    vi.spyOn(Date, 'now').mockReturnValue(board.updatedAt + 10);
    await starBoard(board.id, true);
    expect(await db.boards.get(board.id)).toMatchObject({ starred: true, updatedAt: board.updatedAt + 10 });
  });

  it('moves a board within its group, leaving the other group in place', async () => {
    const a = await createBoard('A', 'empty');
    await createBoard('B', 'empty');
    const c = await createBoard('C', 'empty');
    const d = await createBoard('D', 'empty');
    await starBoard(a.id, true);
    await starBoard(c.id, true);
    // Unstarred group is B, D: move D first.
    await moveBoardTo(d.id, 0);
    expect(await order()).toEqual(['A', 'D', 'C', 'B']);
    // Starred group is A, C: move A after C.
    await moveBoardTo(a.id, 1);
    expect(await order()).toEqual(['C', 'D', 'A', 'B']);
  });

  it('clamps the index and ignores missing boards', async () => {
    await createBoard('A', 'empty');
    const b = await createBoard('B', 'empty');
    await moveBoardTo(b.id, -5);
    expect(await order()).toEqual(['B', 'A']);
    await moveBoardTo('missing', 0);
    expect(await order()).toEqual(['B', 'A']);
  });

  it('moves a column to any index', async () => {
    const board = await createBoard('P', 'pipeline');
    const [ideas] = await sortedColumns(board.id);
    await moveColumnTo(ideas.id, 3);
    expect(await names(board.id)).toEqual(['Next', 'In progress', 'Review', 'Ideas', 'Done*']);
    await moveColumnTo(ideas.id, 99);
    expect(await names(board.id)).toEqual(['Next', 'In progress', 'Review', 'Done*', 'Ideas']);
  });
});
```

`lib/backup.test.ts`: in `describe('boards in backups')` change the `board` literal to include `starred: false`, change `version: 4` in the `buildBackup` expectation at the top of the file to `version: 5`, then add:

```ts
  it('keeps stars, and reads boards from older backups as unstarred', () => {
    const starred = { ...board, starred: true };
    const v5 = file({ format: 'noteboard-backup', version: 5, exportedAt: 'x', notes: [], labels: [], attachments: [], boards: [starred], columns });
    expect(parseBackup(v5).boards).toEqual([starred]);
    const old = { id: 'b1', name: 'Website', position: 0, createdAt: 1, updatedAt: 1 };
    expect(parseBackup(v4([], [old])).boards).toEqual([{ ...old, starred: false }]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/db.test.ts lib/boards.test.ts lib/backup.test.ts`
Expected: FAIL — `starBoard`/`moveBoardTo`/`moveColumnTo` not exported, `starred` undefined, version 4 ≠ 5.

- [ ] **Step 3: Implement**

`lib/types.ts`:

```ts
export type Board = { id: string; name: string; position: number; starred: boolean; createdAt: number; updatedAt: number };
```

`lib/db.ts`, after version 5:

```ts
// v6: boards can be starred; existing ones aren't.
db.version(6)
  .stores({
    notes: 'id, updatedAt, trashedAt, position, boardId, *labelIds',
    labels: 'id, &name',
    attachments: 'id, noteId',
    imageFiles: 'id',
    boards: 'id, position',
    columns: 'id, boardId',
  })
  .upgrade((tx) =>
    tx
      .table('boards')
      .toCollection()
      .modify((board: { starred?: unknown }) => {
        if (board.starred === undefined) board.starred = false;
      }),
  );
```

`lib/boards.ts`: in `createBoard` the board literal gains `starred: false`. Import `moveToIndex` from `./order`. Add after `renameBoard`:

```ts
export const starBoard = async (id: string, starred: boolean) => {
  await db.boards.update(id, { starred, updatedAt: Date.now() });
};

// Positions 0, 1, 2, … in the given order, writing only the records that change.
const renumber = <T extends { id: string; position: number; updatedAt: number }>(records: T[], ids: string[]) => {
  const byId = new Map(records.map((r) => [r.id, r]));
  const now = Date.now();
  return ids.flatMap((id, position) => {
    const record = byId.get(id);
    return !record || record.position === position ? [] : [{ ...record, position, updatedAt: now }];
  });
};

// Moves a board to `index` among the boards in its group (starred or not).
export const moveBoardTo = async (id: string, index: number) => {
  await db.transaction('rw', db.boards, async () => {
    const boards = (await db.boards.toArray()).sort(byPosition);
    const board = boards.find((b) => b.id === id);
    if (!board) return;
    const group = boards.filter((b) => b.starred === board.starred).map((b) => b.id);
    const moved = moveToIndex(group, id, Math.max(0, Math.min(index, group.length - 1)));
    let next = 0;
    const order = boards.map((b) => (b.starred === board.starred ? moved[next++] : b.id));
    await db.boards.bulkPut(renumber(boards, order));
  });
};
```

Replace the body of `moveColumn` and add `moveColumnTo` (Move left/right become index moves):

```ts
export const moveColumnTo = async (id: string, index: number) => {
  await db.transaction('rw', db.columns, async () => {
    const column = await db.columns.get(id);
    if (!column) return;
    const columns = await sortedColumns(column.boardId);
    const ids = moveToIndex(columns.map((c) => c.id), id, Math.max(0, Math.min(index, columns.length - 1)));
    await db.columns.bulkPut(renumber(columns, ids));
  });
};

// Swaps a column with its neighbour.
export const moveColumn = async (id: string, direction: -1 | 1) => {
  await db.transaction('rw', db.columns, async () => {
    const column = await db.columns.get(id);
    if (!column) return;
    const index = (await sortedColumns(column.boardId)).findIndex((c) => c.id === id);
    if (index + direction >= 0) await moveColumnTo(id, index + direction);
  });
};
```

`lib/backup.ts`: `export const BACKUP_VERSION = 5;` and in `toBoard` add `starred: entry.starred === true,` after `position`.

Fix every `Board` literal `tsc` reports (tests only) by adding `starred: false`.

- [ ] **Step 4: Run tests, types and the full suite**

Run: `npx vitest run lib/db.test.ts lib/boards.test.ts lib/backup.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS; tsc clean; full suite green.

- [ ] **Step 5: Commit**

```bash
git add lib components
git commit -m "Star boards and move boards and columns to any place (schema v6, backup v5)"
```

---

### Task 2: Filter logic and moving among shown cards

**Files:**
- Create: `lib/boardFilter.ts`, `lib/boardFilter.test.ts`
- Modify: `lib/cards.ts` (add `moveShown`), `lib/cards.test.ts`

**Interfaces:**
- Produces:
  - `type DateFilter = 'overdue' | 'week' | 'none'`
  - `type CardFilter = { query: string; labelId: string | null; date: DateFilter | null }`
  - `EMPTY_FILTER: CardFilter`, `DATE_FILTERS: { id: DateFilter; label: string }[]`
  - `isFiltering(filter: CardFilter): boolean`
  - `matchesCard(note: Note, filter: CardFilter, labelNames: Map<string, string>, now: number): boolean`
  - `moveShown(ids: string[], shown: string[], id: string, move: CardMove): string[] | null` — the column's full new order, or null when the move doesn't apply.

- [ ] **Step 1: Write the failing tests**

`lib/boardFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, isFiltering, matchesCard, type CardFilter } from './boardFilter';
import { localMoment } from './calendar';
import { newDue } from './due';
import { makeNote } from './testUtils';

const NOW = localMoment('2026-10-15', '12:00');
const labels = new Map([['l1', 'Design']]);
const match = (note: ReturnType<typeof makeNote>, filter: Partial<CardFilter>) =>
  matchesCard(note, { ...EMPTY_FILTER, ...filter }, labels, NOW);

describe('isFiltering', () => {
  it('is off for the empty filter and blank text', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, query: '  ' })).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, date: 'none' })).toBe(true);
  });
});

describe('matchesCard', () => {
  it('matches text in the title, body, items and label names', () => {
    expect(match(makeNote({ title: 'Pick fonts' }), { query: 'FONT' })).toBe(true);
    expect(match(makeNote({ labelIds: ['l1'] }), { query: 'design' })).toBe(true);
    expect(match(makeNote({ title: 'Logo' }), { query: 'fonts' })).toBe(false);
  });

  it('matches one label', () => {
    expect(match(makeNote({ labelIds: ['l1'] }), { labelId: 'l1' })).toBe(true);
    expect(match(makeNote(), { labelId: 'l1' })).toBe(false);
  });

  it('sorts dates into overdue, next 7 days and no date', () => {
    const overdue = makeNote({ due: newDue('2026-10-14', null, null) });
    const today = makeNote({ due: newDue('2026-10-15', '18:00', null) });
    const lateToday = makeNote({ due: newDue('2026-10-15', '09:00', null) }); // passed at noon
    const week = makeNote({ due: newDue('2026-10-22', null, null) });
    const later = makeNote({ due: newDue('2026-10-23', null, null) });
    const none = makeNote();
    const done = makeNote({ due: { ...newDue('2026-10-14', null, null), doneAt: 1 } });
    const pick = (date: CardFilter['date']) =>
      [overdue, today, lateToday, week, later, none, done].filter((n) => match(n, { date })).map((n) => n.id);
    expect(pick('overdue')).toEqual([overdue.id, lateToday.id]);
    expect(pick('week')).toEqual([today.id, week.id]);
    expect(pick('none')).toEqual([none.id]);
  });

  it('needs every part to match', () => {
    const note = makeNote({ title: 'Fonts', labelIds: ['l1'] });
    expect(match(note, { query: 'fonts', labelId: 'l1', date: 'none' })).toBe(true);
    expect(match(note, { query: 'fonts', labelId: 'l1', date: 'overdue' })).toBe(false);
  });
});
```

`lib/cards.test.ts`: add `moveShown` to the import from `./cards`, then:

```ts
describe('moveShown', () => {
  it('moves like moveIndex when nothing is hidden', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveShown(ids, ids, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(moveShown(ids, ids, 'c', 'top')).toEqual(['c', 'a', 'b']);
    expect(moveShown(ids, ids, 'a', 'up')).toBeNull();
  });

  it('passes the next shown card and keeps hidden cards in order', () => {
    const ids = ['a', 'h1', 'b', 'h2', 'c'];
    const shown = ['a', 'b', 'c'];
    expect(moveShown(ids, shown, 'a', 'down')).toEqual(['h1', 'b', 'a', 'h2', 'c']);
    expect(moveShown(ids, shown, 'c', 'up')).toEqual(['a', 'h1', 'c', 'b', 'h2']);
    expect(moveShown(ids, shown, 'b', 'bottom')).toEqual(['a', 'h1', 'h2', 'c', 'b']);
    expect(moveShown(ids, shown, 'b', 'top')).toEqual(['b', 'a', 'h1', 'h2', 'c']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/boardFilter.test.ts lib/cards.test.ts`
Expected: FAIL — module `./boardFilter` not found; `moveShown` is not a function.

- [ ] **Step 3: Implement**

`lib/boardFilter.ts`:

```ts
import { addDays, localDate } from './calendar';
import { isDone, isOverdue } from './due';
import { matchesQuery } from './filters';
import type { Note } from './types';

export type DateFilter = 'overdue' | 'week' | 'none';

// The board page's filter: every part that is set must match.
export type CardFilter = { query: string; labelId: string | null; date: DateFilter | null };

export const EMPTY_FILTER: CardFilter = { query: '', labelId: null, date: null };

export const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'none', label: 'No date' },
];

export const isFiltering = (filter: CardFilter) =>
  filter.query.trim() !== '' || filter.labelId !== null || filter.date !== null;

const matchesDate = (note: Note, date: DateFilter, now: number) => {
  const { due } = note;
  if (date === 'none') return due === null;
  if (!due || isDone(due)) return false;
  if (date === 'overdue') return isOverdue(due, now);
  const today = localDate(now);
  return !isOverdue(due, now) && due.date >= today && due.date <= addDays(today, 7);
};

export const matchesCard = (note: Note, filter: CardFilter, labelNames: Map<string, string>, now: number) =>
  matchesQuery(note, filter.query, labelNames) &&
  (filter.labelId === null || note.labelIds.includes(filter.labelId)) &&
  (filter.date === null || matchesDate(note, filter.date, now));
```

`lib/cards.ts`, after `moveIndex`:

```ts
// A menu move among the cards on screen (a filter may hide some): the card
// passes the shown card next to it; hidden cards keep their order.
export const moveShown = (ids: string[], shown: string[], id: string, move: CardMove): string[] | null => {
  const index = moveIndex(shown, id, move);
  if (index === null) return null;
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(shown[index]) + (index > shown.indexOf(id) ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run lib/boardFilter.test.ts lib/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/boardFilter.ts lib/boardFilter.test.ts lib/cards.ts lib/cards.test.ts
git commit -m "Add the board filter and moving among shown cards"
```

---

### Task 3: Card actions in bulk: quick add, archive, move, Undo

**Files:**
- Modify: `lib/cards.ts`, `lib/cards.test.ts`

**Interfaces:**
- Consumes: `newCardPlace`, `placeAtEnd` (existing), `createNote`, `refreshHasNotesMarker` from `./notes`.
- Produces:
  - `quickAddCard(columnId: string, boardId: string, title: string): Promise<Note | undefined>`
  - `type CardState = Pick<Note, 'id' | 'archived' | 'boardId' | 'columnId' | 'boardPosition' | 'due' | 'items' | 'trashedAt'>`
  - `archiveCards(ids: string[]): Promise<CardState[]>` (only cards not already archived)
  - `moveCards(ids: string[], columnId: string, now?: number): Promise<CardState[]>` (to the end of the column, in the given order, Done rules applied)
  - `putBackCards(states: CardState[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`lib/cards.test.ts`: add `archiveCards, moveCards, putBackCards, quickAddCard` to the import, then:

```ts
describe('quick add', () => {
  it('adds a titled card at the end of the column', async () => {
    const { board, columns } = await setup();
    await createNote({ id: 'old', kind: 'note', boardId: board.id, columnId: columns[0].id, boardPosition: 4 });
    const note = await quickAddCard(columns[0].id, board.id, '  Pick fonts ');
    expect(await db.notes.get(note!.id)).toMatchObject({
      kind: 'note',
      title: 'Pick fonts',
      boardId: board.id,
      columnId: columns[0].id,
      boardPosition: 5,
    });
  });

  it('adds nothing for a blank title, and uses the first column when its column is gone', async () => {
    const { board, columns } = await setup();
    expect(await quickAddCard(columns[0].id, board.id, '   ')).toBeUndefined();
    expect(await db.notes.count()).toBe(0);
    await db.columns.delete(columns[1].id);
    const note = await quickAddCard(columns[1].id, board.id, 'Lost');
    expect(note?.columnId).toBe(columns[0].id);
  });
});

describe('bulk card actions', () => {
  const put = (id: string, columnId: string, boardId: string, boardPosition: number, extra = {}) =>
    createNote({ id, kind: 'note', title: id, boardId, columnId, boardPosition, ...extra });

  it('archives cards and Undo puts them back, keeping later edits', async () => {
    const { board, columns } = await setup();
    await put('a', columns[0].id, board.id, 0);
    await put('b', columns[0].id, board.id, 1, { archived: true });
    const states = await archiveCards(['a', 'b']);
    expect(states.map((s) => s.id)).toEqual(['a']);
    expect((await db.notes.get('a'))?.archived).toBe(true);
    await db.notes.update('a', { title: 'Edited' });
    await putBackCards(states);
    expect(await db.notes.get('a')).toMatchObject({ archived: false, title: 'Edited', columnId: columns[0].id });
  });

  it('moves cards to the end of a column in order, applying the Done rules, and Undo restores them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOON);
    const { board, columns } = await setup();
    const today = localDate(NOON);
    await put('x', columns[2].id, board.id, 0);
    await put('a', columns[0].id, board.id, 0, { due: newDue(today, null, null) });
    await put('r', columns[0].id, board.id, 1, { due: newDue(today, null, presetRepeat('weekly', today)) });
    const states = await moveCards(['a', 'r'], columns[2].id, NOON);
    const a = await db.notes.get('a');
    expect(a).toMatchObject({ columnId: columns[2].id });
    expect(a!.boardPosition).toBeGreaterThan(0);
    expect(a!.due?.doneAt).not.toBeNull();
    // The repeat moved on to its next date and went back to the first column.
    const r = await db.notes.get('r');
    expect(r?.columnId).toBe(columns[0].id);
    expect(r?.due?.date).not.toBe(today);
    await putBackCards(states);
    expect(await db.notes.get('a')).toMatchObject({ columnId: columns[0].id, boardPosition: 0, due: { doneAt: null } });
    expect((await db.notes.get('r'))?.due?.date).toBe(today);
  });

  it('moves cards to another board', async () => {
    const { board, columns } = await setup();
    const other = await createBoard('Other', 'basic');
    const [otherTodo] = await sortedColumns(other.id);
    await put('a', columns[0].id, board.id, 0);
    await moveCards(['a'], otherTodo.id);
    expect(await db.notes.get('a')).toMatchObject({ boardId: other.id, columnId: otherTodo.id });
  });

  it('does nothing when the target column is gone', async () => {
    const { board, columns } = await setup();
    await put('a', columns[0].id, board.id, 0);
    await db.columns.delete(columns[1].id);
    expect(await moveCards(['a'], columns[1].id)).toEqual([]);
    expect((await db.notes.get('a'))?.columnId).toBe(columns[0].id);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/cards.test.ts`
Expected: FAIL — `quickAddCard`, `archiveCards`, `moveCards`, `putBackCards` are not functions.

- [ ] **Step 3: Implement**

`lib/cards.ts`: change the notes import to `import { createNote, nextTopPosition, refreshHasNotesMarker } from './notes';` and add at the end:

```ts
// Quick add: a text card with just a title at the end of its column (or the
// board's first column if it was deleted). Undefined for a blank title or a missing board.
export const quickAddCard = async (columnId: string, boardId: string, title: string): Promise<Note | undefined> => {
  const clean = title.trim();
  if (!clean) return undefined;
  const place = await newCardPlace(columnId, 'bottom', boardId);
  if (!place) return undefined;
  return createNote({ kind: 'note', title: clean, ...place });
};

// What bulk actions change, so Undo can put it back without losing other edits.
export type CardState = Pick<Note, 'id' | 'archived' | 'boardId' | 'columnId' | 'boardPosition' | 'due' | 'items' | 'trashedAt'>;

const stateOf = ({ id, archived, boardId, columnId, boardPosition, due, items, trashedAt }: Note): CardState => ({
  id,
  archived,
  boardId,
  columnId,
  boardPosition,
  due,
  items,
  trashedAt,
});

export const archiveCards = async (ids: string[]): Promise<CardState[]> => {
  const states = await db.transaction('rw', db.notes, async () => {
    const notes = (await db.notes.bulkGet(ids)).filter((n): n is Note => !!n && !n.archived);
    const now = Date.now();
    await Promise.all(notes.map((n) => db.notes.update(n.id, { archived: true, pinned: false, updatedAt: now })));
    return notes.map(stateOf);
  });
  await refreshHasNotesMarker();
  return states;
};

// To the end of a column, in the given order; entering or leaving a Done column
// follows placeNote's rules. Nothing moves if the column is gone.
export const moveCards = async (ids: string[], columnId: string, now = Date.now()): Promise<CardState[]> =>
  db.transaction('rw', db.notes, db.columns, async () => {
    const states: CardState[] = [];
    for (const id of ids) {
      const result = await placeAtEnd(id, columnId, now);
      if (result) states.push(stateOf(result.before));
    }
    return states;
  });

// Undo for archiveCards and moveCards.
export const putBackCards = async (states: CardState[]) => {
  const now = Date.now();
  await db.transaction('rw', db.notes, async () => {
    await Promise.all(states.map(({ id, ...fields }) => db.notes.update(id, { ...fields, updatedAt: now })));
  });
  await refreshHasNotesMarker();
};
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `npx vitest run lib/cards.test.ts && npx vitest run`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add lib/cards.ts lib/cards.test.ts
git commit -m "Add quick add, archive and move for many cards, with Undo"
```

---

### Task 4: One column per component, and quick add

**Files:**
- Create: `components/kanban/BoardColumn.tsx`, `components/kanban/QuickAdd.tsx`
- Modify: `components/kanban/BoardColumns.tsx`, `components/kanban/Board.module.css`, `components/kanban/BoardPage.test.tsx`

**Interfaces:**
- Consumes: `quickAddCard` (Task 3).
- Produces: `BoardColumn` (props below); `QuickAdd` props `{ columnName: string; onAdd: (title: string) => void; onOpenEditor: (title: string) => void; onClose: (refocus: boolean) => void }`. `BoardColumns` gains prop `onCardAdded?: (id: string) => void`. Each column's Add card button carries `data-add-card={column.id}`.

- [ ] **Step 1: Write the failing tests**

`components/kanban/BoardPage.test.tsx`: replace the three lines of `opens a card and adds cards in a column` that click "Add card to To do" and check its push with:

```ts
    await user.click(screen.getByRole('button', { name: 'Add card to To do' }));
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    expect(router.push.mock.lastCall?.[0]).toMatchObject({ query: { new: 'note', column: columns[0].id, at: 'bottom' } });
```

and add a new test in `describe('board page')`:

```ts
  it('adds cards quickly, one after another', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add card to To do' }));
    const box = screen.getByRole('textbox', { name: 'Card title for To do' });
    expect(box).toHaveFocus();
    await user.type(box, 'Pick fonts{Enter}');
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    await user.type(box, '   {Enter}New logo{Enter}');
    await waitFor(async () =>
      expect(
        (await db.notes.toArray())
          .filter((n) => n.columnId === columns[0].id)
          .sort((a, b) => a.boardPosition - b.boardPosition)
          .map((n) => n.title),
      ).toEqual(['Pick fonts', 'New logo']),
    );
    expect(await screen.findByText('New logo')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Card title for To do' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add card to To do' })).toHaveFocus());
  });

  it('opens a typed quick-add card in the editor', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Add card to Doing' }));
    await user.type(screen.getByRole('textbox', { name: 'Card title for Doing' }), 'Copy');
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(router.push.mock.lastCall?.[0]).toMatchObject({ pathname: '/note' }));
    const note = (await db.notes.toArray()).find((n) => n.title === 'Copy');
    expect(router.push.mock.lastCall?.[0]).toMatchObject({ query: { id: note?.id } });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/kanban/BoardPage.test.tsx`
Expected: FAIL — no "Open in editor" button; no "Card title for To do" textbox.

- [ ] **Step 3: Implement**

`components/kanban/QuickAdd.tsx`:

```tsx
import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from '../ui/IconButton';
import styles from './Board.module.css';

type Props = {
  columnName: string;
  onAdd: (title: string) => void;
  onOpenEditor: (title: string) => void;
  onClose: (refocus: boolean) => void; // refocus: back to the column's Add card button
};

// Type a title, press Enter, keep typing. Escape or ✕ closes; clicking away closes too.
const QuickAdd = ({ columnName, onAdd, onOpenEditor, onClose }: Props) => {
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const add = () => {
    if (title.trim()) onAdd(title);
    setTitle('');
    input.current?.focus();
  };

  return (
    <div
      className={styles.quickAdd}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(false);
      }}
    >
      <input
        ref={input}
        type='text'
        className={styles.quickInput}
        aria-label={`Card title for ${columnName}`}
        placeholder='Card title'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose(true);
          }
        }}
      />
      <div className={styles.quickActions}>
        <button type='button' className={styles.primary} onClick={add}>
          Add
        </button>
        <IconButton label='Open in editor' onClick={() => onOpenEditor(title)}>
          <Maximize2 size={16} aria-hidden />
        </IconButton>
        <IconButton label='Close' onClick={() => onClose(true)}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
};

export default QuickAdd;
```

`components/kanban/BoardColumn.tsx` — move the `<section>` markup for one column out of `BoardColumns.tsx`, with `DraggableCard` and `ColumnDrop` moved along:

```tsx
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
import QuickAdd from './QuickAdd';

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
}: Props) => {
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const headingId = `column-${column.id}`;
  const stopAdding = (refocus: boolean) => {
    setAdding(false);
    if (refocus) requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <section className={styles.column} aria-labelledby={headingId}>
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
                  moveMenu={cardMenu(note)}
                />
              </DraggableCard>
            );
          })}
        </ol>
        {ids.length === 0 && <p className={styles.noCards}>No cards</p>}
      </ColumnDrop>
      {adding ? (
        <QuickAdd
          columnName={column.name}
          onAdd={(title) => onQuickAdd(column.id, title)}
          onOpenEditor={(title) => onQuickOpen(column.id, title)}
          onClose={stopAdding}
        />
      ) : (
        <div className={styles.addRow}>
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
          <IconButton label={`Add a list to ${column.name}`} onClick={() => onAddCard(column.id, 'list')}>
            <ListChecks size={16} aria-hidden />
          </IconButton>
        </div>
      )}
    </section>
  );
};

export default BoardColumn;
```

`components/kanban/ColumnHeader.tsx`: add props `total: number` and `bulkItems: MenuItem[]`; insert `...bulkItems` into `items` just before the Delete column item; the count shows `count === total ? count : \`${count} of ${total}\`` and the screen-reader text becomes:

```tsx
      <span className={styles.srOnly}>
        {count === total ? (count === 1 ? '1 card' : `${count} cards`) : `${count} of ${total} cards shown`}
      </span>
```

`components/kanban/BoardColumns.tsx`: remove `DraggableCard`, `ColumnDrop` and the per-column JSX; import `BoardColumn`, `quickAddCard`; render:

```tsx
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
              bulkItems={[]}
              onOpen={onOpen}
              onAddCard={onAddCard}
              onQuickAdd={(columnId, title) => void quickAdd(columnId, title)}
              onQuickOpen={(columnId, title) => void quickOpen(columnId, title)}
              onRename={(name) => void renameColumn(column.id, name)}
              onMove={(direction) => void moveColumn(column.id, direction)}
              onSetDone={(done) => void setDoneColumn(column.id, done)}
              onDelete={() => void removeColumn(column.id, column.name, ids.length)}
              cardMenu={(note) => (
                <CardMoveMenu
                  title={note.title || 'Untitled'}
                  buttonId={note.id}
                  columns={columns.filter((c) => c.id !== column.id).map((c) => ({ id: c.id, name: c.name }))}
                  canMove={(move) => moveIndex(ids, note.id, move) !== null}
                  onMove={(move) => moveWithin(note.id, column.id, move)}
                  onMoveTo={(columnId) => moveToColumn(note.id, columnId)}
                />
              )}
            />
          );
        })}
```

with these handlers in `BoardColumns`:

```tsx
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
```

`components/kanban/Board.module.css`, add:

```css
.quickAdd {
  display: grid;
  gap: 6px;
  padding: 4px;
}

.quickInput {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.quickInput:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.quickActions {
  display: flex;
  align-items: center;
  gap: 4px;
}
```

- [ ] **Step 4: Run the kanban tests, types, lint, then the suite**

Run: `npx vitest run components/kanban && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS; clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add components/kanban
git commit -m "Add cards quickly from the bottom of a column; one component per column"
```

---

### Task 5: The card menu

**Files:**
- Create: `components/kanban/CardMenu.tsx`, `components/kanban/CardMenu.test.tsx`
- Delete: `components/kanban/CardMoveMenu.tsx`
- Modify: `components/editor/DatePopover.tsx` (optional `anchor`), `components/kanban/BoardColumns.tsx`, `components/kanban/BoardColumn.tsx` (right-click), `components/kanban/BoardView.tsx` (boards list), `components/kanban/Board.module.css`, `components/kanban/CardMoves.test.tsx` and `BoardPage.test.tsx` (button name `Move X` → `Card actions for X`; move items now under the "Move" submenu)

**Interfaces:**
- Consumes: `updateNote`, `setDue`, `removeDue`, `putBackDue`, `trashNote`, `undoTrash`, `useLabels` (`lib/notes`); `placeAtEnd`, `putBackPlace`, `archiveCards`, `putBackCards`, `moveShown`, `moveIndex` (`lib/cards`); `useBoardColumns` (`lib/boards`).
- Produces: `CardMenu` with props:

```ts
type Props = {
  note: Note;
  labels: Label[];
  columns: { id: string; name: string }[]; // the other columns on this board
  boards: { board: Board; columns: Column[] }[]; // the other boards
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canMove: (move: CardMove) => boolean;
  onMove: (move: CardMove) => void;
  onMoveTo: (columnId: string) => void;
  onMoveToBoard: (columnId: string) => void;
  onColor: (color: NoteColor) => void;
  onToggleLabel: (labelId: string) => void;
  onSaveDate: (date: string, time: string | null, repeat: Repeat | null) => void;
  onRemoveDate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCloseFocus: () => void; // where focus goes after the menu or date picker closes
};
```

- `DatePopover` gains `anchor?: ReactElement`: when given, it is the popover's anchor and no date button is rendered.
- `BoardColumns` gains prop `boards: { board: Board; columns: Column[] }[]` (every board, from `useBoardColumns()` in `BoardView`).

- [ ] **Step 1: Write the failing tests**

In `CardMoves.test.tsx` and `BoardPage.test.tsx` change the button lookup `Move ${title}` to `Card actions for ${title}`, and before clicking a move item open its submenu by keyboard (jsdom pointer moves close Radix submenus):

```ts
const openMove = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(screen.getByRole('button', { name: `Card actions for ${title}` }));
  (await screen.findByRole('menuitem', { name: 'Move' })).focus();
  await user.keyboard('{ArrowRight}');
};
```

`components/kanban/CardMenu.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../lib/boards';
import { db } from '../../lib/db';
import { createLabel, createNote } from '../../lib/notes';
import { sortedColumns } from '../../lib/places';
import BoardPage from '../../pages/board';
import { ToastProvider } from '../ui/Toast';

const router = vi.hoisted(() => ({
  pathname: '/board',
  asPath: '/board',
  query: {} as Record<string, string>,
  isReady: true,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.clearAllMocks();
});

const open = (id: string) => {
  router.query = { id };
  return render(
    <ToastProvider>
      <BoardPage />
    </ToastProvider>,
  );
};

const setup = async () => {
  const board = await createBoard('Site', 'basic');
  const columns = await sortedColumns(board.id);
  for (const [index, title] of ['Alpha', 'Beta'].entries()) {
    await createNote({ id: title, kind: 'note', title, boardId: board.id, columnId: columns[0].id, boardPosition: index });
  }
  return { board, columns };
};

const menuFor = (title: string) => screen.getByRole('button', { name: `Card actions for ${title}` });

// Radix submenus open by keyboard in jsdom.
const openSub = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  (await screen.findByRole('menuitem', { name })).focus();
  await user.keyboard('{ArrowRight}');
};

describe('card menu', () => {
  it('changes the colour and labels without opening the card', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const label = await createLabel('Design');
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await openSub(user, 'Colour');
    await user.click(await screen.findByRole('menuitemradio', { name: 'Yellow' }));
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.color).toBe('yellow'));
    await user.click(menuFor('Alpha'));
    await openSub(user, 'Labels');
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Design' }));
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.labelIds).toEqual([label.id]));
    // The labels submenu stays open for the next tick.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Design' })).toBeInTheDocument();
  });

  it('archives a card with Undo and focuses the next card', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    await waitFor(() => expect(menuFor('Beta')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect((await db.notes.get('Alpha'))?.archived).toBe(false);
  });

  it('moves a card to the trash with Undo', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(async () => expect((await db.notes.get('Beta'))?.trashedAt).not.toBeNull());
    expect(await screen.findByText('Moved to trash')).toBeInTheDocument();
    await waitFor(() => expect(menuFor('Alpha')).toHaveFocus());
  });

  it('moves a card to another board', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    const other = await createBoard('Home', 'basic');
    const [, doing] = await sortedColumns(other.id);
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await openSub(user, 'Move to board');
    await openSub(user, 'Home');
    await user.click(await screen.findByRole('menuitem', { name: 'Doing' }));
    await waitFor(async () => expect(await db.notes.get('Alpha')).toMatchObject({ boardId: other.id, columnId: doing.id }));
    expect(await screen.findByText('Moved to Home · Doing')).toBeInTheDocument();
  });

  it('opens the date picker from the menu and saves a date', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Card actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Date…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Date' });
    await user.click(dialog.querySelector('button') as HTMLElement); // first quick pick
    await waitFor(async () => expect((await db.notes.get('Alpha'))?.due).not.toBeNull());
    await waitFor(() => expect(menuFor('Alpha')).toHaveFocus());
  });

  it('opens on right-click with a mouse, but not on a touch long-press', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    const card = (await screen.findByText('Alpha')).closest('li') as HTMLElement;
    fireEvent.pointerDown(card, { pointerType: 'touch' });
    fireEvent.contextMenu(card);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.pointer({ keys: '[MouseRight]', target: card });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/kanban`
Expected: FAIL — no "Card actions for …" buttons.

- [ ] **Step 3: Implement**

`components/editor/DatePopover.tsx`: add `anchor?: ReactElement` to `Props` (import `type ReactElement` from react) and render:

```tsx
const DatePopover = ({ due, open, onOpenChange, onSave, onRemove, onCloseAutoFocus, anchor }: Props) => (
  <Popover.Root open={open} onOpenChange={onOpenChange}>
    {anchor ? (
      <Popover.Anchor asChild>{anchor}</Popover.Anchor>
    ) : (
      <Popover.Trigger asChild>
        <IconButton label={due ? 'Change date' : 'Add date'} data-date-button=''>
          <AlarmClock size={18} aria-hidden />
        </IconButton>
      </Popover.Trigger>
    )}
```

(the rest unchanged).

`components/kanban/CardMenu.tsx`:

```tsx
import { Check, ChevronRight, EllipsisVertical } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, useState, type ReactNode } from 'react';
import type { CardMove } from '../../lib/cards';
import { COLOR_NAMES, NOTE_COLORS, type Board, type Column, type Label, type Note, type NoteColor, type Repeat } from '../../lib/types';
import DatePopover from '../editor/DatePopover';
import IconButton from '../ui/IconButton';
import menuStyles from '../ui/Menu.module.css';
import styles from './Board.module.css';

type Props = {
  note: Note;
  labels: Label[];
  columns: { id: string; name: string }[];
  boards: { board: Board; columns: Column[] }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canMove: (move: CardMove) => boolean;
  onMove: (move: CardMove) => void;
  onMoveTo: (columnId: string) => void;
  onMoveToBoard: (columnId: string) => void;
  onColor: (color: NoteColor) => void;
  onToggleLabel: (labelId: string) => void;
  onSaveDate: (date: string, time: string | null, repeat: Repeat | null) => void;
  onRemoveDate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCloseFocus: () => void;
};

const MOVES: { move: CardMove; label: string }[] = [
  { move: 'up', label: 'Move up' },
  { move: 'down', label: 'Move down' },
  { move: 'top', label: 'Move to top' },
  { move: 'bottom', label: 'Move to bottom' },
];

const Sub = ({ label, children }: { label: string; children: ReactNode }) => (
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger className={menuStyles.item}>
      {label}
      <ChevronRight size={16} className={menuStyles.indicator} aria-hidden />
    </DropdownMenu.SubTrigger>
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent className={menuStyles.content} sideOffset={4}>
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  </DropdownMenu.Sub>
);

const Tick = () => (
  <DropdownMenu.ItemIndicator className={menuStyles.indicator}>
    <Check size={16} aria-hidden />
  </DropdownMenu.ItemIndicator>
);

// Everything a card can do without being opened. Moving is also the way to
// move a card without dragging (WCAG 2.5.7).
const CardMenu = (props: Props) => {
  const { note, labels, columns, boards, open, onOpenChange, canMove, onCloseFocus } = props;
  const title = note.title || 'Untitled';
  const [dateOpen, setDateOpen] = useState(false);
  const openingDate = useRef(false);
  const moves = MOVES.filter(({ move }) => canMove(move));
  const dropdown = (
    <span className={styles.menuAnchor}>
      <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Trigger asChild>
          <IconButton label={`Card actions for ${title}`} data-card-move={note.id}>
            <EllipsisVertical size={16} aria-hidden />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={menuStyles.content}
            align='end'
            sideOffset={6}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (openingDate.current) {
                openingDate.current = false;
                return;
              }
              requestAnimationFrame(onCloseFocus);
            }}
          >
            <Sub label='Colour'>
              <DropdownMenu.RadioGroup value={note.color} onValueChange={(c) => props.onColor(c as NoteColor)}>
                {NOTE_COLORS.map((color) => (
                  <DropdownMenu.RadioItem key={color} value={color} className={menuStyles.item}>
                    <span className={styles.swatch} data-color={color} aria-hidden />
                    {COLOR_NAMES[color]}
                    <Tick />
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </Sub>
            <Sub label='Labels'>
              {labels.length === 0 && (
                <DropdownMenu.Item className={menuStyles.item} disabled>
                  No labels yet
                </DropdownMenu.Item>
              )}
              {labels.map((label) => (
                <DropdownMenu.CheckboxItem
                  key={label.id}
                  className={menuStyles.item}
                  checked={note.labelIds.includes(label.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => props.onToggleLabel(label.id)}
                >
                  {label.name}
                  <Tick />
                </DropdownMenu.CheckboxItem>
              ))}
            </Sub>
            <DropdownMenu.Item
              className={menuStyles.item}
              onSelect={() => {
                openingDate.current = true;
                requestAnimationFrame(() => setDateOpen(true));
              }}
            >
              Date…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menuStyles.separator} />
            {(moves.length > 0 || columns.length > 0) && (
              <Sub label='Move'>
                {moves.map(({ move, label }) => (
                  <DropdownMenu.Item key={move} className={menuStyles.item} onSelect={() => props.onMove(move)}>
                    {label}
                  </DropdownMenu.Item>
                ))}
                {columns.map((column) => (
                  <DropdownMenu.Item key={column.id} className={menuStyles.item} onSelect={() => props.onMoveTo(column.id)}>
                    {`Move to ${column.name}`}
                  </DropdownMenu.Item>
                ))}
              </Sub>
            )}
            {boards.length > 0 && (
              <Sub label='Move to board'>
                {boards.map(({ board, columns: boardColumns }) =>
                  boardColumns.length === 0 ? (
                    <DropdownMenu.Item key={board.id} className={menuStyles.item} disabled>
                      {board.name}
                    </DropdownMenu.Item>
                  ) : (
                    <Sub key={board.id} label={board.name}>
                      {boardColumns.map((column) => (
                        <DropdownMenu.Item
                          key={column.id}
                          className={menuStyles.item}
                          onSelect={() => props.onMoveToBoard(column.id)}
                        >
                          {column.name}
                        </DropdownMenu.Item>
                      ))}
                    </Sub>
                  ),
                )}
              </Sub>
            )}
            <DropdownMenu.Separator className={menuStyles.separator} />
            <DropdownMenu.Item className={menuStyles.item} onSelect={props.onArchive}>
              Archive
            </DropdownMenu.Item>
            <DropdownMenu.Item className={`${menuStyles.item} ${menuStyles.danger}`} onSelect={props.onDelete}>
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  );
  return (
    <DatePopover
      due={note.due}
      open={dateOpen}
      onOpenChange={setDateOpen}
      onSave={props.onSaveDate}
      onRemove={props.onRemoveDate}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onCloseFocus();
      }}
      anchor={dropdown}
    />
  );
};

export default CardMenu;
```

`components/kanban/Board.module.css`, add:

```css
.menuAnchor {
  display: inline-flex;
}

.swatch {
  width: 14px;
  height: 14px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--note-default);
}
```

and reuse the note colour variables the main board uses for `[data-color]` swatches (copy the `.swatch[data-color='yellow'] { background: … }` rules from `components/ui/ColorPicker.module.css`).

`components/kanban/BoardColumn.tsx`: right-click for mice only. `DraggableCard` gains `onMenu: () => void` and tracks the last pointer:

```tsx
const DraggableCard = ({ id, onMenu, children }: { id: string; onMenu: () => void; children: ReactNode }) => {
  …
  const pointer = useRef('mouse');
  return (
    <li
      ref={ref}
      className={isDragging ? styles.dragging : undefined}
      {...listeners}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
        listeners?.onPointerDown?.(e);
      }}
      onContextMenu={(e) => {
        // A touch long-press stays a drag; only a mouse right-click opens the menu.
        if (pointer.current !== 'mouse') return;
        e.preventDefault();
        onMenu();
      }}
    >
```

and `BoardColumn` gains prop `onCardMenu: (noteId: string) => void`, passed as `onMenu={() => onCardMenu(noteId)}`.

`components/kanban/BoardView.tsx`: `const boards = useBoardColumns();` and pass `boards={boards ?? []}` to `BoardColumns`.

`components/kanban/BoardColumns.tsx`: replace `CardMoveMenu` with `CardMenu`; add state and handlers:

```tsx
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
      labelIds: note.labelIds.includes(labelId) ? note.labelIds.filter((id) => id !== labelId) : [...note.labelIds, labelId],
    });
```

and pass to each column:

```tsx
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
```

The existing `refocusId` effect stays for moves within the board (the button may remount in another column). Delete `CardMoveMenu.tsx`.

- [ ] **Step 4: Run the kanban tests, types, lint, then the suite**

Run: `npx vitest run components/kanban components/editor && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS; clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add components
git commit -m "Give each card a full menu: colour, labels, date, move, move to board, archive, delete"
```

---

### Task 6: Column bulk actions

**Files:**
- Modify: `components/ui/Menu.tsx` (submenus), `components/kanban/BoardColumns.tsx`, `components/kanban/BoardPage.test.tsx`

**Interfaces:**
- Consumes: `archiveCards`, `moveCards`, `putBackCards` (Task 3); `ColumnHeader` `bulkItems` (Task 4).
- Produces: `MenuItem` gains `key?: string` and `items?: MenuItem[]` (a submenu; `onSelect` becomes optional).

- [ ] **Step 1: Write the failing tests**

`components/kanban/BoardPage.test.tsx`, new tests in `describe('board page')`:

```ts
  it('archives all of a column’s cards with one Undo', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    await createNote({ id: 'n2', kind: 'note', title: 'Copy', boardId: board.id, columnId: columns[1].id, boardPosition: 1 });
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for Doing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive all cards' }));
    await waitFor(async () => expect((await db.notes.toArray()).every((n) => n.archived)).toBe(true));
    expect(await screen.findByText('Archived 2 cards')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.notes.toArray()).some((n) => n.archived)).toBe(false));
  });

  it('moves all of a column’s cards to another column', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for Doing' }));
    (await screen.findByRole('menuitem', { name: 'Move all cards to' })).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitem', { name: 'To do' }));
    await waitFor(async () => expect((await db.notes.get('n1'))?.columnId).toBe(columns[0].id));
    expect(await screen.findByText('Moved 1 card to To do')).toBeInTheDocument();
  });

  it('hides bulk actions for an empty column', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Column actions for To do' }));
    await screen.findByRole('menuitem', { name: 'Rename' });
    expect(screen.queryByRole('menuitem', { name: 'Archive all cards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move all cards to' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/kanban/BoardPage.test.tsx`
Expected: FAIL — no "Archive all cards" item.

- [ ] **Step 3: Implement**

`components/ui/Menu.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import styles from './Menu.module.css';

export type MenuItem = {
  label: string;
  key?: string; // when labels can repeat (e.g. two columns with one name)
  onSelect?: () => void;
  items?: MenuItem[]; // a submenu
  icon?: ReactNode;
  danger?: boolean;
  keepFocus?: boolean; // the item moves focus itself (e.g. opens a name field)
};

type Props = {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
};

const Items = ({ items, keepFocus }: { items: MenuItem[]; keepFocus: RefObject<boolean> }) =>
  items.map((item) =>
    item.items ? (
      <DropdownMenu.Sub key={item.key ?? item.label}>
        <DropdownMenu.SubTrigger className={styles.item}>
          {item.icon}
          {item.label}
          <ChevronRight size={16} className={styles.indicator} aria-hidden />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent className={styles.content} sideOffset={4}>
            <Items items={item.items} keepFocus={keepFocus} />
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    ) : (
      <DropdownMenu.Item
        key={item.key ?? item.label}
        className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
        onSelect={() => {
          keepFocus.current = !!item.keepFocus;
          item.onSelect?.();
        }}
      >
        {item.icon}
        {item.label}
      </DropdownMenu.Item>
    ),
  );

const Menu = ({ trigger, items, align = 'end' }: Props) => {
  const keepFocus = useRef(false);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.content}
          align={align}
          sideOffset={6}
          onCloseAutoFocus={(event) => {
            if (!keepFocus.current) return;
            keepFocus.current = false;
            event.preventDefault();
          }}
        >
          <Items items={items} keepFocus={keepFocus} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default Menu;
```

`components/kanban/BoardColumns.tsx`: add `filtering` (false until Task 7; declare `const filtering = false;` here and Task 7 replaces it) and:

```tsx
  const cardsWord = (n: number) => (n === 1 ? '1 card' : `${n} cards`);

  const archiveAll = async (ids: string[]) => {
    const states = await archiveCards(ids);
    if (states.length === 0) return;
    setAnnouncement(`Archived ${cardsWord(states.length)}`);
    toast({ message: `Archived ${cardsWord(states.length)}`, actionLabel: 'Undo', onAction: () => void putBackCards(states) });
  };

  const moveAll = async (ids: string[], columnId: string, where: string) => {
    const states = await moveCards(ids, columnId);
    if (states.length === 0) return;
    setAnnouncement(`Moved ${cardsWord(states.length)} to ${where}`);
    toast({ message: `Moved ${cardsWord(states.length)} to ${where}`, actionLabel: 'Undo', onAction: () => void putBackCards(states) });
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
      { label: filtering ? `Archive ${ids.length} shown ${ids.length === 1 ? 'card' : 'cards'}` : 'Archive all cards', onSelect: () => void archiveAll(ids) },
      ...(targets.length > 0 ? [{ label: filtering ? 'Move shown cards to' : 'Move all cards to', items: targets }] : []),
    ];
  };
```

and pass `bulkItems={bulkItems(column.id, ids)}` to each `BoardColumn`.

- [ ] **Step 4: Run tests, types, lint, then the suite**

Run: `npx vitest run components && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS; clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add components
git commit -m "Archive or move all of a column's cards at once, with Undo"
```

---

### Task 7: Filtering the board

**Files:**
- Create: `components/kanban/FilterBar.tsx`, `components/kanban/BoardFilter.test.tsx`
- Modify: `components/kanban/BoardView.tsx`, `components/kanban/BoardColumns.tsx`, `components/kanban/Board.module.css`

**Interfaces:**
- Consumes: `CardFilter`, `EMPTY_FILTER`, `DATE_FILTERS`, `isFiltering`, `matchesCard` (Task 2); `moveShown` (Task 2).
- Produces: `BoardColumns` prop `visibleIds: Set<string> | null` (null when not filtering) and `onCardAdded(id)` used by `BoardView` to keep added cards shown.

- [ ] **Step 1: Write the failing tests**

`components/kanban/BoardFilter.test.tsx` (same router mock, `beforeEach` and `open` helper as `CardMenu.test.tsx`):

```tsx
const setup = async () => {
  const board = await createBoard('Site', 'basic');
  const columns = await sortedColumns(board.id);
  const label = await createLabel('Design');
  const today = localDate(Date.now());
  const add = (id: string, columnId: string, boardPosition: number, extra = {}) =>
    createNote({ id, kind: 'note', title: id, boardId: board.id, columnId, boardPosition, ...extra });
  await add('Fonts', columns[0].id, 0, { labelIds: [label.id] });
  await add('Logo', columns[0].id, 1, { due: newDue(addDays(today, -2), null, null) });
  await add('Copy', columns[0].id, 2, { due: newDue(addDays(today, 3), null, null) });
  await add('Wireframes', columns[1].id, 0);
  return { board, columns, label };
};

const visibleTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('filtering a board', () => {
  it('filters by text, label and date, and counts what shows', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    const box = screen.getByRole('searchbox', { name: 'Filter cards by text' });
    expect(box).toHaveFocus();
    await user.type(box, 'o');
    expect(visibleTitles()).toEqual(['Fonts', 'Logo', 'Copy']);
    await user.clear(box);
    await user.click(screen.getByRole('button', { name: 'Design' }));
    expect(visibleTitles()).toEqual(['Fonts']);
    expect(screen.getByText('1 of 3 cards shown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(visibleTitles()).toEqual(['Logo']);
    await user.click(screen.getByRole('button', { name: 'Next 7 days' }));
    expect(visibleTitles()).toEqual(['Copy']);
    await user.click(screen.getByRole('button', { name: 'No date' }));
    expect(visibleTitles()).toEqual(['Fonts', 'Wireframes']);
    expect(screen.getByRole('button', { name: 'Filter, 2 cards match' })).toBeInTheDocument();
  });

  it('says when nothing matches, and Clear brings everything back', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter cards by text' }), 'zzz');
    expect(screen.getByText('No cards match the filter')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear' })[0]);
    expect(visibleTitles()).toHaveLength(4);
  });

  it('Escape clears and closes the filter, back to the Filter button', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter cards by text' }), 'fonts{Escape}');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(visibleTitles()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveFocus();
  });

  it('keeps a quick-added card shown, and moves among shown cards only', async () => {
    const user = userEvent.setup();
    const { board, columns } = await setup();
    open(board.id);
    await screen.findByText('Fonts');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'No date' }));
    await user.click(screen.getByRole('button', { name: 'Add card to To do' }));
    await user.type(screen.getByRole('textbox', { name: 'Card title for To do' }), 'Brief{Enter}');
    expect(await screen.findByText('Brief')).toBeInTheDocument();
    // Shown in To do: Fonts, Brief. Move Brief up passes Fonts; Logo and Copy keep their order.
    await user.click(screen.getByRole('button', { name: 'Card actions for Brief' }));
    (await screen.findByRole('menuitem', { name: 'Move' })).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    await waitFor(async () =>
      expect(
        (await db.notes.toArray())
          .filter((n) => n.columnId === columns[0].id)
          .sort((a, b) => a.boardPosition - b.boardPosition)
          .map((n) => n.title),
      ).toEqual(['Brief', 'Fonts', 'Logo', 'Copy']),
    );
  });
});
```

(imports: `render, screen, waitFor` from Testing Library, `userEvent`, `vitest`, `createBoard`, `db`, `addDays, localDate` from `lib/calendar`, `newDue` from `lib/due`, `createLabel, createNote`, `sortedColumns`, `BoardPage`, `ToastProvider`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/kanban/BoardFilter.test.tsx`
Expected: FAIL — no "Filter" button.

- [ ] **Step 3: Implement**

`components/kanban/FilterBar.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { DATE_FILTERS, EMPTY_FILTER, isFiltering, type CardFilter } from '../../lib/boardFilter';
import type { Label } from '../../lib/types';
import styles from './Board.module.css';

type Props = {
  id: string;
  filter: CardFilter;
  labels: Label[];
  onChange: (filter: CardFilter) => void;
  onClose: () => void; // Escape: clear and close
};

const FilterBar = ({ id, filter, labels, onChange, onClose }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const chip = (key: string, label: string, pressed: boolean, next: CardFilter) => (
    <button key={key} type='button' className={styles.chip} aria-pressed={pressed} onClick={() => onChange(next)}>
      {label}
    </button>
  );
  return (
    <div id={id} className={styles.filterBar} role='group' aria-label='Filter cards'>
      <input
        ref={input}
        type='search'
        className={styles.filterInput}
        placeholder='Filter cards'
        aria-label='Filter cards by text'
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div className={styles.chips}>
        {DATE_FILTERS.map(({ id: date, label }) =>
          chip(date, label, filter.date === date, { ...filter, date: filter.date === date ? null : date }),
        )}
        {labels.map((label) =>
          chip(label.id, label.name, filter.labelId === label.id, {
            ...filter,
            labelId: filter.labelId === label.id ? null : label.id,
          }),
        )}
      </div>
      {isFiltering(filter) && (
        <button type='button' className={styles.clear} onClick={() => onChange(EMPTY_FILTER)}>
          Clear
        </button>
      )}
    </div>
  );
};

export default FilterBar;
```

`components/kanban/BoardView.tsx`:

```tsx
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Cards added while filtering stay shown until the filter changes.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const filterButton = useRef<HTMLButtonElement>(null);
  const filtering = isFiltering(filter);

  const changeFilter = (next: CardFilter) => {
    setFilter(next);
    setKept(new Set());
    setNow(Date.now());
  };

  const closeFilter = () => {
    changeFilter(EMPTY_FILTER);
    setFilterOpen(false);
    requestAnimationFrame(() => filterButton.current?.focus());
  };

  const allCards = [...cards.values()].flat();
  const visibleIds = filtering
    ? new Set(allCards.filter((n) => kept.has(n.id) || matchesCard(n, filter, labelNames, now)).map((n) => n.id))
    : null;
  const matchCount = visibleIds?.size ?? 0;
```

Header, before the Add card button:

```tsx
        <button
          ref={filterButton}
          type='button'
          className={styles.filterButton}
          aria-expanded={filterOpen}
          aria-controls='board-filter'
          aria-label={filtering ? `Filter, ${matchCount} ${matchCount === 1 ? 'card matches' : 'cards match'}` : 'Filter'}
          onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
        >
          <ListFilter size={16} aria-hidden />
          Filter
          {filtering && <span className={styles.filterDot} aria-hidden />}
        </button>
```

After `</header>`:

```tsx
      {filterOpen && (
        <FilterBar id='board-filter' filter={filter} labels={labels ?? []} onChange={changeFilter} onClose={closeFilter} />
      )}
      {filtering && matchCount === 0 && (
        <p className={styles.noMatch}>
          No cards match the filter
          <button type='button' className={styles.clear} onClick={() => changeFilter(EMPTY_FILTER)}>
            Clear
          </button>
        </p>
      )}
```

and pass to `BoardColumns`:

```tsx
          visibleIds={visibleIds}
          onCardAdded={(id) => {
            if (filtering) setKept((s) => new Set(s).add(id));
          }}
```

`components/kanban/BoardColumns.tsx`: accept `visibleIds` and `onCardAdded`; replace `const filtering = false;` with `const filtering = visibleIds !== null;` and:

```tsx
  const visible = (columnId: string) => {
    const ids = shown[columnId] ?? [];
    return visibleIds ? ids.filter((id) => visibleIds.has(id)) : ids;
  };
```

Each column renders `ids={visible(column.id)}` with `total={(shown[column.id] ?? []).length}`; `canMove` uses `moveIndex(visible(column.id), …)`; `bulkItems(column.id, visible(column.id))`; `removeColumn` keeps the full count. `nextFocus` uses `visible(columnId)`. `moveWithin` becomes:

```tsx
  // Menu moves start from the order on screen (an earlier move may not be saved
  // yet) and pass the next shown card; hidden cards keep their order.
  const moveWithin = (noteId: string, columnId: string, move: CardMove) => {
    const next = moveShown(shown[columnId] ?? [], visible(columnId), noteId, move);
    if (!next) return;
    setPreview({ base: null, order: { ...shown, [columnId]: next } });
    refocusId.current = noteId;
    void save(noteId, columnId, next);
  };
```

(The announcement's "position N of M" counts the shown cards: in `save`, compute `const seen = visibleIds ? ids.filter((id) => visibleIds.has(id) || id === noteId) : ids;` and use `seen.indexOf(noteId) + 1` and `seen.length`.)

`components/kanban/Board.module.css`, add:

```css
.filterButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.filterButton[aria-expanded='true'] {
  border-color: var(--accent);
}

.filterDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.filterBar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.filterInput {
  min-width: 180px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.chip {
  flex: none;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.clear {
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: var(--text-sm);
  text-decoration: underline;
  cursor: pointer;
}

.noMatch {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 12px 16px 0;
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .filterBar {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
}
```

- [ ] **Step 4: Run tests, types, lint, then the suite**

Run: `npx vitest run components/kanban && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS; clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add components
git commit -m "Filter a board by text, label and date"
```

---

### Task 8: Drag columns

**Files:**
- Modify: `components/kanban/BoardColumns.tsx`, `components/kanban/BoardColumn.tsx`, `components/kanban/Board.module.css`, `lib/cards.ts` (pure `columnOver` helper), `lib/cards.test.ts`

**Interfaces:**
- Consumes: `moveColumnTo` (Task 1), `moveId` (`lib/order`).
- Produces: `columnOver(overId: string, columnOf: (cardId: string) => string | undefined): string | null` — the column a dragged column is over, from a droppable id (`col-slot:<id>`, `column:<id>` or `card:<id>`).

- [ ] **Step 1: Write the failing test**

`lib/cards.test.ts`:

```ts
describe('columnOver', () => {
  const columnOf = (id: string) => ({ n1: 'c2' })[id];
  it('reads the column from any droppable on it', () => {
    expect(columnOver('col-slot:c1', columnOf)).toBe('c1');
    expect(columnOver('column:c3', columnOf)).toBe('c3');
    expect(columnOver('card:n1', columnOf)).toBe('c2');
    expect(columnOver('card:missing', columnOf)).toBeNull();
    expect(columnOver('other', columnOf)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/cards.test.ts`
Expected: FAIL — `columnOver` is not a function.

- [ ] **Step 3: Implement**

`lib/cards.ts`:

```ts
// The column a dragged column is over: its slot, its card list, or one of its cards.
export const columnOver = (overId: string, columnOf: (cardId: string) => string | undefined): string | null => {
  if (overId.startsWith('col-slot:')) return overId.slice(9);
  if (overId.startsWith('column:')) return overId.slice(7);
  if (overId.startsWith('card:')) return columnOf(overId.slice(5)) ?? null;
  return null;
};
```

`components/kanban/BoardColumn.tsx`: the section is a droppable slot and the header a drag handle:

```tsx
  const { setNodeRef: setSlotRef } = useDroppable({ id: `col-slot:${column.id}` });
  const { setNodeRef: setHandleRef, listeners, isDragging } = useDraggable({ id: `col:${column.id}` });
  …
    <section ref={setSlotRef} className={isDragging ? `${styles.column} ${styles.dragging}` : styles.column} aria-labelledby={headingId}>
      <div ref={setHandleRef} className={styles.columnGrab} {...listeners}>
        <ColumnHeader … />
      </div>
```

`components/kanban/BoardColumns.tsx`:

```tsx
  const [columnPreview, setColumnPreview] = useState<string[] | null>(null);
  const storedColumns = columns.map((c) => c.id);
  // The new order shows until the stored one catches up.
  if (columnPreview && columnPreview.join() === storedColumns.join()) setColumnPreview(null);
  const columnById = new Map(columns.map((c) => [c.id, c]));
  const orderedColumns = (columnPreview ?? storedColumns).map((id) => columnById.get(id)).filter((c): c is Column => !!c);
  const isColumnDrag = (id: string | number) => String(id).startsWith('col:');
  const columnOfCard = (cardId: string) => Object.keys(shown).find((key) => shown[key].includes(cardId));

  // Cards only land on cards and lists; columns only on column slots.
  const collisions: CollisionDetection = (args) =>
    closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => String(c.id).startsWith('col-slot:') === isColumnDrag(args.active.id),
      ),
    });
```

In `onDragStart`, `onDragOver`, `onDragEnd`, `onDragCancel` branch first on `isColumnDrag(active.id)`:

```tsx
  // start
  if (isColumnDrag(active.id)) {
    setActiveId(String(active.id));
    setColumnPreview(storedColumns);
    return;
  }
  // over
  if (isColumnDrag(active.id)) {
    const target = over ? columnOver(String(over.id), columnOfCard) : null;
    if (target) setColumnPreview((p) => moveId(p ?? storedColumns, String(active.id).slice(4), target));
    return;
  }
  // end
  if (isColumnDrag(active.id)) {
    setActiveId(null);
    const id = String(active.id).slice(4);
    const index = (columnPreview ?? storedColumns).indexOf(id);
    if (index < 0 || index === storedColumns.indexOf(id)) return setColumnPreview(null);
    setAnnouncement(`Moved column ${columnById.get(id)?.name} to position ${index + 1} of ${storedColumns.length}`);
    moveColumnTo(id, index).catch(() => {
      setColumnPreview(null);
      toast({ message: 'Couldn’t move the column.' });
    });
    return;
  }
  // cancel: also setColumnPreview(null)
```

Render `orderedColumns` instead of `columns` (with `first`/`last` from its index); pass `collisionDetection={collisions}`; the drag announcements name a column when `isColumnDrag` (`Picked up column ${name}` / `Dropped column ${name}` / `Stopped moving column ${name}`); the `DragOverlay` shows `<div className={styles.columnOverlay}>{name}</div>` for a column. `activeId`'s `data-dragging` attribute (snap off) applies to column drags too.

`components/kanban/Board.module.css`:

```css
.columnGrab {
  cursor: grab;
  touch-action: manipulation;
}

.columnOverlay {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--surface-sunken, var(--surface));
  box-shadow: var(--shadow-raised);
  font-weight: 700;
}
```

- [ ] **Step 4: Run tests, types, lint, then the suite**

Run: `npx vitest run lib/cards.test.ts components/kanban && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS; clean; suite green. Then in Chrome (dev server on :4000): drag a column by its name to a new place; it stays after reload; card drags still work, also while filtered.

- [ ] **Step 5: Commit**

```bash
git add lib/cards.ts lib/cards.test.ts components/kanban
git commit -m "Drag columns by their header to reorder them"
```

---

### Task 9: Starred boards and board order on the Boards page; README

**Files:**
- Modify: `components/kanban/BoardTiles.tsx`, `components/kanban/BoardTiles.module.css`, `components/kanban/BoardTiles.test.tsx`, `components/kanban/BoardView.tsx` (Star in menu), `components/kanban/BoardPage.test.tsx`, `README.md`

**Interfaces:**
- Consumes: `starBoard`, `moveBoardTo` (Task 1); `useBoardSummaries` (sorted by position, each with `board.starred`).

- [ ] **Step 1: Write the failing tests**

`components/kanban/BoardTiles.test.tsx` (add `starBoard` to the boards import):

```tsx
  it('shows starred boards first, and stars from a tile', async () => {
    const user = userEvent.setup();
    await createBoard('Home', 'empty');
    const work = await createBoard('Work', 'empty');
    render(<BoardTiles onOpen={vi.fn()} />);
    await screen.findByRole('link', { name: /Home/ });
    expect(screen.queryByRole('heading', { name: 'Starred' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Star Work' }));
    await waitFor(async () => expect((await db.boards.get(work.id))?.starred).toBe(true));
    const starred = await screen.findByRole('list', { name: 'Starred' });
    expect(within(starred).getByRole('link', { name: /Work/ })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'All boards' })).getByRole('link', { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Star Work' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves a board earlier from its menu', async () => {
    const user = userEvent.setup();
    await createBoard('A', 'empty');
    await createBoard('B', 'empty');
    render(<BoardTiles onOpen={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Board actions for B' }));
    expect(screen.queryByRole('menuitem', { name: 'Move later' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Move earlier' }));
    await waitFor(async () => expect((await db.boards.orderBy('position').toArray()).map((b) => b.name)).toEqual(['B', 'A']));
  });
```

`components/kanban/BoardPage.test.tsx`:

```ts
  it('stars the board from its menu', async () => {
    const user = userEvent.setup();
    const { board } = await setup();
    open(board.id);
    await user.click(await screen.findByRole('button', { name: 'Board actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Star board' }));
    await waitFor(async () => expect((await db.boards.get(board.id))?.starred).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Board actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Unstar board' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/kanban/BoardTiles.test.tsx components/kanban/BoardPage.test.tsx`
Expected: FAIL — no "Star Work" button, no "Star board" item.

- [ ] **Step 3: Implement**

`components/kanban/BoardView.tsx` menu items gain, after Add column:

```tsx
            { label: board.starred ? 'Unstar board' : 'Star board', onSelect: () => void starBoard(board.id, !board.starred) },
```

`components/kanban/BoardTiles.tsx`:

```tsx
import { DndContext, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { EllipsisVertical, Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { moveBoardTo, starBoard, useBoardSummaries, type BoardSummary } from '../../lib/boards';
import { moveId } from '../../lib/order';
import { boardHref } from '../../lib/routes';
import IconButton from '../ui/IconButton';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './BoardTiles.module.css';
import NewBoardDialog from './NewBoardDialog';

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
    <li ref={ref} className={isDragging ? `${styles.item} ${styles.dragging}` : styles.item} {...listeners}>
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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  if (!summaries) return null;

  const stored = summaries.map((s) => s.board.id);
  if (preview && preview.join() === stored.join()) setPreview(null);
  const byId = new Map(summaries.map((s) => [s.board.id, s]));
  const ordered = (preview ?? stored).map((id) => byId.get(id)).filter((s): s is BoardSummary => !!s);
  const starred = ordered.filter((s) => s.board.starred);
  const rest = ordered.filter((s) => !s.board.starred);
  const groupOf = (id: string) => (byId.get(id)?.board.starred ? starred : rest).map((s) => s.board.id);

  const move = (id: string, index: number) => {
    const name = byId.get(id)?.board.name;
    setAnnouncement(`Moved ${name} to position ${index + 1} of ${groupOf(id).length}`);
    moveBoardTo(id, index).catch(() => setPreview(null));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const overId = String(over?.id ?? '');
    if (!overId.startsWith('tile:')) return;
    const target = overId.slice(5);
    const id = String(active.id);
    if (byId.get(target)?.board.starred !== byId.get(id)?.board.starred) return;
    setPreview((p) => moveId(p ?? stored, id, target));
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    // The click that may follow this drop isn't a click on the tile.
    dragged.current = true;
    setTimeout(() => {
      dragged.current = false;
    }, 0);
    const id = String(active.id);
    const index = groupOf(id).indexOf(id);
    const was = summaries.filter((s) => s.board.starred === byId.get(id)?.board.starred).findIndex((s) => s.board.id === id);
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
            onClick={() => {
              setAnnouncement(board.starred ? `Unstarred ${board.name}` : `Starred ${board.name}`);
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
        onDragStart={() => setPreview(stored)}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setPreview(null)}
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
        <ul className={styles.tiles} {...(starred.length > 0 ? { 'aria-labelledby': 'all-boards' } : { 'aria-label': 'Boards' })}>
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
```

The hooks run before the early `return null` — move `useSensors` above `if (!summaries) return null;` as written (all hooks are above it).

`components/kanban/BoardTiles.module.css`, add:

```css
.item {
  position: relative;
}

.dragging {
  opacity: 0.4;
}

.actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
}

.heading {
  margin: 8px 0;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-muted);
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

(and give `.name` `padding-right: 64px` so it doesn't run under the buttons).

`README.md`: in the boards section, add one bullet each: quick add, filter, card menu (colour, labels, date, move to board, archive, delete; right-click), archive/move all cards in a column, drag columns, starred boards and board order.

- [ ] **Step 4: Run tests, types, lint, build, then the suite**

Run: `npx vitest run components/kanban && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: PASS; clean; suite green; build succeeds. In Chrome: star a board, drag tiles within a group, Move earlier/later, click a tile still opens it.

- [ ] **Step 5: Commit**

```bash
git add components README.md
git commit -m "Star boards, show them first, and drag boards into any order"
```
