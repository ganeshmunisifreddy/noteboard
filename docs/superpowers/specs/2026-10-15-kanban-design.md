# Kanban Boards: Design

Date: 2026-10-15
Status: Draft, awaiting review

## Goal

Round 5, the last planned round for Noteboard:

1. Backup + drag to reorder (done)
2. Rich text / Markdown (done)
3. Images in notes (done)
4. Due dates and reminders (done)
5. **Kanban boards** (this spec)

Sharing is out of scope. A later round is expected to add sync without accounts and native apps, so the data is shaped to sync record by record.

Notes and lists can be organised on kanban boards: named boards with columns, where each card is a normal note. Purposes: personal tasks, projects, pipelines, and sorting existing notes by status.

### Success criteria

- Creating "Website redesign" from the Basic template and adding three cards takes under a minute.
- Cards move between columns by mouse, touch or keyboard; the move sticks after a reload.
- A card is a full note: opening it gives the normal editor (formatting, checklist, images, date, labels).
- Board notes don't clutter the main board, but search, Upcoming, Archive and Trash still find them.
- Dropping a dated card in the Done column marks its date done.
- Old notes and old backups keep working.

### Constraints

- Same as earlier specs: no server, data in the browser (IndexedDB via Dexie), Next.js 16 Pages Router, React 19 with the React Compiler lint rules, Radix + CSS Modules, WCAG 2.2 AA, functional text at least 11px.
- No new dependency; drag and drop uses dnd-kit, already used by the main board.
- Every record (board, column, note) stands on its own, with an id and `updatedAt`, so a later sync can merge them one by one. No record holds a list that another record also holds.

## Decisions

| Topic | Decision |
|---|---|
| Card | A card is a note or list; a note sits in at most one board column |
| Main board | Board notes are hidden from the main board, like a folder; search includes them |
| Navigation | A "Boards" chip shows board tiles; each board opens at `/board?id=…` |
| Board layout | Columns side by side, scrolling sideways; snap on phones |
| Card style | Compact: colour, title, ☑ progress, image count, labels, date chip |
| New board | Name + template: Basic, Pipeline, Now/Next/Later, Empty |
| Done column | Optional per column; linked to Round 4 dates both ways |
| Delete board | Ask: keep the notes (back to the main board) or move them to Trash |
| Delete column | Its notes move to the neighbouring column |
| Storage | `boards` and `columns` tables; the note stores its place |
| Backup | Format version 4; versions 1–3 still restore |
| Not included | Sharing, column (WIP) limits, swimlanes, a note on several boards, reordering boards, board-wide label filter |

## Part 1: Data and rules

### Data

```ts
type Board = { id: string; name: string; position: number; createdAt: number; updatedAt: number };
type Column = { id: string; boardId: string; name: string; position: number; done: boolean; updatedAt: number };
```

`Note` gains:

| Field | Type | Notes |
|---|---|---|
| `boardId` | `string \| null` | null = on the main board |
| `columnId` | `string \| null` | set exactly when `boardId` is set |
| `boardPosition` | `number` | order inside its column (lower first); 0 when not on a board |

- Dexie schema version 5 adds `boards: 'id, position'` and `columns: 'id, boardId'`, and adds `boardId` to the `notes` index list. Its upgrade sets `boardId: null, columnId: null, boardPosition: 0` on notes without them. Versions 1–4 are unchanged.
- `NoteChanges` does not include the three new fields; they change only through the board functions below, so an editor draft save never moves a card.
- Board names are trimmed, required, up to 60 characters, and need not be unique. Column names: same rules, up to 40 characters.
- Positions use the same in-between numbers as the main board (`lib/order.ts`: `positionBetween`, renumbering when the gap gets too small), for boards, columns and cards.

### Templates

| Template | Columns (Done column in bold) |
|---|---|
| Basic | To do · Doing · **Done** |
| Pipeline | Ideas · Next · In progress · Review · **Done** |
| Now / Next / Later | Now · Next · Later |
| Empty | (none) |

### Where notes show

- The main board's All, Notes, Lists and label views skip notes with a `boardId`.
- With a search query, the main board includes board notes, each with a "Board · Column" tag.
- Upcoming, Archive and Trash include board notes as usual, with the tag.
- The board page shows its notes that are not archived and not in Trash, by column, in `boardPosition` order (ties by id).

### Moving cards

- Within a column: a new `boardPosition` only; not an edit (`updatedAt` unchanged), like reordering the main board.
- To another column: new `columnId` and `boardPosition`; an edit (`updatedAt` bumped), so it wins in a backup merge.
- To another board (from the editor's Board menu): as above; lands at the bottom of the chosen column.
- Remove from board: `boardId`/`columnId` null, `boardPosition` 0, placed at the top of the main board; an edit.

### Done column

- Moving a card whose date is open (Round 4 `due`, not done) into a Done column marks it done with the Round 4 Mark done rules. If the date repeats and moves on, the card goes to the top of the board's first column (by position) instead; the list is unticked as usual.
- Moving a card whose date is done out of a Done column reopens it (Round 4 `reopenDue` rules).
- Mark done on a board note (editor chip, reminder panel), on a board with a Done column, also moves it to the bottom of the Done column; a repeating date that moved on leaves the card where it is.
- Cards without a date only move.
- At most one Done column per board: setting one clears the flag on the others.
- The Undo after a Done-column move puts back the date, items, column and position.

### Adding cards

- "+ Add card" at the bottom of a column: a new note at the bottom of that column; it opens in the editor. A small menu on the button offers Note or List (Note is the default click).
- "+ Add card" in the board's top bar: a new note at the top of the first column; disabled when the board has no columns.
- A new card that is left empty goes to Trash on leaving, as for any note.
- Make a copy of a board note: the copy sits just below the original in the same column.
- Converting between note and list keeps the place.

### Archive and Trash

- Archiving or trashing keeps the place; restoring puts the card back in its column at its position.

### Deleting

- Delete column (confirm when it has notes): every note in it, including archived and trashed ones, moves to the end of the column on its left, or on its right if it was first. If it was the board's only column, they return to the main board (top). One transaction; a toast offers Undo, which restores the column and every note's place.
- Delete board: a dialog asks "Keep the notes" (they return to the top of the main board) or "Move notes to Trash" (archived and trashed notes included either way; already-trashed ones stay in Trash). One transaction; a toast offers Undo, which restores the board, its columns and every note as it was.
- Rename board or column, move column left/right, and set the Done column are edits of that board or column (`updatedAt` bumped).

### Integrity

- A note whose `boardId` or `columnId` points to a board or column that doesn't exist is treated as on the main board everywhere, and is fixed (set to null) by the next backup restore or column/board delete that touches it.

## Part 2: Screens

### Boards view (`/?view=boards`)

- A "Boards" chip after "Upcoming" in the filter row. In this view, label chips and the search box's filtering don't apply (search typed here switches to the All view with that query).
- Board tiles in board order: name, "4 columns · 12 cards" (notes not archived or trashed), and one small bar per column whose fill shows that column's share of the cards. Each tile is a link to the board.
- A "+ New board" tile opens the New board dialog (Radix Dialog): Name (required; error "Enter a name."), Template (radio group: Basic, Pipeline, Now / Next / Later, Empty; Basic selected), Create and Cancel. Create opens the new board.
- Empty state: "No boards yet. Create one to organise notes into columns."

### Board page (`/board?id=…`)

- Top bar: Back (to the Boards view), board name as the page heading, "+ Add card", and a ⋯ menu: Rename board, Add column, Delete board…
- A board that doesn't exist shows "Board not found" with a link back to Boards.
- Columns (each a `section` named by its heading): about 280px wide in a row that scrolls sideways; under 600px each is 85% of the screen width with scroll snapping.
- Column header: name, card count, a ✓ "Done column" mark when set, and a ⋯ menu: Rename, Move left, Move right, Set as Done column / Not a Done column, Delete column…
- Rename (board or column) edits inline in place of the name; Enter saves, Esc cancels.
- "+ Add column" after the last column opens an inline name field.
- Empty column: "No cards" in muted text above "+ Add card".

### Cards

- Compact card: note colour, title ("Untitled" when empty), and a row of markers: ☑ done/total for lists, image count, label names, and the Round 4 date chip. Markers are summed up for screen readers in the card's description (e.g. "3 of 5 done, 2 images, labels Design, due Fri 16 Oct").
- Clicking a card opens the note; Back from the editor returns to the board, scrolled to where it was.
- Each card has a ⋯ "Move" button with: Move to column (one item per other column), Move up, Move down, Move to top, Move to bottom (items that don't apply are disabled).
- Drag and drop with dnd-kit: mouse after 5px movement, touch after a 250ms press; within and between columns; the board scrolls sideways near its edges while dragging; a drop indicator shows the landing place.
- Moves (drag or menu) are announced in a polite live region: "Moved Dark mode to Doing, position 2 of 3".

### Delete board dialog

- Radix AlertDialog: "Delete “Website redesign”?" with text "It has 12 notes." and buttons "Keep the notes" (they go back to your main board), "Move notes to Trash", and Cancel (initial focus).

### Note editor

- A "Board" icon button in the top bar (not in Trash) opens a menu: each board as a submenu of its columns (the current column checked), and "Remove from board" when on one.
- A board note shows a small chip under the title (next to the date chip): "Website redesign · Doing"; it opens the same menu.

### Other screens

- Search results and Upcoming show board notes with a small "Website redesign · Doing" tag on the card.
- Leaving the editor returns to where the note was opened from: the board page, the Boards view or the main board (extends `lib/routes.ts`).

## Part 3: Backup and export

### Backup format version 4

```json
{
  "format": "noteboard-backup",
  "version": 4,
  "notes": [{ "…": "…", "boardId": "b1", "columnId": "c2", "boardPosition": 3 }],
  "labels": [],
  "attachments": [],
  "boards": [{ "id": "b1", "name": "Website redesign", "position": 0, "createdAt": 0, "updatedAt": 0 }],
  "columns": [{ "id": "c2", "boardId": "b1", "name": "Doing", "position": 1, "done": false, "updatedAt": 0 }]
}
```

- Versions 1–3 restore with every note on the main board. Version 5 or higher: "This backup is from a newer version of Noteboard."
- Boards and columns merge by id; the copy with the newer `updatedAt` wins; local ones are never deleted. A board with the same name but a different id is added as another board.
- Invalid boards or columns (missing id or name, column without a known board) are skipped.
- After merging, a note keeps its place only if its board and column exist (locally or in the backup) and the column belongs to that board; otherwise it is on the main board.
- The restore message adds boards when any were added: "Restored 12 notes: 10 added, 2 updated, 0 already up to date. Added 1 board."
- One transaction over notes, labels, attachments, boards and columns, as before.

### Markdown export

- Main board notes first (as now), then one section per board in board order: `# Board: <name>`, then `## <column>` per column in order with its notes (not archived, not trashed) in card order. Archived board notes go in the existing Archived section.

## Code structure

| Path | Responsibility |
|---|---|
| `lib/types.ts` | `Board`, `Column`; note place fields; `BoardView` gains `'boards'` |
| `lib/db.ts` | Schema v5 |
| `lib/boards.ts` | Templates; create/rename/delete board; add/rename/move/delete column; set Done column; `useBoards`, `useBoard(id)`, tile summaries |
| `lib/cards.ts` | `placeNote` (with Done-column rules), `addCard`, `removeFromBoard`, `moveCard` (up/down/top/bottom/to column), move announcements |
| `lib/notes.ts` | Main-board filtering helpers, copy below the original, Mark done moving to the Done column |
| `lib/filters.ts` | Main views skip board notes; search includes them; `'boards'` view |
| `lib/backup.ts` | Version 4; Markdown board sections |
| `lib/routes.ts` | `boardHref`, back to the board |
| `pages/board.tsx` | Board page |
| `components/kanban/` | `BoardTiles`, `NewBoardDialog`, `BoardColumns` (dnd-kit), `ColumnHeader`, `KanbanCard`, `CardMoveMenu`, `DeleteBoardDialog`, `PlaceTag` |
| `components/editor/BoardPicker.tsx` | Editor Board button, menu and chip |

## Testing

- Vitest: schema v5 upgrade; templates; positions (between, top, bottom, renumber); moving within/between columns and `updatedAt`; Done-column rules (into, repeat back to first column, out reopens, Mark done moves in, Undo); delete column (neighbour, only column, archived/trashed included, Undo); delete board (keep, Trash, Undo); filters (main skips, search includes); copy placement; backup v4 round trip, v1–3, dangling places, same-name boards, invalid records; Markdown sections.
- React Testing Library: Boards view tiles and empty state; New board dialog (validation, templates); board page columns, cards and markers; Move menu (each item, disabled states, announcement); column menu (rename, move, Done, delete); delete dialog choices; Add card (note, list); editor Board menu and chip; search and Upcoming tags; Back from the editor to the board; Board not found.
- Manual in Chrome: mouse drag within and between columns; touch drag at phone width with snapping and edge scrolling; keyboard-only moves; many cards in a column; dark mode; backup restore into a fresh origin.

## Out of scope

- Sharing boards, column (WIP) limits, swimlanes, a note on several boards, reordering boards, filtering a board by label, board backgrounds.
