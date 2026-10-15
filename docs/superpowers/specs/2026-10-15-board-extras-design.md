# Board Extras: Design

Date: 2026-10-15
Status: Draft, awaiting review

## Goal

Round 5.1, a follow-up to kanban boards (round 5, merged to dev at a0414d6). It adds the everyday Trello features the boards were missing, so a board can be used and tidied without opening cards one by one:

1. Quick add: type a title at the bottom of a column, press Enter, keep typing.
2. Filter on the board page: text, label, date.
3. Quick card actions: colour, labels, date, move, move to another board, archive, delete.
4. Column bulk actions: archive all cards, move all cards.
5. Move a card to another board from the board page.
6. Drag columns to reorder; star and reorder boards on the Boards page.

Out of scope: anything that needs sharing (members, comments, activity), Jira-style sprints, swimlanes, story points, card cover images, WIP limits, copying boards.

### Success criteria

- Ten cards can be typed into a column in a few seconds, without leaving the board.
- A board can be filtered to "overdue", "next 7 days", "no date", a label, or text, and cleared in one click.
- A card's colour, labels, date, column, board, archive and trash can all be changed from the board.
- A full Done column can be archived in one action, and undone in one action.
- Columns and boards can be put in any order by dragging, and by keyboard without dragging.
- Everything works by mouse, touch, keyboard and screen reader (WCAG 2.2 AA).

### Constraints

- No backend. IndexedDB via Dexie 4; data must survive backup, restore-merge and the later sync round record by record.
- Reuse the existing pieces: `ColorPicker` colours, labels, `DatePopover`, `Menu`, dnd-kit, toasts with Undo, the live-region announcer.
- Cards stay compact: new actions live in menus, not on the card face.

## Decisions

| Question | Choice |
| --- | --- |
| Quick add | Inline title box; Enter saves and keeps the box open; Escape or clicking away closes; a button still opens the full editor |
| Filter | Filter button opens a row (text, label chips, date chips); clears when you leave the board; dragging and quick add still work |
| Quick actions | One card menu (A): the card's ⋮ menu grows; right-click opens it with a mouse |
| Bulk actions | Archive all cards + Move all cards to › (this board or another); no confirm; one Undo |
| Starring | Starred group above All boards on the Boards page |
| Approach | Build on the existing modules; no multi-select model |

## Part 1: Data and rules

### Data

- `Board` gains `starred: boolean`.
- Dexie schema version 6: same stores and indexes; the upgrade sets `starred: false` on every board.
- `createBoard` makes boards with `starred: false`.
- Nothing else changes: a card is still a note with `boardId`, `columnId`, `boardPosition`.

### Quick add

- Creates a text note (`kind: 'note'`) with the typed title (trimmed), empty content, default colour, no labels, at the bottom of the column (same place as "Add card").
- Enter saves and clears the box, which stays open and focused. Enter on an empty or whitespace-only box does nothing.
- Escape closes the box. Clicking or tabbing away closes it; any typed text is kept as a card only if Enter or Add was pressed.
- If the column was deleted meanwhile, the card goes to the board's first column (existing `newCardPlace` rule); if the board is gone, nothing is saved and the box closes.
- "Open in editor" saves the typed title as a new card (if any) and opens it in the editor; with an empty box it opens the editor for a new card in this column, as "Add card" does today.

### Filter

A card shows when every set part matches:

- **Text**: the main screen's search (`matchesQuery`): title, body, checklist items and label names, case-insensitive.
- **Label**: the card has that label. One label at a time.
- **Date**, one at a time:
  - **Overdue**: has a date, not done, and its moment is in the past (same rule as the overdue chip).
  - **Next 7 days**: has a date, not done, date from today to today + 7 days inclusive (and not overdue).
  - **No date**: `due` is null.

Rules:

- The filter lives in the board page's state; leaving the board clears it.
- Hidden cards keep their places. Dragging a shown card places it relative to the shown cards next to it; hidden cards keep their positions and their order relative to each other.
- A card added by quick add while a filter is on stays shown until the filter changes.
- Column counts read `shown of total` while filtering ("2 of 5"); screen readers get "2 of 5 cards shown".
- With no cards matching anywhere, the board shows "No cards match the filter" with a Clear button; columns stay visible so quick add still works.

### Card menu

- **Colour ›**: the note colours; a tick on the current one. Changing it is an edit (updates `updatedAt`).
- **Labels ›**: a checkbox per label; selecting toggles it and keeps the menu open. With no labels, the submenu shows "No labels yet".
- **Date…**: opens `DatePopover` anchored to the card's ⋮ button, with the same save and remove behaviour as the editor (Remove has Undo).
- **Move ›**: Move up, Move down, Move to top, Move to bottom (items that do not apply are left out), then "Move to <column>" for each other column. Same behaviour as today's Move menu.
- **Move to board ›**: one submenu per other board, listing its columns; the card goes to the bottom of the chosen column (`placeAtEnd`), with the Done rules (entering a Done column marks an open date done; leaving one reopens a done date). Toast "Moved to <board> · <column>" with Undo (`putBackPlace`). Hidden when there are no other boards.
- **Archive**: sets `archived`; the card leaves the board and appears in the Archive view with its place tag; Unarchive puts it back in its place. Toast with Undo.
- **Delete**: moves the card to the trash (as everywhere in the app). Toast with Undo.
- Right-click on a card opens the same menu, for mouse only; a long press on touch stays a drag.
- Focus after an action: back to the card's ⋮ button; if the card left the board (moved to another board, archived, deleted, filtered out), to the next card's ⋮ button, else the previous card's, else the column's Add card button.
- Moves, archive and delete are announced in the board's live region.

### Column bulk actions

- **Archive all cards** archives every shown card in the column. While filtering, the item reads "Archive N shown cards".
- **Move all cards to ›** lists this board's other columns, then **Other boards ›** with each board's columns. Shown cards go to the bottom of the target column in their current order, each following the Done rules.
- Both items are hidden when the column shows no cards.
- No confirm dialog. One toast ("Archived 4 cards" / "Moved 4 cards to <column>") whose Undo restores every card's `archived`, `boardId`, `columnId`, `boardPosition`, `due` and `items` as they were before the action. Other edits made since are kept.

### Ordering

- **Columns**: drag a column by its header (name area). Same activation as cards: mouse after 5 px, touch after a 250 ms press. Columns are renumbered 0, 1, 2, … in the new order, writing only the columns whose position changed (as Move left / Move right do). The menu's Move left / Move right stay.
- **Boards**: the Boards page shows "Starred" (when any board is starred), then "All boards". Tiles drag within their group; a drop in the other group is ignored. Each tile has a ⋮ with Move earlier / Move later (left out when not applicable) and a ☆/★ toggle button ("Star X", `aria-pressed`). Starring or unstarring keeps the board's `position`, so it joins the other group at its relative place. The board page menu has Star board / Unstar board.
- Board order and star are edits (`updatedAt`), so the newest wins on merge.

### Integrity

- Every multi-note action runs in one Dexie transaction.
- A board or column deleted while its submenu is open is ignored when chosen (no-op, no error).
- Undo snapshots only restore place and done-state fields, never content.

## Part 2: Screens

### Board page header

`← Board name … [Filter] [+ Add card] [⋮]`

- **Filter** is a toggle button (`aria-expanded`, `aria-controls`). While a filter is set it shows a dot and its accessible name is "Filter, N cards match".
- Opening shows a row below the header: search box (focused), label chips, date chips (Overdue · Next 7 days · No date), Clear. Chips are toggle buttons (`aria-pressed`).
- Escape in the search box clears the filter, closes the row and returns focus to Filter.
- Phone width: the chips scroll sideways on one line.
- The board menu gains Star board / Unstar board.

### Column

- Header: name area is the drag handle (cursor `grab`). The ⋮ menu gains Archive all cards / Move all cards to › (above Delete column).
- Footer: "+ Add card" turns into the quick-add box: a text box ("Card title"), **Add**, ✕ (close) and an "Open in editor" icon button. The list button stays.
- Count: "5", or "2 of 5" while filtering.

### Card

- The ⋮ button is named "Card actions for <title>" and opens the card menu (Colour › · Labels › · Date… | Move › · Move to board › | Archive · Delete).

### Boards page

- "Starred" heading and its tiles, then "All boards" heading and the rest. Headings show only when at least one board is starred.
- Each tile: ☆/★ toggle (`aria-pressed`) and a ⋮ with Move earlier / Move later.
- Moves and star changes are announced ("Moved Website after Home", "Starred Website").

## Part 3: Backup and export

- Backup format version 5: boards carry `starred`. Reading versions 1–4 sets `starred: false`. Writing always writes v5. A backup newer than 5 is refused, as today.
- Merge: unchanged rule; the newer board wins by `updatedAt`, star included.
- Markdown export: unchanged (stars are not exported).

## Code structure

| File | Change |
| --- | --- |
| `lib/types.ts` | `Board.starred` |
| `lib/db.ts` | version 6 upgrade |
| `lib/backup.ts` | v5, read `starred` |
| `lib/boardFilter.ts` (new) | `CardFilter`, `EMPTY_FILTER`, `isFiltering`, `matchesCard` |
| `lib/cards.ts` | `quickAddCard`, `archiveCards`, `moveCards`, `putBackCards` |
| `lib/boards.ts` | `starBoard`, `moveBoardTo`, `moveColumnTo` |
| `components/kanban/BoardColumn.tsx` (new) | one column, split from `BoardColumns.tsx` |
| `components/kanban/QuickAdd.tsx` (new) | inline add box |
| `components/kanban/CardMenu.tsx` (new) | full card menu; replaces `CardMoveMenu.tsx` |
| `components/kanban/FilterBar.tsx` (new) | filter row |
| `components/kanban/BoardColumns.tsx` | column dragging, filter, focus after actions |
| `components/kanban/ColumnHeader.tsx` | bulk items |
| `components/kanban/BoardTiles.tsx` | Starred group, star, tile drag and Move menu |
| `components/kanban/BoardView.tsx` | Filter button, Star in menu |

## Testing

TDD: every test written first and seen failing.

- `lib/boardFilter.test.ts`: each part alone and combined; overdue vs next 7 days boundaries; done dates excluded.
- `lib/cards.test.ts`: quick add order and empty title; `moveCards` into and out of Done (incl. a repeating card); `archiveCards`; Undo restores place and done state and keeps later edits; deleted target is a no-op.
- `lib/boards.test.ts`: `starBoard`, `moveBoardTo` within a group, `moveColumnTo`, renumber when crowded.
- `lib/backup.test.ts`, `lib/db.test.ts`: v5 round trip, v4 reads as unstarred, v6 upgrade.
- Components: quick add (Enter keeps open and focused, Escape closes, empty does nothing); filter (hides, counts, Clear, Escape); card menu (each action, Undo, focus after); bulk items (shown cards only, hidden when empty, Undo); Boards page (star moves tile, Move earlier/later); right-click opens the menu, touch long-press does not.
- Chrome: drag columns and board tiles, drag while filtered, phone width.

## Review Focus

- Dragging while a filter hides cards: hidden cards keep their order.
- Moving all cards into a Done column when some repeat.
- Undo after a card was edited in between.
- Right-click never opens on touch.
- A board or column deleted in another tab while its submenu is open.
