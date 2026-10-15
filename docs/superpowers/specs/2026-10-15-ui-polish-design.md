# UI/UX Polish: Design

Date: 2026-10-15
Status: Draft, awaiting review

## Goal

Round 6, before sync: make Noteboard feel like one designed product. The direction is "Google Keep, refined": the colourful card grid stays the heart of the app, with a proper sidebar, a calmer editor, and no cramped, cut-off or empty spaces.

What changes is look, layout and flow. Data, URLs, backups and features stay as they are, with one addition: tick boxes inside text notes.

### Success criteria

- Every section (Notes, Upcoming, Boards, each label, Archive, Trash) is visible and one click away on desktop, and one tap away (from ☰) on a phone. You always know where you are.
- The editor shows at most 6 actions beside ← in its top bar (4 on a phone, counting ⋮). The formatting bar lines up with the text, and on a phone it sits above the keyboard.
- No card has empty space below its content. Nothing is truncated or overflows at 360 px wide.
- Light and dark themes both read well, and every text colour meets WCAG 2.2 AA.
- Text notes can hold tick-box lines that tick on cards and in the editor.

### Constraints

- Next.js 16 Pages Router, React 19 (React Compiler lint), Radix + CSS Modules, Tiptap 3, Vitest. Tokens live in `styles/tokens.css`; the font is Lato; the accent is #6a61bf (light) / #a59ef0 (dark).
- WCAG 2.2 AA: keyboard and screen reader for everything; 44 × 44 px tap targets on touch; visible focus.
- URLs keep working: `/`, `/?view=notes|lists|upcoming|boards|archive|trash`, `/?label=<id>`, `/?q=<text>`, `/note?id=…`, `/board?id=…`.
- Backup format unchanged (tick boxes are plain Markdown in `content`).

## Decisions

| Question | Choice |
| --- | --- |
| Overall feel | Google Keep, refined |
| Navigation | Full sidebar (A): names visible, collapsible to an icon rail; drawer on phone |
| Editor | Full page, tidied (A) |
| Tick boxes in text notes | Yes, tickable everywhere |

## Part 1: App shell and navigation

### Sidebar

- **Desktop (≥ 1024 px):** a 248 px sidebar shows by default. ☰ in the header collapses it to a 72 px icon rail (each icon has a tooltip and an accessible name). The choice is remembered (`localStorage`, key `sidebar`: `open` / `rail`).
- **Tablet (600–1023 px):** the icon rail shows by default. ☰ opens the full sidebar as an overlay (closes on Escape, on picking an item, or on clicking outside).
- **Phone (< 600 px):** no sidebar. ☰ opens a drawer (a modal side sheet) with the same items; picking an item closes it; focus returns to ☰.
- Items, top to bottom:
  1. **Notes** → `/` (all notes and lists).
  2. **Upcoming** → `/?view=upcoming`, with a badge counting notes that are overdue or due today (hidden at 0; accessible name e.g. "Upcoming, 2 due").
  3. **Boards** → `/?view=boards`.
  4. **Labels** section heading, then each label → `/?label=<id>` (alphabetical), then **Edit labels** (opens the labels dialog).
  5. **Archive** → `/?view=archive`, **Trash** → `/?view=trash`.
- The current item has the accent-soft pill and `aria-current="page"`. `/?view=notes` and `/?view=lists` mark **Notes** as current.
- The sidebar is a `<nav aria-label="Sections">`.

### Header

- `☰ · Noteboard · [Search notes] · + New · theme · ⋮`
- The search box's left edge lines up with the content column; it grows up to 640 px.
- ⋮ keeps: Back up notes, Restore from backup…, Export as Markdown, Use device theme. (Archive, Trash and Manage labels move to the sidebar.)
- On a phone: ☰ · search · ⋮, with + New as the existing floating button.

### Page headings

- Each section shows its name as the page's `h1` above the grid: Notes, Upcoming, Boards, the label's name, Archive, Trash.
- On Notes, beside the heading, a segmented switch **All · Text · Lists** (`/`, `/?view=notes`, `/?view=lists`); it is a radio group.
- While searching, the heading reads **Results for "qa"** with "4 notes" after it (announced in a status region).
- Trash keeps its line "Notes in Trash are deleted after 30 days." and the Empty trash button next to the heading.
- The chip row is removed.

### Focused screens

- The editor (`/note`) and a board (`/board`) keep their own slim header with ← and no sidebar.

## Part 2: Editor, cards and screens

### Editor (full page)

- **Top bar:** ← on the left; on the right Pin, Colour, Date, Labels, Add image, ⋮. ⋮ holds Board…, Turn into list / Turn into text, Make a copy, Archive, Delete. On a phone (< 600 px) the top bar shows Pin, Colour, Date, ⋮, and Labels and Add image move into ⋮.
- **Formatting bar (text notes):** directly under the top bar, the width of the text column (max 720 px, centred), sticky while the page scrolls. Groups: H1 H2 | B I S Code | Bullets Numbers Tick boxes Quote Code block | Link.
- **On a phone:** while the text editor has focus, the formatting bar is fixed just above the on-screen keyboard (positioned from `visualViewport`), scrolls sideways when it doesn't fit, and hides when the editor loses focus.
- **Title:** 28 px, weight 800, line-height 1.2; distinct from body H1 (22 px, weight 700). The placeholder "Title" uses `--text-muted` at normal weight.
- **Chips under the text:** date chip, one chip per label, board chip (`Board · Column`). Each opens its picker. The row is hidden when there are none.
- Images stay above the title; "Edited …" stays last.

### Tick boxes in text notes

- The Tick boxes button, or typing `[ ] ` (or `[] `) at the start of a line, turns the line into a tick-box line; Enter adds the next one; Enter on an empty one ends the list.
- Saved in `content` as Markdown task items: `- [ ] text` / `- [x] text`. Existing notes whose lines are `- [ ] …` or `* [x] …` render as tick boxes with no migration.
- On cards, tick boxes are real checkboxes ("Mark ‘buy milk’ done"); ticking one saves the note with that line toggled (by its order among the note's tick boxes). Ticked lines are crossed out and muted.
- In the editor a tick box toggles in place.

### Cards

- Height follows content: no min-height; padding 12 px 14 px. A card with only images shows just the images (no empty body).
- Title 15 px bold; body 14 px; text clamps after 10 lines with a fade.
- The labels, date and board tags stay at the bottom of the card.

### Colour picker

- All 7 swatches on one row (the popover sizes to fit; swatches 32 px).

### Dark theme

- Note colours in dark are re-tuned so each reads as its colour (yellow as amber, not olive), with `--note-ink` meeting 4.5:1 on each.
- Empty states use a small (64 px) line icon in theme colours with one line of text, instead of the large light illustration. The 404 page keeps its illustration, sized to fit.

### Search

- Matches of the query in a card's title and text are wrapped in `<mark>` (accent-soft background, text colour unchanged).
- The heading line counts results ("1 note" / "4 notes").

### Boards

- Empty columns drop the "No cards" text; the drop area keeps a 48 px minimum so cards can still be dropped there.
- On a phone (< 600 px) the board header's Filter and Add card become icon buttons (same names), so the board name has room.

### Dialogs

- New board's templates become option cards (styled radios with the template name and its columns), keyboard-operable as a radio group.
- All dialogs: 6 px between a label and its field, 16 px between groups, title 18 px, the same button styles.

### Throughout

- One focus ring (2 px `--focus`, 2 px offset) and one hover style for icon buttons and chips.
- Touch targets at least 44 × 44 px under `(pointer: coarse)`.

## Code structure

| File | Change |
| --- | --- |
| `components/shell/AppShell.tsx` (new) | Header + sidebar + content; sidebar mode (open, rail, drawer) from width and the remembered choice |
| `components/shell/Sidebar.tsx` (new) | The navigation list: sections, labels, Edit labels, Archive, Trash, Upcoming badge |
| `components/board/ViewHeader.tsx` (new) | Page heading, search result line, All · Text · Lists switch, Trash line |
| `lib/tasks.ts` (new) | Tick-box lines in Markdown: list them, toggle the n-th |
| `pages/index.tsx`, `components/board/TopBar.tsx` | Use the shell; ⋮ trimmed |
| `components/board/FilterChips.tsx` | Removed |
| `components/editor/NoteEditor.tsx`, `EditorToolbar.tsx`, `FormatBar.tsx` | Action set, ⋮, sticky bar, phone keyboard dock, title, chips row, tick-box button |
| `components/editor/extensions.ts` | Tiptap task list + task item, Markdown `- [ ]` |
| `components/board/MarkdownPreview.tsx`, `NoteCard.tsx` | Tick boxes on cards, search highlight, card sizing |
| `components/ui/ColorPicker.module.css` | One row |
| `styles/tokens.css` | Dark note colours |
| `components/NotFound/*`, empty states | Small icon style |
| `components/kanban/*` | No "No cards", phone icon buttons, template option cards |
| Dialog styles | Shared spacing |

## Testing

TDD: every test written first and seen failing.

- `lib/tasks.test.ts`: finds tick-box lines (`-`, `*`, `+`, `[ ]`, `[x]`, `[X]`), ignores code blocks; toggles the n-th only; leaves other text byte-for-byte.
- Sidebar: each item's link; `aria-current` for each view (Notes for `view=notes|lists`); labels listed; Edit labels opens the dialog; Upcoming badge count; rail choice remembered; phone drawer opens, closes on pick and returns focus to ☰.
- Notes page: heading per view; All · Text · Lists switch changes the view; search heading and count; Trash line.
- Editor: top bar controls and ⋮ items (desktop and phone widths via `matchMedia` mock); title placeholder; tick-box button and `[ ] ` input rule produce `- [ ]` in the saved Markdown.
- Cards: tick boxes render and toggle the right line; search matches marked; image-only card has no body.
- Boards: no "No cards"; phone header buttons keep their accessible names.
- Chrome (not testable in jsdom): every screen at 360, 768, 1280 and 2560 px, light and dark; the phone keyboard dock; dark colour contrast computed for each note colour.

## Out of scope

- Opening notes as a pop-up over the grid.
- New features beyond tick boxes in text notes.
- Sync and native apps (next round).
