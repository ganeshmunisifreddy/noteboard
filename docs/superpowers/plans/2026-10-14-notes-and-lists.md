# Notes and Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Noteboard into a notes-and-checklists app stored in IndexedDB, with a redesigned board, a full-page editor, labels, archive, trash with undo, search and dark mode.

**Architecture:** The data layer (`lib/`) wraps a Dexie database and exposes plain async functions plus live React hooks; pure helpers (filtering, checklist edits, time formatting) sit in their own files and are unit-tested. UI is Radix Primitives styled with CSS Modules and CSS variables from `styles/tokens.css`. Two pages: `/` (board, filter state in the query string) and `/note` (editor, note id in the query string). A small custom service worker serves both pages offline for any query string.

**Tech Stack:** Next.js 16 Pages Router, React 19.3, TypeScript, Dexie 4 + dexie-react-hooks, radix-ui 1.x, lucide-react, framer-motion, CSS Modules, next-pwa 5.6, Vitest 5 + jsdom + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-14-notes-and-lists-design.md`

## Global Constraints

- No server, database service or accounts. All data lives in the browser.
- Keep: Next.js 16 Pages Router, React 19, lucide-react, framer-motion, CSS Modules, next-pwa. Remove `@mui/material`, `@emotion/react`, `@emotion/styled`.
- Text meets WCAG AA contrast; functional text is at least 11px (the smallest token is 12px).
- Code style: single quotes, semicolons, 2-space indent, arrow-function components with `export default` at the bottom (as in `components/NotFound/NotFound.tsx`). `pages/_app.tsx` keeps its existing no-semicolon style.
- `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` pass at the end of every task.
- Never write test data into a browser profile that holds real notes; use a fresh profile or back up `localStorage` and IndexedDB first.
- Commit messages: plain imperative sentence, followed by the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

### Deliberate deviations from the spec

The spec author has seen these; implement as written here.

1. **Indexes:** IndexedDB cannot index booleans or `null`, so `notes` is indexed on `id, updatedAt, trashedAt, *labelIds` only. Pinned/archived filtering happens in memory.
2. **Radix packages:** use the `radix-ui` umbrella package. Checklist checkboxes are native `<input type="checkbox">` styled with `accent-color`; no Radix Checkbox or Tooltip.
3. **New-note URLs** carry the draft's id from the start: `/note?new=note&id=<uuid>`. `/note?new=note` without an id redirects to one with an id. After the first save the URL becomes `/note?id=<uuid>`.
4. **Startup work** (migration, trash purge, `hasNotes` refresh) runs once via `useStartup()` in `lib/startup.ts`, called by both pages and the storage banner, rather than inline in `_app`.
5. **Offline editor:** a custom worker (`worker/index.js`, picked up by next-pwa) caches `/` and `/note` and serves them for any query string, instead of a precache entry.

## Review Focus

1. **Typing in a brand-new note:** the first autosave creates the note and rewrites the URL; the editor must not remount, lose focus or drop characters. Test: Task 8, "keeps the same editor and text when a new note is first saved".
2. **Leaving within the 300 ms autosave delay** (Back, Esc, closing the tab): the last keystrokes must be saved. Test: Task 8, "saves the last keystrokes when the editor closes before the autosave delay".
3. **IndexedDB blocked** (some private modes, disabled storage): the app shows the banner and does not crash. Test: Task 4, "reports unavailable when the database cannot open".
4. **Card controls** (checkbox, ⋯ menu rendered in a portal): using them must not open the editor. Tests: Task 9, "ticks a list item without opening the note" and "deletes from the menu without opening the note".
5. **Filter URLs round-trip:** Back/refresh must restore exactly the same view, label and search. Test: Task 2, "round-trips through the query string".

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `vitest.config.mts`, `vitest.setup.ts` | Create | Test runner config; fake IndexedDB and browser API stubs |
| `lib/types.ts` | Create | `Note`, `ChecklistItem`, `Label`, `NoteColor`, `BoardFilter` types and colour list |
| `lib/checklist.ts` | Create | Pure: `newItem`, `toggleItemIn`, `convertKind`, `isNoteEmpty` |
| `lib/filters.ts` | Create | Pure: URL ↔ filter, view/search matching, board grouping, empty-state text |
| `lib/time.ts` | Create | `formatEdited`, `useNow` |
| `lib/testUtils.ts` | Create | `makeNote` factory for tests |
| `lib/db.ts` | Create | Dexie database `noteboard` |
| `lib/storage.ts` | Create | `hasNotes` marker, persistent-storage request, quota error check |
| `lib/notes.ts` | Replace | All note and label writes; hooks `useBoardNotes`, `useNote`, `useLabels` |
| `lib/migrate.ts` | Create | localStorage → IndexedDB, once |
| `lib/startup.ts` | Create | `runStartup`, `useStartup` |
| `lib/theme.ts` | Create | Theme preference, `useTheme`, `useSystemThemeSync` |
| `lib/routes.ts` | Create | Hrefs, `openEditor`, `leaveEditor`, `markOnBoard` |
| `lib/shortcuts.ts` | Create | `shortcutFor`, `useGlobalShortcuts`, `SEARCH_INPUT_ID` |
| `styles/tokens.css` | Create | CSS variables, light/dark, note colours |
| `styles/globals.css` | Modify | Base styles on tokens |
| `styles/Home.module.css` | Replace | Board page layout |
| `styles/NotePage.module.css` | Create | Editor page loading/missing states |
| `components/ui/*` | Create | `IconButton`, `Menu`, `ColorPicker`, `LabelPicker`, `Toast`, `LabelsDialog`, `StorageBanner` (+ CSS modules) |
| `components/editor/*` | Create | `NoteEditor`, `EditorToolbar`, `NoteBody`, `ChecklistEditor` (+ CSS modules) |
| `components/board/*` | Create | `TopBar`, `FilterChips`, `MoreMenu`, `NoteCard`, `NoteGrid` (+ CSS modules) |
| `components/NotFound/NotFound.module.css` | Modify | Restyle on tokens |
| `pages/index.tsx` | Replace | Board |
| `pages/note.tsx` | Create | Editor page |
| `pages/_app.tsx` | Modify | Tokens, toast provider, banner, shortcuts, theme sync, reduced motion |
| `pages/_document.jsx` | Modify | Theme + `hasNotes` pre-paint script |
| `worker/index.js` | Create | Offline app shell for `/` and `/note` |
| `components/Header.tsx`, `components/Note.tsx`, `components/NoteModal.tsx`, `components/Modal/`, `styles/Note.module.css` | Delete (Task 9) | Old UI |
| `README.md` | Modify | Features, tests, storage |

---

### Task 1: Tooling and dependencies

**Files:**
- Modify: `package.json`, `eslint.config.mjs`
- Create: `vitest.config.mts`, `vitest.setup.ts`, `lib/smoke.test.ts` (deleted again in Step 6)

**Interfaces:**
- Produces: `npm test` runs Vitest in jsdom with `fake-indexeddb/auto`, jest-dom matchers, and stubs for `matchMedia`, `ResizeObserver`, `scrollIntoView` and pointer capture.

- [ ] **Step 1: Swap dependencies**

```bash
npm uninstall @mui/material @emotion/react @emotion/styled
npm install dexie@^4.4.6 dexie-react-hooks@^4.4.0 radix-ui@^1.8.1
npm install -D vitest@^5.0.4 jsdom@^30.1.2 @testing-library/react@^16.3.3 @testing-library/dom@^10 @testing-library/user-event@^14.6.8 @testing-library/jest-dom@^7.0.1 fake-indexeddb@^6.2.5
```

Expected: installs without ERESOLVE errors. `grep -rn "@mui\|@emotion" components pages lib styles` prints nothing.

- [ ] **Step 2: Add the test script**

In `package.json` `scripts`, add after `"lint"`:

```json
    "lint": "eslint .",
    "test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', '.superpowers/**'],
  },
});
```

JSX is compiled with the automatic runtime because `tsconfig.json` has `"jsx": "react-jsx"`; no React plugin is needed.

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom lacks these browser APIs; Radix popovers and menus call them.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
```

- [ ] **Step 5: Ignore brainstorm files in ESLint**

In `eslint.config.mjs`, extend the ignores array:

```js
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", ".superpowers/**"] },
```

- [ ] **Step 6: Prove the runner works, then remove the probe**

Create `lib/smoke.test.ts`:

```ts
import { expect, it } from 'vitest';

it('has IndexedDB', () => {
  expect(typeof indexedDB.open).toBe('function');
});
```

Run: `npm test`
Expected: `1 passed`. Then delete `lib/smoke.test.ts`.

- [ ] **Step 7: Check and commit**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass (the old UI still works; nothing imported MUI).

```bash
git add package.json package-lock.json eslint.config.mjs vitest.config.mts vitest.setup.ts
git commit -m "Set up Vitest and swap MUI for Dexie and Radix" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Types and pure helpers

**Files:**
- Create: `lib/types.ts`, `lib/checklist.ts`, `lib/filters.ts`, `lib/time.ts`, `lib/testUtils.ts`
- Test: `lib/checklist.test.ts`, `lib/filters.test.ts`, `lib/time.test.ts`

**Interfaces:**
- Produces (exact names used later):
  - `lib/types.ts`: `NOTE_COLORS`, `NoteColor`, `COLOR_NAMES`, `NoteKind`, `ChecklistItem`, `Note`, `Label`, `NoteChanges`, `BoardView`, `BoardFilter`
  - `lib/checklist.ts`: `newItem(text?: string): ChecklistItem`, `toggleItemIn(items, itemId): ChecklistItem[]`, `convertKind(note): Pick<Note,'kind'|'content'|'items'>`, `isNoteEmpty(note): boolean`
  - `lib/filters.ts`: `parseFilter(query): BoardFilter`, `filterToQuery(filter): Record<string,string>`, `matchesView(note, filter)`, `matchesQuery(note, query, labelNames)`, `BoardNotes`, `selectBoardNotes(notes, labels, filter): BoardNotes`, `emptyMessage(filter): string`
  - `lib/time.ts`: `formatEdited(timestamp, now): string`, `useNow(intervalMs?): number`
  - `lib/testUtils.ts`: `makeNote(overrides?): Note`

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink', 'purple', 'grey'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const COLOR_NAMES: Record<NoteColor, string> = {
  default: 'Default',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
  grey: 'Grey',
};

export type NoteKind = 'note' | 'list';

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  content: string; // used when kind = 'note'
  items: ChecklistItem[]; // used when kind = 'list'
  color: NoteColor;
  labelIds: string[];
  pinned: boolean;
  archived: boolean;
  trashedAt: number | null; // in Trash when set (ms since epoch)
  createdAt: number;
  updatedAt: number;
};

export type Label = { id: string; name: string };

// Fields the board and editor change directly.
export type NoteChanges = Partial<
  Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived'>
>;

export type BoardView = 'all' | 'notes' | 'lists' | 'archive' | 'trash';

export type BoardFilter = { view: BoardView; labelId: string | null; query: string };
```

- [ ] **Step 2: Create `lib/testUtils.ts`**

```ts
import type { Note } from './types';

let counter = 0;

export const makeNote = (overrides: Partial<Note> = {}): Note => {
  counter += 1;
  return {
    id: `note-${counter}`,
    kind: 'note',
    title: '',
    content: '',
    items: [],
    color: 'default',
    labelIds: [],
    pinned: false,
    archived: false,
    trashedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
};
```

- [ ] **Step 3: Write failing tests `lib/checklist.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { convertKind, isNoteEmpty, newItem, toggleItemIn } from './checklist';

const items = [
  { id: 'a', text: 'Milk', done: false },
  { id: 'b', text: 'Eggs', done: false },
  { id: 'c', text: 'Bread', done: true },
];

describe('newItem', () => {
  it('creates an unticked item with a fresh id', () => {
    const one = newItem('Tea');
    expect(one).toMatchObject({ text: 'Tea', done: false });
    expect(one.id).not.toBe(newItem('Tea').id);
  });
});

describe('toggleItemIn', () => {
  it('ticks an item in place', () => {
    expect(toggleItemIn(items, 'a').map((i) => [i.id, i.done])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
  });

  it('moves an unticked item to the end', () => {
    expect(toggleItemIn(items, 'c').map((i) => [i.id, i.done])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
    const reordered = toggleItemIn(
      [
        { id: 'x', text: 'X', done: true },
        { id: 'y', text: 'Y', done: false },
      ],
      'x',
    );
    expect(reordered.map((i) => i.id)).toEqual(['y', 'x']);
  });

  it('returns the same array for an unknown id', () => {
    expect(toggleItemIn(items, 'nope')).toBe(items);
  });
});

describe('convertKind', () => {
  it('turns non-empty lines into unticked items', () => {
    const result = convertKind({ kind: 'note', content: 'Milk\n\n  \nEggs', items: [] });
    expect(result.kind).toBe('list');
    expect(result.content).toBe('');
    expect(result.items.map((i) => [i.text, i.done])).toEqual([
      ['Milk', false],
      ['Eggs', false],
    ]);
  });

  it('joins items into lines and drops ticks', () => {
    expect(convertKind({ kind: 'list', content: '', items })).toEqual({
      kind: 'note',
      content: 'Milk\nEggs\nBread',
      items: [],
    });
  });
});

describe('isNoteEmpty', () => {
  it('is empty with no title and blank text', () => {
    expect(isNoteEmpty({ kind: 'note', title: ' ', content: '\n', items: [] })).toBe(true);
  });
  it('is not empty with a title', () => {
    expect(isNoteEmpty({ kind: 'list', title: 'Groceries', content: '', items: [] })).toBe(false);
  });
  it('treats a list of blank items as empty', () => {
    expect(isNoteEmpty({ kind: 'list', title: '', content: '', items: [newItem(' ')] })).toBe(true);
    expect(isNoteEmpty({ kind: 'list', title: '', content: '', items: [newItem('Tea')] })).toBe(false);
  });
  it('ignores items on a text note', () => {
    expect(isNoteEmpty({ kind: 'note', title: '', content: '', items: [newItem('Tea')] })).toBe(true);
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run lib/checklist.test.ts`
Expected: FAIL, cannot resolve `./checklist`.

- [ ] **Step 5: Create `lib/checklist.ts`**

```ts
import { v4 as uuid } from 'uuid';
import type { ChecklistItem, Note } from './types';

export const newItem = (text = ''): ChecklistItem => ({ id: uuid(), text, done: false });

// Ticking keeps the item in place (the UI shows it under "completed");
// unticking moves it to the end so it reappears last in the open list.
export const toggleItemIn = (items: ChecklistItem[], itemId: string): ChecklistItem[] => {
  const item = items.find((i) => i.id === itemId);
  if (!item) return items;
  if (!item.done) return items.map((i) => (i.id === itemId ? { ...i, done: true } : i));
  return [...items.filter((i) => i.id !== itemId), { ...item, done: false }];
};

export const convertKind = (
  note: Pick<Note, 'kind' | 'content' | 'items'>,
): Pick<Note, 'kind' | 'content' | 'items'> => {
  if (note.kind === 'note') {
    const items = note.content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => newItem(line));
    return { kind: 'list', content: '', items };
  }
  return { kind: 'note', content: note.items.map((i) => i.text).join('\n'), items: [] };
};

export const isNoteEmpty = (note: Pick<Note, 'kind' | 'title' | 'content' | 'items'>): boolean => {
  if (note.title.trim() !== '') return false;
  if (note.kind === 'note') return note.content.trim() === '';
  return note.items.every((i) => i.text.trim() === '');
};
```

Run: `npx vitest run lib/checklist.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing tests `lib/filters.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  emptyMessage,
  filterToQuery,
  matchesQuery,
  matchesView,
  parseFilter,
  selectBoardNotes,
} from './filters';
import { makeNote } from './testUtils';
import type { BoardFilter } from './types';

const all: BoardFilter = { view: 'all', labelId: null, query: '' };

describe('parseFilter', () => {
  it('defaults to all', () => {
    expect(parseFilter({})).toEqual(all);
  });
  it('reads view, label and search', () => {
    expect(parseFilter({ view: 'lists', label: 'l1', q: 'milk' })).toEqual({
      view: 'lists',
      labelId: 'l1',
      query: 'milk',
    });
  });
  it('ignores unknown views and repeated params', () => {
    expect(parseFilter({ view: 'bogus', q: ['a', 'b'] })).toEqual(all);
  });
  it('drops the label in archive and trash', () => {
    expect(parseFilter({ view: 'trash', label: 'l1' }).labelId).toBeNull();
  });
});

describe('filterToQuery', () => {
  it('omits defaults', () => {
    expect(filterToQuery(all)).toEqual({});
  });
  it('round-trips through the query string', () => {
    const filters: BoardFilter[] = [
      all,
      { view: 'notes', labelId: null, query: '' },
      { view: 'all', labelId: 'l1', query: 'eggs & milk' },
      { view: 'trash', labelId: null, query: 'x' },
    ];
    for (const filter of filters) {
      expect(parseFilter(filterToQuery(filter))).toEqual(filter);
    }
  });
});

describe('matchesView', () => {
  const plain = makeNote();
  const list = makeNote({ kind: 'list' });
  const archived = makeNote({ archived: true });
  const trashed = makeNote({ trashedAt: 5 });
  const labelled = makeNote({ labelIds: ['l1'] });

  it('hides archived and trashed notes from the board', () => {
    expect([plain, list, archived, trashed].map((n) => matchesView(n, all))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
  it('shows only archived notes in archive', () => {
    const f: BoardFilter = { ...all, view: 'archive' };
    expect([plain, archived, trashed].map((n) => matchesView(n, f))).toEqual([false, true, false]);
  });
  it('shows only trashed notes in trash, archived or not', () => {
    const f: BoardFilter = { ...all, view: 'trash' };
    const both = makeNote({ archived: true, trashedAt: 1 });
    expect([plain, trashed, both].map((n) => matchesView(n, f))).toEqual([false, true, true]);
  });
  it('filters by kind and label', () => {
    expect(matchesView(list, { ...all, view: 'notes' })).toBe(false);
    expect(matchesView(list, { ...all, view: 'lists' })).toBe(true);
    expect(matchesView(plain, { ...all, labelId: 'l1' })).toBe(false);
    expect(matchesView(labelled, { ...all, labelId: 'l1' })).toBe(true);
  });
});

describe('matchesQuery', () => {
  const labels = new Map([['l1', 'Work']]);
  it('matches title, text, items and label names, ignoring case', () => {
    expect(matchesQuery(makeNote({ title: 'Sprint' }), 'sprint', labels)).toBe(true);
    expect(matchesQuery(makeNote({ content: 'Buy MILK' }), 'milk', labels)).toBe(true);
    expect(
      matchesQuery(makeNote({ kind: 'list', items: [{ id: 'i', text: 'Eggs', done: true }] }), 'egg', labels),
    ).toBe(true);
    expect(matchesQuery(makeNote({ labelIds: ['l1'] }), 'work', labels)).toBe(true);
    expect(matchesQuery(makeNote({ title: 'Other' }), 'milk', labels)).toBe(false);
  });
  it('matches everything for a blank query', () => {
    expect(matchesQuery(makeNote(), '  ', labels)).toBe(true);
  });
  it('searches only the field for the current kind', () => {
    const note = makeNote({ kind: 'note', items: [{ id: 'i', text: 'hidden', done: false }] });
    expect(matchesQuery(note, 'hidden', labels)).toBe(false);
  });
});

describe('selectBoardNotes', () => {
  it('splits pinned from others, newest first', () => {
    const a = makeNote({ id: 'a', updatedAt: 1 });
    const b = makeNote({ id: 'b', updatedAt: 3, pinned: true });
    const c = makeNote({ id: 'c', updatedAt: 2 });
    const d = makeNote({ id: 'd', updatedAt: 4, pinned: true });
    const result = selectBoardNotes([a, b, c, d], [], all);
    expect(result.pinned.map((n) => n.id)).toEqual(['d', 'b']);
    expect(result.others.map((n) => n.id)).toEqual(['c', 'a']);
  });
  it('lists trash by deletion time with no pinned section', () => {
    const a = makeNote({ id: 'a', trashedAt: 10, pinned: true });
    const b = makeNote({ id: 'b', trashedAt: 20 });
    const result = selectBoardNotes([a, b], [], { ...all, view: 'trash' });
    expect(result.pinned).toEqual([]);
    expect(result.others.map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('searches label names', () => {
    const note = makeNote({ id: 'a', labelIds: ['l1'] });
    const result = selectBoardNotes([note], [{ id: 'l1', name: 'Home' }], { ...all, query: 'home' });
    expect(result.others.map((n) => n.id)).toEqual(['a']);
  });
});

describe('emptyMessage', () => {
  it('describes each view', () => {
    expect(emptyMessage(all)).toBe('Notes you add appear here');
    expect(emptyMessage({ ...all, view: 'notes' })).toBe('No notes yet');
    expect(emptyMessage({ ...all, view: 'lists' })).toBe('No lists yet');
    expect(emptyMessage({ ...all, view: 'archive' })).toBe('Archive is empty');
    expect(emptyMessage({ ...all, view: 'trash' })).toBe('Trash is empty');
    expect(emptyMessage({ ...all, labelId: 'l1' })).toBe('No notes with this label');
    expect(emptyMessage({ ...all, query: ' milk ' })).toBe('No results for “milk”');
  });
});
```

Run: `npx vitest run lib/filters.test.ts`
Expected: FAIL, cannot resolve `./filters`.

- [ ] **Step 7: Create `lib/filters.ts`**

```ts
import type { BoardFilter, BoardView, Label, Note } from './types';

const VIEWS: BoardView[] = ['all', 'notes', 'lists', 'archive', 'trash'];

type Query = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export const parseFilter = (query: Query): BoardFilter => {
  const view = single(query.view);
  const parsedView = VIEWS.includes(view as BoardView) ? (view as BoardView) : 'all';
  const hasLabels = parsedView !== 'archive' && parsedView !== 'trash';
  return {
    view: parsedView,
    labelId: hasLabels ? single(query.label) || null : null,
    query: single(query.q) ?? '',
  };
};

export const filterToQuery = (filter: BoardFilter): Record<string, string> => {
  const query: Record<string, string> = {};
  if (filter.view !== 'all') query.view = filter.view;
  if (filter.labelId) query.label = filter.labelId;
  if (filter.query) query.q = filter.query;
  return query;
};

export const matchesView = (note: Note, filter: BoardFilter): boolean => {
  if (filter.view === 'trash') return note.trashedAt !== null;
  if (note.trashedAt !== null) return false;
  if (filter.view === 'archive') return note.archived;
  if (note.archived) return false;
  if (filter.view === 'notes' && note.kind !== 'note') return false;
  if (filter.view === 'lists' && note.kind !== 'list') return false;
  return filter.labelId === null || note.labelIds.includes(filter.labelId);
};

export const matchesQuery = (note: Note, query: string, labelNames: Map<string, string>): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const body = note.kind === 'note' ? [note.content] : note.items.map((i) => i.text);
  const labels = note.labelIds.map((id) => labelNames.get(id) ?? '');
  return [note.title, ...body, ...labels].some((text) => text.toLowerCase().includes(needle));
};

export type BoardNotes = { pinned: Note[]; others: Note[] };

export const selectBoardNotes = (notes: Note[], labels: Label[], filter: BoardFilter): BoardNotes => {
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));
  const visible = notes.filter((n) => matchesView(n, filter) && matchesQuery(n, filter.query, labelNames));
  if (filter.view === 'trash') {
    return { pinned: [], others: visible.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)) };
  }
  const byRecent = visible.sort((a, b) => b.updatedAt - a.updatedAt);
  if (filter.view === 'archive') return { pinned: [], others: byRecent };
  return { pinned: byRecent.filter((n) => n.pinned), others: byRecent.filter((n) => !n.pinned) };
};

export const emptyMessage = (filter: BoardFilter): string => {
  const query = filter.query.trim();
  if (query) return `No results for “${query}”`;
  switch (filter.view) {
    case 'trash':
      return 'Trash is empty';
    case 'archive':
      return 'Archive is empty';
    case 'lists':
      return 'No lists yet';
    case 'notes':
      return 'No notes yet';
    default:
      return filter.labelId ? 'No notes with this label' : 'Notes you add appear here';
  }
};
```

Run: `npx vitest run lib/filters.test.ts`
Expected: PASS.

- [ ] **Step 8: Write failing tests `lib/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatEdited } from './time';

const now = 1_800_000_000_000;
const minute = 60_000;

describe('formatEdited', () => {
  it('says just now under a minute, and for future times', () => {
    expect(formatEdited(now - 30_000, now)).toBe('Edited just now');
    expect(formatEdited(now + 5_000, now)).toBe('Edited just now');
  });
  it('uses the largest whole unit', () => {
    expect(formatEdited(now - 5 * minute, now)).toBe('Edited 5 minutes ago');
    expect(formatEdited(now - 120 * minute, now)).toBe('Edited 2 hours ago');
    expect(formatEdited(now - 24 * 60 * minute, now)).toBe('Edited yesterday');
    expect(formatEdited(now - 3 * 24 * 60 * minute, now)).toBe('Edited 3 days ago');
  });
});
```

Run: `npx vitest run lib/time.test.ts`
Expected: FAIL, cannot resolve `./time`.

- [ ] **Step 9: Create `lib/time.ts`**

```ts
import { useEffect, useState } from 'react';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

export const formatEdited = (timestamp: number, now: number): string => {
  const elapsed = now - timestamp;
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return `Edited ${relative.format(-Math.floor(elapsed / size), unit)}`;
  }
  return 'Edited just now';
};

// Current time, refreshed every interval so relative times stay current.
export const useNow = (intervalMs = 60_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};
```

Run: `npx vitest run lib/time.test.ts`
Expected: PASS.

- [ ] **Step 10: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass.

```bash
git add lib/types.ts lib/testUtils.ts lib/checklist.ts lib/checklist.test.ts lib/filters.ts lib/filters.test.ts lib/time.ts lib/time.test.ts
git commit -m "Add note types and pure helpers for checklists, filters and times" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: IndexedDB data layer

**Files:**
- Rename: `lib/notes.ts` → `lib/legacyNotes.ts` (old store, kept until Task 9)
- Modify: `pages/index.tsx:10`, `components/Note.tsx`, `components/NoteModal.tsx` (import path only)
- Create: `lib/db.ts`, `lib/storage.ts`, `lib/notes.ts`
- Test: `lib/notes.test.ts`

**Interfaces:**
- Consumes: Task 2 types and `toggleItemIn`, `selectBoardNotes`, `BoardNotes`.
- Produces:
  - `lib/db.ts`: `db` (Dexie with `notes: EntityTable<Note,'id'>`, `labels: EntityTable<Label,'id'>`)
  - `lib/storage.ts`: `HAS_NOTES_KEY = 'hasNotes'`, `setHasNotesMarker(hasNotes: boolean)`, `requestPersistentStorage()`, `isQuotaError(error: unknown): boolean`
  - `lib/notes.ts`: `TRASH_RETENTION_MS`, `NewNote`, `refreshHasNotesMarker()`, `createNote(input: NewNote): Promise<Note>`, `updateNote(id, changes: NoteChanges)`, `togglePin(id)`, `setArchived(id, archived)`, `toggleItem(noteId, itemId)`, `trashNote(id)`, `restoreNote(id)`, `deleteForever(id)`, `emptyTrash()`, `purgeOldTrash(now?): Promise<number>`, `restoreSnapshot(note)`, `duplicateNote(id): Promise<Note | undefined>`, `createLabel(name): Promise<Label>`, `renameLabel(id, name)`, `deleteLabel(id)`, `useLabels(): Label[] | undefined`, `useBoardNotes(filter): BoardNotes | undefined`, `useNote(id): Note | null | undefined`

- [ ] **Step 1: Move the old store out of the way**

```bash
git mv lib/notes.ts lib/legacyNotes.ts
```

Then change the import path in the three files that use it (only the path changes):

- `pages/index.tsx`: `from '../lib/notes'` → `from '../lib/legacyNotes'`
- `components/Note.tsx` and `components/NoteModal.tsx`: `from '../lib/notes'` → `from '../lib/legacyNotes'`

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Create `lib/db.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Label, Note } from './types';

export type NoteboardDB = Dexie & {
  notes: EntityTable<Note, 'id'>;
  labels: EntityTable<Label, 'id'>;
};

export const db = new Dexie('noteboard') as NoteboardDB;

// IndexedDB can't index booleans or null, so `pinned` and `archived` are
// filtered in memory, and only notes in Trash appear in the trashedAt index.
db.version(1).stores({
  notes: 'id, updatedAt, trashedAt, *labelIds',
  labels: 'id, &name',
});
```

- [ ] **Step 3: Create `lib/storage.ts`**

```ts
export const HAS_NOTES_KEY = 'hasNotes';

// Read by the inline script in pages/_document.jsx to hide the
// server-rendered empty state before first paint.
export const setHasNotesMarker = (hasNotes: boolean) => {
  try {
    if (hasNotes) localStorage.setItem(HAS_NOTES_KEY, '1');
    else localStorage.removeItem(HAS_NOTES_KEY);
  } catch {
    // Storage unavailable; the empty state may flash briefly, nothing worse.
  }
};

let persistRequested = false;

// Asks the browser not to evict our data under storage pressure (Safari
// otherwise clears it after weeks without a visit). Asked once per load.
export const requestPersistentStorage = () => {
  if (persistRequested) return;
  persistRequested = true;
  navigator.storage?.persist?.().catch(() => {});
};

export const isQuotaError = (error: unknown): boolean => {
  const e = error as { name?: string; inner?: { name?: string } } | null;
  return e?.name === 'QuotaExceededError' || e?.inner?.name === 'QuotaExceededError';
};
```

- [ ] **Step 4: Write failing tests `lib/notes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import {
  TRASH_RETENTION_MS,
  createLabel,
  createNote,
  deleteForever,
  deleteLabel,
  duplicateNote,
  emptyTrash,
  purgeOldTrash,
  renameLabel,
  restoreNote,
  restoreSnapshot,
  setArchived,
  toggleItem,
  togglePin,
  trashNote,
  updateNote,
} from './notes';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNote', () => {
  it('fills defaults and sets the hasNotes marker', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const note = await createNote({ kind: 'list', title: 'Groceries' });
    expect(note).toMatchObject({
      kind: 'list',
      title: 'Groceries',
      content: '',
      items: [],
      color: 'default',
      labelIds: [],
      pinned: false,
      archived: false,
      trashedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await db.notes.get(note.id)).toEqual(note);
    expect(localStorage.getItem('hasNotes')).toBe('1');
  });

  it('keeps a given id', async () => {
    const note = await createNote({ id: 'fixed', kind: 'note' });
    expect(note.id).toBe('fixed');
  });
});

describe('updateNote', () => {
  it('saves changes and bumps updatedAt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const note = await createNote({ kind: 'note' });
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await updateNote(note.id, { title: 'New', color: 'blue' });
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'New', color: 'blue', updatedAt: 5000 });
  });

  it('unpins when archiving and unarchives when pinning', async () => {
    const note = await createNote({ kind: 'note', pinned: true });
    await setArchived(note.id, true);
    expect(await db.notes.get(note.id)).toMatchObject({ archived: true, pinned: false });
    await togglePin(note.id);
    expect(await db.notes.get(note.id)).toMatchObject({ archived: false, pinned: true });
  });
});

describe('toggleItem', () => {
  it('ticks a checklist item', async () => {
    const note = await createNote({ kind: 'list', items: [{ id: 'i1', text: 'Milk', done: false }] });
    await toggleItem(note.id, 'i1');
    expect((await db.notes.get(note.id))?.items[0].done).toBe(true);
  });
});

describe('trash', () => {
  it('trashes, restores and updates the marker', async () => {
    const note = await createNote({ kind: 'note', title: 'A' });
    await trashNote(note.id);
    expect((await db.notes.get(note.id))?.trashedAt).not.toBeNull();
    expect(localStorage.getItem('hasNotes')).toBeNull();
    await restoreNote(note.id);
    expect((await db.notes.get(note.id))?.trashedAt).toBeNull();
    expect(localStorage.getItem('hasNotes')).toBe('1');
  });

  it('does not count archived notes for the marker', async () => {
    const note = await createNote({ kind: 'note', title: 'A' });
    await setArchived(note.id, true);
    expect(localStorage.getItem('hasNotes')).toBeNull();
  });

  it('empties only trashed notes', async () => {
    const kept = await createNote({ kind: 'note', title: 'Keep' });
    const gone = await createNote({ kind: 'note', title: 'Gone' });
    await trashNote(gone.id);
    await emptyTrash();
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual([kept.id]);
  });

  it('deletes forever', async () => {
    const note = await createNote({ kind: 'note' });
    await deleteForever(note.id);
    expect(await db.notes.get(note.id)).toBeUndefined();
  });

  it('purges notes trashed more than 30 days ago', async () => {
    const now = 100 * TRASH_RETENTION_MS;
    const old = await createNote({ kind: 'note' });
    const recent = await createNote({ kind: 'note' });
    await db.notes.update(old.id, { trashedAt: now - TRASH_RETENTION_MS - 1 });
    await db.notes.update(recent.id, { trashedAt: now - 1000 });
    expect(await purgeOldTrash(now)).toBe(1);
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual([recent.id]);
  });
});

describe('restoreSnapshot', () => {
  it('puts a note back exactly as it was', async () => {
    const note = await createNote({ kind: 'note', title: 'Before', pinned: true });
    await setArchived(note.id, true);
    await restoreSnapshot(note);
    expect(await db.notes.get(note.id)).toEqual(note);
  });
});

describe('duplicateNote', () => {
  it('copies content with new ids and no pin', async () => {
    const note = await createNote({
      kind: 'list',
      title: 'Trip',
      pinned: true,
      color: 'green',
      labelIds: ['l1'],
      items: [{ id: 'i1', text: 'Passport', done: true }],
    });
    const copy = await duplicateNote(note.id);
    expect(copy).toMatchObject({ kind: 'list', title: 'Trip', color: 'green', labelIds: ['l1'], pinned: false });
    expect(copy?.id).not.toBe(note.id);
    expect(copy?.items[0]).toMatchObject({ text: 'Passport', done: true });
    expect(copy?.items[0].id).not.toBe('i1');
  });

  it('returns undefined for a missing note', async () => {
    expect(await duplicateNote('missing')).toBeUndefined();
  });
});

describe('labels', () => {
  it('creates once, ignoring case and spaces', async () => {
    const work = await createLabel(' Work ');
    expect(work.name).toBe('Work');
    expect(await createLabel('work')).toEqual(work);
    await expect(createLabel('  ')).rejects.toThrow('Label name is required');
  });

  it('refuses to rename onto another label', async () => {
    const work = await createLabel('Work');
    await createLabel('Home');
    await expect(renameLabel(work.id, 'home')).rejects.toThrow('A label with that name already exists');
    await renameLabel(work.id, 'Office');
    expect((await db.labels.get(work.id))?.name).toBe('Office');
  });

  it('removes a deleted label from notes but keeps the notes', async () => {
    const work = await createLabel('Work');
    const home = await createLabel('Home');
    const note = await createNote({ kind: 'note', labelIds: [work.id, home.id] });
    await deleteLabel(work.id);
    expect(await db.labels.get(work.id)).toBeUndefined();
    expect((await db.notes.get(note.id))?.labelIds).toEqual([home.id]);
  });
});
```

Run: `npx vitest run lib/notes.test.ts`
Expected: FAIL, cannot resolve `./notes`.

- [ ] **Step 5: Create `lib/notes.ts`**

```ts
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { toggleItemIn } from './checklist';
import { db } from './db';
import { selectBoardNotes, type BoardNotes } from './filters';
import { requestPersistentStorage, setHasNotesMarker } from './storage';
import type { BoardFilter, Label, Note, NoteChanges, NoteKind } from './types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NewNote = Partial<Omit<Note, 'createdAt' | 'updatedAt' | 'trashedAt'>> & { kind: NoteKind };

export const refreshHasNotesMarker = async () => {
  const active = await db.notes.filter((n) => n.trashedAt === null && !n.archived).count();
  setHasNotesMarker(active > 0);
};

const afterWrite = async () => {
  requestPersistentStorage();
  await refreshHasNotesMarker();
};

// Pinning and archiving exclude each other, as in Google Keep.
const normalize = (changes: NoteChanges): NoteChanges => {
  if (changes.archived) return { ...changes, pinned: false };
  if (changes.pinned) return { ...changes, archived: false };
  return changes;
};

export const createNote = async (input: NewNote): Promise<Note> => {
  const now = Date.now();
  const fields = normalize({ pinned: input.pinned ?? false, archived: input.archived ?? false });
  const note: Note = {
    id: input.id ?? uuid(),
    kind: input.kind,
    title: input.title ?? '',
    content: input.content ?? '',
    items: input.items ?? [],
    color: input.color ?? 'default',
    labelIds: input.labelIds ?? [],
    pinned: fields.pinned ?? false,
    archived: fields.archived ?? false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.notes.add(note);
  await afterWrite();
  return note;
};

export const updateNote = async (id: string, changes: NoteChanges) => {
  await db.notes.update(id, { ...normalize(changes), updatedAt: Date.now() });
  await afterWrite();
};

export const togglePin = async (id: string) => {
  const note = await db.notes.get(id);
  if (note) await updateNote(id, { pinned: !note.pinned });
};

export const setArchived = (id: string, archived: boolean) => updateNote(id, { archived });

export const toggleItem = async (noteId: string, itemId: string) => {
  const note = await db.notes.get(noteId);
  if (note) await updateNote(noteId, { items: toggleItemIn(note.items, itemId) });
};

export const trashNote = async (id: string) => {
  await db.notes.update(id, { trashedAt: Date.now() });
  await afterWrite();
};

export const restoreNote = async (id: string) => {
  await db.notes.update(id, { trashedAt: null });
  await afterWrite();
};

export const deleteForever = async (id: string) => {
  await db.notes.delete(id);
  await afterWrite();
};

export const emptyTrash = async () => {
  await db.notes.where('trashedAt').aboveOrEqual(0).delete();
  await afterWrite();
};

export const purgeOldTrash = async (now = Date.now()) => {
  const removed = await db.notes.where('trashedAt').below(now - TRASH_RETENTION_MS).delete();
  if (removed > 0) await afterWrite();
  return removed;
};

// Puts a note back exactly as it was; used by Undo.
export const restoreSnapshot = async (note: Note) => {
  await db.notes.put(note);
  await afterWrite();
};

export const duplicateNote = async (id: string): Promise<Note | undefined> => {
  const note = await db.notes.get(id);
  if (!note) return undefined;
  return createNote({
    kind: note.kind,
    title: note.title,
    content: note.content,
    items: note.items.map((item) => ({ ...item, id: uuid() })),
    color: note.color,
    labelIds: note.labelIds,
  });
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const createLabel = async (name: string): Promise<Label> => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Label name is required');
  const existing = (await db.labels.toArray()).find((l) => sameName(l.name, trimmed));
  if (existing) return existing;
  const label = { id: uuid(), name: trimmed };
  await db.labels.add(label);
  return label;
};

export const renameLabel = async (id: string, name: string) => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Label name is required');
  const clash = (await db.labels.toArray()).find((l) => l.id !== id && sameName(l.name, trimmed));
  if (clash) throw new Error('A label with that name already exists');
  await db.labels.update(id, { name: trimmed });
};

export const deleteLabel = async (id: string) => {
  await db.transaction('rw', db.notes, db.labels, async () => {
    await db.labels.delete(id);
    await db.notes
      .where('labelIds')
      .equals(id)
      .modify((note) => {
        note.labelIds = note.labelIds.filter((labelId) => labelId !== id);
      });
  });
};

// Queries swallow errors so a blocked database shows the storage banner
// (see lib/startup.ts) instead of crashing the page.
export const useLabels = (): Label[] | undefined =>
  useLiveQuery(
    () =>
      db.labels
        .toArray()
        .then((labels) => labels.sort((a, b) => a.name.localeCompare(b.name)))
        .catch((): Label[] => []),
    [],
  );

export const useBoardNotes = (filter: BoardFilter): BoardNotes | undefined => {
  const notes = useLiveQuery(() => db.notes.toArray().catch((): Note[] => []), []);
  const labels = useLabels();
  const { view, labelId, query } = filter;
  return useMemo(
    () => (notes && labels ? selectBoardNotes(notes, labels, { view, labelId, query }) : undefined),
    [notes, labels, view, labelId, query],
  );
};

// undefined while loading, null when the note doesn't exist.
export const useNote = (id: string): Note | null | undefined =>
  useLiveQuery(
    () =>
      db.notes
        .get(id)
        .then((note) => note ?? null)
        .catch(() => null),
    [id],
  );
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/notes.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 7: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass; the old UI still runs on `lib/legacyNotes.ts`.

```bash
git add lib/legacyNotes.ts lib/db.ts lib/storage.ts lib/notes.ts lib/notes.test.ts pages/index.tsx components/Note.tsx components/NoteModal.tsx
git commit -m "Add IndexedDB notes and labels store" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migration and startup

**Files:**
- Create: `lib/migrate.ts`, `lib/startup.ts`
- Test: `lib/migrate.test.ts`, `lib/startup.test.ts`

**Interfaces:**
- Consumes: `db`, `purgeOldTrash`, `refreshHasNotesMarker`.
- Produces:
  - `lib/migrate.ts`: `LEGACY_KEY = 'notes'`, `BACKUP_KEY = 'notes-backup-v1'`, `migrateFromLocalStorage(now?): Promise<number>` (throws if the insert fails)
  - `lib/startup.ts`: `StartupStatus = 'pending' | 'ready' | 'unavailable'`, `runStartup(): Promise<'ready' | 'unavailable'>`, `useStartup(): StartupStatus`

- [ ] **Step 1: Write failing tests `lib/migrate.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { BACKUP_KEY, LEGACY_KEY, migrateFromLocalStorage } from './migrate';
import { createNote } from './notes';

const legacy = (value: unknown) => localStorage.setItem(LEGACY_KEY, JSON.stringify(value));

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('migrateFromLocalStorage', () => {
  it('copies legacy notes, keeping their order, and keeps a backup', async () => {
    legacy([
      { id: 'a', title: 'First', content: 'one', pinned: true },
      { id: 'b', title: 'Second', content: 'two', pinned: false },
    ]);
    expect(await migrateFromLocalStorage(1000)).toBe(2);
    expect(await db.notes.get('a')).toMatchObject({
      kind: 'note',
      title: 'First',
      content: 'one',
      items: [],
      color: 'default',
      labelIds: [],
      pinned: true,
      archived: false,
      trashedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect((await db.notes.get('b'))?.updatedAt).toBe(999);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toContain('First');
  });

  it('skips entries that are not objects and fills missing fields', async () => {
    legacy([null, 3, 'text', { title: 'No id', pinned: 'yes' }]);
    expect(await migrateFromLocalStorage()).toBe(1);
    const [note] = await db.notes.toArray();
    expect(note.id).toEqual(expect.any(String));
    expect(note).toMatchObject({ title: 'No id', content: '', pinned: false });
  });

  it('leaves unreadable data alone', async () => {
    localStorage.setItem(LEGACY_KEY, '{oops');
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{oops');
    expect(await db.notes.count()).toBe(0);
  });

  it('does not duplicate when run twice', async () => {
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    await migrateFromLocalStorage();
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(await db.notes.count()).toBe(1);
  });

  it('does nothing when the database already has notes', async () => {
    await createNote({ kind: 'note', title: 'Existing' });
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    expect(await migrateFromLocalStorage()).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('keeps localStorage intact when the insert fails', async () => {
    legacy([{ id: 'a', title: 'A', content: '', pinned: false }]);
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(migrateFromLocalStorage()).rejects.toThrow('boom');
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
  });
});
```

Run: `npx vitest run lib/migrate.test.ts`
Expected: FAIL, cannot resolve `./migrate`.

- [ ] **Step 2: Create `lib/migrate.ts`**

```ts
import { v4 as uuid } from 'uuid';
import { db } from './db';
import type { Note } from './types';

export const LEGACY_KEY = 'notes';
export const BACKUP_KEY = 'notes-backup-v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const toNote = (entry: Record<string, unknown>, timestamp: number): Note => ({
  id: typeof entry.id === 'string' && entry.id ? entry.id : uuid(),
  kind: 'note',
  title: text(entry.title),
  content: text(entry.content),
  items: [],
  color: 'default',
  labelIds: [],
  pinned: entry.pinned === true,
  archived: false,
  trashedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

// Moves notes saved by the localStorage version into IndexedDB, once.
// The old value is renamed, never deleted. If the insert fails, nothing in
// localStorage changes and the next load tries again.
export const migrateFromLocalStorage = async (now = Date.now()): Promise<number> => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (raw === null) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  if ((await db.notes.count()) > 0) return 0;

  // The old store kept newest first, so earlier entries get later timestamps.
  const notes = parsed.filter(isRecord).map((entry, index) => toNote(entry, now - index));
  await db.notes.bulkPut(notes);

  try {
    localStorage.setItem(BACKUP_KEY, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // The notes table is no longer empty, so this won't run again.
  }
  return notes.length;
};
```

Run: `npx vitest run lib/migrate.test.ts`
Expected: PASS.

- [ ] **Step 3: Write failing tests `lib/startup.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { LEGACY_KEY } from './migrate';
import { TRASH_RETENTION_MS, createNote } from './notes';
import { runStartup } from './startup';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runStartup', () => {
  it('migrates, purges old trash and refreshes the marker', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'a', title: 'A', content: '', pinned: false }]));
    expect(await runStartup()).toBe('ready');
    expect(await db.notes.get('a')).toBeDefined();
    expect(localStorage.getItem('hasNotes')).toBe('1');

    const old = await createNote({ kind: 'note' });
    await db.notes.update(old.id, { trashedAt: Date.now() - TRASH_RETENTION_MS - 1 });
    await runStartup();
    expect(await db.notes.get(old.id)).toBeUndefined();
  });

  it('reports unavailable when the database cannot open', async () => {
    vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('blocked'));
    expect(await runStartup()).toBe('unavailable');
  });

  it('still reports ready when migration fails', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'a', title: 'A' }]));
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    expect(await runStartup()).toBe('ready');
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});
```

Run: `npx vitest run lib/startup.test.ts`
Expected: FAIL, cannot resolve `./startup`.

- [ ] **Step 4: Create `lib/startup.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { db } from './db';
import { migrateFromLocalStorage } from './migrate';
import { purgeOldTrash, refreshHasNotesMarker } from './notes';

export type StartupStatus = 'pending' | 'ready' | 'unavailable';

export const runStartup = async (): Promise<'ready' | 'unavailable'> => {
  try {
    await db.open();
  } catch {
    return 'unavailable';
  }
  // Each step is independent; a failure in one must not block the app.
  await migrateFromLocalStorage().catch(() => {});
  await purgeOldTrash().catch(() => {});
  await refreshHasNotesMarker().catch(() => {});
  return 'ready';
};

let status: StartupStatus = 'pending';
let started = false;
const listeners = new Set<() => void>();

// Startup runs once per page load, the first time any component asks.
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!started) {
    started = true;
    void runStartup().then((result) => {
      status = result;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
  };
};

export const useStartup = (): StartupStatus =>
  useSyncExternalStore(
    subscribe,
    () => status,
    () => 'pending',
  );
```

Run: `npx vitest run lib/startup.test.ts`
Expected: PASS.

- [ ] **Step 5: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass.

```bash
git add lib/migrate.ts lib/migrate.test.ts lib/startup.ts lib/startup.test.ts
git commit -m "Migrate localStorage notes to IndexedDB on startup" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Theme and design tokens

**Files:**
- Create: `lib/theme.ts`, `styles/tokens.css`
- Modify: `styles/globals.css`, `pages/_document.jsx`, `pages/_app.tsx`
- Test: `lib/theme.test.ts`

**Interfaces:**
- Produces: `ThemePref = 'system' | 'light' | 'dark'`, `readTheme(): ThemePref`, `resolveTheme(pref, prefersDark): 'light' | 'dark'`, `applyTheme(pref?)`, `setTheme(pref)`, `useTheme(): ThemePref`, `useSystemThemeSync()`. CSS variables listed in `styles/tokens.css` (later tasks use `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-hover`, `--accent-soft`, `--on-accent`, `--danger`, `--focus`, `--shadow-card`, `--shadow-raised`, `--scrim`, `--toast-action`, `--note-bg`, `--note-ink`, `--radius-*`, `--text-xs…xl`).

- [ ] **Step 1: Write failing tests `lib/theme.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { readTheme, resolveTheme, setTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('defaults to system', () => {
    expect(readTheme()).toBe('system');
    localStorage.setItem('theme', 'purple');
    expect(readTheme()).toBe('system');
  });

  it('resolves system from the device setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('saves the choice and applies it', () => {
    setTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setTheme('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light'); // the jsdom stub reports light
  });
});
```

Run: `npx vitest run lib/theme.test.ts`
Expected: FAIL, cannot resolve `./theme`.

- [ ] **Step 2: Create `lib/theme.ts`**

```ts
import { useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

export const readTheme = (): ThemePref => {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): 'light' | 'dark' =>
  pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;

// Same logic as the inline script in pages/_document.jsx.
export const applyTheme = (pref: ThemePref = readTheme()) => {
  document.documentElement.dataset.theme = resolveTheme(pref, window.matchMedia(DARK_QUERY).matches);
};

export const setTheme = (pref: ThemePref) => {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Not saved, but still applied for this visit.
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useTheme = (): ThemePref =>
  useSyncExternalStore(subscribe, readTheme, () => 'system');

// Follows the device when the preference is "system".
export const useSystemThemeSync = () => {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
};
```

Run: `npx vitest run lib/theme.test.ts`
Expected: PASS.

- [ ] **Step 3: Create `styles/tokens.css`**

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 24px;
}

:root,
[data-theme='light'] {
  color-scheme: light;
  --bg: #f6f8fa;
  --surface: #ffffff;
  --surface-2: #f1f2f7;
  --border: #e3e6ee;
  --text: #171a34;
  --text-muted: #4a4f6a;
  --accent: #6a61bf;
  --accent-hover: #5a51ad;
  --accent-soft: #ecebf8;
  --on-accent: #ffffff;
  --danger: #b3261e;
  --focus: #6a61bf;
  --shadow-card: 0 1px 2px rgba(23, 26, 52, 0.06), 0 2px 10px rgba(23, 26, 52, 0.06);
  --shadow-raised: 0 10px 30px rgba(23, 26, 52, 0.16);
  --scrim: rgba(23, 26, 52, 0.4);
  --toast-action: #c9c4ff;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: #14151f;
  --surface: #1d1f2c;
  --surface-2: #262938;
  --border: #33364a;
  --text: #eceef6;
  --text-muted: #b5b9cc;
  --accent: #a59ef0;
  --accent-hover: #bbb5f5;
  --accent-soft: #2d2a4d;
  --on-accent: #14151f;
  --danger: #f2b8b5;
  --focus: #a59ef0;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-raised: 0 10px 30px rgba(0, 0, 0, 0.5);
  --scrim: rgba(0, 0, 0, 0.6);
  --toast-action: #4a42a0;
}

/* Note colours: --note-bg fills the card or editor, --note-ink is body
   text on it (a dark shade of the colour, not grey, to keep AA contrast). */
[data-color='default'] {
  --note-bg: var(--surface);
  --note-ink: var(--text-muted);
}
[data-color='yellow'] {
  --note-bg: #fff4c7;
  --note-ink: #4d3f0c;
}
[data-color='green'] {
  --note-bg: #dcf3e4;
  --note-ink: #1d4a2e;
}
[data-color='blue'] {
  --note-bg: #dde9fc;
  --note-ink: #1c3561;
}
[data-color='pink'] {
  --note-bg: #fde2ec;
  --note-ink: #5e1f37;
}
[data-color='purple'] {
  --note-bg: #ebe6fb;
  --note-ink: #3b2f73;
}
[data-color='grey'] {
  --note-bg: #eceef3;
  --note-ink: #3a3f52;
}

[data-theme='dark'] [data-color='yellow'] {
  --note-bg: #3b3418;
  --note-ink: #f1e2a8;
}
[data-theme='dark'] [data-color='green'] {
  --note-bg: #1e3a2a;
  --note-ink: #b9e6c9;
}
[data-theme='dark'] [data-color='blue'] {
  --note-bg: #1f2e4a;
  --note-ink: #c4d7f7;
}
[data-theme='dark'] [data-color='pink'] {
  --note-bg: #42202e;
  --note-ink: #f4c4d6;
}
[data-theme='dark'] [data-color='purple'] {
  --note-bg: #2e2850;
  --note-ink: #d4ccf8;
}
[data-theme='dark'] [data-color='grey'] {
  --note-bg: #2a2d3a;
  --note-ink: #c9ccd8;
}
```

- [ ] **Step 4: Base styles on tokens in `styles/globals.css`**

Replace the first block (`html, body { … color: #171a34; }`) and the `body { background: #f6f8fa; }` block with:

```css
html,
body {
  padding: 0;
  margin: 0;
  color: var(--text);
  background: var(--bg);
}
```

Replace the form-control block with:

```css
/* Form controls don't inherit the page font by default. */
button,
input,
textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

Leave the `.header`, `.logo`, `.add-note__*` and `.button__primary` rules in place; Task 9 deletes them with the old header.

- [ ] **Step 5: Apply the theme before first paint in `pages/_document.jsx`**

Replace the existing comment and `<script>` (lines 12–18) with:

```jsx
          {/* Runs before first paint: apply the saved theme, and hide the
              server-rendered empty state when notes exist so it doesn't
              flash while they load. Keep in sync with lib/theme.ts. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var s=localStorage,d=document.documentElement,t=s.getItem("theme");d.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";var l=JSON.parse(s.getItem("notes")||"[]");if(s.getItem("hasNotes")||(Array.isArray(l)&&l.length))d.setAttribute("data-has-notes","")}catch(e){}`,
            }}
          />
```

(`notes` is still checked so the first load after the upgrade, before migration, doesn't flash the empty state.)

- [ ] **Step 6: Load tokens and follow the device theme in `pages/_app.tsx`**

```tsx
import '../styles/tokens.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Lato } from 'next/font/google'
import { useSystemThemeSync } from '../lib/theme'

const lato = Lato({
  weight: ['300', '400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

function MyApp({ Component, pageProps }: AppProps) {
  useSystemThemeSync()
  return (
    <>
      <style jsx global>{`
        html,
        body {
          font-family: ${lato.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
```

- [ ] **Step 7: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

Manual: `npm run dev`, open http://localhost:4000 in a fresh Chrome profile. In DevTools, run `localStorage.setItem('theme','dark'); location.reload()`. The page background is `#14151f` with no light flash. Run `localStorage.removeItem('theme')` afterwards.

```bash
git add lib/theme.ts lib/theme.test.ts styles/tokens.css styles/globals.css pages/_document.jsx pages/_app.tsx
git commit -m "Add design tokens and light/dark theme" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Shared UI components

**Files:**
- Create: `components/ui/IconButton.tsx`, `IconButton.module.css`, `Menu.tsx`, `Menu.module.css`, `ColorPicker.tsx`, `ColorPicker.module.css`, `LabelPicker.tsx`, `LabelPicker.module.css`, `Toast.tsx`, `Toast.module.css`, `LabelsDialog.tsx`, `LabelsDialog.module.css`, `StorageBanner.tsx`, `StorageBanner.module.css` (all in `components/ui/`)
- Modify: `pages/_app.tsx`
- Test: `components/ui/Toast.test.tsx`, `components/ui/LabelPicker.test.tsx`

**Interfaces:**
- Consumes: `useLabels`, `createLabel`, `renameLabel`, `deleteLabel`, `useStartup`, `NOTE_COLORS`, `COLOR_NAMES`, `NoteColor`.
- Produces:
  - `IconButton` (default): props `ButtonHTMLAttributes<HTMLButtonElement> & { label: string; ref?: Ref<HTMLButtonElement> }`; works as a Radix `asChild` trigger.
  - `Menu` (default): props `{ trigger: ReactElement; items: MenuItem[]; align?: 'start' | 'end' }`; `MenuItem = { label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean }`. `Menu.module.css` also exports `content`, `item`, `danger`, `separator`, `label`, `indicator` for `MoreMenu`.
  - `ColorPicker` (default): `{ value: NoteColor; onChange: (color: NoteColor) => void; trigger: ReactElement }`
  - `LabelPicker` (default): `{ selectedIds: string[]; onChange: (ids: string[]) => void; trigger: ReactElement }`
  - `Toast.tsx`: `ToastProvider`, `useToast(): (toast: ToastOptions) => void`, `ToastOptions = { message: string; actionLabel?: string; onAction?: () => void }`
  - `LabelsDialog` (default): `{ open: boolean; onOpenChange: (open: boolean) => void }`
  - `StorageBanner` (default): no props

- [ ] **Step 1: Create `components/ui/IconButton.tsx` and its CSS**

```tsx
import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './IconButton.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ref?: Ref<HTMLButtonElement>;
};

// Spreads the rest so Radix `asChild` triggers can attach their handlers.
const IconButton = ({ label, className, ref, children, ...rest }: Props) => (
  <button
    ref={ref}
    type='button'
    aria-label={label}
    title={label}
    className={className ? `${styles.button} ${className}` : styles.button}
    {...rest}
  >
    {children}
  </button>
);

export default IconButton;
```

`components/ui/IconButton.module.css`:

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: inherit;
  transition: background-color 0.15s ease;
}

.button:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.button[aria-pressed='true'] {
  color: var(--accent);
}

.button:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 2: Create `components/ui/Menu.tsx` and its CSS**

```tsx
import { DropdownMenu } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import styles from './Menu.module.css';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
};

type Props = {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
};

const Menu = ({ trigger, items, align = 'end' }: Props) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={styles.content} align={align} sideOffset={6}>
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.label}
            className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
            onSelect={item.onSelect}
          >
            {item.icon}
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export default Menu;
```

`components/ui/Menu.module.css`:

```css
.content {
  z-index: 50;
  min-width: 180px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  cursor: pointer;
  outline: none;
  user-select: none;
}

.item[data-highlighted] {
  background: var(--accent-soft);
}

.danger {
  color: var(--danger);
}

.separator {
  height: 1px;
  margin: 6px 4px;
  background: var(--border);
}

.label {
  padding: 6px 10px 4px;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-muted);
}

.indicator {
  display: inline-flex;
  margin-left: auto;
}
```

- [ ] **Step 3: Create `components/ui/ColorPicker.tsx` and its CSS**

```tsx
import { Check } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { ReactElement } from 'react';
import { COLOR_NAMES, NOTE_COLORS, type NoteColor } from '../../lib/types';
import styles from './ColorPicker.module.css';

type Props = {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  trigger: ReactElement;
};

const ColorPicker = ({ value, onChange, trigger }: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className={styles.content} sideOffset={6} aria-label='Note colour'>
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            type='button'
            data-color={color}
            className={styles.swatch}
            aria-label={COLOR_NAMES[color]}
            title={COLOR_NAMES[color]}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
          >
            {color === value && <Check size={16} aria-hidden />}
          </button>
        ))}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default ColorPicker;
```

`components/ui/ColorPicker.module.css`:

```css
.content {
  z-index: 50;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 280px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--note-bg);
  color: var(--text);
}

.swatch[aria-pressed='true'] {
  border: 2px solid var(--accent);
}
```

- [ ] **Step 4: Write failing test `components/ui/LabelPicker.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createLabel } from '../../lib/notes';
import LabelPicker from './LabelPicker';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const renderPicker = (selectedIds: string[] = []) => {
  const onChange = vi.fn();
  render(
    <LabelPicker selectedIds={selectedIds} onChange={onChange} trigger={<button type='button'>Labels</button>} />,
  );
  return onChange;
};

describe('LabelPicker', () => {
  it('creates a label and selects it', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.type(await screen.findByRole('textbox', { name: 'Label name' }), 'Work');
    await user.click(screen.getByRole('button', { name: 'Create “Work”' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.any(String)]));
    expect((await db.labels.toArray()).map((l) => l.name)).toEqual(['Work']);
  });

  it('toggles an existing label', async () => {
    const home = await createLabel('Home');
    const user = userEvent.setup();
    const onChange = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Home' }));
    expect(onChange).toHaveBeenCalledWith([home.id]);
  });
});
```

Run: `npx vitest run components/ui/LabelPicker.test.tsx`
Expected: FAIL, cannot resolve `./LabelPicker`.

- [ ] **Step 5: Create `components/ui/LabelPicker.tsx` and its CSS**

```tsx
import { Plus } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState, type ReactElement } from 'react';
import { createLabel, useLabels } from '../../lib/notes';
import styles from './LabelPicker.module.css';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  trigger: ReactElement;
};

const LabelPicker = ({ selectedIds, onChange, trigger }: Props) => {
  const labels = useLabels() ?? [];
  const [text, setText] = useState('');
  const needle = text.trim().toLowerCase();
  const shown = labels.filter((l) => l.name.toLowerCase().includes(needle));
  const canCreate = needle !== '' && !labels.some((l) => l.name.toLowerCase() === needle);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const create = async () => {
    const label = await createLabel(text);
    if (!selectedIds.includes(label.id)) onChange([...selectedIds, label.id]);
    setText('');
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.content} sideOffset={6} aria-label='Labels'>
          <input
            className={styles.filter}
            value={text}
            placeholder='Enter label name'
            aria-label='Label name'
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) {
                e.preventDefault();
                void create();
              }
            }}
          />
          {shown.length > 0 && (
            <ul className={styles.list}>
              {shown.map((label) => (
                <li key={label.id}>
                  <label className={styles.option}>
                    <input
                      type='checkbox'
                      checked={selectedIds.includes(label.id)}
                      onChange={() => toggle(label.id)}
                    />
                    {label.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <button type='button' className={styles.create} onClick={() => void create()}>
              <Plus size={16} aria-hidden />
              Create “{text.trim()}”
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default LabelPicker;
```

`components/ui/LabelPicker.module.css`:

```css
.content {
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 248px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
  color: var(--text);
}

.filter {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--text-sm);
}

.list {
  max-height: 220px;
  overflow-y: auto;
  padding: 0;
  list-style: none;
}

.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.option:hover {
  background: var(--accent-soft);
}

.create {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--accent);
  text-align: left;
}

.create:hover {
  background: var(--accent-soft);
}
```

Run: `npx vitest run components/ui/LabelPicker.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write failing test `components/ui/Toast.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

const Trigger = ({ onAction }: { onAction: () => void }) => {
  const toast = useToast();
  return (
    <button type='button' onClick={() => toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction })}>
      Delete
    </button>
  );
};

describe('Toast', () => {
  it('shows a message with a working Undo', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger onAction={onAction} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect((await screen.findAllByText('Moved to trash')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
```

Run: `npx vitest run components/ui/Toast.test.tsx`
Expected: FAIL, cannot resolve `./Toast`.

- [ ] **Step 7: Create `components/ui/Toast.tsx` and its CSS**

```tsx
import { Toast } from 'radix-ui';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ActiveToast = ToastOptions & { id: number };

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {});

let nextId = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const show = useCallback((toast: ToastOptions) => {
    nextId += 1;
    const id = nextId;
    // Keep at most three on screen.
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);

  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <Toast.Provider duration={6000} swipeDirection='down'>
      <ToastContext.Provider value={show}>{children}</ToastContext.Provider>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          className={styles.toast}
          onOpenChange={(open) => {
            if (!open) dismiss(toast.id);
          }}
        >
          <Toast.Description className={styles.message}>{toast.message}</Toast.Description>
          {toast.onAction && (
            <Toast.Action asChild altText={toast.actionLabel ?? 'Undo'}>
              <button type='button' className={styles.action} onClick={toast.onAction}>
                {toast.actionLabel ?? 'Undo'}
              </button>
            </Toast.Action>
          )}
        </Toast.Root>
      ))}
      <Toast.Viewport className={styles.viewport} />
    </Toast.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
```

`components/ui/Toast.module.css`:

```css
.viewport {
  position: fixed;
  bottom: 24px;
  left: 50%;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  margin: 0;
  padding: 0;
  list-style: none;
  transform: translateX(-50%);
  outline: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow-raised);
  font-size: var(--text-sm);
}

.message {
  flex: 1;
}

.action {
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-weight: 700;
  color: var(--toast-action);
}

.action:hover {
  background: color-mix(in srgb, var(--bg) 12%, transparent);
}

/* Clear the floating New button on phones. */
@media (max-width: 600px) {
  .viewport {
    bottom: 92px;
  }
}
```

Run: `npx vitest run components/ui/Toast.test.tsx`
Expected: PASS.

- [ ] **Step 8: Create `components/ui/LabelsDialog.tsx` and its CSS**

```tsx
import { Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { createLabel, deleteLabel, renameLabel, useLabels } from '../../lib/notes';
import type { Label } from '../../lib/types';
import IconButton from './IconButton';
import styles from './LabelsDialog.module.css';

const LabelRow = ({ label }: { label: Label }) => {
  const [name, setName] = useState(label.name);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    if (name.trim() === label.name) return;
    try {
      await renameLabel(label.id, name);
      setError(null);
    } catch (err) {
      setName(label.name);
      setError((err as Error).message);
    }
  };

  const remove = () => {
    if (window.confirm(`Delete the label “${label.name}”? Notes keep their content.`)) {
      void deleteLabel(label.id);
    }
  };

  return (
    <li className={styles.row}>
      <input
        className={styles.input}
        value={name}
        aria-label={`Rename label ${label.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <IconButton label={`Delete label ${label.name}`} onClick={remove}>
        <Trash2 size={16} aria-hidden />
      </IconButton>
      {error && (
        <p role='alert' className={styles.error}>
          {error}
        </p>
      )}
    </li>
  );
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LabelsDialog = ({ open, onOpenChange }: Props) => {
  const labels = useLabels() ?? [];
  const [newName, setNewName] = useState('');

  const add = async () => {
    if (!newName.trim()) return;
    await createLabel(newName);
    setNewName('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Labels</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label='Close'>
                <X size={18} aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Rename or delete labels. Deleting a label keeps its notes.
          </Dialog.Description>
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              className={styles.input}
              value={newName}
              placeholder='New label'
              aria-label='New label name'
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type='submit' className={styles.add}>
              Add
            </button>
          </form>
          {labels.length === 0 ? (
            <p className={styles.description}>No labels yet.</p>
          ) : (
            <ul className={styles.list}>
              {labels.map((label) => (
                <LabelRow key={label.id} label={label} />
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default LabelsDialog;
```

`components/ui/LabelsDialog.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--scrim);
}

.content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 61;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 20px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-raised);
  transform: translate(-50%, -50%);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--text-lg);
}

.description {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--text-sm);
}

.add {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-sm);
  font-weight: 700;
}

.error {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--danger);
}
```

- [ ] **Step 9: Create `components/ui/StorageBanner.tsx` and its CSS**

```tsx
import { useStartup } from '../../lib/startup';
import styles from './StorageBanner.module.css';

const StorageBanner = () => {
  const status = useStartup();
  if (status !== 'unavailable') return null;
  return (
    <div role='alert' className={styles.banner}>
      Storage is unavailable, so notes won’t be saved.
    </div>
  );
};

export default StorageBanner;
```

`components/ui/StorageBanner.module.css`:

```css
.banner {
  padding: 10px 16px;
  background: var(--danger);
  color: var(--surface);
  font-size: var(--text-sm);
  font-weight: 700;
  text-align: center;
}
```

- [ ] **Step 10: Wire the provider, banner and reduced motion into `pages/_app.tsx`**

```tsx
import '../styles/tokens.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Lato } from 'next/font/google'
import { MotionConfig } from 'framer-motion'
import StorageBanner from '../components/ui/StorageBanner'
import { ToastProvider } from '../components/ui/Toast'
import { useSystemThemeSync } from '../lib/theme'

const lato = Lato({
  weight: ['300', '400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

function MyApp({ Component, pageProps }: AppProps) {
  useSystemThemeSync()
  return (
    <>
      <style jsx global>{`
        html,
        body {
          font-family: ${lato.style.fontFamily};
        }
      `}</style>
      <MotionConfig reducedMotion='user'>
        <ToastProvider>
          <StorageBanner />
          <Component {...pageProps} />
        </ToastProvider>
      </MotionConfig>
    </>
  )
}

export default MyApp
```

- [ ] **Step 11: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

```bash
git add components/ui pages/_app.tsx
git commit -m "Add shared Radix UI components and toast provider" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Routes and keyboard shortcuts

**Files:**
- Create: `lib/routes.ts`, `lib/shortcuts.ts`
- Test: `lib/routes.test.ts`, `lib/shortcuts.test.ts`

**Interfaces:**
- Consumes: `NoteKind`.
- Produces:
  - `lib/routes.ts`: `noteHref(id): UrlObject` (`{ pathname: '/note', query: { id } }`), `newNoteHref(kind): UrlObject` (`{ pathname: '/note', query: { new: kind, id: <uuid> } }`), `openEditor(router, href)`, `leaveEditor(router)`, `markOnBoard()`
  - `lib/shortcuts.ts`: `SEARCH_INPUT_ID = 'note-search'`, `Shortcut`, `shortcutFor(event): Shortcut | null`, `useGlobalShortcuts()`

- [ ] **Step 1: Write failing tests `lib/routes.test.ts`**

```ts
import type { NextRouter } from 'next/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveEditor, markOnBoard, newNoteHref, noteHref, openEditor } from './routes';

const fakeRouter = (pathname: string) =>
  ({ pathname, push: vi.fn(), replace: vi.fn(), back: vi.fn() }) as unknown as NextRouter;

beforeEach(() => {
  markOnBoard();
});

describe('hrefs', () => {
  it('builds editor URLs', () => {
    expect(noteHref('abc')).toEqual({ pathname: '/note', query: { id: 'abc' } });
    const href = newNoteHref('list');
    expect(href.query).toEqual({ new: 'list', id: expect.any(String) });
    expect(newNoteHref('list').query).not.toEqual(href.query);
  });
});

describe('openEditor / leaveEditor', () => {
  it('goes back to the board it came from', () => {
    const board = fakeRouter('/');
    openEditor(board, noteHref('a'));
    expect(board.push).toHaveBeenCalledWith(noteHref('a'));

    const editor = fakeRouter('/note');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
    expect(editor.push).not.toHaveBeenCalled();
  });

  it('goes home when the editor was opened directly', () => {
    const editor = fakeRouter('/note');
    leaveEditor(editor);
    expect(editor.push).toHaveBeenCalledWith('/');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('replaces history when opening a note from the editor', () => {
    const board = fakeRouter('/');
    openEditor(board, noteHref('a'));
    const editor = fakeRouter('/note');
    openEditor(editor, noteHref('b'));
    expect(editor.replace).toHaveBeenCalledWith(noteHref('b'));
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run lib/routes.test.ts`
Expected: FAIL, cannot resolve `./routes`.

- [ ] **Step 2: Create `lib/routes.ts`**

```ts
import type { NextRouter } from 'next/router';
import type { UrlObject } from 'url';
import { v4 as uuid } from 'uuid';
import type { NoteKind } from './types';

export const noteHref = (id: string): UrlObject => ({ pathname: '/note', query: { id } });

// New notes get their id up front so the editor's URL and identity stay the
// same when the note is first saved.
export const newNoteHref = (kind: NoteKind): UrlObject => ({
  pathname: '/note',
  query: { new: kind, id: uuid() },
});

let openedFromBoard = false;

// Called by the board on mount; browser Back into the board resets the flag.
export const markOnBoard = () => {
  openedFromBoard = false;
};

export const openEditor = (router: NextRouter, href: UrlObject) => {
  if (router.pathname === '/') {
    openedFromBoard = true;
    void router.push(href);
  } else {
    // Editor to editor (Make a copy, shortcuts): keep one history entry so
    // Back still lands on the board.
    void router.replace(href);
  }
};

// Back from the editor: pop history when we came from the board, so it keeps
// its filter and scroll position; otherwise go home.
export const leaveEditor = (router: NextRouter) => {
  if (openedFromBoard) {
    openedFromBoard = false;
    router.back();
  } else {
    void router.push('/');
  }
};
```

Run: `npx vitest run lib/routes.test.ts`
Expected: PASS.

- [ ] **Step 3: Write failing tests `lib/shortcuts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { shortcutFor } from './shortcuts';

const press = (key: string, target: Element = document.body, mods: Partial<KeyboardEvent> = {}) =>
  shortcutFor({
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    ...mods,
  } as KeyboardEvent);

describe('shortcutFor', () => {
  it('maps n, l and /', () => {
    expect(press('n')).toBe('new-note');
    expect(press('l')).toBe('new-list');
    expect(press('/')).toBe('search');
    expect(press('x')).toBeNull();
  });

  it('ignores keys typed into fields', () => {
    expect(press('n', document.createElement('input'))).toBeNull();
    expect(press('n', document.createElement('textarea'))).toBeNull();
  });

  it('ignores keys inside menus and dialogs', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    menu.appendChild(item);
    document.body.appendChild(menu);
    expect(press('n', item)).toBeNull();
    menu.remove();
  });

  it('ignores modified and handled keys', () => {
    expect(press('n', document.body, { metaKey: true })).toBeNull();
    expect(press('l', document.body, { ctrlKey: true })).toBeNull();
    expect(press('/', document.body, { defaultPrevented: true })).toBeNull();
  });
});
```

Run: `npx vitest run lib/shortcuts.test.ts`
Expected: FAIL, cannot resolve `./shortcuts`.

- [ ] **Step 4: Create `lib/shortcuts.ts`**

```ts
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { newNoteHref, openEditor } from './routes';

export const SEARCH_INPUT_ID = 'note-search';

export type Shortcut = 'new-note' | 'new-list' | 'search';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'defaultPrevented' | 'target'>;

const isTyping = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  // Menus use letters for type-ahead.
  return target.closest('[role="menu"],[role="dialog"],[role="listbox"]') !== null;
};

export const shortcutFor = (event: KeyInfo): Shortcut | null => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTyping(event.target)) return null;
  if (event.key === 'n') return 'new-note';
  if (event.key === 'l') return 'new-list';
  if (event.key === '/') return 'search';
  return null;
};

export const useGlobalShortcuts = () => {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFor(event);
      if (!shortcut) return;
      if (shortcut === 'search') {
        const input = document.getElementById(SEARCH_INPUT_ID);
        if (!input) return;
        event.preventDefault();
        input.focus();
        return;
      }
      event.preventDefault();
      openEditor(router, newNoteHref(shortcut === 'new-note' ? 'note' : 'list'));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router]);
};
```

Run: `npx vitest run lib/shortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass. (`useGlobalShortcuts` is registered in Task 9, once `/note` exists.)

```bash
git add lib/routes.ts lib/routes.test.ts lib/shortcuts.ts lib/shortcuts.test.ts
git commit -m "Add editor routes and keyboard shortcut helpers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full-page editor

**Files:**
- Create: `components/editor/ChecklistEditor.tsx`, `ChecklistEditor.module.css`, `NoteBody.tsx`, `NoteBody.module.css`, `EditorToolbar.tsx`, `EditorToolbar.module.css`, `NoteEditor.tsx`, `NoteEditor.module.css` (all in `components/editor/`), `pages/note.tsx`, `styles/NotePage.module.css`
- Test: `components/editor/ChecklistEditor.test.tsx`, `components/editor/NotePage.test.tsx` (not under `pages/`: Next would treat it as a route)

**Interfaces:**
- Consumes: `newItem`, `toggleItemIn`, `convertKind`, `isNoteEmpty`, `createNote`, `updateNote`, `trashNote`, `restoreNote`, `deleteForever`, `duplicateNote`, `useNote`, `useLabels`, `isQuotaError`, `formatEdited`, `useNow`, `leaveEditor`, `noteHref`, `newNoteHref`, `openEditor`, `useStartup`, `useToast`, `IconButton`, `Menu`, `ColorPicker`, `LabelPicker`, `NotFound`.
- Produces:
  - `ChecklistEditor` (default): `{ items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void; readOnly?: boolean; autoFocus?: boolean }`
  - `NoteBody` (default): `{ value: string; onChange: (value: string) => void; readOnly: boolean; autoFocus: boolean }`
  - `NoteEditor` (default): `{ noteId: string; stored: Note | null; newKind: NoteKind | null }`; exports `Draft`
  - `pages/note.tsx`: the `/note` route

- [ ] **Step 1: Write failing tests `components/editor/ChecklistEditor.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../../lib/types';
import ChecklistEditor from './ChecklistEditor';

const Harness = ({ initial }: { initial: ChecklistItem[] }) => {
  const [items, setItems] = useState(initial);
  return (
    <>
      <ChecklistEditor items={items} onChange={setItems} />
      <output data-testid='state'>{items.map((i) => `${i.text}:${i.done ? 'x' : 'o'}`).join(',')}</output>
    </>
  );
};

const state = () => screen.getByTestId('state').textContent;
const textboxes = () => screen.getAllByRole('textbox', { name: 'List item' });

const start = [
  { id: 'a', text: 'Milk', done: false },
  { id: 'b', text: 'Eggs', done: false },
];

describe('ChecklistEditor', () => {
  it('adds an item below on Enter and focuses it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={start} />);
    await user.click(textboxes()[0]);
    await user.keyboard('{Enter}Tea');
    expect(state()).toBe('Milk:o,Tea:o,Eggs:o');
    expect(textboxes()[1]).toHaveFocus();
  });

  it('removes an empty item on Backspace and focuses the previous one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[...start, { id: 'c', text: '', done: false }]} />);
    await user.click(textboxes()[2]);
    await user.keyboard('{Backspace}');
    expect(state()).toBe('Milk:o,Eggs:o');
    expect(textboxes()[1]).toHaveFocus();
  });

  it('moves ticked items to the completed section and back to the end', async () => {
    const user = userEvent.setup();
    render(<Harness initial={start} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” done' }));
    expect(state()).toBe('Milk:x,Eggs:o');
    expect(screen.getByRole('button', { name: /1 completed/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” not done' }));
    expect(state()).toBe('Eggs:o,Milk:o');
  });

  it('creates an item from the add row and keeps typing in it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    await user.type(screen.getByRole('textbox', { name: 'Add list item' }), 'Bread');
    expect(state()).toBe('Bread:o');
    expect(textboxes()[0]).toHaveFocus();
  });
});
```

Run: `npx vitest run components/editor/ChecklistEditor.test.tsx`
Expected: FAIL, cannot resolve `./ChecklistEditor`.

- [ ] **Step 2: Create `components/editor/ChecklistEditor.tsx` and its CSS**

```tsx
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { newItem, toggleItemIn } from '../../lib/checklist';
import type { ChecklistItem } from '../../lib/types';
import IconButton from '../ui/IconButton';
import styles from './ChecklistEditor.module.css';

type Props = {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
};

const ChecklistEditor = ({ items, onChange, readOnly = false, autoFocus = false }: Props) => {
  const [showDone, setShowDone] = useState(true);
  // Item to focus as soon as its input renders.
  const focusId = useRef<string | null>(null);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const focusWhenReady = (id: string) => (el: HTMLInputElement | null) => {
    if (el && focusId.current === id) {
      focusId.current = null;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  };

  const setText = (id: string, text: string) =>
    onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));

  const insertAfter = (id: string) => {
    const item = newItem();
    const index = items.findIndex((i) => i.id === id);
    focusId.current = item.id;
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
  };

  const remove = (item: ChecklistItem, focusPrevious: boolean) => {
    if (focusPrevious) {
      const section = item.done ? done : open;
      const index = section.findIndex((i) => i.id === item.id);
      focusId.current = index > 0 ? section[index - 1].id : null;
    }
    onChange(items.filter((i) => i.id !== item.id));
  };

  const onItemKeyDown = (item: ChecklistItem) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(item.id);
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      remove(item, true);
    }
  };

  const addFromRow = (text: string) => {
    if (!text) return;
    const item = newItem(text);
    focusId.current = item.id;
    onChange([...items, item]);
  };

  const row = (item: ChecklistItem) => {
    const name = item.text || 'item';
    return (
      <li key={item.id} className={item.done ? `${styles.row} ${styles.done}` : styles.row}>
        <input
          type='checkbox'
          checked={item.done}
          disabled={readOnly}
          aria-label={item.done ? `Mark “${name}” not done` : `Mark “${name}” done`}
          onChange={() => onChange(toggleItemIn(items, item.id))}
        />
        <input
          ref={focusWhenReady(item.id)}
          className={styles.text}
          value={item.text}
          readOnly={readOnly}
          aria-label='List item'
          onChange={(e) => setText(item.id, e.target.value)}
          onKeyDown={onItemKeyDown(item)}
        />
        {!readOnly && (
          <IconButton label='Remove item' className={styles.remove} onClick={() => remove(item, false)}>
            <X size={16} aria-hidden />
          </IconButton>
        )}
      </li>
    );
  };

  return (
    <div className={styles.root}>
      {open.length > 0 && <ul className={styles.list}>{open.map(row)}</ul>}
      {!readOnly && (
        <label className={styles.addRow}>
          <Plus size={18} aria-hidden />
          <input
            className={styles.text}
            value=''
            placeholder='List item'
            aria-label='Add list item'
            autoFocus={autoFocus}
            onChange={(e) => addFromRow(e.target.value)}
          />
        </label>
      )}
      {done.length > 0 && (
        <>
          <button
            type='button'
            className={styles.doneToggle}
            aria-expanded={showDone}
            onClick={() => setShowDone((shown) => !shown)}
          >
            {showDone ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            {done.length} completed
          </button>
          {showDone && <ul className={styles.list}>{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
};

export default ChecklistEditor;
```

`components/editor/ChecklistEditor.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list {
  display: flex;
  flex-direction: column;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
}

.row:focus-within {
  box-shadow: inset 0 -2px 0 var(--accent);
}

.text {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  border: none;
  background: transparent;
  font-size: var(--text-md);
  line-height: 1.5;
  color: var(--text);
  outline: none;
}

.text::placeholder {
  color: var(--note-ink);
}

.done .text {
  text-decoration: line-through;
  color: var(--note-ink);
}

.remove {
  opacity: 0;
}

.row:hover .remove,
.row:focus-within .remove {
  opacity: 1;
}

@media (hover: none) {
  .remove {
    opacity: 1;
  }
}

.addRow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  color: var(--note-ink);
}

.doneToggle {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 8px 6px 0;
  border: none;
  background: none;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--note-ink);
}
```

Run: `npx vitest run components/editor/ChecklistEditor.test.tsx`
Expected: PASS.

- [ ] **Step 3: Create `components/editor/NoteBody.tsx` and its CSS**

```tsx
import { useLayoutEffect, useRef } from 'react';
import styles from './NoteBody.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  autoFocus: boolean;
};

const NoteBody = ({ value, onChange, readOnly, autoFocus }: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text instead of scrolling inside the box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={styles.body}
      value={value}
      rows={6}
      placeholder='Note'
      aria-label='Note'
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

export default NoteBody;
```

`components/editor/NoteBody.module.css`:

```css
.body {
  width: 100%;
  min-height: 160px;
  padding: 0;
  overflow: hidden;
  border: none;
  background: transparent;
  resize: none;
  font-size: var(--text-md);
  line-height: 1.6;
  color: var(--text);
  outline: none;
}

.body::placeholder {
  color: var(--note-ink);
}
```

- [ ] **Step 4: Create `components/editor/EditorToolbar.tsx` and its CSS**

```tsx
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  EllipsisVertical,
  FileText,
  ListChecks,
  Palette,
  Pin,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';
import ColorPicker from '../ui/ColorPicker';
import IconButton from '../ui/IconButton';
import LabelPicker from '../ui/LabelPicker';
import Menu from '../ui/Menu';
import type { Draft } from './NoteEditor';
import styles from './EditorToolbar.module.css';

type Props = {
  draft: Draft;
  trashed: boolean;
  onBack: () => void;
  onChange: (changes: Partial<Draft>) => void;
  onTogglePin: () => void;
  onSwitchKind: () => void;
  onArchive: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
};

const EditorToolbar = ({
  draft,
  trashed,
  onBack,
  onChange,
  onTogglePin,
  onSwitchKind,
  onArchive,
  onCopy,
  onDelete,
  onRestore,
  onDeleteForever,
}: Props) => (
  <header className={styles.bar}>
    <IconButton label='Back to notes' onClick={onBack}>
      <ArrowLeft size={20} aria-hidden />
    </IconButton>
    <div className={styles.actions}>
      {trashed ? (
        <>
          <button type='button' className={styles.textButton} onClick={onRestore}>
            <RotateCcw size={16} aria-hidden />
            Restore
          </button>
          <IconButton label='Delete forever' onClick={onDeleteForever}>
            <Trash2 size={18} aria-hidden />
          </IconButton>
        </>
      ) : (
        <>
          <IconButton label={draft.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={draft.pinned} onClick={onTogglePin}>
            <Pin size={18} fill={draft.pinned ? 'currentColor' : 'none'} aria-hidden />
          </IconButton>
          <ColorPicker
            value={draft.color}
            onChange={(color) => onChange({ color })}
            trigger={
              <IconButton label='Change colour'>
                <Palette size={18} aria-hidden />
              </IconButton>
            }
          />
          <LabelPicker
            selectedIds={draft.labelIds}
            onChange={(labelIds) => onChange({ labelIds })}
            trigger={
              <IconButton label='Labels'>
                <Tag size={18} aria-hidden />
              </IconButton>
            }
          />
          <IconButton label={draft.kind === 'note' ? 'Convert to list' : 'Convert to note'} onClick={onSwitchKind}>
            {draft.kind === 'note' ? <ListChecks size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
          </IconButton>
          <IconButton label={draft.archived ? 'Unarchive' : 'Archive'} onClick={onArchive}>
            {draft.archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}
          </IconButton>
          <Menu
            items={[
              { label: 'Make a copy', icon: <Copy size={16} aria-hidden />, onSelect: onCopy },
              { label: 'Delete', icon: <Trash2 size={16} aria-hidden />, danger: true, onSelect: onDelete },
            ]}
            trigger={
              <IconButton label='More actions'>
                <EllipsisVertical size={18} aria-hidden />
              </IconButton>
            }
          />
        </>
      )}
    </div>
  </header>
);

export default EditorToolbar;
```

`components/editor/EditorToolbar.module.css`:

```css
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  background: var(--note-bg);
  color: var(--text);
}

.actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.textButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  font-size: var(--text-sm);
  font-weight: 700;
  color: inherit;
}

.textButton:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}
```

- [ ] **Step 5: Create `components/editor/NoteEditor.tsx` and its CSS**

```tsx
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { convertKind, isNoteEmpty } from '../../lib/checklist';
import {
  createNote,
  deleteForever,
  duplicateNote,
  restoreNote,
  trashNote,
  updateNote,
  useLabels,
} from '../../lib/notes';
import { leaveEditor, noteHref, openEditor } from '../../lib/routes';
import { isQuotaError } from '../../lib/storage';
import { formatEdited, useNow } from '../../lib/time';
import type { Note, NoteKind } from '../../lib/types';
import { useToast } from '../ui/Toast';
import ChecklistEditor from './ChecklistEditor';
import EditorToolbar from './EditorToolbar';
import NoteBody from './NoteBody';
import styles from './NoteEditor.module.css';

export type Draft = Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived'>;

const SAVE_DELAY_MS = 300;

const blankDraft = (kind: NoteKind): Draft => ({
  kind,
  title: '',
  content: '',
  items: [],
  color: 'default',
  labelIds: [],
  pinned: false,
  archived: false,
});

const toDraft = ({ kind, title, content, items, color, labelIds, pinned, archived }: Note): Draft => ({
  kind,
  title,
  content,
  items,
  color,
  labelIds,
  pinned,
  archived,
});

const EditedAt = ({ timestamp }: { timestamp: number }) => {
  const now = useNow();
  return <p className={styles.meta}>{formatEdited(timestamp, now)}</p>;
};

type Props = {
  noteId: string;
  stored: Note | null; // live copy from the database; null for an unsaved draft
  newKind: NoteKind | null;
};

const NoteEditor = ({ noteId, stored, newKind }: Props) => {
  const router = useRouter();
  const toast = useToast();
  const labels = useLabels() ?? [];
  // `stored` only seeds the draft; after that the draft is the source of truth.
  const [draft, setDraft] = useState<Draft>(() => (stored ? toDraft(stored) : blankDraft(newKind ?? 'note')));
  const draftRef = useRef(draft);
  const createdRef = useRef(stored !== null);
  const editedRef = useRef(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const trashed = stored?.trashedAt != null;

  const save = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const current = draftRef.current;
    try {
      if (createdRef.current) {
        await updateNote(noteId, current);
      } else if (!isNoteEmpty(current)) {
        await createNote({ id: noteId, ...current });
        createdRef.current = true;
        void router.replace(noteHref(noteId), undefined, { shallow: true });
      }
    } catch (error) {
      dirtyRef.current = true;
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
    }
  };

  // Saves run one at a time, so the first save can't create the note twice.
  const flush = () => {
    clearTimeout(timerRef.current);
    queueRef.current = queueRef.current.then(save);
    return queueRef.current;
  };

  const update = (changes: Partial<Draft>) => {
    const next = { ...draftRef.current, ...changes };
    draftRef.current = next;
    dirtyRef.current = true;
    editedRef.current = true;
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const onLeave = useEffectEvent(() => {
    void flush().then(async () => {
      // A note the user emptied goes to Trash rather than lingering blank.
      if (!createdRef.current || !editedRef.current || trashed || !isNoteEmpty(draftRef.current)) return;
      await trashNote(noteId);
      toast({ message: 'Empty note moved to trash', actionLabel: 'Undo', onAction: () => void restoreNote(noteId) });
    });
  });

  const onPageHide = useEffectEvent(() => {
    void flush();
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Popovers and menus close themselves on Escape.
    if (event.target instanceof Element && event.target.closest('[role="dialog"],[role="menu"]')) return;
    leaveEditor(router);
  });

  useEffect(() => {
    const hide = () => onPageHide();
    const key = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('pagehide', hide);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('keydown', key);
      onLeave();
    };
  }, []);

  const togglePin = () => update({ pinned: !draft.pinned, archived: draft.pinned ? draft.archived : false });

  const archive = async () => {
    const archiving = !draft.archived;
    const wasPinned = draft.pinned;
    update({ archived: archiving, pinned: archiving ? false : draft.pinned });
    await flush();
    if (!archiving || !createdRef.current) return;
    leaveEditor(router);
    toast({
      message: 'Note archived',
      actionLabel: 'Undo',
      onAction: () => void updateNote(noteId, { archived: false, pinned: wasPinned }),
    });
  };

  const remove = async () => {
    await flush();
    editedRef.current = false;
    if (createdRef.current) {
      await trashNote(noteId);
      toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void restoreNote(noteId) });
    }
    leaveEditor(router);
  };

  const copy = async () => {
    await flush();
    if (!createdRef.current) return;
    const duplicate = await duplicateNote(noteId);
    if (!duplicate) return;
    openEditor(router, noteHref(duplicate.id));
    toast({ message: 'Copy created' });
  };

  const restore = async () => {
    await restoreNote(noteId);
    toast({ message: 'Note restored' });
  };

  const removeForever = async () => {
    if (!window.confirm('Delete this note forever? This can’t be undone.')) return;
    editedRef.current = false;
    await deleteForever(noteId);
    leaveEditor(router);
  };

  const labelNames = draft.labelIds
    .map((id) => labels.find((l) => l.id === id)?.name)
    .filter((name): name is string => !!name);

  return (
    <div className={styles.page} data-color={draft.color}>
      <Head>
        <title>{`${draft.title || 'Untitled'} | Noteboard`}</title>
      </Head>
      <EditorToolbar
        draft={draft}
        trashed={trashed}
        onBack={() => leaveEditor(router)}
        onChange={update}
        onTogglePin={togglePin}
        onSwitchKind={() => update(convertKind(draftRef.current))}
        onArchive={() => void archive()}
        onCopy={() => void copy()}
        onDelete={() => void remove()}
        onRestore={() => void restore()}
        onDeleteForever={() => void removeForever()}
      />
      <main className={styles.body}>
        {trashed && <p className={styles.notice}>This note is in Trash. Restore it to edit.</p>}
        <input
          className={styles.title}
          value={draft.title}
          placeholder='Title'
          aria-label='Title'
          readOnly={trashed}
          onChange={(e) => update({ title: e.target.value })}
        />
        {draft.kind === 'note' ? (
          <NoteBody
            value={draft.content}
            readOnly={trashed}
            autoFocus={stored === null}
            onChange={(content) => update({ content })}
          />
        ) : (
          <ChecklistEditor
            items={draft.items}
            readOnly={trashed}
            autoFocus={stored === null}
            onChange={(items) => update({ items })}
          />
        )}
        {labelNames.length > 0 && (
          <ul className={styles.labels} aria-label='Labels'>
            {labelNames.map((name) => (
              <li key={name} className={styles.label}>
                {name}
              </li>
            ))}
          </ul>
        )}
        {stored && <EditedAt timestamp={stored.updatedAt} />}
      </main>
    </div>
  );
};

export default NoteEditor;
```

`components/editor/NoteEditor.module.css`:

```css
.page {
  min-height: 100vh;
  background: var(--note-bg);
  color: var(--text);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 24px 96px;
}

.title {
  padding: 4px 0;
  border: none;
  background: transparent;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text);
  outline: none;
}

.title::placeholder {
  color: var(--note-ink);
}

.notice {
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  font-size: var(--text-sm);
}

.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
  list-style: none;
}

.label {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  font-size: var(--text-xs);
  color: var(--text);
}

.meta {
  margin-top: 16px;
  font-size: var(--text-xs);
  color: var(--note-ink);
}

@media (max-width: 600px) {
  .body {
    padding: 16px 16px 96px;
  }
}
```

- [ ] **Step 6: Write failing tests `components/editor/NotePage.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NotePage from '../../pages/note';

const router = vi.hoisted(() => ({
  pathname: '/note',
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
  localStorage.clear();
  vi.clearAllMocks();
});

const savedContent = async (id: string) => (await db.notes.get(id))?.content;

describe('NotePage', () => {
  it('keeps the same editor and text when a new note is first saved', async () => {
    router.query = { new: 'note', id: 'n1' };
    const user = userEvent.setup();
    const { rerender } = render(<NotePage />);
    const body = await screen.findByRole('textbox', { name: 'Note' });
    await user.type(body, 'Milk');
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/note', query: { id: 'n1' } }, undefined, {
        shallow: true,
      }),
    );
    router.query = { id: 'n1' };
    rerender(<NotePage />);
    await user.type(body, ' and eggs');
    expect(screen.getByRole('textbox', { name: 'Note' })).toBe(body);
    expect(body).toHaveFocus();
    await waitFor(async () => expect(await savedContent('n1')).toBe('Milk and eggs'));
  });

  it('saves the last keystrokes when the editor closes before the autosave delay', async () => {
    await createNote({ id: 'n2', kind: 'note', title: 'Draft' });
    router.query = { id: 'n2' };
    const user = userEvent.setup();
    const { unmount } = render(<NotePage />);
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Quick');
    unmount();
    await waitFor(async () => expect(await savedContent('n2')).toBe('Quick'));
  });

  it('moves a note the user emptied to trash on leaving', async () => {
    await createNote({ id: 'n3', kind: 'note', content: 'x' });
    router.query = { id: 'n3' };
    const user = userEvent.setup();
    const { unmount } = render(<NotePage />);
    await user.clear(await screen.findByRole('textbox', { name: 'Note' }));
    unmount();
    await waitFor(async () => expect((await db.notes.get('n3'))?.trashedAt).not.toBeNull());
  });

  it('does not save an untouched new note', async () => {
    router.query = { new: 'list', id: 'n4' };
    const { unmount } = render(<NotePage />);
    await screen.findByRole('textbox', { name: 'Add list item' });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await db.notes.get('n4')).toBeUndefined();
  });

  it('goes home on Escape when opened directly', async () => {
    await createNote({ id: 'n5', kind: 'note', title: 'Esc' });
    router.query = { id: 'n5' };
    const user = userEvent.setup();
    render(<NotePage />);
    await screen.findByRole('textbox', { name: 'Title' });
    await user.keyboard('{Escape}');
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('shows a trashed note read-only with Restore', async () => {
    await createNote({ id: 'n6', kind: 'note', title: 'Old' });
    await db.notes.update('n6', { trashedAt: 1 });
    router.query = { id: 'n6' };
    const user = userEvent.setup();
    render(<NotePage />);
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('n6'))?.trashedAt).toBeNull());
  });

  it('says when a note does not exist', async () => {
    router.query = { id: 'missing' };
    render(<NotePage />);
    expect(await screen.findByText('Note not found')).toBeInTheDocument();
  });

  it('gives a new note an id when the URL has none', async () => {
    router.query = { new: 'note' };
    render(<NotePage />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/note',
        query: { new: 'note', id: expect.any(String) },
      }),
    );
  });
});
```

Run: `npx vitest run components/editor/NotePage.test.tsx`
Expected: FAIL, cannot resolve `../../pages/note`.

- [ ] **Step 7: Create `pages/note.tsx` and `styles/NotePage.module.css`**

```tsx
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import NoteEditor from '../components/editor/NoteEditor';
import NotFound from '../components/NotFound';
import { useNote } from '../lib/notes';
import { newNoteHref } from '../lib/routes';
import { useStartup } from '../lib/startup';
import type { NoteKind } from '../lib/types';
import styles from '../styles/NotePage.module.css';

const single = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

const parseKind = (value: string | string[] | undefined): NoteKind | null =>
  value === 'note' || value === 'list' ? value : null;

const Loading = () => <div className={styles.loading} aria-busy='true' />;

const Missing = () => (
  <div className={styles.missing}>
    <NotFound text='Note not found' />
    <Link href='/' className={styles.backLink}>
      Back to notes
    </Link>
  </div>
);

const EditorLoader = ({ id, newKind }: { id: string; newKind: NoteKind | null }) => {
  const stored = useNote(id);
  const [editing, setEditing] = useState(false);
  const canEdit = stored !== undefined && (stored !== null || newKind !== null);
  // Once open, stay open: right after a new note's first save the URL drops
  // `new` before the live query has caught up, and remounting would lose focus.
  if (canEdit && !editing) setEditing(true);
  if (editing || canEdit) return <NoteEditor key={id} noteId={id} stored={stored ?? null} newKind={newKind} />;
  if (stored === undefined) return <Loading />;
  return <Missing />;
};

const NotePage: NextPage = () => {
  const router = useRouter();
  const status = useStartup();
  const id = single(router.query.id);
  const newKind = parseKind(router.query.new);

  // `/note?new=list` without an id: give the draft its id up front.
  useEffect(() => {
    if (router.isReady && newKind && !id) void router.replace(newNoteHref(newKind));
  }, [router, newKind, id]);

  if (!router.isReady || status === 'pending') return <Loading />;
  if (id) return <EditorLoader key={id} id={id} newKind={newKind} />;
  if (newKind) return <Loading />;
  return <Missing />;
};

export default NotePage;
```

`styles/NotePage.module.css`:

```css
.loading {
  min-height: 100vh;
  background: var(--bg);
}

.missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 0 16px 48px;
}

.backLink {
  font-weight: 700;
  color: var(--accent);
}
```

Run: `npx vitest run components/editor/NotePage.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 8: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass. The build output lists `/note`.

Manual (fresh Chrome profile, `npm run dev`):
1. Open http://localhost:4000/note?new=list. The URL gains an `id`. Type an item, press Enter, type another, tick the first; it moves under "1 completed".
2. Wait a second; the URL becomes `/note?id=…`. Reload: the list is there.
3. Change colour, add a label "Work", convert to a note and back. Press Esc: you land on `/`.

```bash
git add components/editor pages/note.tsx styles/NotePage.module.css
git commit -m "Add full-page note and checklist editor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Board and removal of the old UI

**Files:**
- Create: `components/board/TopBar.tsx`, `TopBar.module.css`, `FilterChips.tsx`, `FilterChips.module.css`, `MoreMenu.tsx`, `NoteCard.tsx`, `NoteCard.module.css`, `NoteGrid.tsx`, `NoteGrid.module.css` (all in `components/board/`)
- Replace: `pages/index.tsx`, `styles/Home.module.css`
- Modify: `pages/_app.tsx`, `styles/globals.css`, `components/NotFound/NotFound.module.css`
- Delete: `components/Header.tsx`, `components/Note.tsx`, `components/NoteModal.tsx`, `components/Modal/`, `styles/Note.module.css`, `lib/legacyNotes.ts`
- Test: `components/board/NoteCard.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–7, `NotFound`.
- Produces:
  - `NoteCard` (default) and `CardMode = 'board' | 'archive' | 'trash'`: `{ note: Note; labelNames: string[]; mode: CardMode; onOpen: (id: string) => void }`
  - `NoteGrid` (default): `{ notes: Note[]; labelNames: Map<string, string>; mode: CardMode; onOpen: (id: string) => void }`
  - `TopBar` (default): `{ initialQuery: string; searchKey: string; onQueryChange: (query: string) => void; onNew: (kind: NoteKind) => void }`
  - `FilterChips` (default): `{ filter: BoardFilter; labels: Label[]; onSelect: (next: Pick<BoardFilter, 'view' | 'labelId'>) => void; onManageLabels: () => void }`
  - `MoreMenu` (default): `{ onArchive: () => void; onTrash: () => void; onManageLabels: () => void }`

- [ ] **Step 1: Write failing tests `components/board/NoteCard.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { createNote } from '../../lib/notes';
import NoteCard from './NoteCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const groceries = () =>
  createNote({
    id: 'c1',
    kind: 'list',
    title: 'Groceries',
    items: [
      { id: 'i1', text: 'Milk', done: false },
      { id: 'i2', text: 'Bread', done: true },
    ],
  });

describe('NoteCard', () => {
  it('opens the note from the card', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={['Home']} mode='board' onOpen={onOpen} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('+1 completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open note: Groceries' }));
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('ticks a list item without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark “Milk” done' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.items[0].done).toBe(true));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('deletes from the menu without opening the note', async () => {
    const note = await groceries();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='board' onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).not.toBeNull());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers restore in trash and no editing controls', async () => {
    const note = { ...(await groceries()), trashedAt: 1 };
    const user = userEvent.setup();
    render(<NoteCard note={note} labelNames={[]} mode='trash' onOpen={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Mark “Milk” done' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    await db.notes.update('c1', { trashedAt: 1 });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('c1'))?.trashedAt).toBeNull());
  });
});
```

Run: `npx vitest run components/board/NoteCard.test.tsx`
Expected: FAIL, cannot resolve `./NoteCard`.

- [ ] **Step 2: Create `components/board/NoteCard.tsx` and its CSS**

```tsx
import { Archive, ArchiveRestore, EllipsisVertical, Palette, Pin, RotateCcw, Trash2 } from 'lucide-react';
import {
  deleteForever,
  restoreNote,
  restoreSnapshot,
  setArchived,
  toggleItem,
  togglePin,
  trashNote,
  updateNote,
} from '../../lib/notes';
import type { Note } from '../../lib/types';
import ColorPicker from '../ui/ColorPicker';
import IconButton from '../ui/IconButton';
import Menu from '../ui/Menu';
import { useToast } from '../ui/Toast';
import styles from './NoteCard.module.css';

export type CardMode = 'board' | 'archive' | 'trash';

type Props = {
  note: Note;
  labelNames: string[];
  mode: CardMode;
  onOpen: (id: string) => void;
};

const PREVIEW_ITEMS = 8;

const NoteCard = ({ note, labelNames, mode, onOpen }: Props) => {
  const toast = useToast();
  const openItems = note.items.filter((i) => !i.done);
  const doneCount = note.items.length - openItems.length;
  const isEmpty = !note.title && (note.kind === 'note' ? !note.content : note.items.length === 0);

  const archive = async () => {
    await setArchived(note.id, true);
    toast({ message: 'Note archived', actionLabel: 'Undo', onAction: () => void restoreSnapshot(note) });
  };

  const trash = async () => {
    await trashNote(note.id);
    toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void restoreNote(note.id) });
  };

  const removeForever = () => {
    if (window.confirm('Delete this note forever? This can’t be undone.')) void deleteForever(note.id);
  };

  return (
    <article className={styles.card} data-color={note.color}>
      {/* Covers the card so a click anywhere opens it; checkboxes and
          actions sit above it and don't bubble into it. */}
      <button
        type='button'
        className={styles.open}
        aria-label={`Open note: ${note.title || 'Untitled'}`}
        onClick={() => onOpen(note.id)}
      />
      {note.title && <h3 className={styles.title}>{note.title}</h3>}
      {note.kind === 'note' && note.content && <p className={styles.content}>{note.content}</p>}
      {note.kind === 'list' && openItems.length > 0 && (
        <ul className={styles.items}>
          {openItems.slice(0, PREVIEW_ITEMS).map((item) => (
            <li key={item.id}>
              <label className={styles.item}>
                <input
                  type='checkbox'
                  checked={false}
                  disabled={mode === 'trash'}
                  aria-label={`Mark “${item.text || 'item'}” done`}
                  onChange={() => void toggleItem(note.id, item.id)}
                />
                <span>{item.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {openItems.length > PREVIEW_ITEMS && <p className={styles.more}>+{openItems.length - PREVIEW_ITEMS} more</p>}
      {doneCount > 0 && <p className={styles.more}>+{doneCount} completed</p>}
      {isEmpty && <p className={styles.more}>Empty note</p>}
      {labelNames.length > 0 && (
        <ul className={styles.labels} aria-label='Labels'>
          {labelNames.map((name) => (
            <li key={name} className={styles.label}>
              {name}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        {mode === 'trash' ? (
          <>
            <IconButton label='Restore' onClick={() => void restoreNote(note.id)}>
              <RotateCcw size={16} aria-hidden />
            </IconButton>
            <IconButton label='Delete forever' onClick={removeForever}>
              <Trash2 size={16} aria-hidden />
            </IconButton>
          </>
        ) : (
          <>
            {mode === 'board' && (
              <IconButton
                label={note.pinned ? 'Unpin note' : 'Pin note'}
                aria-pressed={note.pinned}
                onClick={() => void togglePin(note.id)}
              >
                <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} aria-hidden />
              </IconButton>
            )}
            <ColorPicker
              value={note.color}
              onChange={(color) => void updateNote(note.id, { color })}
              trigger={
                <IconButton label='Change colour'>
                  <Palette size={16} aria-hidden />
                </IconButton>
              }
            />
            {mode === 'archive' ? (
              <IconButton label='Unarchive' onClick={() => void setArchived(note.id, false)}>
                <ArchiveRestore size={16} aria-hidden />
              </IconButton>
            ) : (
              <IconButton label='Archive' onClick={() => void archive()}>
                <Archive size={16} aria-hidden />
              </IconButton>
            )}
            <Menu
              items={[
                {
                  label: 'Delete',
                  icon: <Trash2 size={16} aria-hidden />,
                  danger: true,
                  onSelect: () => void trash(),
                },
              ]}
              trigger={
                <IconButton label='More actions'>
                  <EllipsisVertical size={16} aria-hidden />
                </IconButton>
              }
            />
          </>
        )}
      </div>
    </article>
  );
};

export default NoteCard;
```

`components/board/NoteCard.module.css`:

```css
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--note-bg);
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:not([data-color='default']) {
  border-color: transparent;
}

.card:hover {
  box-shadow: var(--shadow-raised);
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card:hover {
    transform: none;
  }
}

.open {
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: transparent;
}

.open:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Text lets clicks fall through to the open button; controls take them. */
.title,
.content,
.items,
.more,
.labels {
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.title {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text);
  overflow-wrap: anywhere;
}

.content {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--note-ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 10;
}

.items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--note-ink);
  overflow-wrap: anywhere;
  cursor: pointer;
  pointer-events: auto;
}

.item input {
  flex: none;
  margin-top: 1px;
}

.more {
  font-size: var(--text-xs);
  color: var(--note-ink);
}

.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
  list-style: none;
}

.label {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  font-size: var(--text-xs);
  color: var(--text);
}

.actions {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin: 0 -10px;
  color: var(--note-ink);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.card:hover .actions,
.card:focus-within .actions {
  opacity: 1;
}

@media (hover: none) {
  .actions {
    opacity: 1;
  }
}
```

Run: `npx vitest run components/board/NoteCard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Create `components/board/NoteGrid.tsx` and its CSS**

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import type { Note } from '../../lib/types';
import NoteCard, { type CardMode } from './NoteCard';
import styles from './NoteGrid.module.css';

type Props = {
  notes: Note[];
  labelNames: Map<string, string>;
  mode: CardMode;
  onOpen: (id: string) => void;
};

const NoteGrid = ({ notes, labelNames, mode, onOpen }: Props) => (
  <div className={styles.grid}>
    <AnimatePresence initial={false}>
      {notes.map((note) => (
        <motion.div
          key={note.id}
          className={styles.cell}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2 }}
        >
          <NoteCard
            note={note}
            mode={mode}
            onOpen={onOpen}
            labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((name): name is string => !!name)}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

export default NoteGrid;
```

`components/board/NoteGrid.module.css`:

```css
/* Masonry: up to 4 columns, at least 160px wide (2 columns on phones). */
.grid {
  column-width: 160px;
  column-count: 4;
  column-gap: 16px;
}

.cell {
  margin-bottom: 16px;
  break-inside: avoid;
}

@media (max-width: 600px) {
  .grid {
    column-gap: 10px;
  }
  .cell {
    margin-bottom: 10px;
  }
}
```

- [ ] **Step 4: Create `components/board/TopBar.tsx` and its CSS**

```tsx
import { ListTodo, Plus, Search, StickyNote } from 'lucide-react';
import { SEARCH_INPUT_ID } from '../../lib/shortcuts';
import type { NoteKind } from '../../lib/types';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './TopBar.module.css';

type Props = {
  initialQuery: string;
  searchKey: string; // remounts the input once the URL is known
  onQueryChange: (query: string) => void;
  onNew: (kind: NoteKind) => void;
};

const TopBar = ({ initialQuery, searchKey, onQueryChange, onNew }: Props) => {
  const newItems: MenuItem[] = [
    { label: 'Note', icon: <StickyNote size={16} aria-hidden />, onSelect: () => onNew('note') },
    { label: 'List', icon: <ListTodo size={16} aria-hidden />, onSelect: () => onNew('list') },
  ];

  return (
    <header className={styles.bar}>
      <span className={styles.logo}>Noteboard</span>
      <label className={styles.search}>
        <Search size={16} aria-hidden />
        <input
          key={searchKey}
          id={SEARCH_INPUT_ID}
          type='search'
          placeholder='Search notes'
          aria-label='Search notes'
          defaultValue={initialQuery}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <Menu
        items={newItems}
        trigger={
          <button type='button' className={styles.newButton}>
            <Plus size={16} aria-hidden />
            New
          </button>
        }
      />
      <Menu
        items={newItems}
        trigger={
          <button type='button' className={styles.fab} aria-label='New note or list'>
            <Plus size={24} aria-hidden />
          </button>
        }
      />
    </header>
  );
};

export default TopBar;
```

`components/board/TopBar.module.css`:

```css
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: var(--surface);
  box-shadow: 0 1px 0 var(--border);
}

.logo {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--accent);
}

.search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  max-width: 640px;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-muted);
}

.search:focus-within {
  outline: 2px solid var(--focus);
}

.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  font-size: var(--text-sm);
  color: var(--text);
  outline: none;
}

.search input::placeholder {
  color: var(--text-muted);
}

.newButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  margin-left: auto;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--on-accent);
}

.newButton:hover {
  background: var(--accent-hover);
}

.fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-raised);
}

@media (max-width: 600px) {
  .bar {
    gap: 10px;
    padding: 10px 12px;
  }
  .logo {
    font-size: var(--text-md);
  }
  .newButton {
    display: none;
  }
  .fab {
    display: inline-flex;
  }
}
```

- [ ] **Step 5: Create `components/board/MoreMenu.tsx`**

```tsx
import { Archive, Check, EllipsisVertical, Tags, Trash2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { setTheme, useTheme, type ThemePref } from '../../lib/theme';
import IconButton from '../ui/IconButton';
import styles from '../ui/Menu.module.css';

type Props = {
  onArchive: () => void;
  onTrash: () => void;
  onManageLabels: () => void;
};

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Non-modal so "Manage labels" can open its dialog without the menu
// fighting it for focus.
const MoreMenu = ({ onArchive, onTrash, onManageLabels }: Props) => {
  const theme = useTheme();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label='More options'>
          <EllipsisVertical size={18} aria-hidden />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align='end' sideOffset={6}>
          <DropdownMenu.Item className={styles.item} onSelect={onArchive}>
            <Archive size={16} aria-hidden />
            Archive
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onTrash}>
            <Trash2 size={16} aria-hidden />
            Trash
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onManageLabels}>
            <Tags size={16} aria-hidden />
            Manage labels
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.label}>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemePref)}>
            {THEMES.map((option) => (
              <DropdownMenu.RadioItem key={option.value} value={option.value} className={styles.item}>
                {option.label}
                <DropdownMenu.ItemIndicator className={styles.indicator}>
                  <Check size={16} aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default MoreMenu;
```

- [ ] **Step 6: Create `components/board/FilterChips.tsx` and its CSS**

```tsx
import { Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardFilter, BoardView, Label } from '../../lib/types';
import MoreMenu from './MoreMenu';
import styles from './FilterChips.module.css';

type Selection = Pick<BoardFilter, 'view' | 'labelId'>;

type Props = {
  filter: BoardFilter;
  labels: Label[];
  onSelect: (next: Selection) => void;
  onManageLabels: () => void;
};

const FilterChips = ({ filter, labels, onSelect, onManageLabels }: Props) => {
  const isView = (view: BoardView) => filter.view === view && filter.labelId === null;

  const chip = (key: string, content: ReactNode, active: boolean, next: Selection) => (
    <button key={key} type='button' className={styles.chip} aria-pressed={active} onClick={() => onSelect(next)}>
      {content}
    </button>
  );

  return (
    <nav className={styles.bar} aria-label='Filters'>
      <div className={styles.chips}>
        {chip('all', 'All', isView('all'), { view: 'all', labelId: null })}
        {chip('notes', 'Notes', isView('notes'), { view: 'notes', labelId: null })}
        {chip('lists', 'Lists', isView('lists'), { view: 'lists', labelId: null })}
        {labels.map((label) =>
          chip(
            label.id,
            <>
              <Tag size={14} aria-hidden />
              {label.name}
            </>,
            filter.labelId === label.id,
            { view: 'all', labelId: label.id },
          ),
        )}
        {filter.view === 'archive' && chip('archive', 'Archive', true, { view: 'archive', labelId: null })}
        {filter.view === 'trash' && chip('trash', 'Trash', true, { view: 'trash', labelId: null })}
      </div>
      <MoreMenu
        onArchive={() => onSelect({ view: 'archive', labelId: null })}
        onTrash={() => onSelect({ view: 'trash', labelId: null })}
        onManageLabels={onManageLabels}
      />
    </nav>
  );
};

export default FilterChips;
```

`components/board/FilterChips.module.css`:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 16px 4px;
  color: var(--text-muted);
}

.chips {
  display: flex;
  flex: 1;
  gap: 8px;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  font-size: var(--text-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

.chip:hover {
  border-color: var(--accent);
}

.chip[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent);
  font-weight: 700;
  color: var(--on-accent);
}
```

- [ ] **Step 7: Replace `pages/index.tsx` and `styles/Home.module.css`**

```tsx
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import FilterChips from '../components/board/FilterChips';
import type { CardMode } from '../components/board/NoteCard';
import NoteGrid from '../components/board/NoteGrid';
import TopBar from '../components/board/TopBar';
import NotFound from '../components/NotFound';
import LabelsDialog from '../components/ui/LabelsDialog';
import { useToast } from '../components/ui/Toast';
import { emptyMessage, filterToQuery, parseFilter } from '../lib/filters';
import { emptyTrash, useBoardNotes, useLabels } from '../lib/notes';
import { markOnBoard, newNoteHref, noteHref, openEditor } from '../lib/routes';
import { useStartup } from '../lib/startup';
import type { BoardFilter, NoteKind } from '../lib/types';
import styles from '../styles/Home.module.css';

const Home: NextPage = () => {
  const router = useRouter();
  const toast = useToast();
  const status = useStartup();
  const filter = parseFilter(router.query);
  const board = useBoardNotes(filter);
  const labels = useLabels();
  const [labelsOpen, setLabelsOpen] = useState(false);
  const loaded = status !== 'pending' && board !== undefined;

  useEffect(() => {
    markOnBoard();
  }, []);

  // Notes are on screen now, so stop force-hiding the empty state
  // (the attribute is set before first paint in _document).
  useEffect(() => {
    if (loaded) document.documentElement.removeAttribute('data-has-notes');
  }, [loaded]);

  const labelNames = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);

  const showFilter = (next: Pick<BoardFilter, 'view' | 'labelId'>) =>
    void router.push({ pathname: '/', query: filterToQuery({ ...filter, ...next }) }, undefined, { shallow: true });

  const search = (query: string) =>
    void router.replace({ pathname: '/', query: filterToQuery({ ...filter, query }) }, undefined, { shallow: true });

  const openNote = (id: string) => openEditor(router, noteHref(id));
  const newNote = (kind: NoteKind) => openEditor(router, newNoteHref(kind));

  const clearTrash = async () => {
    if (!window.confirm('Delete all notes in Trash forever? This can’t be undone.')) return;
    await emptyTrash();
    toast({ message: 'Trash emptied' });
  };

  const mode: CardMode = filter.view === 'trash' ? 'trash' : filter.view === 'archive' ? 'archive' : 'board';
  const pinned = loaded && board ? board.pinned : [];
  const others = loaded && board ? board.others : [];
  const total = pinned.length + others.length;
  const headings = pinned.length > 0 && others.length > 0;

  return (
    <>
      <Head>
        <title>Noteboard</title>
        <meta name='description' content='Notes and lists by Nine Technology' />
      </Head>
      <TopBar
        initialQuery={filter.query}
        searchKey={router.isReady ? 'ready' : 'loading'}
        onQueryChange={search}
        onNew={newNote}
      />
      <FilterChips
        filter={filter}
        labels={labels ?? []}
        onSelect={showFilter}
        onManageLabels={() => setLabelsOpen(true)}
      />
      <main className={styles.main}>
        {mode === 'trash' && total > 0 && (
          <div className={styles.trashBar}>
            <p>Notes in Trash are deleted after 30 days.</p>
            <button type='button' className={styles.textButton} onClick={() => void clearTrash()}>
              Empty trash
            </button>
          </div>
        )}
        {pinned.length > 0 && (
          <section className={styles.section} aria-label='Pinned notes'>
            {headings && <h2 className={styles.sectionTitle}>Pinned</h2>}
            <NoteGrid notes={pinned} labelNames={labelNames} mode={mode} onOpen={openNote} />
          </section>
        )}
        {others.length > 0 && (
          <section className={styles.section} aria-label={headings ? 'Other notes' : 'Notes'}>
            {headings && <h2 className={styles.sectionTitle}>Others</h2>}
            <NoteGrid notes={others} labelNames={labelNames} mode={mode} onOpen={openNote} />
          </section>
        )}
        {/* Also rendered on the server and while loading; _document hides it
            before first paint when notes exist. */}
        {total === 0 && (
          <div className={styles.emptyState}>
            <NotFound text={emptyMessage(filter)} />
          </div>
        )}
      </main>
      <LabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
    </>
  );
};

export default Home;
```

`styles/Home.module.css` (replace the whole file):

```css
.main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px 16px 96px;
}

.section + .section {
  margin-top: 24px;
}

.sectionTitle {
  margin: 0 4px 10px;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.trashBar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 4px 16px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.textButton {
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-weight: 700;
  color: var(--accent);
}

.textButton:hover {
  background: var(--accent-soft);
}

:global(html[data-has-notes]) .emptyState {
  display: none;
}
```

- [ ] **Step 8: Restyle the empty state**

Replace `components/NotFound/NotFound.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 248px;
  margin: 96px auto 0;
  color: var(--text-muted);
  font-weight: 700;
  text-align: center;
}

.image {
  width: 100%;
  height: auto;
}

.root > p {
  margin-top: 16px;
}
```

- [ ] **Step 9: Delete the old UI and register shortcuts**

```bash
git rm components/Header.tsx components/Note.tsx components/NoteModal.tsx styles/Note.module.css lib/legacyNotes.ts
git rm -r components/Modal
```

In `styles/globals.css`, delete everything from `.header {` to the end of the file (the `.header`, `.logo`, `.add-note__btn`, `.add-note__fab`, `.button__primary*` rules and the `@media (max-width: 420px)` block).

In `pages/_app.tsx`, add the import and call:

```tsx
import { useGlobalShortcuts } from '../lib/shortcuts'
```

```tsx
function MyApp({ Component, pageProps }: AppProps) {
  useGlobalShortcuts()
  useSystemThemeSync()
```

Run: `grep -rn "legacyNotes\|NoteModal\|components/Header\|components/Note'" pages components lib`
Expected: no output.

- [ ] **Step 10: Check and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

Manual (fresh Chrome profile, `npm run dev`, http://localhost:4000):
1. Empty board shows "Notes you add appear here". Press `n`: the editor opens; type a title; press Esc: back on the board with the note.
2. Press `l`, add three items, go back. Tick an item on the card; it disappears into "+1 completed" and the editor didn't open.
3. Pin a note: "Pinned" and "Others" headings appear. Colour a note yellow.
4. Create label "Work" in the editor; the chip appears on the board; selecting it filters. Search "work" finds the labelled note.
5. Archive a note from its card: toast with Undo; Undo brings it back pinned as before.
6. ⋯ → Trash after deleting a note: the 30-day line and Empty trash appear; Restore works.
7. ⋯ → Manage labels: rename "Work" to "Office"; the chip updates. Delete it; notes remain.
8. ⋯ → Theme → Dark; reload: no light flash. Back to System.
9. Resize to 375px: two columns, floating New button, toasts above it, chips scroll sideways.
10. Back/forward between chip views restores the filter.

```bash
git add -A components pages styles lib
git commit -m "Add the new board and remove the old modal UI" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Offline, README and final verification

**Files:**
- Create: `worker/index.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: next-pwa's `customWorkerDir` (default `worker`): `worker/index.js` is bundled and imported at the top of `public/sw.js`, so its fetch handler runs before Workbox's.

- [ ] **Step 1: Create `worker/index.js`**

```js
// Bundled by next-pwa and imported at the top of the service worker, so this
// fetch handler runs before Workbox's routes.
//
// The board and editor are static pages that read everything from IndexedDB,
// so one cached copy of each serves every query string (?view=…, ?id=…)
// offline, including notes never opened before.
const SHELL_CACHE = 'app-shell';
const SHELL_PATHS = ['/', '/note'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .catch(() => {}),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.mode !== 'navigate' || url.origin !== self.location.origin || !SHELL_PATHS.includes(url.pathname)) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(url.pathname, { cacheName: SHELL_CACHE })) || Response.error()),
  );
});
```

Run: `npm run lint`
Expected: PASS. If ESLint reports `no-undef` for `self`, `caches` or `Response`, add `/* global self, caches, Response */` as the first line and rerun.

- [ ] **Step 2: Build and test offline**

```bash
npm run build && npm start
```

Expected: build log shows `> [PWA] Custom worker found` (or lists a `worker-*.js`), and `ls public | grep worker-` prints a file.

In a fresh Chrome profile at http://localhost:9090:
1. Load `/`, wait for the service worker (DevTools → Application → Service workers shows "activated").
2. Create a note, go back to the board.
3. DevTools → Network → Offline. Reload `/?view=lists`: the board loads. Open the note (a URL never visited before, `/note?id=…`): it loads and edits save.
4. Back online, stop the server.

- [ ] **Step 3: Test the upgrade path**

Still on the production build (`npm start`), in another fresh Chrome profile. Every app page runs the migration on load, so seed the old data from a static file on the same origin: open http://localhost:9090/manifest.json and run in the DevTools console:

```js
localStorage.setItem('notes', JSON.stringify([{ id: 'legacy-1', title: 'Old note', content: 'From v1', pinned: true }]))
```

Then open http://localhost:9090/. Expected: "Old note" appears on the board, pinned, with no empty-state flash; `localStorage.getItem('notes')` is `null` and `localStorage.getItem('notes-backup-v1')` contains it; reloading does not duplicate it.

- [ ] **Step 4: Update `README.md`**

Replace the intro paragraph (line 3) with:

```markdown
A notes and checklists app by Nine Technology, built with [Next.js](https://nextjs.org/) (Pages Router). Notes are stored in the browser with IndexedDB (via [Dexie](https://dexie.org/)), and the app installs as a PWA that works offline. There is no server-side storage.

## Features

- Notes and checklists, with pin, colour, labels, archive and trash (30-day auto-delete, undo)
- Search and filters (All, Notes, Lists, labels), kept in the URL
- Light and dark themes
- Keyboard shortcuts: `n` new note, `l` new list, `/` search, `Esc` leave the editor
```

In the scripts table, add a row after `npm run lint`:

```markdown
| `npm test`      | Run unit and component tests (Vitest)                             |
```

Replace the "Project Structure" list with:

```markdown
- `pages/index.tsx`: board
- `pages/note.tsx`: editor (`/note?id=…`)
- `pages/_offline.tsx`: fallback page served by the service worker when offline
- `components/board/`, `components/editor/`, `components/ui/`: UI (Radix Primitives + CSS Modules)
- `lib/notes.ts`: notes and labels store; `lib/db.ts`: IndexedDB schema
- `lib/migrate.ts`: one-time move of notes from the old `localStorage` format (the old data is kept as `notes-backup-v1`)
- `styles/tokens.css`: colours, spacing and type, light and dark
- `worker/index.js`: serves the board and editor offline
```

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass. Record the test count.

Run: `git status --short`
Expected: only `README.md`, `worker/index.js` (and the pre-existing `next-env.d.ts` change, which stays uncommitted). Delete any generated `AGENTS.md` if Next created one.

- [ ] **Step 6: Commit**

```bash
git add worker/index.js README.md
git commit -m "Serve the board and editor offline and document the new app" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
