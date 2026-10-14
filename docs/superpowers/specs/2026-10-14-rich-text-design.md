# Rich Text Notes: Design

Date: 2026-10-14
Status: Draft, awaiting review

## Goal

Round 2 of four follow-up rounds for Noteboard:

1. Backup + drag to reorder (done)
2. **Rich text / Markdown** (this spec)
3. Images in notes
4. Due dates and reminders

Sharing notes with other people is out of scope for this version.

Text notes get formatting: emphasis, structure, links and code. Formatting shows as you type (a rich editor), and notes are stored as Markdown.

### Success criteria

- A user can write a structured note (headings, lists, links, code) without typing any Markdown symbols.
- The note looks the same in the editor after a reload, on its card, and in the Markdown export.
- Existing notes and existing backups keep working; line breaks in old notes are kept.
- Opening a note never changes it; only edits are saved.

### Constraints

- Same as earlier specs: no server, data in the browser (IndexedDB via Dexie), Next.js 16 Pages Router, React 19 with the React Compiler lint rules, Radix + CSS Modules, WCAG 2.2 AA, functional text at least 11px.
- The database schema and the backup format (version 1) do not change.
- The board page must not load the editor.

## Decisions

| Topic | Decision |
|---|---|
| Scope | The body of text notes only. Titles and checklist items stay plain text. |
| Editing | Rich editor: formatting shows as you type; toolbar plus Markdown typing shortcuts |
| Library | Tiptap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extensions`) |
| Storage | Markdown in the existing `Note.content` string |
| Toolbar | Formatting bar under the editor's top bar (sticky) |
| Cards | Rendered from Markdown with `marked` (same parser as the editor) into React elements; no raw HTML |
| Links on cards | Styled, not clickable (a click opens the note) |
| Old notes | Read as Markdown as they are; no conversion step |

## Part 1: Editing a note

### Editor

- For notes with `kind = 'note'`, the plain textarea (`NoteBody`) is replaced by a Tiptap editor. List notes are unchanged.
- The editor is loaded with a dynamic import only on the note page. While it loads, the note's text is shown read-only in the same place, so the page doesn't flash empty.
- The service worker already caches built chunks, so the editor works offline after the first visit.
- Placeholder text: "Note". Accessible name: "Note" (the editable area is a multi-line textbox).
- Notes in Trash are read-only: the editor is not editable and the formatting bar is hidden.

### Formatting bar

- Sits under the existing top bar and stays visible while the note scrolls.
- Buttons, in order, with groups separated:
  - Heading 1, Heading 2
  - Bold, Italic, Strikethrough, Inline code
  - Bullet list, Numbered list, Quote, Code block, Divider
  - Link
- Toggle buttons show their state (`aria-pressed`) for the style at the cursor.
- It is one toolbar (`role="toolbar"`): Tab moves into and out of it; Left and Right arrows (plus Home and End) move between buttons.
- On narrow screens it scrolls sideways; it never wraps onto a second row.
- Hidden for list notes and for notes in Trash.

### Keyboard and typing shortcuts

- Markdown typing shortcuts: `# `, `## `, `### `, `- ` or `* `, `1. `, `> `, three backticks, `---`, `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``.
- Cmd/Ctrl+B (bold), Cmd/Ctrl+I (italic), Cmd/Ctrl+K (link), plus undo and redo.
- Heading level 3 is supported when typed, pasted or present in an old note, but has no button.
- Underline is not offered (Markdown cannot store it).
- Esc still leaves the editor, as today (IME composition is still respected).

### Links

- Cmd/Ctrl+K or the Link button opens a small popover anchored to the bar with a URL field, "Save" and, for an existing link, "Remove link".
- If text is selected, the link wraps it; with no selection the URL itself is inserted as the link text.
- Typing or pasting a bare URL turns it into a link automatically.
- Only `http:`, `https:` and `mailto:` URLs are accepted. A URL without a scheme gets `https://`. Anything else shows "Enter a web or email address." in the popover and nothing is saved.
- In the editor, a plain click places the cursor; Cmd/Ctrl+click opens the link in a new tab (`noopener`).

### Pasting

- Content pasted from a web page keeps the formatting the editor supports; anything else becomes plain text.
- Pasted plain text that is Markdown is converted to formatting.

### Saving

- On every edit the editor's Markdown goes through the existing autosave (draft, 400 ms delay, flush on leave and on hide).
- Loading a note into the editor does not count as an edit: an old note opened and left untouched is never rewritten and its `updatedAt` does not change.
- An empty editor saves `''`.

## Part 2: Notes outside the editor

### Reading Markdown (shared rules)

The editor, cards, search and conversion read Markdown the same way:

- GitHub-flavoured Markdown, including strikethrough and autolinks.
- **A single line break is a line break** (not a space), so old plain-text notes keep their lines.
- **Indented text is not code**: lines indented by four spaces stay normal text. Code blocks need fences (three backticks).
- Raw HTML in a note is treated as plain text, never as HTML.

### Cards on the board

- Text notes show their content formatted: headings (slightly larger, bold), paragraphs, bullet and numbered lists, quotes, dividers, inline code and code blocks (monospace), bold, italic, strikethrough, links.
- The card keeps the current 10-line clamp.
- Links are underlined but rendered as text, not as links, so a click anywhere on the card still opens the note.
- The preview element keeps its id so the card's `aria-describedby` still reads the note's text.
- Rendering uses `marked`'s lexer and maps tokens to React elements from a fixed list. Unknown token types render their text. Nothing is set through `innerHTML`.
- If parsing fails, the card shows the content as plain text.

### Search

- Search matches the note's text without Markdown symbols, plus link addresses. "milk" finds `**milk**`; "booking.com" finds `[hotel](https://booking.com)`.

### Converting between note and list

- Note to list: each non-empty line of text becomes an item; list markers, heading markers, quote markers and inline formatting are removed (items are plain text). Code block lines become items as they are; fence lines are dropped.
- List to note: items become a bullet list (`- text` per item). The ticked state is not kept (as today).

### Empty notes

- A note whose Markdown has no text (only empty paragraphs, empty headings, empty list items or dividers) counts as empty, so leaving it still moves it to Trash.

### Copy, export, backup

- "Make a copy" copies the Markdown as it is.
- The Markdown export writes `content` as it is.
- The backup format is unchanged (version 1). Old backups restore as they are.

## Code structure

| Path | Responsibility |
|---|---|
| `lib/markdown.ts` | Pure, on `marked` with the shared rules: `parseMarkdown(md)` (tokens), `toPlainText(md)`, `markdownLines(md)`, `itemsToMarkdown(items)`, `isMarkdownEmpty(md)`, `safeUrl(input)` |
| `components/board/MarkdownPreview.tsx` | Tokens to React elements for cards |
| `components/board/NoteCard.tsx` | Uses `MarkdownPreview` for text notes |
| `components/editor/RichEditor.tsx` | Tiptap editor; props `{ value, onChange, readOnly, autoFocus }` like `NoteBody` |
| `components/editor/FormatBar.tsx` | The formatting toolbar |
| `components/editor/LinkPopover.tsx` | Add, edit or remove a link |
| `components/editor/NoteEditor.tsx` | Loads `RichEditor` dynamically for text notes; falls back to `NoteBody` |
| `lib/checklist.ts` | `convertKind` and `isNoteEmpty` use the Markdown helpers |
| `lib/filters.ts` | `matchesQuery` uses `toPlainText` |

New dependencies: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extensions` (all 3.x, same version), and `marked` on the same major version `@tiptap/markdown` uses.

To be confirmed while planning: that `@tiptap/markdown` can be given the shared reading rules (line breaks, no indented code, HTML as text). If it can't, the note is normalised with `lib/markdown.ts` before it is loaded into the editor, with the same visible result.

## Error handling

- The editor chunk fails to load: the note opens in the plain textarea (editing the Markdown directly) with the message "Formatting tools couldn't load. You can still edit the text." Nothing is lost.
- Markdown that fails to render on a card: plain text is shown.
- Invalid link address: inline error in the link popover; the document is unchanged.

## Testing

- Vitest, `lib/markdown`: line breaks kept; indented text is not code; raw HTML is text; plain text for search (formatting removed, link URLs included); lines for conversion; empty detection; `safeUrl` (accepts http, https, mailto; adds https to bare domains; rejects `javascript:` and others).
- Vitest, editor round trips: a set of sample notes (headings, nested lists, code blocks, links, line breaks, old plain-text notes) load and serialise back unchanged, or to the documented normal form.
- React Testing Library: card rendering (formatted elements, no raw HTML, links not clickable); toolbar buttons change the saved Markdown and show their state; link popover add, edit, remove and invalid URL; opening a note does not save it; read-only note in Trash; textarea fallback when the editor fails to load; convert note to list and back.
- Manual in Chrome: typing shortcuts; pasting from a web page; Cmd/Ctrl+click on a link; narrow phone width (bar scrolls sideways); offline after a first visit; an old plain-text note with line breaks; restoring an old backup; Markdown export contents.

## Out of scope

- Formatting in titles and checklist items.
- Task lists (checkboxes) inside text notes; list notes cover this.
- Tables, images (round 3), underline, text colour, font sizes.
- Importing Markdown files.
