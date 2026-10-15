# Noteboard

A notes and checklists app by Nine Technology, built with [Next.js](https://nextjs.org/) (Pages Router). Notes are stored in the browser with IndexedDB (via [Dexie](https://dexie.org/)), and the app installs as a PWA that works offline. There is no server-side storage.

## Features

- Notes and checklists, with pin, colour, labels, archive and trash (30-day auto-delete, undo)
- Formatting in text notes (headings, bold, italic, lists, quotes, code, links), stored as Markdown
- Images in notes and lists (photos, screenshots, pasted or dropped images), shrunk on the device and kept offline
- Dates on notes and lists (optional time, repeats), reminders while Noteboard is open, Mark done, and an Upcoming view (Overdue, Today, Tomorrow, Next 7 days, Later)
- Drag cards into your own order (mouse, touch, or the grip button with arrow keys)
- Backup and restore (JSON, merges with what's there) and export as Markdown, from the ⋯ menu
- Search and filters (All, Notes, Lists, Upcoming, labels), kept in the URL
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

| Command         | Description                                                       |
| --------------- | ----------------------------------------------------------------- |
| `npm run dev`   | Dev server on port 4000 (Turbopack; the service worker is off)    |
| `npm run build` | Production build (webpack, required by `next-pwa` to emit `sw.js`) |
| `npm start`     | Serve the production build on port 9090                           |
| `npm run lint`  | Run ESLint                                                        |
| `npm test`      | Run unit and component tests (Vitest)                             |

In production the app runs under pm2 via `ecosystem.config.js`.

## Project Structure

- `pages/index.tsx`: board
- `pages/note.tsx`: editor (`/note?id=…`)
- `pages/_offline.tsx`: fallback page served by the service worker when offline
- `components/board/`, `components/editor/`, `components/ui/`: UI (Radix Primitives + CSS Modules)
- `lib/notes.ts`: notes and labels store; `lib/db.ts`: IndexedDB schema
- `lib/backup.ts`: backup format, restore merge and Markdown export; `lib/order.ts` and `lib/masonry.ts`: board order and layout
- `lib/markdown.ts`: how notes are read as Markdown (cards, search, conversion and the editor share it); `components/editor/RichEditor.tsx`: the Tiptap editor
- `lib/images.ts`: shrinking images on the device; `lib/attachments.ts`: stored images and thumbnails
- `lib/calendar.ts`, `lib/repeat.ts`, `lib/due.ts`: dates, repeats and Mark done; `lib/reminders.ts`: the reminder clock (one tab at a time) and notifications. Reminders only fire while Noteboard is open; there's no server.
- `lib/migrate.ts`: one-time move of notes from the old `localStorage` format (the old data is kept as `notes-backup-v1`)
- `styles/tokens.css`: colours, spacing and type, light and dark
- `worker/index.js`: serves the board and editor offline, and opens notes from reminder notifications
