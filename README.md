# Noteboard

A notes app by Nine Technology, built with [Next.js](https://nextjs.org/) (Pages Router). Notes are stored in the browser's `localStorage`, and the app installs as a PWA with offline support.

## Getting Started

Requires Node.js 20.9 or later.

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

In production the app runs under pm2 via `ecosystem.config.js`.

## Project Structure

- `pages/index.tsx`: notes board
- `pages/_offline.tsx`: fallback page served by the service worker when offline
- `components/`: note card, edit modal, header, empty state
- `lib/notes.ts`: notes store (`localStorage`, synced across tabs)
