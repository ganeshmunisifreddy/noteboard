# Backup and Drag to Reorder: Design

Date: 2026-10-14
Status: Draft, awaiting review

## Goal

Round 1 of four follow-up rounds for Noteboard:

1. **Backup + drag to reorder** (this spec)
2. Rich text / Markdown
3. Images in notes
4. Due dates and reminders

Sharing notes with other people is out of scope for this version.

This round lets people protect and move their notes (a backup file they can restore, and a readable Markdown export) and arrange the board themselves by dragging cards.

### Success criteria

- A user can download a backup of everything, restore it into any browser, and end up with the same notes and labels; restoring never deletes anything.
- A user can export all notes as one readable Markdown file.
- A user can drag cards into their own order with mouse, touch or keyboard; the order persists and editing a note does not move it.
- The board looks the same as today on first load after the upgrade.

### Constraints

- Same as the notes-and-lists spec: no server, data in the browser, Next.js 16 Pages Router, React 19, Radix + CSS Modules, WCAG AA, functional text at least 11px.
- Backup format must be versioned so rounds 3 and 4 can add images and dates.

## Decisions

| Topic | Decision |
|---|---|
| Board layout | Masonry filled left-to-right: each card goes into the shortest column (computed in code), 1–4 columns by width |
| Drag library | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) |
| Order after editing | Notes stay where the user put them; editing, ticking or colouring does not move them |
| Backup format | JSON, `format: "noteboard-backup"`, `version: 1` |
| Import behaviour | Merge; for the same note the more recently edited version wins; labels merged by name; nothing deleted |
| Markdown | Export only, not importable |

## Part 1: Ordering and drag to reorder

### Data

- `Note` gains `position: number`. Lower positions come first.
- Dexie schema version 2 adds the field. The upgrade assigns positions from the current order (newest `updatedAt` first → `0, 1, 2, …`), so the board looks unchanged after the upgrade.
- Positions are fractional. Moving a note between neighbours `a` and `b` sets its position to `(a + b) / 2`; to the top, `first - 1`; to the bottom, `last + 1`. Only the moved note is written.
- If the gap between the two neighbours is smaller than `1e-6`, all notes are renumbered to `0, 1, 2, …` in their current order in one transaction, then the move is applied.

### Board order rules

- Pinned and Others are each sorted by `position` ascending (ties by `updatedAt` descending). This replaces "newest edited first".
- Archive and Trash keep their current order (Archive by `updatedAt`, Trash by `trashedAt`, newest first).
- These put a note at the top of its section (`position = min(all positions) - 1`): creating a note, making a copy, pinning, unpinning, restoring from Trash, unarchiving.
- Editing title, text, items, colour or labels does not change `position`.

### Dragging

- Available on the board in All, Notes, Lists and label views.
- Not available in Archive, Trash, or while a search is active.
- Cards move within their own section. Moving between Pinned and Others is done with the pin button.
- In filtered views, the new position is computed from the neighbours visible in that view. Positions are global, so order set in one view holds in the others.
- Input: mouse and pen drag; touch press-and-hold (about 250 ms) so scrolling still works; keyboard via a drag handle button on each card (Space or Enter to pick up, arrow keys to move, Space or Enter to drop, Escape to cancel).
- Screen readers hear dnd-kit announcements, for example "Picked up Groceries", "Moved Groceries to position 3 of 8", "Dropped Groceries".
- While dragging, the other cards shift to make room; the dragged card is lifted (shadow, slight scale). Reduced-motion users get no lift animation.

### Layout

- The grid component measures its width, picks a column count (1–4, at least 160px per column as today), and assigns each card to the shortest column in order, using measured card heights.
- Order reads left to right, top to bottom.

## Part 2: Backup and export

### Menu

The board's ⋯ menu gets a "Backup" group:

- **Back up notes**
- **Restore from backup…**
- **Export as Markdown**

### Back up notes

Downloads `noteboard-backup-YYYY-MM-DD.json` (local date):

```json
{
  "format": "noteboard-backup",
  "version": 1,
  "exportedAt": "2026-10-14T12:00:00.000Z",
  "notes": [],
  "labels": []
}
```

It contains every note (including archived and trashed) and every label, exactly as stored.

### Restore from backup

A file picker accepts `.json`. The file is validated, then merged in one IndexedDB transaction (all or nothing).

- **Validation**
  - Not JSON, wrong `format`, or `notes`/`labels` not arrays: "That file isn't a Noteboard backup."
  - `version` greater than 1: "This backup is from a newer version of Noteboard."
  - Individual notes that aren't objects are skipped. Missing fields get defaults (same rules as the localStorage migration, plus `position` = after the last note). Unknown `kind` or `color` values fall back to `note` and `default`.
- **Labels** are merged by name, ignoring case and surrounding spaces. An imported label whose name exists maps to the existing label's id; otherwise it is added (with a new id if its id is already taken by a different name). Imported notes' `labelIds` are rewritten through this mapping; ids with no imported label are dropped.
- **Notes** are matched by `id`:
  - Not present locally: added.
  - Present, and the imported `updatedAt` is newer: the imported version replaces the local one (including `archived`, `trashedAt`, `position`).
  - Present, and the local copy is the same age or newer: unchanged.
- Nothing local is deleted.
- **Result** toast: "Restored N notes: A added, U updated, S already up to date". Errors show the messages above, or "Couldn't restore: storage is full." for quota errors.
- After a restore, the `hasNotes` marker is refreshed.

### Export as Markdown

Downloads `noteboard-notes-YYYY-MM-DD.md`:

- Active notes in board order (Pinned, then Others), then archived notes under `# Archived`. Trash is excluded.
- Each note:
  - `## <title>` or `## Untitled`
  - `Labels: Work, Home` when it has labels
  - Note text as is; lists as `- [ ] item` / `- [x] item` (unticked items first, in list order)
- Notes are separated by a line containing `---`.

### Downloads

A `Blob` with an object URL and a temporary `<a download>`, then the URL is revoked. Works in desktop browsers and in Safari/Chrome on phones.

## Code structure

| Path | Responsibility |
|---|---|
| `lib/types.ts` | `Note.position` |
| `lib/db.ts` | Schema version 2 and its upgrade |
| `lib/order.ts` | Pure position maths: `positionBetween`, `topPosition`, `needsRenumber`, `reorderPositions` |
| `lib/notes.ts` | Sets top positions on create/copy/pin/unpin/restore/unarchive; `moveNote(id, beforeId, afterId)` with renumbering |
| `lib/filters.ts` | Board sort by position |
| `lib/masonry.ts` | Pure column assignment: `assignColumns(heights, columnCount)` |
| `lib/backup.ts` | Pure: `buildBackup`, `parseBackup`, `planMerge`, `toMarkdown`; plus `restoreBackup` (transaction) |
| `lib/download.ts` | `downloadFile(name, contents, type)` |
| `components/board/NoteGrid.tsx` | Masonry + dnd-kit sortable context |
| `components/board/SortableCard.tsx` | dnd-kit wrapper for `NoteCard` with the drag handle |
| `components/board/MoreMenu.tsx` | Backup group |

New dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Error handling

- Database upgrade failure: the storage banner shows (existing behaviour); data is untouched because Dexie upgrades are transactional.
- Drag drop with a failed save: the card returns to its previous place and a toast reads "Couldn't save the new order."
- Restore errors as listed above; the database is unchanged on any failure.

## Testing

- Vitest: position maths (between, top, bottom, renumber trigger), schema upgrade assigning positions from `updatedAt`, `moveNote` including renumbering, top-of-section rules, board sort.
- Vitest: `assignColumns` (shortest column, ties go left, 1–4 columns).
- Vitest: backup round trip into an empty database gives identical data; merge rules (newer wins both ways, labels by name, id clash with different name, duplicate import is a no-op); validation errors and skipped entries; Markdown output.
- React Testing Library: keyboard reorder on the board (focus handle, Space, ArrowRight, Space) persists the new order; drag is not offered in Archive, Trash or search.
- Manual in Chrome: mouse drag, touch emulation, restore a backup into a fresh origin, Markdown file contents.

## Out of scope

- Sharing notes with other people.
- Automatic or scheduled backups, cloud backups.
- Importing Markdown.
- Moving notes between Pinned and Others by dragging.
