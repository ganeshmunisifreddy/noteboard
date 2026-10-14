# Backup and Drag to Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users arrange the board by dragging cards (order persists, edits don't move notes), back up and restore all notes as JSON, and export notes as Markdown.

**Architecture:** Notes gain a fractional `position` (Dexie schema v2 upgrade). Pure helpers in `lib/order.ts` and `lib/masonry.ts` do the maths; `NoteGrid` lays cards out absolutely in a left-to-right masonry and uses `@dnd-kit/core` for mouse/touch dragging with a live preview order, plus an arrow-key handle for keyboard users. `lib/backup.ts` holds pure build/parse/merge/Markdown functions and a transactional restore; the board's ⋯ menu triggers them.

**Tech Stack:** Next.js 16 Pages Router, React 19.3, TypeScript, Dexie 4, `@dnd-kit/core` 6, framer-motion, Radix, CSS Modules, Vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-14-backup-and-reorder-design.md`

## Global Constraints

- No server; all data stays in the browser.
- Keep the existing stack and code style: single quotes, semicolons, 2-space indent, arrow-function components with `export default` at the bottom; `pages/_app.tsx` keeps its no-semicolon style.
- WCAG AA contrast; functional text at least 11px.
- `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass at the end of every task.
- Never write test data into a browser profile with real notes; manual checks use `localhost:9090` (fresh origin) or a profile whose notes are test data.
- Commit messages: plain imperative sentence, then the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. **Keyboard reordering** uses a drag-handle button where the arrow keys move the note one place earlier/later immediately (Home/End to first/last), with a spoken announcement. There is no separate pick-up/drop step. It is simpler, works the same in a masonry layout (where "up" and "left" are ambiguous), and stays fully accessible.
2. **Only `@dnd-kit/core`** is added. The grid keeps a live preview order in state during a drag instead of using `@dnd-kit/sortable`'s transform strategies, which don't suit masonry. `@dnd-kit/sortable` and `@dnd-kit/utilities` are not needed.
3. **Moving a note doesn't change `updatedAt`**, because reordering isn't an edit ("Edited 2h ago" stays truthful). Consequence: restoring a backup carries over order only for notes it adds or replaces.

## Review Focus

1. **Reordering inside a filtered view** (a label, Notes or Lists) must not reshuffle notes hidden from that view. Test: Task 2, "renumbers without changing the order of other notes".
2. **Restoring a backup from another device** where the same note was edited on both: the newer edit wins in both directions, and labels with the same name merge. Tests: Task 4, "replaces older local notes and keeps newer ones" and "maps labels by name".
3. **A restore that fails midway** (storage full, bad entry that throws) must change nothing. Test: Task 4, "changes nothing when the restore fails".
4. **Pinning, unpinning, restoring from Trash and unarchiving** put the note at the top of its section; editing never moves it. Tests: Task 2, "moves a note to the top when pinned or unpinned", "moves restored and unarchived notes to the top", "keeps its place when edited".
5. **Dragging must not break click-to-open or touch scrolling** (6px mouse threshold, 250ms touch hold). jsdom can't simulate this; Task 3's manual step checks a plain click opens the note, a mouse drag reorders, and touch emulation scrolls without dragging.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `lib/order.ts` | Create | Pure: `positionBetween`, `needsRenumber`, `moveId`, `moveToIndex`, `neighbors` |
| `lib/masonry.ts` | Create | Pure: `columnCountFor`, `gapFor`, `assignColumns` |
| `lib/types.ts` | Modify | `Note.position`; `NoteChanges` includes `position` |
| `lib/testUtils.ts` | Modify | `makeNote` default `position: 0` |
| `lib/db.ts` | Modify | Schema v2 with `position` index and upgrade |
| `lib/migrate.ts` | Modify | Legacy notes get positions |
| `lib/notes.ts` | Modify | Top positions, `moveNote`, `getAllData` |
| `lib/filters.ts` | Modify | Sort by position; `isReorderable` |
| `components/board/NoteGrid.tsx` | Replace | Masonry layout, dnd-kit, keyboard handle, announcements |
| `components/board/NoteGrid.module.css` | Replace | Absolute layout styles |
| `components/board/NoteCard.tsx` | Modify | Optional `dragHandle` slot |
| `lib/backup.ts` | Create | Build/parse/merge/Markdown, restore, downloads, messages |
| `lib/download.ts` | Create | `downloadFile` |
| `components/board/MoreMenu.tsx`, `FilterChips.tsx` | Modify | Backup menu group |
| `pages/index.tsx` | Modify | Reorderable flag, backup handlers, hidden file input |
| `README.md` | Modify | Features |

---

### Task 1: Order and masonry helpers

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@dnd-kit/core`)
- Create: `lib/order.ts`, `lib/masonry.ts`
- Test: `lib/order.test.ts`, `lib/masonry.test.ts`

**Interfaces:**
- Produces:
  - `lib/order.ts`: `MIN_GAP = 1e-6`; `positionBetween(before: number | null, after: number | null): number`; `needsRenumber(before: number | null, after: number | null): boolean`; `moveId(ids: string[], activeId: string, overId: string): string[]`; `moveToIndex(ids: string[], id: string, index: number): string[]`; `neighbors(ids: string[], id: string): { beforeId: string | null; afterId: string | null }`
  - `lib/masonry.ts`: `columnCountFor(width: number): number` (1–4, min column 160px); `gapFor(width: number): number` (10 below 600px, else 16); `assignColumns(heights: number[], columnCount: number): number[][]` (indexes per column)

- [ ] **Step 1: Install dnd-kit**

```bash
npm install @dnd-kit/core@^6.3.1
```

Expected: installs with no peer warnings (peer `react >=16.8`).

- [ ] **Step 2: Write failing tests `lib/order.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { MIN_GAP, moveId, moveToIndex, needsRenumber, neighbors, positionBetween } from './order';

describe('positionBetween', () => {
  it('goes halfway between neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });
  it('goes before the first and after the last', () => {
    expect(positionBetween(null, 4)).toBe(3);
    expect(positionBetween(4, null)).toBe(5);
  });
  it('starts at zero with no neighbours', () => {
    expect(positionBetween(null, null)).toBe(0);
  });
});

describe('needsRenumber', () => {
  it('is true only when the gap is too small', () => {
    expect(needsRenumber(1, 1 + MIN_GAP / 2)).toBe(true);
    expect(needsRenumber(1, 2)).toBe(false);
    expect(needsRenumber(null, 2)).toBe(false);
    expect(needsRenumber(1, null)).toBe(false);
  });
});

describe('moveId', () => {
  it('moves an id to where another one is', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('returns the same array for unknown ids', () => {
    const ids = ['a', 'b'];
    expect(moveId(ids, 'a', 'x')).toBe(ids);
  });
});

describe('moveToIndex', () => {
  it('moves an id to an index', () => {
    expect(moveToIndex(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveToIndex(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('neighbors', () => {
  it('finds the ids around an id', () => {
    expect(neighbors(['a', 'b', 'c'], 'b')).toEqual({ beforeId: 'a', afterId: 'c' });
    expect(neighbors(['a', 'b', 'c'], 'a')).toEqual({ beforeId: null, afterId: 'b' });
    expect(neighbors(['a', 'b', 'c'], 'c')).toEqual({ beforeId: 'b', afterId: null });
  });
});
```

Run: `npx vitest run lib/order.test.ts`
Expected: FAIL, cannot resolve `./order`.

- [ ] **Step 3: Create `lib/order.ts`**

```ts
// Notes are ordered by a fractional `position`; moving one only rewrites it.
export const MIN_GAP = 1e-6;

export const positionBetween = (before: number | null, after: number | null): number => {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
};

// After many moves into the same gap, floats run out of room between two
// neighbours; then all positions are renumbered first.
export const needsRenumber = (before: number | null, after: number | null) =>
  before !== null && after !== null && Math.abs(after - before) < MIN_GAP;

export const moveToIndex = (ids: string[], id: string, index: number): string[] => {
  const rest = ids.filter((x) => x !== id);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
};

// Moves `activeId` into the slot `overId` occupies.
export const moveId = (ids: string[], activeId: string, overId: string): string[] => {
  if (!ids.includes(activeId) || !ids.includes(overId)) return ids;
  return moveToIndex(ids, activeId, ids.indexOf(overId));
};

export const neighbors = (ids: string[], id: string) => {
  const index = ids.indexOf(id);
  return {
    beforeId: index > 0 ? ids[index - 1] : null,
    afterId: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
  };
};
```

Run: `npx vitest run lib/order.test.ts`
Expected: PASS.

- [ ] **Step 4: Write failing tests `lib/masonry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { assignColumns, columnCountFor, gapFor } from './masonry';

describe('columnCountFor', () => {
  it('fits columns of at least 160px, between 1 and 4', () => {
    expect(columnCountFor(0)).toBe(1);
    expect(columnCountFor(300)).toBe(1);
    expect(columnCountFor(343)).toBe(2);
    expect(columnCountFor(700)).toBe(4);
    expect(columnCountFor(1248)).toBe(4);
  });
});

describe('gapFor', () => {
  it('uses a tighter gap on small screens', () => {
    expect(gapFor(343)).toBe(10);
    expect(gapFor(800)).toBe(16);
  });
});

describe('assignColumns', () => {
  it('fills left to right, then the shortest column', () => {
    expect(assignColumns([100, 50, 80, 30, 40], 3)).toEqual([[0], [1, 3], [2, 4]]);
  });
  it('sends ties to the leftmost column', () => {
    expect(assignColumns([0, 0, 0, 0], 2)).toEqual([[0, 2], [1, 3]]);
  });
  it('puts everything in one column', () => {
    expect(assignColumns([5, 5], 1)).toEqual([[0, 1]]);
  });
});
```

Run: `npx vitest run lib/masonry.test.ts`
Expected: FAIL, cannot resolve `./masonry`.

- [ ] **Step 5: Create `lib/masonry.ts`**

```ts
const MIN_COLUMN = 160;
const MAX_COLUMNS = 4;

export const gapFor = (width: number) => (width < 600 ? 10 : 16);

export const columnCountFor = (width: number) => {
  const gap = gapFor(width);
  const fit = Math.floor((width + gap) / (MIN_COLUMN + gap));
  return Math.max(1, Math.min(MAX_COLUMNS, fit));
};

// Each card goes into the currently shortest column, so the board reads
// left to right. Returns card indexes per column.
export const assignColumns = (heights: number[], columnCount: number): number[][] => {
  const columns: number[][] = Array.from({ length: columnCount }, () => []);
  const totals = new Array<number>(columnCount).fill(0);
  heights.forEach((height, index) => {
    let target = 0;
    for (let c = 1; c < columnCount; c += 1) {
      if (totals[c] < totals[target]) target = c;
    }
    columns[target].push(index);
    totals[target] += height;
  });
  return columns;
};
```

Run: `npx vitest run lib/masonry.test.ts`
Expected: PASS.

- [ ] **Step 6: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass.

```bash
git add package.json package-lock.json lib/order.ts lib/order.test.ts lib/masonry.ts lib/masonry.test.ts
git commit -m "Add position and masonry helpers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Note positions in the data layer

**Files:**
- Modify: `lib/types.ts`, `lib/testUtils.ts`, `lib/db.ts`, `lib/migrate.ts`, `lib/notes.ts`, `lib/filters.ts`
- Test: `lib/db.test.ts` (create), `lib/notes.test.ts`, `lib/filters.test.ts`, `lib/migrate.test.ts`

**Interfaces:**
- Consumes: `positionBetween`, `needsRenumber` (Task 1).
- Produces:
  - `Note.position: number`; `NoteChanges` now includes `position`.
  - `lib/notes.ts`: `moveNote(id: string, beforeId: string | null, afterId: string | null): Promise<void>`; `getAllData(): Promise<{ notes: Note[]; labels: Label[] }>`; `createNote` accepts optional `position`.
  - `lib/filters.ts`: `isReorderable(filter: BoardFilter): boolean`; board sections sorted by `position` ascending, ties by `updatedAt` descending.

- [ ] **Step 1: Add the field**

In `lib/types.ts`, add to `Note` after `updatedAt: number;`:

```ts
  position: number; // board order; lower comes first
```

and change `NoteChanges` to:

```ts
export type NoteChanges = Partial<
  Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived' | 'position'>
>;
```

In `lib/testUtils.ts`, add `position: 0,` after `updatedAt: 0,`.

Run: `npx tsc --noEmit`
Expected: errors only in `lib/notes.ts` (`createNote` object literal) and `lib/migrate.ts` (`toNote`), which the next steps fix.

- [ ] **Step 2: Write failing tests `lib/db.test.ts`**

```ts
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db } from './db';

describe('schema v2 upgrade', () => {
  it('gives existing notes positions in newest-first order', async () => {
    db.close();
    await Dexie.delete('noteboard');
    const v1 = new Dexie('noteboard');
    v1.version(1).stores({ notes: 'id, updatedAt, trashedAt, *labelIds', labels: 'id, &name' });
    await v1.table('notes').bulkAdd([
      { id: 'old', updatedAt: 1 },
      { id: 'new', updatedAt: 5 },
      { id: 'mid', updatedAt: 3 },
    ]);
    v1.close();

    await db.open();
    const ordered = await db.notes.orderBy('position').toArray();
    expect(ordered.map((n) => [n.id, n.position])).toEqual([
      ['new', 0],
      ['mid', 1],
      ['old', 2],
    ]);
  });
});
```

Run: `npx vitest run lib/db.test.ts`
Expected: FAIL (`KeyPath position on object store notes is not indexed`, or similar).

- [ ] **Step 3: Add schema v2 in `lib/db.ts`**

Replace the `db.version(1)…` block with:

```ts
// IndexedDB can't index booleans or null, so `pinned` and `archived` are
// filtered in memory, and only notes in Trash appear in the trashedAt index.
db.version(1).stores({
  notes: 'id, updatedAt, trashedAt, *labelIds',
  labels: 'id, &name',
});

// v2: manual board order. Existing notes keep today's newest-first order.
db.version(2)
  .stores({
    notes: 'id, updatedAt, trashedAt, position, *labelIds',
    labels: 'id, &name',
  })
  .upgrade(async (tx) => {
    const notes = await tx.table('notes').orderBy('updatedAt').reverse().toArray();
    await Promise.all(notes.map((note, index) => tx.table('notes').update(note.id, { position: index })));
  });
```

Run: `npx vitest run lib/db.test.ts`
Expected: PASS.

- [ ] **Step 4: Give migrated notes positions**

In `lib/migrate.test.ts`, in the first test's `toMatchObject` for `'a'` add `position: 0,` and add after the `updatedAt` check for `'b'`:

```ts
    expect((await db.notes.get('b'))?.position).toBe(1);
```

Run: `npx vitest run lib/migrate.test.ts`
Expected: FAIL (`position` undefined).

In `lib/migrate.ts`, change `toNote` to take the position and set it:

```ts
const toNote = (entry: Record<string, unknown>, timestamp: number, position: number): Note => ({
```

add `position,` after `updatedAt: timestamp,`, and change the map call:

```ts
  const notes = parsed.filter(isRecord).map((entry, index) => toNote(entry, now - index, index));
```

Run: `npx vitest run lib/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing tests in `lib/notes.test.ts`**

Add `moveNote` to the import list from `./notes`, then append:

```ts
describe('positions', () => {
  const order = async () => (await db.notes.orderBy('position').toArray()).map((n) => n.id);

  it('puts new notes and copies at the top', async () => {
    const a = await createNote({ id: 'a', kind: 'note', title: 'A' });
    const b = await createNote({ id: 'b', kind: 'note', title: 'B' });
    expect(b.position).toBeLessThan(a.position);
    await duplicateNote('a');
    expect((await order())[0]).not.toBe('b');
  });

  it('keeps its place when edited', async () => {
    const a = await createNote({ id: 'a', kind: 'note', position: 5 });
    await updateNote('a', { title: 'Changed', color: 'blue', content: 'x' });
    expect((await db.notes.get('a'))?.position).toBe(a.position);
  });

  it('moves a note to the top when pinned or unpinned', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await togglePin('b');
    expect(await order()).toEqual(['b', 'a']);
    await togglePin('a');
    expect(await order()).toEqual(['a', 'b']);
  });

  it('moves restored and unarchived notes to the top', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await createNote({ id: 'c', kind: 'note', position: 2 });
    await trashNote('b');
    await restoreNote('b');
    expect((await order())[0]).toBe('b');
    await setArchived('c', true);
    await setArchived('c', false);
    expect((await order())[0]).toBe('c');
  });

  it('moves a note between two others', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await createNote({ id: 'c', kind: 'note', position: 2 });
    await moveNote('c', 'a', 'b');
    expect(await order()).toEqual(['a', 'c', 'b']);
    await moveNote('a', 'b', null);
    expect(await order()).toEqual(['c', 'b', 'a']);
    await moveNote('a', null, 'c');
    expect(await order()).toEqual(['a', 'c', 'b']);
  });

  it('does not count a move as an edit', async () => {
    await createNote({ id: 'a', kind: 'note', position: 0 });
    await createNote({ id: 'b', kind: 'note', position: 1 });
    await db.notes.update('a', { updatedAt: 1000 });
    await moveNote('a', 'b', null);
    expect((await db.notes.get('a'))?.updatedAt).toBe(1000);
  });

  it('renumbers without changing the order of other notes', async () => {
    await createNote({ id: 'a', kind: 'note', position: 1 });
    await createNote({ id: 'hidden', kind: 'note', position: 1 + 1e-7 });
    await createNote({ id: 'b', kind: 'note', position: 1 + 2e-7 });
    await createNote({ id: 'z', kind: 'note', position: 9 });
    // In a filtered view showing a, b and z, drop z between a and b.
    await moveNote('z', 'a', 'b');
    const ids = await order();
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('hidden'));
    expect(ids.indexOf('hidden')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('z'));
    expect(ids.indexOf('z')).toBeLessThan(ids.indexOf('b'));
  });
});
```

Run: `npx vitest run lib/notes.test.ts`
Expected: FAIL (`moveNote` is not exported; positions undefined).

- [ ] **Step 6: Implement positions in `lib/notes.ts`**

Add the import:

```ts
import { needsRenumber, positionBetween } from './order';
```

After `afterWrite`, add:

```ts
// A position above every note, so it lands at the top of its section.
const nextTopPosition = async () => {
  const first = await db.notes.orderBy('position').first();
  return first ? first.position - 1 : 0;
};
```

In `createNote`, add before `const note: Note = {`:

```ts
  const position = input.position ?? (await nextTopPosition());
```

and add `position,` after `updatedAt: now,` in the object.

Replace `updateNote` with:

```ts
export const updateNote = async (id: string, changes: NoteChanges) => {
  const next = normalize(changes);
  const current = await db.notes.get(id);
  const patch: NoteChanges & { updatedAt: number } = { ...next, updatedAt: Date.now() };
  // Pinning, unpinning and unarchiving bring the note to the top of the
  // section it lands in; ordinary edits leave it where the user put it.
  const pinChanged = next.pinned !== undefined && next.pinned !== current?.pinned;
  const unarchived = next.archived === false && current?.archived === true;
  if (current && next.position === undefined && (pinChanged || unarchived)) {
    patch.position = await nextTopPosition();
  }
  await db.notes.update(id, patch);
  await afterWrite();
};
```

Replace `restoreNote` with:

```ts
export const restoreNote = async (id: string) => {
  await db.notes.update(id, { trashedAt: null, position: await nextTopPosition() });
  await afterWrite();
};
```

Add after `restoreSnapshot`:

```ts
// Places a note between two neighbours (null = start or end of the list).
// Not an edit, so `updatedAt` is unchanged.
export const moveNote = async (id: string, beforeId: string | null, afterId: string | null) => {
  await db.transaction('rw', db.notes, async () => {
    const find = async (noteId: string | null) => (noteId ? ((await db.notes.get(noteId))?.position ?? null) : null);
    let before = await find(beforeId);
    let after = await find(afterId);
    if (needsRenumber(before, after)) {
      const all = await db.notes.orderBy('position').toArray();
      await Promise.all(all.map((note, index) => db.notes.update(note.id, { position: index })));
      before = await find(beforeId);
      after = await find(afterId);
    }
    await db.notes.update(id, { position: positionBetween(before, after) });
  });
};

export const getAllData = async () => {
  const [notes, labels] = await Promise.all([db.notes.toArray(), db.labels.toArray()]);
  return { notes, labels };
};
```

Run: `npx vitest run lib/notes.test.ts`
Expected: PASS (all old tests plus 7 new).

- [ ] **Step 7: Write failing tests in `lib/filters.test.ts`**

Add `isReorderable` to the import from `./filters`. Replace the test `'splits pinned from others, newest first'` with:

```ts
  it('splits pinned from others, in board order', () => {
    const a = makeNote({ id: 'a', position: 3, updatedAt: 9 });
    const b = makeNote({ id: 'b', position: 2, pinned: true });
    const c = makeNote({ id: 'c', position: 1 });
    const d = makeNote({ id: 'd', position: 0, pinned: true });
    const result = selectBoardNotes([a, b, c, d], [], all);
    expect(result.pinned.map((n) => n.id)).toEqual(['d', 'b']);
    expect(result.others.map((n) => n.id)).toEqual(['c', 'a']);
  });
  it('breaks position ties by most recent edit', () => {
    const a = makeNote({ id: 'a', position: 1, updatedAt: 1 });
    const b = makeNote({ id: 'b', position: 1, updatedAt: 2 });
    expect(selectBoardNotes([a, b], [], all).others.map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('keeps archive newest first', () => {
    const a = makeNote({ id: 'a', archived: true, position: 0, updatedAt: 1 });
    const b = makeNote({ id: 'b', archived: true, position: 1, updatedAt: 2 });
    const result = selectBoardNotes([a, b], [], { ...all, view: 'archive' });
    expect(result.others.map((n) => n.id)).toEqual(['b', 'a']);
  });
```

Append:

```ts
describe('isReorderable', () => {
  it('allows dragging on the board and its filters, not archive, trash or search', () => {
    expect(isReorderable(all)).toBe(true);
    expect(isReorderable({ ...all, view: 'lists' })).toBe(true);
    expect(isReorderable({ ...all, labelId: 'l1' })).toBe(true);
    expect(isReorderable({ ...all, view: 'archive' })).toBe(false);
    expect(isReorderable({ ...all, view: 'trash' })).toBe(false);
    expect(isReorderable({ ...all, query: 'milk' })).toBe(false);
    expect(isReorderable({ ...all, query: '  ' })).toBe(true);
  });
});
```

Run: `npx vitest run lib/filters.test.ts`
Expected: FAIL (`isReorderable` not exported; order by updatedAt).

- [ ] **Step 8: Sort by position in `lib/filters.ts`**

Replace the end of `selectBoardNotes` (from `const byRecent`) with:

```ts
  if (filter.view === 'archive') {
    return { pinned: [], others: visible.sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  const byPosition = visible.sort((a, b) => a.position - b.position || b.updatedAt - a.updatedAt);
  return { pinned: byPosition.filter((n) => n.pinned), others: byPosition.filter((n) => !n.pinned) };
};

export const isReorderable = (filter: BoardFilter) =>
  (filter.view === 'all' || filter.view === 'notes' || filter.view === 'lists') && filter.query.trim() === '';
```

Run: `npx vitest run lib/filters.test.ts`
Expected: PASS.

- [ ] **Step 9: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

```bash
git add lib/types.ts lib/testUtils.ts lib/db.ts lib/db.test.ts lib/migrate.ts lib/migrate.test.ts lib/notes.ts lib/notes.test.ts lib/filters.ts lib/filters.test.ts
git commit -m "Store a manual board order for notes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Draggable masonry board

**Files:**
- Replace: `components/board/NoteGrid.tsx`, `components/board/NoteGrid.module.css`
- Modify: `components/board/NoteCard.tsx`, `pages/index.tsx`
- Test: `components/board/NoteGrid.test.tsx`

**Interfaces:**
- Consumes: `assignColumns`, `columnCountFor`, `gapFor`, `moveId`, `moveToIndex`, `neighbors`, `moveNote`, `isReorderable`.
- Produces:
  - `NoteGrid` props: `{ notes: Note[]; labelNames: Map<string, string>; mode: CardMode; onOpen: (id: string) => void; reorderable: boolean }`
  - `NoteCard` gains optional `dragHandle?: ReactNode`, rendered first in the actions row.

- [ ] **Step 1: Write failing tests `components/board/NoteGrid.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NoteGrid from './NoteGrid';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const threeNotes = () =>
  Promise.all([
    createNote({ id: 'a', kind: 'note', title: 'A', position: 0 }),
    createNote({ id: 'b', kind: 'note', title: 'B', position: 1 }),
    createNote({ id: 'c', kind: 'note', title: 'C', position: 2 }),
  ]);

const savedOrder = async () => (await db.notes.orderBy('position').toArray()).map((n) => n.id);

describe('NoteGrid', () => {
  it('moves a note with the arrow keys and saves the order', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    const handle = screen.getByRole('button', { name: 'Move A' });
    handle.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'a', 'c']));
    expect(screen.getByRole('status')).toHaveTextContent('Moved A to position 2 of 3');
    expect(handle).toHaveFocus();
  });

  it('moves a note to the end with End', async () => {
    const notes = await threeNotes();
    const user = userEvent.setup();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable />);
    screen.getByRole('button', { name: 'Move A' }).focus();
    await user.keyboard('{End}');
    await waitFor(async () => expect(await savedOrder()).toEqual(['b', 'c', 'a']));
  });

  it('offers no drag handle when reordering is off', async () => {
    const notes = await threeNotes();
    render(<NoteGrid notes={notes} labelNames={new Map()} mode='board' onOpen={vi.fn()} reorderable={false} />);
    expect(screen.queryByRole('button', { name: 'Move A' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open note: A' })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run components/board/NoteGrid.test.tsx`
Expected: FAIL (no `reorderable` handling; no "Move A" button).

- [ ] **Step 2: Add the handle slot to `components/board/NoteCard.tsx`**

Change the React import to:

```tsx
import { useId, type ReactNode } from 'react';
```

Add to `Props`:

```tsx
  dragHandle?: ReactNode;
```

Destructure it: `const NoteCard = ({ note, labelNames, mode, onOpen, dragHandle }: Props) => {`

Insert `{dragHandle}` as the first child of `<div className={styles.actions}>`:

```tsx
      <div className={styles.actions}>
        {dragHandle}
```

- [ ] **Step 3: Replace `components/board/NoteGrid.tsx`**

```tsx
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { assignColumns, columnCountFor, gapFor } from '../../lib/masonry';
import { moveNote } from '../../lib/notes';
import { moveId, moveToIndex, neighbors } from '../../lib/order';
import type { Note } from '../../lib/types';
import IconButton from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import NoteCard, { type CardMode } from './NoteCard';
import styles from './NoteGrid.module.css';

type Size = { width: number; height: number };
type Measure = (el: HTMLElement | null) => (() => void) | undefined;

const GRID_KEY = '__grid';

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
      return () => observer.unobserve(el);
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

type Props = {
  notes: Note[];
  labelNames: Map<string, string>;
  mode: CardMode;
  onOpen: (id: string) => void;
  reorderable: boolean;
};

const KEY_TARGETS: Record<string, (index: number, last: number) => number> = {
  ArrowUp: (i) => i - 1,
  ArrowLeft: (i) => i - 1,
  ArrowDown: (i) => i + 1,
  ArrowRight: (i) => i + 1,
  Home: () => 0,
  End: (_, last) => last,
};

const NoteGrid = ({ notes, labelNames, mode, onOpen, reorderable }: Props) => {
  const toast = useToast();
  const hintId = useId();
  const [sizes, measure] = useSizes();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Order shown while dragging or saving; ignored once `notes` changes.
  const [preview, setPreview] = useState<{ base: Note[]; ids: string[] } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Reordering moves the card's DOM node, which drops focus; the grip that
  // was used is focused again until the user moves focus elsewhere.
  const refocusId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold, so a normal swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const ids = notes.map((n) => n.id);
  const shownIds = preview && preview.base === notes ? preview.ids : ids;
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
  ).forEach((column, c) => {
    let y = 0;
    for (const index of column) {
      const note = ordered[index];
      placed.set(note.id, { x: c * (columnWidth + gap), y });
      y += (sizes[note.id]?.height ?? 0) + gap;
    }
    height = Math.max(height, y - gap);
  });
  const settled = width > 0 && ordered.every((n) => sizes[n.id]);

  const title = (id: string) => byId.get(id)?.title || 'Untitled';

  const save = async (nextIds: string[], movedId: string) => {
    setAnnouncement(`Moved ${title(movedId)} to position ${nextIds.indexOf(movedId) + 1} of ${nextIds.length}`);
    const { beforeId, afterId } = neighbors(nextIds, movedId);
    try {
      await moveNote(movedId, beforeId, afterId);
    } catch {
      setPreview(null);
      toast({ message: 'Couldn’t save the new order.' });
    }
  };

  const onHandleKeyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = KEY_TARGETS[event.key];
    if (!target) return;
    event.preventDefault();
    const index = ids.indexOf(id);
    const next = target(index, ids.length - 1);
    if (next < 0 || next >= ids.length || next === index) return;
    const nextIds = moveToIndex(ids, id, next);
    refocusId.current = id;
    setPreview({ base: notes, ids: nextIds });
    void save(nextIds, id);
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
      mode={mode}
      onOpen={onOpen}
      labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((name): name is string => !!name)}
      dragHandle={
        withHandle ? (
          <IconButton
            ref={(el) => {
              if (el && refocusId.current === note.id && document.activeElement !== el) el.focus();
            }}
            label={`Move ${note.title || 'Untitled'}`}
            aria-describedby={hintId}
            className={styles.handle}
            onKeyDown={onHandleKeyDown(note.id)}
            onBlur={(e) => {
              // relatedTarget is null when the blur came from moving the node.
              if (e.relatedTarget) refocusId.current = null;
            }}
          >
            <GripVertical size={16} aria-hidden />
          </IconButton>
        ) : undefined
      }
    />
  );

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
                {card(note, reorderable)}
              </Cell>
            );
          })}
        </AnimatePresence>
      </div>
      <DragOverlay>
        {active ? (
          <div className={styles.overlay} style={{ width: columnWidth || undefined }} aria-hidden>
            {card(active, false)}
          </div>
        ) : null}
      </DragOverlay>
      {reorderable && (
        <p id={hintId} className={styles.srOnly}>
          Use the arrow keys to move this note earlier or later.
        </p>
      )}
      <p role='status' className={styles.srOnly}>
        {announcement}
      </p>
    </DndContext>
  );
};

export default NoteGrid;
```

- [ ] **Step 4: Replace `components/board/NoteGrid.module.css`**

```css
/* Masonry: cards are absolutely placed, filled left to right into the
   shortest column (see lib/masonry.ts). */
.grid {
  position: relative;
}

.cell {
  position: absolute;
  top: 0;
  left: 0;
  touch-action: manipulation;
}

.overlay {
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-raised);
  cursor: grabbing;
  transform: rotate(-1.5deg) scale(1.02);
}

@media (prefers-reduced-motion: reduce) {
  .overlay {
    transform: none;
  }
}

.handle {
  margin-right: auto;
  cursor: grab;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

Run: `npx vitest run components/board/NoteGrid.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Pass `reorderable` from the board**

In `pages/index.tsx`, change the filters import to:

```tsx
import { emptyMessage, filterToQuery, isReorderable, parseFilter } from '../lib/filters';
```

After `const headings = …;` add:

```tsx
  const reorderable = isReorderable(filter);
```

and add `reorderable={reorderable}` to both `<NoteGrid … />` elements.

- [ ] **Step 6: Check, verify in the browser, commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

Manual (dev server on 4000, test-data profile):
1. Board loads in left-to-right masonry; no cards overlap; resizing the window reflows 4 → 1 columns.
2. Click a card (no movement): the editor opens.
3. Mouse-drag a card onto another: cards make room while dragging; on drop the order sticks after reload.
4. Edit the moved note's text, go back: it stays in place.
5. In a label view, reorder two notes; in All, their relative order matches.
6. DevTools device emulation (touch): a swipe scrolls; press-and-hold then move drags.
7. Tab to a card's grip, press → twice: the card moves two places; focus stays on the grip.
8. Archive, Trash and a search show no grip and cards don't drag.

```bash
git add components/board/NoteGrid.tsx components/board/NoteGrid.module.css components/board/NoteGrid.test.tsx components/board/NoteCard.tsx pages/index.tsx
git commit -m "Let users drag notes into their own order" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backup format, merge and Markdown

**Files:**
- Create: `lib/backup.ts`
- Test: `lib/backup.test.ts`

**Interfaces:**
- Consumes: `db`, `getAllData`, `refreshHasNotesMarker`, `selectBoardNotes`, `isQuotaError`, `NOTE_COLORS`.
- Produces: `BACKUP_FORMAT`, `BACKUP_VERSION`, `NOT_A_BACKUP`, `NEWER_VERSION`, `BackupError`, `MergeCounts`, `buildBackup(notes, labels, now?)`, `parseBackup(text)`, `planMerge(notes, labels, imported)`, `restoreBackup(text): Promise<MergeCounts>`, `toMarkdown(notes, labels)`, `restoredMessage(counts)`, `restoreErrorMessage(error)`, `backupFileName(date)`, `markdownFileName(date)`.

- [ ] **Step 1: Write failing tests `lib/backup.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  NEWER_VERSION,
  NOT_A_BACKUP,
  backupFileName,
  buildBackup,
  markdownFileName,
  parseBackup,
  planMerge,
  restoreBackup,
  restoreErrorMessage,
  restoredMessage,
  toMarkdown,
} from './backup';
import { db } from './db';
import { createLabel, createNote, getAllData } from './notes';
import { makeNote } from './testUtils';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const file = (value: unknown) => JSON.stringify(value);
const backupOf = (notes: unknown[], labels: unknown[] = [], version = 1) =>
  file({ format: 'noteboard-backup', version, exportedAt: 'x', notes, labels });

describe('buildBackup', () => {
  it('wraps notes and labels with the format and version', () => {
    const note = makeNote({ id: 'a' });
    const backup = buildBackup([note], [{ id: 'l', name: 'Work' }], new Date('2026-10-14T12:00:00Z'));
    expect(backup).toEqual({
      format: 'noteboard-backup',
      version: 1,
      exportedAt: '2026-10-14T12:00:00.000Z',
      notes: [note],
      labels: [{ id: 'l', name: 'Work' }],
    });
  });
});

describe('parseBackup', () => {
  it('rejects files that are not backups', () => {
    for (const text of ['{oops', file([]), file({ format: 'other', version: 1, notes: [], labels: [] }), file({ format: 'noteboard-backup', version: 1, notes: {}, labels: [] })]) {
      expect(() => parseBackup(text)).toThrow(new BackupError(NOT_A_BACKUP));
    }
  });

  it('rejects backups from a newer version', () => {
    expect(() => parseBackup(backupOf([], [], 2))).toThrow(new BackupError(NEWER_VERSION));
  });

  it('skips broken entries and fills defaults', () => {
    const { notes, labels } = parseBackup(
      backupOf(
        [null, 7, { id: 'a', kind: 'weird', color: 'neon', title: 5, items: 'x', pinned: true, archived: true }],
        [{ id: 'l', name: '  Work ' }, { id: 'm' }, 'x'],
      ),
    );
    expect(labels).toEqual([{ id: 'l', name: 'Work' }]);
    expect(notes).toEqual([
      {
        id: 'a',
        kind: 'note',
        title: '',
        content: '',
        items: [],
        color: 'default',
        labelIds: [],
        pinned: false,
        archived: true,
        trashedAt: null,
        createdAt: 0,
        updatedAt: 0,
        position: null,
      },
    ]);
  });

  it('keeps the newest copy of a note that appears twice', () => {
    const { notes } = parseBackup(backupOf([{ id: 'a', title: 'old', updatedAt: 1 }, { id: 'a', title: 'new', updatedAt: 2 }]));
    expect(notes.map((n) => n.title)).toEqual(['new']);
  });
});

describe('planMerge', () => {
  it('adds new notes and places ones without a position after the last note', () => {
    const local = [makeNote({ id: 'x', position: 4 })];
    const imported = parseBackup(backupOf([{ id: 'a', position: 0 }, { id: 'b' }]));
    const plan = planMerge(local, [], imported);
    expect(plan.notes.map((n) => [n.id, n.position])).toEqual([
      ['a', 0],
      ['b', 5],
    ]);
    expect(plan.counts).toEqual({ added: 2, updated: 0, unchanged: 0 });
  });

  it('replaces older local notes and keeps newer ones', () => {
    const local = [makeNote({ id: 'a', title: 'local', updatedAt: 5 }), makeNote({ id: 'b', title: 'local', updatedAt: 9 })];
    const imported = parseBackup(backupOf([{ id: 'a', title: 'backup', updatedAt: 7 }, { id: 'b', title: 'backup', updatedAt: 9 }]));
    const plan = planMerge(local, [], imported);
    expect(plan.notes.map((n) => [n.id, n.title])).toEqual([['a', 'backup']]);
    expect(plan.counts).toEqual({ added: 0, updated: 1, unchanged: 1 });
  });

  it('maps labels by name and keeps ids unique', () => {
    const localLabels = [{ id: 'w1', name: 'Work' }];
    const imported = parseBackup(
      backupOf(
        [{ id: 'a', labelIds: ['x', 'h', 'w1', 'gone'] }],
        [
          { id: 'x', name: 'work' },
          { id: 'h', name: 'Home' },
          { id: 'w1', name: 'Other' },
        ],
      ),
    );
    const plan = planMerge([], localLabels, imported);
    const other = plan.labels.find((l) => l.name === 'Other');
    expect(plan.labels.map((l) => l.name)).toEqual(['Home', 'Other']);
    expect(plan.labels.find((l) => l.name === 'Home')?.id).toBe('h');
    expect(other?.id).not.toBe('w1');
    expect(plan.notes[0].labelIds).toEqual(['w1', 'h', other?.id]);
  });
});

describe('restoreBackup', () => {
  it('restores a backup into an empty database exactly', async () => {
    const work = await createLabel('Work');
    await createNote({ id: 'a', kind: 'list', title: 'List', items: [{ id: 'i', text: 'Milk', done: true }], labelIds: [work.id] });
    await createNote({ id: 'b', kind: 'note', title: 'Note', archived: true });
    const before = await getAllData();
    const text = JSON.stringify(buildBackup(before.notes, before.labels));
    await db.delete();
    await db.open();

    expect(await restoreBackup(text)).toEqual({ added: 2, updated: 0, unchanged: 0 });
    const after = await getAllData();
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(after.notes)).toEqual(byId(before.notes));
    expect(byId(after.labels)).toEqual(byId(before.labels));
    expect(localStorage.getItem('hasNotes')).toBe('1');
  });

  it('changes nothing when the same backup is restored twice', async () => {
    await createNote({ id: 'a', kind: 'note', title: 'A' });
    const { notes, labels } = await getAllData();
    const text = JSON.stringify(buildBackup(notes, labels));
    expect(await restoreBackup(text)).toEqual({ added: 0, updated: 0, unchanged: 1 });
  });

  it('changes nothing when the restore fails', async () => {
    const text = backupOf([{ id: 'a', updatedAt: 1 }], [{ id: 'l', name: 'Work' }]);
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(restoreBackup(text)).rejects.toThrow('boom');
    expect(await db.labels.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });
});

describe('toMarkdown', () => {
  it('writes active notes in board order, then archived ones', () => {
    const labels = [{ id: 'l1', name: 'Home' }];
    const notes = [
      makeNote({ id: 'p', kind: 'note', title: 'Plan', content: 'Book hotel\nPack', position: 1 }),
      makeNote({
        id: 'g',
        kind: 'list',
        title: 'Groceries',
        pinned: true,
        labelIds: ['l1'],
        position: 5,
        items: [
          { id: '1', text: 'Bread', done: true },
          { id: '2', text: 'Milk', done: false },
        ],
      }),
      makeNote({ id: 'u', kind: 'note', title: '', content: 'Idea', position: 2 }),
      makeNote({ id: 'o', kind: 'note', title: 'Old', content: 'Done', archived: true }),
      makeNote({ id: 't', kind: 'note', title: 'Gone', content: 'x', trashedAt: 1 }),
    ];
    expect(toMarkdown(notes, labels)).toBe(
      [
        '## Groceries\nLabels: Home\n\n- [ ] Milk\n- [x] Bread',
        '## Plan\n\nBook hotel\nPack',
        '## Untitled\n\nIdea',
        '# Archived\n\n## Old\n\nDone',
      ].join('\n\n---\n\n') + '\n',
    );
  });

  it('is empty with no notes', () => {
    expect(toMarkdown([], [])).toBe('');
  });
});

describe('messages and file names', () => {
  it('summarises a restore', () => {
    expect(restoredMessage({ added: 8, updated: 3, unchanged: 1 })).toBe(
      'Restored 12 notes: 8 added, 3 updated, 1 already up to date',
    );
    expect(restoredMessage({ added: 1, updated: 0, unchanged: 0 })).toBe(
      'Restored 1 note: 1 added, 0 updated, 0 already up to date',
    );
    expect(restoredMessage({ added: 0, updated: 0, unchanged: 0 })).toBe('That backup has no notes.');
  });

  it('explains restore errors', () => {
    expect(restoreErrorMessage(new BackupError(NOT_A_BACKUP))).toBe(NOT_A_BACKUP);
    expect(restoreErrorMessage({ name: 'QuotaExceededError' })).toBe('Couldn’t restore: storage is full.');
    expect(restoreErrorMessage(new Error('x'))).toBe('Couldn’t restore that backup.');
  });

  it('names files with the local date', () => {
    const date = new Date(2026, 0, 5, 23, 30);
    expect(backupFileName(date)).toBe('noteboard-backup-2026-01-05.json');
    expect(markdownFileName(date)).toBe('noteboard-notes-2026-01-05.md');
  });
});
```

Run: `npx vitest run lib/backup.test.ts`
Expected: FAIL, cannot resolve `./backup`.

- [ ] **Step 2: Create `lib/backup.ts`**

```ts
import { v4 as uuid } from 'uuid';
import { db } from './db';
import { selectBoardNotes } from './filters';
import { refreshHasNotesMarker } from './notes';
import { isQuotaError } from './storage';
import { NOTE_COLORS, type ChecklistItem, type Label, type Note, type NoteColor } from './types';

export const BACKUP_FORMAT = 'noteboard-backup';
export const BACKUP_VERSION = 1;
export const NOT_A_BACKUP = 'That file isn’t a Noteboard backup.';
export const NEWER_VERSION = 'This backup is from a newer version of Noteboard.';

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  notes: Note[];
  labels: Label[];
};

// Position is filled in during the merge when the backup has none.
export type ImportedNote = Omit<Note, 'position'> & { position: number | null };
export type ImportedBackup = { notes: ImportedNote[]; labels: Label[] };
export type MergeCounts = { added: number; updated: number; unchanged: number };

export class BackupError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toItem = (value: unknown): ChecklistItem | null =>
  isRecord(value)
    ? { id: typeof value.id === 'string' && value.id ? value.id : uuid(), text: text(value.text), done: value.done === true }
    : null;

const toNote = (entry: Record<string, unknown>): ImportedNote => {
  const updatedAt = finite(entry.updatedAt) ?? 0;
  const archived = entry.archived === true;
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(),
    kind: entry.kind === 'list' ? 'list' : 'note',
    title: text(entry.title),
    content: text(entry.content),
    items: Array.isArray(entry.items) ? entry.items.map(toItem).filter((i): i is ChecklistItem => i !== null) : [],
    color: NOTE_COLORS.includes(entry.color as NoteColor) ? (entry.color as NoteColor) : 'default',
    labelIds: Array.isArray(entry.labelIds) ? entry.labelIds.filter((id): id is string => typeof id === 'string') : [],
    // Archived notes can't be pinned (see lib/notes.ts).
    pinned: entry.pinned === true && !archived,
    archived,
    trashedAt: finite(entry.trashedAt),
    createdAt: finite(entry.createdAt) ?? updatedAt,
    updatedAt,
    position: finite(entry.position),
  };
};

const toLabel = (entry: Record<string, unknown>): Label | null => {
  const name = text(entry.name).trim();
  if (!name) return null;
  return { id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(), name };
};

export const buildBackup = (notes: Note[], labels: Label[], now = new Date()): Backup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  notes,
  labels,
});

export const parseBackup = (contents: string): ImportedBackup => {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new BackupError(NOT_A_BACKUP);
  }
  if (
    !isRecord(data) ||
    data.format !== BACKUP_FORMAT ||
    typeof data.version !== 'number' ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.labels)
  ) {
    throw new BackupError(NOT_A_BACKUP);
  }
  if (data.version > BACKUP_VERSION) throw new BackupError(NEWER_VERSION);

  const notes = new Map<string, ImportedNote>();
  for (const note of data.notes.filter(isRecord).map(toNote)) {
    const seen = notes.get(note.id);
    if (!seen || note.updatedAt > seen.updatedAt) notes.set(note.id, note);
  }
  const labels = data.labels
    .filter(isRecord)
    .map(toLabel)
    .filter((l): l is Label => l !== null);
  return { notes: [...notes.values()], labels };
};

const labelKey = (name: string) => name.trim().toLowerCase();

// Works out what a restore writes. Nothing local is ever deleted.
export const planMerge = (localNotes: Note[], localLabels: Label[], imported: ImportedBackup) => {
  const byName = new Map(localLabels.map((l) => [labelKey(l.name), l]));
  const takenIds = new Set(localLabels.map((l) => l.id));
  const labelIdMap = new Map<string, string>();
  const labels: Label[] = [];
  for (const label of imported.labels) {
    const match = byName.get(labelKey(label.name));
    if (match) {
      labelIdMap.set(label.id, match.id);
      continue;
    }
    const added = { id: takenIds.has(label.id) ? uuid() : label.id, name: label.name };
    labels.push(added);
    byName.set(labelKey(added.name), added);
    takenIds.add(added.id);
    labelIdMap.set(label.id, added.id);
  }

  const local = new Map(localNotes.map((n) => [n.id, n]));
  let lastPosition = localNotes.reduce((max, n) => Math.max(max, n.position), -1);
  const notes: Note[] = [];
  const counts: MergeCounts = { added: 0, updated: 0, unchanged: 0 };
  for (const note of imported.notes) {
    const current = local.get(note.id);
    if (current && current.updatedAt >= note.updatedAt) {
      counts.unchanged += 1;
      continue;
    }
    const labelIds = [
      ...new Set(note.labelIds.map((id) => labelIdMap.get(id)).filter((id): id is string => !!id)),
    ];
    const position = note.position ?? (lastPosition += 1);
    notes.push({ ...note, labelIds, position });
    if (current) counts.updated += 1;
    else counts.added += 1;
  }
  return { labels, notes, counts };
};

// All or nothing: a failure leaves the database unchanged.
export const restoreBackup = async (contents: string): Promise<MergeCounts> => {
  const imported = parseBackup(contents);
  const counts = await db.transaction('rw', db.notes, db.labels, async () => {
    const [notes, labels] = await Promise.all([db.notes.toArray(), db.labels.toArray()]);
    const plan = planMerge(notes, labels, imported);
    await db.labels.bulkAdd(plan.labels);
    await db.notes.bulkPut(plan.notes);
    return plan.counts;
  });
  await refreshHasNotesMarker();
  return counts;
};

const SEPARATOR = '\n\n---\n\n';

export const toMarkdown = (notes: Note[], labels: Label[]): string => {
  const names = new Map(labels.map((l) => [l.id, l.name]));
  const block = (note: Note) => {
    const head = [`## ${note.title.trim() || 'Untitled'}`];
    const noteLabels = note.labelIds.map((id) => names.get(id)).filter((n): n is string => !!n);
    if (noteLabels.length > 0) head.push(`Labels: ${noteLabels.join(', ')}`);
    const body =
      note.kind === 'note'
        ? note.content.trimEnd()
        : [...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)]
            .map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`)
            .join('\n');
    return body.trim() ? `${head.join('\n')}\n\n${body}` : head.join('\n');
  };

  const board = selectBoardNotes(notes, labels, { view: 'all', labelId: null, query: '' });
  const archived = selectBoardNotes(notes, labels, { view: 'archive', labelId: null, query: '' }).others;
  const sections = [[...board.pinned, ...board.others].map(block).join(SEPARATOR)];
  if (archived.length > 0) sections.push(`# Archived\n\n${archived.map(block).join(SEPARATOR)}`);
  const output = sections.filter(Boolean).join(SEPARATOR);
  return output ? `${output}\n` : '';
};

export const restoredMessage = ({ added, updated, unchanged }: MergeCounts) => {
  const total = added + updated + unchanged;
  if (total === 0) return 'That backup has no notes.';
  return `Restored ${total} ${total === 1 ? 'note' : 'notes'}: ${added} added, ${updated} updated, ${unchanged} already up to date`;
};

export const restoreErrorMessage = (error: unknown) => {
  if (error instanceof BackupError) return error.message;
  if (isQuotaError(error)) return 'Couldn’t restore: storage is full.';
  return 'Couldn’t restore that backup.';
};

const dateStamp = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

export const backupFileName = (date: Date) => `noteboard-backup-${dateStamp(date)}.json`;
export const markdownFileName = (date: Date) => `noteboard-notes-${dateStamp(date)}.md`;
```

Run: `npx vitest run lib/backup.test.ts`
Expected: PASS.

- [ ] **Step 3: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass.

```bash
git add lib/backup.ts lib/backup.test.ts
git commit -m "Add backup, restore merge and Markdown export" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Backup menu, downloads and verification

**Files:**
- Create: `lib/download.ts`
- Modify: `lib/backup.ts`, `components/board/MoreMenu.tsx`, `components/board/FilterChips.tsx`, `pages/index.tsx`, `README.md`
- Test: `lib/download.test.ts`, `components/board/Home.test.tsx`

**Interfaces:**
- Consumes: Task 4 exports, `getAllData`.
- Produces: `downloadFile(name: string, contents: string, type: string)`; `downloadBackup(now?)`, `downloadMarkdown(now?)` in `lib/backup.ts`; `MoreMenu` and `FilterChips` gain `onBackup`, `onRestore`, `onExport: () => void`.

- [ ] **Step 1: Write failing test `lib/download.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadFile', () => {
  it('saves contents under the given name and frees the URL', async () => {
    vi.useFakeTimers();
    const create = vi.fn((blob: Blob) => (blob instanceof Blob ? 'blob:file' : ''));
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('notes.md');
      expect(this.href).toBe('blob:file');
    });

    downloadFile('notes.md', '# Hi', 'text/markdown');

    expect(click).toHaveBeenCalledOnce();
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('# Hi');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:file');
  });
});
```

Run: `npx vitest run lib/download.test.ts`
Expected: FAIL, cannot resolve `./download`.

- [ ] **Step 2: Create `lib/download.ts`**

```ts
// Saves text as a file. The URL is revoked a little later because Safari
// can cancel a download if it is revoked straight after the click.
export const downloadFile = (name: string, contents: string, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
```

Run: `npx vitest run lib/download.test.ts`
Expected: PASS.

- [ ] **Step 3: Add download helpers to `lib/backup.ts`**

Add imports:

```ts
import { downloadFile } from './download';
import { getAllData, refreshHasNotesMarker } from './notes';
```

(replacing the existing `refreshHasNotesMarker` import), and append:

```ts
export const downloadBackup = async (now = new Date()) => {
  const { notes, labels } = await getAllData();
  downloadFile(backupFileName(now), JSON.stringify(buildBackup(notes, labels, now), null, 2), 'application/json');
};

export const downloadMarkdown = async (now = new Date()) => {
  const { notes, labels } = await getAllData();
  downloadFile(markdownFileName(now), toMarkdown(notes, labels), 'text/markdown');
};
```

- [ ] **Step 4: Write a failing board test in `components/board/Home.test.tsx`**

Add `fireEvent` to the Testing Library import, then append inside the `describe('Home')` block:

```tsx
  it('restores a backup chosen in the file picker', async () => {
    const { container } = render(<Home />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const backup = JSON.stringify({
      format: 'noteboard-backup',
      version: 1,
      exportedAt: 'x',
      notes: [{ id: 'r1', title: 'From backup', updatedAt: 5 }],
      labels: [],
    });
    fireEvent.change(input, { target: { files: [new File([backup], 'backup.json', { type: 'application/json' })] } });
    expect(await screen.findByText('From backup')).toBeInTheDocument();
  });
```

Run: `npx vitest run components/board/Home.test.tsx`
Expected: FAIL (no file input).

- [ ] **Step 5: Add the Backup group to `components/board/MoreMenu.tsx`**

Change the lucide import to:

```tsx
import { Archive, Check, Download, EllipsisVertical, FileText, Tags, Trash2, Upload } from 'lucide-react';
```

Extend `Props`:

```tsx
type Props = {
  onArchive: () => void;
  onTrash: () => void;
  onManageLabels: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onExport: () => void;
};
```

Destructure the new props, and insert before the Theme separator:

```tsx
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.label}>Backup</DropdownMenu.Label>
          <DropdownMenu.Item className={styles.item} onSelect={onBackup}>
            <Download size={16} aria-hidden />
            Back up notes
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onRestore}>
            <Upload size={16} aria-hidden />
            Restore from backup…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onExport}>
            <FileText size={16} aria-hidden />
            Export as Markdown
          </DropdownMenu.Item>
```

- [ ] **Step 6: Pass the actions through `components/board/FilterChips.tsx`**

Add to `Props`:

```tsx
  onBackup: () => void;
  onRestore: () => void;
  onExport: () => void;
```

destructure them, and pass to `MoreMenu`:

```tsx
      <MoreMenu
        onArchive={() => onSelect({ view: 'archive', labelId: null })}
        onTrash={() => onSelect({ view: 'trash', labelId: null })}
        onManageLabels={onManageLabels}
        onBackup={onBackup}
        onRestore={onRestore}
        onExport={onExport}
      />
```

- [ ] **Step 7: Wire the board in `pages/index.tsx`**

Change the React import to include `useRef`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
```

Add:

```tsx
import { downloadBackup, downloadMarkdown, restoreBackup, restoreErrorMessage, restoredMessage } from '../lib/backup';
```

After `const [historyKey, setHistoryKey] = useState(0);` add:

```tsx
  const restoreInput = useRef<HTMLInputElement>(null);
```

After `clearTrash`, add:

```tsx
  const backUp = async () => {
    try {
      await downloadBackup();
      toast({ message: 'Backup downloaded' });
    } catch {
      toast({ message: 'Couldn’t create the backup.' });
    }
  };

  const exportMarkdown = async () => {
    try {
      await downloadMarkdown();
      toast({ message: 'Markdown file downloaded' });
    } catch {
      toast({ message: 'Couldn’t export your notes.' });
    }
  };

  const restore = async (file: File) => {
    try {
      toast({ message: restoredMessage(await restoreBackup(await file.text())) });
    } catch (error) {
      toast({ message: restoreErrorMessage(error) });
    }
  };
```

Add the three props to `<FilterChips … />`:

```tsx
        onBackup={() => void backUp()}
        onRestore={() => restoreInput.current?.click()}
        onExport={() => void exportMarkdown()}
```

and before `<LabelsDialog … />` add:

```tsx
      <input
        ref={restoreInput}
        type='file'
        accept='.json,application/json'
        hidden
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void restore(file);
        }}
      />
```

Run: `npx vitest run components/board/Home.test.tsx`
Expected: PASS.

- [ ] **Step 8: Update `README.md`**

In the Features list, replace the first bullet with:

```markdown
- Notes and checklists, with pin, colour, labels, archive and trash (30-day auto-delete, undo)
- Drag cards into your own order (mouse, touch, or the grip button with arrow keys)
- Backup and restore (JSON, merges with what's there) and export as Markdown, from the ⋯ menu
```

In Project Structure, add after the `lib/notes.ts` line:

```markdown
- `lib/backup.ts`: backup format, restore merge and Markdown export; `lib/order.ts` and `lib/masonry.ts`: board order and layout
```

- [ ] **Step 9: Check, verify in the browser, commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

Manual (production build on 9090, fresh origin):
1. ⋯ → Back up notes downloads `noteboard-backup-<today>.json` with `"format": "noteboard-backup"`.
2. ⋯ → Export as Markdown downloads a `.md` file whose contents match the board order.
3. Clear the origin's data (DevTools → Application → Clear site data), reload, ⋯ → Restore from backup… with the file: the toast says "Restored N notes: N added…", notes, labels and order are back.
4. Restore the same file again: "…0 added, 0 updated, N already up to date".
5. Restore a random `.json`: "That file isn't a Noteboard backup."

```bash
git add lib/download.ts lib/download.test.ts lib/backup.ts components/board/MoreMenu.tsx components/board/FilterChips.tsx components/board/Home.test.tsx pages/index.tsx README.md
git commit -m "Add backup, restore and Markdown export to the board menu" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
