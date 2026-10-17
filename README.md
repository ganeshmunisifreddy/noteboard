# Noteboard

A notes and checklists app by Nine Technology, built with [Vite](https://vite.dev/) and [React Router](https://reactrouter.com/), in an npm workspaces monorepo (`apps/web` is the app, `packages/shared` the data types). Notes are stored in the browser with IndexedDB (via [Dexie](https://dexie.org/)), and the app installs as a PWA that works offline. There is no server-side storage.

## Features

- Notes and checklists, with pin, colour, labels, archive and trash (30-day auto-delete, undo)
- Formatting in text notes (headings, bold, italic, lists, quotes, code, links), stored as Markdown
- Images in notes and lists (photos, screenshots, pasted or dropped images), shrunk on the device and kept offline
- Dates on notes and lists (optional time, repeats), reminders while Noteboard is open, Mark done, and an Upcoming view (Overdue, Today, Tomorrow, Next 7 days, Later)
- Kanban boards from the Boards chip: named boards with columns (templates: Basic, Pipeline, Now / Next / Later), cards are your notes, drag or use each card's Move menu, a Done column marks dates done
  - Quick add: type a title at the bottom of a column, press Enter, keep typing
  - Filter a board by text, label, or date (Overdue, Next 7 days, No date)
  - Each card's menu (or right-click): colour, labels, date, move, move to another board, archive, delete
  - Archive or move all of a column's cards at once, with Undo
  - Drag columns by their name; star boards to keep them first and drag boards into any order
- Drag cards into your own order (mouse, touch, or the grip button with arrow keys)
- Backup and restore (JSON, merges with what's there) and export as Markdown, from the ⋯ menu
- A sidebar with every section (Notes, Upcoming, Boards, your labels, Archive, Trash), collapsible to icons; a drawer on phones
- Search with matches highlighted on cards; All · Text · Lists on Notes; everything kept in the URL
- Tick boxes inside text notes (type `[ ] ` at the start of a line), tickable on cards
- Light and dark themes
- Keyboard shortcuts: `n` new note, `l` new list, `/` search, `Esc` leave the editor

## Getting Started

Requires Node.js 24 (pinned in `package.json` `engines` and `.nvmrc`; Vercel builds with it).

```bash
npm install
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

## Scripts

| Command             | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Dev server on port 4000 (the service worker is off)            |
| `npm run build`     | Production build into `apps/web/dist`, with the service worker |
| `npm run preview`   | Serve the production build on port 4100                        |
| `npm test`          | Run unit and component tests (Vitest)                          |
| `npm run lint`      | Run ESLint                                                     |
| `npm run typecheck` | Run TypeScript                                                 |

Vercel builds and serves `apps/web/dist` as configured in `vercel.json` (every address falls back to `index.html`).

## Project Structure

Paths are under `apps/web/` unless noted.

- `index.html`, `main.tsx`, `App.tsx`: the page, the entry point and the routes
- `lib/navigation.ts`: the only module that talks to React Router (components use it to read the URL and navigate)
- `routes/Home.tsx`: board
- `routes/NotePage.tsx`: editor (`/note?id=…`)
- `routes/NotFoundPage.tsx`: any other address
- `components/board/`, `components/editor/`, `components/ui/`: UI (Radix Primitives + CSS Modules)
- `lib/notes.ts`: notes and labels store; `lib/db.ts`: IndexedDB schema
- `lib/backup.ts`: backup format, restore merge and Markdown export; `lib/order.ts` and `lib/masonry.ts`: board order and layout
- `lib/markdown.ts`: how notes are read as Markdown (cards, search, conversion and the editor share it); `components/editor/RichEditor.tsx`: the Tiptap editor
- `lib/images.ts`: shrinking images on the device; `lib/attachments.ts`: stored images and thumbnails
- `lib/calendar.ts`, `lib/repeat.ts`, `lib/due.ts`: dates, repeats and Mark done; `lib/reminders.ts`: the reminder clock (one tab at a time) and notifications. Reminders only fire while Noteboard is open; there's no server.
- `components/shell/`: the app shell and sidebar; `lib/tasks.ts`: tick boxes in a note's Markdown
- `routes/BoardPage.tsx`, `components/kanban/`: kanban boards; `lib/boards.ts` (boards and columns), `lib/cards.ts` (placing notes on them), `lib/places.ts` (column order), `lib/boardFilter.ts` (the board filter)
- `lib/migrate.ts`: one-time move of notes from the old `localStorage` format (the old data is kept as `notes-backup-v1`)
- `styles/tokens.css`: colours, spacing and type, light and dark
- `worker/sw.js`: the service worker (built to `/sw.js`): precaches the app so every page opens offline, clears the old Next.js caches, and opens notes from reminder notifications
- `packages/shared/` (repo root): data types shared with the future API
