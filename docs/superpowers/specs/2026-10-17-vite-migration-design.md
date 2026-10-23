# Phase 0: Move to Vite + React Router in a Monorepo: Design

Date: 2026-10-17
Status: Draft, awaiting review

## Goal

Phase 0 of the scaling plan: move Noteboard from Next.js to Vite + React Router, inside a monorepo that later holds the API (Phase 1) and the native apps (Phase 4). Next adds nothing to an app that renders entirely in the browser and keeps its data in IndexedDB; Vite is simpler, faster and the natural base for Capacitor and Tauri.

Nobody using the app should notice anything changed.

### Success criteria

- Same URLs: `/`, `/?view=notes|lists|upcoming|boards|archive|trash`, `/?label=<id>`, `/?q=<text>`, `/note?id=…` (with `&new=…`, `&column=…`, `&at=…`, `&board=…`), `/board?id=…`. Unknown URLs show the Not Found page.
- Same data: existing notes, boards, images, labels and settings load unchanged after the update (same origin, same IndexedDB database, same localStorage keys). No migration code.
- Same behaviour: filters, search, Back/Forward, Back from the editor to the same board and scroll position, kanban, reminders and notification clicks, theme and collapsed sidebar with no flash on load.
- Works offline and stays installable. Installed copies update themselves to the new version on their own.
- Deploys on Vercel from the existing project, with no dashboard changes.
- All tests pass (about 600), `tsc`, lint and build are clean, `npm run dev` starts with no console warnings, and a Chrome walkthrough of a production build passes, including the upgrade from the current Next build.

### Constraints

- React 19 (React Compiler lint rules), Radix + CSS Modules, Tiptap 3, Dexie, Vitest, Node 24.
- Dev server on port 4000.
- No Prettier run. No change to look, copy or features.
- main is protected: the work is merged into dev; dev → main by PR when the user asks.

## Decisions

| Question | Choice |
| --- | --- |
| Router | React Router 8 (current major), plain component (declarative) mode |
| How components navigate | Through our own small navigation module, never the router directly |
| Repo layout | npm workspaces: `apps/web`, `packages/shared`; `apps/api` arrives in Phase 1 |
| Service worker | `vite-plugin-pwa` (`injectManifest`) built from the existing `worker/` code |
| Font | Lato from `@fontsource/lato` (300, 400, 700) |
| Hosting | Vercel, configured by a root `vercel.json` |

React Router 8 keeps the declarative API of 7; it only drops `react-router-dom` and some framework-mode flags.

Rejected: a shim that imitates Next's router (keeps Next-shaped code around for no gain); TanStack Router (more than three routes need).

## Part 1: Repo layout and tooling

```
package.json            workspaces: apps/*, packages/*; scripts dev, build, test, lint
tsconfig.base.json      shared compiler options
vercel.json
apps/web/
  index.html            replaces pages/_document
  vite.config.ts        React plugin, PWA plugin, port 4000, Vitest config
  package.json
  tsconfig.json
  eslint.config.js
  main.tsx, App.tsx     replace pages/_app
  routes/               Home, NotePage, BoardPage (were pages/index, note, board)
  components/ lib/ styles/ worker/ public/ assets/   unchanged apart from Next imports
packages/shared/
  package.json          name @noteboard/shared
  src/types.ts          moved from lib/types.ts
```

- There is no `src/` folder: the folders keep today's layout and move with `git mv`, so history follows them.
- `lib/types.ts` moves to `@noteboard/shared` because the API will share these types. To keep the diff small, `apps/web/lib/types.ts` re-exports it, so existing imports still work.
- Root scripts run the web app's: `npm run dev`, `npm run build`, `npm test`, `npm run lint`.
- Tooling: Vite, `@vitejs/plugin-react` (no compiler plugin, as today), Vitest (jsdom, the same setup file), ESLint replaces `eslint-config-next/core-web-vitals` with the same plugins minus the Next one: `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` (recommended set, which includes the React Compiler rules) and `eslint-plugin-jsx-a11y`. The React and accessibility rules stay at least as strict as now.
- Removed: `next`, `next-pwa`, `eslint-config-next`, `next.config.js`, `next-env.d.ts`, `.next/`, `ecosystem.config.js`, `pages/_offline.tsx`, and the next-pwa entries in `.gitignore`.
- Node 24 stays in `engines`.

## Part 2: Routing, navigation and the app shell

### Routes

`<BrowserRouter>` with:

| URL | Screen | Loading |
| --- | --- | --- |
| `/` | Home | in the main bundle |
| `/note` | Note editor | `React.lazy`, still preloaded from boards as today |
| `/board` | Kanban board | `React.lazy` |
| `*` | Not Found | in the main bundle |

### Our navigation module

Components never import `react-router` directly; they use `lib/navigation.ts` and `lib/routes.ts`. If the router changes again, only these files change.

- `useQuery(): Record<string, string | string[]>` returns the URL query as a plain object, the shape of Next's `router.query`, so `parseFilter` and the other call sites keep their logic.
- `useNav()` returns `{ path, go(href), swap(href), back() }`: push, replace, and history back.
- `lib/routes.ts` builds string hrefs (`/note?id=…`) instead of URL objects. `noteHref`, `newNoteHref`, `boardHref`, `BOARDS_HREF`, `openEditor` and `leaveEditor` keep their behaviour: opening from `/` or `/board` pushes, from anywhere else replaces; leaving goes back or to the saved board URL; the board scroll position is saved and restored as now.

### Next behaviours and their replacements

- **`router.isReady`** goes away: without server rendering the URL is known on the first render, so the editor and board no longer wait for it.
- **Back/Forward refreshing the search box** (`router.events` today): the search box rereads the URL when React Router reports a `POP` navigation (`useNavigationType()` with `location.key`). Typing still only replaces the URL.
- **Shallow routing:** not needed; changing the filter just re-renders Home.
- **Scroll to top on navigation:** a small `ScrollToTop` scrolls to the top on `PUSH` and `REPLACE` to a new path. Back to a board keeps using the existing scroll restore.
- **`next/link`** becomes React Router's `Link`; **`next/head`** becomes React 19's `<title>` and `<meta>`; **`next/image`** becomes `<img>` with the same width, height, `loading="lazy"` and `decoding="async"`.

### App shell

- `main.tsx` mounts `<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>` and imports the global CSS and fonts.
- `App.tsx` does what `_app` does today: `MotionConfig reducedMotion="user"`, `ToastProvider`, `StorageBanner`, `ReminderAlerts`, `useGlobalShortcuts`, `useSystemThemeSync`, `ScrollToTop`, and the routes.
- **Font:** `@fontsource/lato` weights 300, 400 and 700 are imported in `main.tsx`; `globals.css` sets the font family. The `<style jsx global>` block goes.
- **`index.html`** carries the manifest link, icons, theme colour, title and the pre-paint script that sets the theme and the collapsed sidebar before first paint.
- **"Has notes" marker removed:** it hid a flash of the empty state that came from server rendering. Home now shows the empty state only after notes have loaded, so the marker (`setHasNotesMarker`, `hasNotesMarker`, the `data-has-notes` attribute, its CSS rule and its part of the pre-paint script) is removed with no visible change.

## Part 3: Offline, deployment and testing

### Service worker

- `vite-plugin-pwa` in `injectManifest` mode builds `worker/index.js` into `/sw.js`, the same address as the current next-pwa worker, so browsers treat it as an update of the installed worker.
- The worker takes over straight away (`skipWaiting`, `clientsClaim`); the page picks it up on its next load, without a prompt.
- **Precache:** the built scripts, styles, fonts, icons and `index.html`.
- **Navigation:** every same-origin page request is answered network first with the existing `networkFirst` helper (3-second timeout), falling back to the precached `index.html`. Any note or board opens offline, even one never opened before.
- **Old caches:** on activate the worker deletes every cache that isn't its own precache, which clears next-pwa's Workbox caches and `app-shell`. Notes and images live in IndexedDB, so nothing is lost.
- Notification clicks keep using `openFromNotification`.
- The worker is disabled in `npm run dev`, as today. `public/manifest.json` and the icons stay as they are (the plugin does not generate a manifest).

### Deployment

Root `vercel.json`:

- `framework: "vite"`, `buildCommand: "npm run build"`, `outputDirectory: "apps/web/dist"`.
- A rewrite of every path to `/index.html`. Vercel only rewrites when no file matches, so assets and `sw.js` are served as files.
- `Cache-Control: public, max-age=31536000, immutable` for `/assets/(.*)`.

The dev branch's preview deploy is checked before the work is considered done.

### Testing

- Vitest runs from `apps/web/vite.config.ts` with the same jsdom setup.
- The 13 test files that mock `next/*` switch to one helper, `renderAt(ui, url)`, which renders inside a real `MemoryRouter` at that URL, and to `<img>` / React Router `Link` assertions.
- New tests:
  - `useQuery`, `go`, `swap` and `back`
  - `ScrollToTop`
  - an unknown route showing Not Found
  - Back/Forward refreshing the search box while typing does not
  - Home not showing the empty state before notes load
  - the worker deleting old caches and answering navigations from the precached `index.html` when offline
- The existing `networkFirst` and `notificationClick` tests keep passing unchanged.

### Verification

1. `npm test`, `tsc`, `npm run lint` and `npm run build` are clean, and `npm run dev` starts on port 4000 with no console warnings.
2. Chrome walkthrough on a production build (`vite preview`): filters, search, Back/Forward, open, edit and close a note, Back to the board at the same scroll position, kanban, reminders, the theme and collapsed sidebar with no flash on load, and an offline reload.
3. Upgrade path: serve the current Next build, load it so its worker installs and add test notes. Then serve the new build at the same address, reload, and check that the new worker is in control, the notes are still there and the old caches are gone.
4. Final whole-branch review, with every finding fixed, including minor ones. Then merge into dev, push, and check the Vercel preview deploy.

## Out of scope

The API, accounts, sync, teams (Phases 1 and 2), new board features (Phase 3), native apps (Phase 4), and any visible change to the app.
