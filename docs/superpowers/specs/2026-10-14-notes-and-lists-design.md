# Notes and Lists: Design

Date: 2026-10-14
Status: Draft, awaiting review

## Goal

Turn Noteboard into a full notes app with two kinds of item, **notes** and **checklists**, and a redesigned UI. It stays a hosted web app with no backend: each user's data lives in their own browser.

This is the first of three specs. Sharing (links, share sheet, export) and sync come later, each in its own spec.

### Success criteria

- A user can create, edit, pin, colour, label, search, archive and delete (with undo) both notes and checklists.
- The UI works well on phone and desktop, in light and dark mode.
- Notes saved by the current version survive the upgrade.
- The app still installs as a PWA and opens notes offline.

### Constraints

- No server, database service or accounts. Single user per browser.
- Keep the current stack: Next.js 16 Pages Router, React 19, lucide-react, framer-motion, CSS Modules, next-pwa.
- Text must meet WCAG AA contrast; functional text is at least 11px.

## Decisions

| Topic | Decision |
|---|---|
| Storage | IndexedDB through Dexie, replacing localStorage |
| UI components | Radix Primitives, styled with CSS Modules |
| Removed | `@mui/material`, `@emotion/react`, `@emotion/styled` (installed but unused), `components/Modal`, `components/NoteModal` |
| Tasks model | Checklist notes (Google Keep style), not a separate tasks section |
| Layout | Full-width board with filter chips, no sidebar |
| Editor | Full page at `/note?id=…` |
| Visual style | "Soft": cool grey background, white cards, soft shadows, pastel note colours, purple accent `#6a61bf`, Lato |

Mockups from the brainstorm are in `.superpowers/brainstorm/` (not committed).

## Data model

```ts
type NoteColor = 'default' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'grey';

type ChecklistItem = { id: string; text: string; done: boolean };

type Note = {
  id: string;
  kind: 'note' | 'list';
  title: string;
  content: string;          // used when kind = 'note'
  items: ChecklistItem[];   // used when kind = 'list'
  color: NoteColor;
  labelIds: string[];
  pinned: boolean;
  archived: boolean;
  trashedAt: number | null; // in Trash when set (ms since epoch)
  createdAt: number;
  updatedAt: number;
};

type Label = { id: string; name: string };
```

Dexie database `noteboard`, version 1:

- `notes`: primary key `id`; indexes `updatedAt`, `pinned`, `archived`, `trashedAt`, `*labelIds` (multi-entry).
- `labels`: primary key `id`; unique index `&name`.

Both `content` and `items` are kept on every note so switching kind never loses data structure. Only the field for the current `kind` is shown and searched.

### Rules

- **Board order:** pinned notes first, then by `updatedAt` descending.
- **Note → list:** each non-empty line of `content` becomes an unticked item; `content` is then cleared.
- **List → note:** item texts are joined with newlines into `content` (ticked state is dropped); `items` is then cleared.
- **Delete:** sets `trashedAt` and shows an Undo toast. Trashed notes can be restored or deleted forever. *Empty trash* deletes all of them.
- **Trash cleanup:** on app load, notes with `trashedAt` older than 30 days are deleted.
- **Archive:** sets `archived`; archived notes leave the board and appear only in the Archive view. Archiving unpins.
- **Deleting a label** removes its id from every note; the notes stay.
- **Empty notes:** a new note is saved only once it has a title, text or a non-empty item. If an existing note is cleared completely and the editor is left, it moves to Trash with Undo.

### Migration from localStorage

Runs once on first load (`lib/migrate.ts`):

1. If localStorage key `notes` exists, holds a JSON array, and the `notes` table is empty, insert each entry as a note: `kind: 'note'`, `color: 'default'`, `labelIds: []`, `archived: false`, `trashedAt: null`, `createdAt`/`updatedAt` set to now with the original order kept (earlier entries get later timestamps), and `pinned`, `title`, `content`, `id` copied over. A missing `id` gets a new uuid.
2. Entries that aren't objects are skipped.
3. Only after the insert succeeds, rename the key to `notes-backup-v1`.
4. If anything fails, localStorage is left untouched and the migration retries on the next load.
5. Running it twice must not duplicate notes.

### Storage helpers

- localStorage key `hasNotes` (`"1"` or absent) is updated whenever the count of non-trashed, non-archived notes changes. The inline script in `_document` reads it to hide the server-rendered empty state before first paint, replacing today's parse of the `notes` key.
- After the first successful save, call `navigator.storage.persist()` once (ignore the result).

## Screens

### Board (`/`)

- **Top bar:** logo, search box, **New** button opening a menu with *Note* and *List*. On narrow screens New becomes a floating button.
- **Search** matches title, note text, list item text and label names, case-insensitively, within the current view.
- **Filter chips:** *All*, *Notes*, *Lists*, then one chip per label (alphabetical). A ⋯ menu holds *Archive*, *Trash*, *Manage labels* and *Theme* (System / Light / Dark). Chips scroll sideways on narrow screens.
- **URL state:** the active view and search live in the query string so Back and refresh keep them: `/?view=notes|lists|archive|trash`, `/?label=<id>`, `/?q=<text>`. No parameter means *All*.
- **Sections:** *Pinned* and *Others* (headings shown only when both have notes). Archive and Trash views have no sections.
- **Grid:** masonry layout with 1–4 columns depending on width.
- **Card:** background from the note colour; title; preview of up to ~10 lines of text, or the first unticked items with a "+N more" line. Labels show as small tags. List items can be ticked directly on the card. On hover or keyboard focus the card shows pin, colour and archive buttons and a ⋯ menu with *Delete*. Clicking the card or pressing Enter opens the editor.
- **Archive view:** cards with *Unarchive* instead of *Archive*.
- **Trash view:** cards are read-only and offer *Restore* and *Delete forever*; an *Empty trash* button sits above the grid; a note explains the 30-day cleanup.
- **Empty states:** a message per view, e.g. "Notes you add appear here", "No lists yet", "Archive is empty", "Trash is empty", "No results for '<query>'". The board's main empty state is server-rendered, as today.
- **Manage labels:** a Radix dialog to rename and delete labels.
- **Undo toast:** delete, archive and clearing a note show a Radix Toast with *Undo* for about 6 seconds.

### Editor (`/note?id=<id>`, `/note?new=note|list`)

- **Top bar:** Back, then pin, colour (popover of swatches), labels (popover with checkboxes, a filter field and *Create "<text>"*), switch note ↔ list, archive, and a ⋯ menu with *Make a copy* and *Delete*.
- **Note body:** title input and an auto-growing text area.
- **List body:** title input, then one row per unticked item (checkbox and text input), an *+ List item* row, and a collapsible "N completed" section holding ticked items. Enter in an item adds a new item below and focuses it. Backspace in an empty item deletes it and focuses the previous one. Ticking moves an item to the completed section; unticking moves it back to the end of the unticked items.
- **Saving:** changes save automatically about 300 ms after typing stops, and immediately when leaving the page. Footer shows "Edited <relative time>".
- **New notes:** `?new=note` or `?new=list` opens a blank editor; the note is created on first non-empty save and the URL is replaced with `?id=<id>`. Leaving while still blank saves nothing.
- **Not found:** an unknown or deleted id shows "Note not found" with a link back to the board. A trashed note opens read-only with a *Restore* button.
- **Back:** returns to the board with its previous filter. Esc does the same.

### Across the app

- **Theme:** follows the device by default; the ⋯ menu overrides it (System / Light / Dark), stored in localStorage key `theme`. An inline script in `_document` sets `data-theme` on `<html>` before first paint.
- **Keyboard shortcuts** (ignored while typing in a field): `n` new note, `l` new list, `/` focus search. Esc leaves the editor.
- **Note colours** have a light and a dark version each, all meeting AA contrast with the text on them.
- **Accessibility:** every icon button has a label; menus, popovers, dialogs and toasts come from Radix; focus is visible; colour is never the only signal (pinned notes also sit in the Pinned section).

## Code structure

| Path | Responsibility |
|---|---|
| `lib/db.ts` | Dexie database, tables and indexes |
| `lib/notes.ts` | All note and label changes (create, update, pin, colour, labels, archive, trash, restore, delete forever, empty trash, duplicate, switch kind, purge old trash) and the hooks `useBoardNotes(view, query)`, `useNote(id)`, `useLabels()` |
| `lib/filters.ts` | Pure functions: filter by view, match search, sort |
| `lib/migrate.ts` | One-time localStorage → IndexedDB migration |
| `lib/theme.ts` | Theme preference read/write and `useTheme()` |
| `components/board/` | `TopBar`, `FilterChips`, `NoteGrid`, `NoteCard` |
| `components/editor/` | `EditorToolbar`, `NoteBody`, `ChecklistEditor` |
| `components/ui/` | Radix wrappers: `ColorPicker`, `LabelPicker`, `Menu`, `IconButton`, `UndoToast`, `LabelsDialog` |
| `components/NotFound/` | Kept for empty states and the offline page |
| `styles/tokens.css` | CSS variables: colours (light and dark), note colours, spacing, radii, shadows, type scale |
| `pages/index.tsx` | Board |
| `pages/note.tsx` | Editor |
| `pages/_app.tsx` | Toast provider, migration and trash cleanup on load, global shortcuts |
| `pages/_document.jsx` | `hasNotes` and theme scripts |
| `pages/_offline.tsx` | Unchanged apart from styling |

`lib/notes.ts` (the current store) is replaced. Components never call Dexie directly; they go through `lib/notes.ts`.

New dependencies: `dexie`, `dexie-react-hooks`, the Radix packages actually used (dialog, dropdown-menu, popover, checkbox, toast, tooltip). Dev: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb`.

## Error handling

- **IndexedDB unavailable or blocked:** a banner reads "Storage is unavailable, so notes won't be saved." The app still renders.
- **Storage full (`QuotaExceededError`):** a toast reads "Couldn't save: storage is full." The editor keeps the unsaved text on screen.
- **Migration failure:** localStorage is untouched; retried next load. Malformed entries are skipped.
- **Same note in two tabs:** both update live through Dexie; the latest save wins.
- **Offline:** `/note` is precached by the service worker so the editor opens offline even if never visited before.

## Testing

- **Vitest + fake-indexeddb** for `lib/`: every change function, migration (normal, malformed data, run twice, failure leaves localStorage intact), note ↔ list conversion, filters and search, 30-day purge.
- **React Testing Library** for `ChecklistEditor` keyboard behaviour (Enter, Backspace, tick/untick) and ticking on `NoteCard`.
- **Manual checks in Chrome:** all board and editor flows, dark mode, 375px width, migration from a localStorage fixture, and offline on a production build. Test data goes in a fresh browser profile or is backed up first; never overwrite real notes.
- `npm run lint`, `tsc --noEmit` and `npm run build` pass. A `test` script is added to `package.json`.

## Out of scope

- Sharing and sync (separate specs).
- Due dates and reminders.
- Images and attachments.
- Markdown or rich text.
- Drag to reorder.
- Moving off next-pwa.
