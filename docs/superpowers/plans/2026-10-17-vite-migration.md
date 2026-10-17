# Phase 0: Vite + React Router Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Noteboard from Next.js to Vite + React Router inside an npm-workspaces monorepo, with no visible change for anyone using the app.

**Architecture:** The app moves to `apps/web` (folders keep their layout) and the data types move to `packages/shared`. Components navigate through our own `lib/navigation.ts` (hooks over React Router), never the router directly. The service worker is built from `worker/` by `vite-plugin-pwa` (`injectManifest`) at the old `/sw.js` address, so installed copies update themselves. Vercel builds it from a root `vercel.json`.

**Tech Stack:** Vite 8, @vitejs/plugin-react 6, React Router 8 (declarative mode), vite-plugin-pwa 2 + Workbox 7, @fontsource/lato, Vitest 5 (jsdom), ESLint 10 with typescript-eslint, eslint-plugin-react, eslint-plugin-react-hooks 7 and eslint-plugin-jsx-a11y. React 19.3, Dexie, Tiptap 3, Radix are unchanged.

**Spec:** `docs/superpowers/specs/2026-10-17-vite-migration-design.md`

**Branch:** `feature/vite-migration`, from `dev` at d2806c3.

## Global Constraints

- Same URLs: `/`, `/?view=notes|lists|upcoming|boards|archive|trash`, `/?label=<id>`, `/?q=<text>`, `/note?id=…` (with `&new=…`, `&column=…`, `&at=…`, `&board=…`), `/board?id=…`. Unknown URLs show the Not Found page.
- Same data: same origin, same IndexedDB database, same localStorage keys (`theme`, `sidebar`, …). No migration code.
- No change to look, copy or features.
- Node `24.x` in `engines`. Dev server on port 4000.
- React 19 with the React Compiler lint rules (`eslint-plugin-react-hooks` recommended set). No compiler build plugin.
- Components never import `react-router`. Only `lib/navigation.ts`, `lib/testRouter.tsx`, `App.tsx` and `main.tsx` do. `Link` is re-exported from `lib/navigation.ts`.
- No Prettier run. Match the surrounding code: single quotes, JSX attributes in single quotes, semicolons, sparse comments that explain why.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB
  ```
- main is protected. Work is merged into dev with `--no-ff` and pushed. No PR to main.

**Ruling (made while planning):** the spec says React Router 7, but 8.4.0 is current. v8 keeps declarative mode (`BrowserRouter`, `Routes`, `Route`, `Link`, `useNavigate`, `useLocation`, `useNavigationType`) unchanged and only drops `react-router-dom` and some framework-mode flags. Use 8. The spec line is updated in the plan's commit. Cost if wrong: one version pin.

## Review Focus

1. **Installed copies on the old next-pwa worker:** the new worker must take over and must not keep serving cached HTML that points at removed `/_next/` files. Covered by the cache-cleanup test (Task 6) and the upgrade walkthrough (Task 8).
2. **Opening or refreshing a deep link directly** (`/note?id=…`, `/board?id=…`, an unknown path), online on Vercel and offline. Covered by `App.test.tsx` (Task 5), the navigation test (Task 6) and the Vercel rewrite (Task 7).
3. **Search box:** typing replaces the URL and must not remount the input (it would lose focus); Back/Forward must refresh it. Covered by the `usePopKey` tests (Task 4) and the Home test (Task 5).
4. **A new note's first save drops `new` from the URL with a replace:** this must neither scroll to the top nor remount the editor. Covered by the `useScrollToTop` keep-scroll test (Task 4) and the NotePage test (Task 5).
5. **The saved dark theme and the collapsed sidebar apply before first paint.** Covered by `prepaint.test.ts` (Task 5).

---

### Task 1: Monorepo layout (still on Next)

Moves the app into `apps/web` and the types into `packages/shared`, still building with Next, so the move is verified on its own.

**Files:**
- Move (git mv) into `apps/web/`: `assets components lib pages public styles worker eslint.config.mjs next.config.js next-env.d.ts tsconfig.json vitest.config.mts vitest.setup.ts ecosystem.config.js`
- Move: `apps/web/lib/types.ts` → `packages/shared/src/types.ts`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `apps/web/lib/types.ts`, `apps/web/package.json`, `tsconfig.base.json`
- Modify: `package.json` (root), `apps/web/tsconfig.json`, `apps/web/next.config.js`

**Interfaces:**
- Produces: the workspace `@noteboard/web` (scripts `dev`, `build`, `start`, `lint`, `test`, `typecheck`), the package `@noteboard/shared` (exports everything from `types.ts`), and root scripts `dev`, `build`, `lint`, `typecheck`, `test` that run the web app's.

This task is a move plus configuration, with no behaviour to test first (a TDD exception). The full suite, typecheck, lint and build are its test.

- [ ] **Step 1: Branch, and record the baseline**

```bash
git switch -c feature/vite-migration
npm test > .superpowers/baseline-tests.txt 2>&1; tail -4 .superpowers/baseline-tests.txt
```
Expected: all tests pass (601 at the time of writing). Note the number: every later task must keep it, give or take tests this plan adds or removes on purpose.

- [ ] **Step 2: Move the files**

```bash
mkdir -p apps/web packages/shared/src
git mv assets components lib pages public styles worker eslint.config.mjs next.config.js next-env.d.ts tsconfig.json vitest.config.mts vitest.setup.ts ecosystem.config.js apps/web/
git mv apps/web/lib/types.ts packages/shared/src/types.ts
rm -rf .next tsconfig.tsbuildinfo
```

- [ ] **Step 3: Create the shared package**

`packages/shared/package.json`:
```json
{
  "name": "@noteboard/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

`packages/shared/src/index.ts`:
```ts
export * from './types';
```

`apps/web/lib/types.ts`. The web app keeps importing `./types`, so no other import changes:
```ts
// The data types live in @noteboard/shared so the API (Phase 1) can use them too.
export * from '@noteboard/shared';
```

- [ ] **Step 4: Package files and TypeScript config**

Root `package.json` (replace the whole file):
```json
{
  "name": "noteboard",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": "24.x"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @noteboard/web",
    "build": "npm run build -w @noteboard/web",
    "lint": "npm run lint -w @noteboard/web",
    "typecheck": "npm run typecheck -w @noteboard/web",
    "test": "npm test -w @noteboard/web --"
  }
}
```

`apps/web/package.json`: generated from the old root file, so the dependency lists are copied exactly (with `@noteboard/shared` added):
```bash
git show HEAD:package.json | node -e '
const old = JSON.parse(require("fs").readFileSync(0, "utf8"));
const web = {
  name: "@noteboard/web",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "PORT=4000 next dev --turbopack",
    build: "next build --webpack",
    start: "next start -p 9090",
    lint: "eslint .",
    test: "vitest run",
    typecheck: "tsc --noEmit",
  },
  dependencies: { "@noteboard/shared": "*", ...old.dependencies },
  devDependencies: old.devDependencies,
};
require("fs").writeFileSync("apps/web/package.json", JSON.stringify(web, null, 2) + "\n");
'
```

`tsconfig.base.json` (repo root):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "../../packages/shared/src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

In `apps/web/next.config.js`, add `transpilePackages`. Next doesn't compile TypeScript from linked packages without it:
```js
module.exports = withPWA({
  reactStrictMode: true,
  // Don't let `next dev` generate an AGENTS.md in the repo root.
  agentRules: false,
  transpilePackages: ['@noteboard/shared'],
});
```

- [ ] **Step 5: Install and verify**

```bash
rm -rf node_modules && npm install
npm test 2>&1 | tail -4
npm run typecheck && npm run lint && npm run build 2>&1 | tail -5
```
Expected: the same test count as the baseline, all passing. Typecheck, lint and build pass. `node_modules/@noteboard/shared` is a symlink to `packages/shared`. If `next build` rewrites `apps/web/tsconfig.json`, keep its additions.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move the app into apps/web and the types into @noteboard/shared

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```

---

### Task 2: ESLint without Next's preset

**Files:**
- Modify: `apps/web/eslint.config.mjs`, `apps/web/package.json` (devDependencies)
- Modify: `apps/web/components/board/CardImages.tsx:7-8`, `apps/web/components/editor/ImageViewer.tsx:14-15`, `apps/web/components/editor/Gallery.tsx:22-23` (remove the Next-only comments)

**Interfaces:**
- Produces: `npm run lint` with the same React, React Hooks (compiler) and accessibility rules as `eslint-config-next/core-web-vitals`, minus the Next plugin.

- [ ] **Step 1: Write a probe that the new rules must catch**

Create `apps/web/lint-probe.tsx` (deleted in Step 5):
```tsx
import { useState } from 'react';

export const Probe = ({ on }: { on: boolean }) => {
  if (on) {
    const [value] = useState(0);
    return <img src={String(value)} />;
  }
  return null;
};
```

- [ ] **Step 2: Swap the dependencies**

```bash
npm uninstall -w @noteboard/web eslint-config-next
npm install -D -w @noteboard/web eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y typescript-eslint globals
```

- [ ] **Step 3: Write the config**

`apps/web/eslint.config.mjs` (replace the whole file):
```js
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The rules eslint-config-next/core-web-vitals turned on, minus the Next plugin.
export default [
  {
    ignores: ['.next/**', 'dist/**', 'dev-dist/**', 'coverage/**', 'public/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/no-unknown-property': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': 'off',
      'jsx-a11y/alt-text': ['warn', { elements: ['img'] }],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
];
```

Remove the three Next-only comments: the `@next/next/no-img-element` disable lines and the "next/image can't optimise them" lines above them. ESLint reports a disable comment for a rule it doesn't know as an error.
- `components/board/CardImages.tsx` lines 7–8
- `components/editor/ImageViewer.tsx` lines 14–15
- `components/editor/Gallery.tsx` lines 22–23 (two JSX comments)

- [ ] **Step 4: Run the probe**

```bash
cd apps/web && npx eslint lint-probe.tsx; cd ../..
```
Expected: an error `react-hooks/rules-of-hooks` (useState called conditionally) and a warning `jsx-a11y/alt-text`. If either is missing, the config is wrong: fix it before going on.

- [ ] **Step 5: Delete the probe, lint everything, commit**

```bash
rm apps/web/lint-probe.tsx
npm run lint
npm test 2>&1 | tail -4
git add -A
git commit -m "Lint with the React, hooks and accessibility plugins directly, without Next's preset

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```
Expected: lint exits 0. If it reports warnings or errors in existing code that the Next preset also reported, they were already there: fix them in this task. Report any that are new.

---

### Task 3: Show the empty state only after notes load; remove the "has notes" marker

**Files:**
- Modify: `apps/web/pages/index.tsx`, `apps/web/styles/Home.module.css:26-28`, `apps/web/pages/_document.jsx`
- Modify: `apps/web/lib/storage.ts`, `lib/notes.ts`, `lib/boards.ts`, `lib/cards.ts`, `lib/startup.ts`, `lib/backup.ts`
- Test: `apps/web/components/board/Home.test.tsx`, `lib/notes.test.ts`, `lib/startup.test.ts`, `lib/backup.test.ts`

**Interfaces:**
- Produces: `refreshHasNotesMarker`, `setHasNotesMarker`, `hasNotesMarker` and `HAS_NOTES_KEY` no longer exist. Home renders the empty state only when `loaded && total === 0`.

- [ ] **Step 1: Write the failing test**

In `components/board/Home.test.tsx`, replace the test `'hides the empty state while notes load when returning to the board'` with:
```tsx
  it('does not show the empty state before notes have loaded', async () => {
    await createNote({ kind: 'note', title: 'Sprint' });
    render(<Home />);
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
    expect(await screen.findByText('Sprint')).toBeInTheDocument();
    expect(screen.queryByText('Notes you add appear here')).not.toBeInTheDocument();
  });
```
Also remove the line `document.documentElement.removeAttribute('data-has-notes');` from its `beforeEach`.

- [ ] **Step 2: Run it**

Run: `npm test -- components/board/Home.test.tsx`
Expected: FAIL. The empty-state text is in the document on the first render.

- [ ] **Step 3: Implement**

`pages/index.tsx`:
- Delete the import `import { hasNotesMarker } from '../lib/storage';`.
- Delete both effects about `data-has-notes`: the `useLayoutEffect` that sets it and the `useEffect` that removes it once `loaded`. Remove `useLayoutEffect` from the React import if nothing else uses it.
- Show the empty state only once loaded (the exact JSX is under `styles/Home.module.css` below). Delete the comment above it ("Also rendered on the server and while loading…").

`styles/Home.module.css`: delete the rule `:global(html[data-has-notes]) .emptyState { display: none; }`. It is the only `.emptyState` rule, so drop the wrapper `div` too:
```tsx
          {loaded && total === 0 && filter.view !== 'boards' && (
            <EmptyState filter={filter} text={emptyMessage(filter)} />
          )}
```

`pages/_document.jsx`, inline script: remove `var l=JSON.parse(s.getItem("notes")||"[]");if(s.getItem("hasNotes")||(Array.isArray(l)&&l.length))d.setAttribute("data-has-notes","");`, and change its comment to: `Runs before first paint: apply the saved theme and the collapsed sidebar. Keep in sync with lib/theme.ts.`

`lib/storage.ts`: delete `HAS_NOTES_KEY`, its comment, `setHasNotesMarker` and `hasNotesMarker`.

`lib/notes.ts`: delete `refreshHasNotesMarker`, import only `requestPersistentStorage` from `./storage`, and make `afterWrite`:
```ts
const afterWrite = async () => {
  requestPersistentStorage();
};
```
`lib/boards.ts`, `lib/cards.ts`, `lib/startup.ts`, `lib/backup.ts`: delete every `await refreshHasNotesMarker();` line (in startup: `await refreshHasNotesMarker().catch(() => {});`), and drop `refreshHasNotesMarker` from their imports.

Tests:
- `lib/notes.test.ts`:
  - Rename `'fills defaults and sets the hasNotes marker'` to `'fills defaults'` and delete its `hasNotes` line.
  - Rename `'trashes, restores and updates the marker'` to `'trashes and restores'` and delete its two `hasNotes` lines.
  - Delete the test `'does not count archived notes for the marker'`.
- `lib/startup.test.ts`: rename `'migrates, purges old trash and refreshes the marker'` to `'migrates and purges old trash'` and delete its `hasNotes` line.
- `lib/backup.test.ts`: delete the line `expect(localStorage.getItem('hasNotes')).toBe('1');`.

- [ ] **Step 4: Run the tests**

```bash
npm test 2>&1 | tail -4
grep -rn "hasNotes\|has-notes\|HasNotes" apps/web --include=*.ts --include=*.tsx --include=*.jsx --include=*.css
```
Expected: all pass (baseline − 1, since one marker test was deleted). grep finds nothing.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add -A
git commit -m "Show the empty state once notes have loaded; drop the has-notes marker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```

---

### Task 4: The navigation module and the test router (React Router, not wired in yet)

**Files:**
- Create: `apps/web/lib/navigation.ts`, `apps/web/lib/testRouter.tsx`
- Test: `apps/web/lib/navigation.test.tsx`
- Modify: `apps/web/package.json` (add `react-router`)

**Interfaces:**
- Produces, from `lib/navigation.ts`:
  - `type Query = Record<string, string | string[]>`
  - `toQuery(search: string): Query`
  - `useQuery(): Query`
  - `type NavOptions = { keepScroll?: boolean }`
  - `type Nav = { path: string; url: string; go(href: string): void; swap(href: string, options?: NavOptions): void; back(): void }`
  - `useNav(): Nav`
  - `usePopKey(): number`
  - `useScrollToTop(): void`
  - re-export `Link` from `react-router`
- Produces, from `lib/testRouter.tsx`: `renderAt(ui: ReactElement, at?: string | string[]): Harness` where `Harness = RenderResult & { history: MemoryHistory; url(): string; path(): string; query(): Record<string, string>; action(): string; go(to: string): void; back(): void }`.

- [ ] **Step 1: Install React Router**

```bash
npm install -w @noteboard/web react-router@^8.4.0
```

- [ ] **Step 2: Write the test router (a helper the tests need)**

`apps/web/lib/testRouter.tsx`:
```tsx
import { act, render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { UNSAFE_createMemoryHistory as createMemoryHistory, unstable_HistoryRouter as HistoryRouter } from 'react-router';

type MemoryHistory = ReturnType<typeof createMemoryHistory>;

export type Harness = RenderResult & {
  history: MemoryHistory;
  url: () => string;
  path: () => string;
  query: () => Record<string, string>;
  action: () => string;
  go: (to: string) => void;
  back: () => void;
};

// Renders inside a real router at `at` (the last entry when given several, so
// Back has somewhere to go). The history outlives an unmount, so a test can
// check that nothing navigated after the page closed.
export const renderAt = (ui: ReactElement, at: string | string[] = '/'): Harness => {
  const entries = Array.isArray(at) ? at : [at];
  const history = createMemoryHistory({ initialEntries: entries, initialIndex: entries.length - 1 });
  const wrapper = ({ children }: { children: ReactNode }) => <HistoryRouter history={history}>{children}</HistoryRouter>;
  const result = render(ui, { wrapper });
  return {
    ...result,
    history,
    url: () => history.location.pathname + history.location.search,
    path: () => history.location.pathname,
    query: () => Object.fromEntries(new URLSearchParams(history.location.search)),
    action: () => history.action,
    go: (to) => act(() => history.push(to)),
    back: () => act(() => history.go(-1)),
  };
};
```
If `tsc` rejects `history={history}` because `HistoryRouter` wants a different `History` type, cast with `history={history as never}` and add a one-line comment saying why.

- [ ] **Step 3: Write the failing tests**

`apps/web/lib/navigation.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { toQuery, useNav, usePopKey, useQuery, useScrollToTop, type Nav } from './navigation';
import { renderAt } from './testRouter';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toQuery', () => {
  it('reads single and repeated keys', () => {
    expect(toQuery('?view=lists&q=milk')).toEqual({ view: 'lists', q: 'milk' });
    expect(toQuery('?q=a&q=b')).toEqual({ q: ['a', 'b'] });
    expect(toQuery('')).toEqual({});
  });
});

describe('useQuery and useNav', () => {
  let nav: Nav;
  let query: Record<string, string | string[]>;
  const Probe = () => {
    nav = useNav();
    query = useQuery();
    return null;
  };

  it('reads the URL and pushes, replaces and goes back', () => {
    const view = renderAt(<Probe />, '/?view=lists');
    expect(query).toEqual({ view: 'lists' });
    expect(nav.path).toBe('/');
    expect(nav.url).toBe('/?view=lists');

    act(() => nav.go('/note?id=a'));
    expect(view.url()).toBe('/note?id=a');
    expect(view.action()).toBe('PUSH');
    expect(nav.path).toBe('/note');

    act(() => nav.swap('/note?id=b'));
    expect(view.url()).toBe('/note?id=b');
    expect(view.action()).toBe('REPLACE');

    act(() => nav.back());
    expect(view.url()).toBe('/?view=lists');
    expect(query).toEqual({ view: 'lists' });
  });
});

describe('usePopKey', () => {
  let key = -1;
  let nav: Nav;
  const Probe = () => {
    key = usePopKey();
    nav = useNav();
    return null;
  };

  it('changes after Back or Forward, not when the URL is replaced or pushed', () => {
    const view = renderAt(<Probe />, ['/?q=milk', '/']);
    const start = key;
    act(() => nav.swap('/?q=eggs'));
    expect(key).toBe(start);
    act(() => nav.go('/?view=lists'));
    expect(key).toBe(start);
    view.back();
    expect(key).toBe(start + 1);
  });
});

describe('useScrollToTop', () => {
  let nav: Nav;
  const Probe = () => {
    useScrollToTop();
    nav = useNav();
    return null;
  };

  it('scrolls to the top on new pages, but not on Back or a kept-scroll replace', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const view = renderAt(<Probe />, '/');
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => nav.go('/note?id=a'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    act(() => nav.swap('/note?id=a&x=1', { keepScroll: true }));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    act(() => nav.swap('/?q=milk'));
    expect(scrollTo).toHaveBeenCalledTimes(2);

    view.back();
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run them**

Run: `npm test -- lib/navigation.test.tsx`
Expected: FAIL, with `./navigation` not found.

- [ ] **Step 5: Implement**

`apps/web/lib/navigation.ts`:
```ts
import { useLayoutEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';

// The only module (with App and main) that talks to the router, so a router
// change stays here.
export { Link } from 'react-router';

export type Query = Record<string, string | string[]>;

// The query string as a plain object; a repeated key becomes an array.
export const toQuery = (search: string): Query => {
  const query: Query = {};
  new URLSearchParams(search).forEach((value, key) => {
    const current = query[key];
    query[key] = current === undefined ? value : [...(Array.isArray(current) ? current : [current]), value];
  });
  return query;
};

export const useQuery = (): Query => {
  const { search } = useLocation();
  return useMemo(() => toQuery(search), [search]);
};

export type NavOptions = { keepScroll?: boolean };

export type Nav = {
  path: string; // e.g. '/note'
  url: string; // path and query, e.g. '/note?id=…'
  go: (href: string) => void; // a new history entry
  swap: (href: string, options?: NavOptions) => void; // replaces the current entry
  back: () => void;
};

export const useNav = (): Nav => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useMemo(
    () => ({
      path: pathname,
      url: pathname + search,
      go: (href) => void navigate(href),
      swap: (href, options) =>
        void navigate(href, { replace: true, state: options?.keepScroll ? { keepScroll: true } : undefined }),
      back: () => void navigate(-1),
    }),
    [navigate, pathname, search],
  );
};

// Changes only after Back/Forward, so a field keyed on it rereads the URL
// then, and not while typing (which replaces the URL).
export const usePopKey = (): number => {
  const { key } = useLocation();
  const type = useNavigationType();
  const [seen, setSeen] = useState({ key, count: 0 });
  if (seen.key !== key) {
    const next = { key, count: type === 'POP' ? seen.count + 1 : seen.count };
    setSeen(next);
    return next.count;
  }
  return seen.count;
};

// Next.js scrolled to the top on every navigation; React Router doesn't.
// Back/Forward is left alone (pages restore their own position), and so is a
// replace that asks to keep the scroll (the editor dropping `new` on save).
export const useScrollToTop = () => {
  const { key, state } = useLocation();
  const type = useNavigationType();
  const keep = (state as NavOptions | null)?.keepScroll === true;
  useLayoutEffect(() => {
    if (type === 'POP' || keep) return;
    window.scrollTo(0, 0);
  }, [key, type, keep]);
};
```

- [ ] **Step 6: Run the tests, typecheck, lint**

```bash
npm test -- lib/navigation.test.tsx
npm test 2>&1 | tail -4
npm run typecheck && npm run lint
```
Expected: the navigation tests pass (4 tests); the whole suite passes; typecheck and lint are clean. If the React Compiler lint objects to the state update during render in `usePopKey`, rule on it: the codebase already uses this pattern (`EditorLoader` in `pages/note.tsx`). Disable that one rule for the line, with a comment, only if the lint truly errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the navigation module and a test router on React Router

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```

---

### Task 5: Switch the app to Vite and React Router

The big step: the app shell, routes, links and tests move off Next in one go. Next can't run alongside React Router, so this task has no green midpoint. The service worker returns in Task 6, so this task builds without one.

**Files:**
- Create: `apps/web/index.html`, `apps/web/main.tsx`, `apps/web/App.tsx`, `apps/web/vite.config.ts`, `apps/web/vite-env.d.ts`, `apps/web/routes/lazyPages.ts`, `apps/web/routes/PageLoading.tsx`, `apps/web/routes/NotFoundPage.tsx`
- Move: `pages/index.tsx` → `routes/Home.tsx`, `pages/note.tsx` → `routes/NotePage.tsx`, `pages/board.tsx` → `routes/BoardPage.tsx`
- Delete: `pages/_app.tsx`, `pages/_document.jsx`, `pages/_offline.tsx`, `next.config.js`, `next-env.d.ts`, `vitest.config.mts`, `ecosystem.config.js`, the generated `public/sw.js`, `public/workbox-*.js`, `public/worker-*.js`, `public/fallback-*.js`
- Modify: `lib/routes.ts`, `lib/shortcuts.ts`, `components/editor/NoteEditor.tsx`, `components/kanban/BoardView.tsx`, `components/kanban/BoardTiles.tsx`, `components/shell/Sidebar.tsx`, `components/ui/ReminderAlerts.tsx`, `components/NotFound/NotFound.tsx`, `components/board/TopBar.tsx` (comment), `styles/globals.css`, `vitest.setup.ts`, `tsconfig.json`, `package.json`
- Test: `App.test.tsx`, `prepaint.test.ts` (new); `lib/routes.test.ts` (rewritten), plus the 14 component test files listed in Step 9

**Interfaces:**
- Consumes (Task 4): `useNav`, `useQuery`, `usePopKey`, `useScrollToTop`, `Link`, `Nav`, `NavOptions` from `lib/navigation`; `renderAt` and `Harness` from `lib/testRouter`.
- Produces, from `lib/routes.ts`:
  - `noteHref(id: string): string`
  - `newNoteHref(kind: NoteKind, place?: NewCardPlace): string`
  - `boardHref(id: string): string`
  - `BOARDS_HREF: string` (`'/?view=boards'`)
  - `homeHref(filter: BoardFilter): string`
  - `openEditor(nav: Nav, href: string): void`
  - `leaveEditor(nav: Nav): void`
  - `markOnBoard()` and `takeBoardScroll(url)`, unchanged
- Produces: `routes/lazyPages.ts` exports `loadNotePage`, `NotePage` and `BoardPage`.

- [ ] **Step 1: Swap the dependencies**

```bash
npm uninstall -w @noteboard/web next next-pwa
npm install -w @noteboard/web @fontsource/lato
npm install -D -w @noteboard/web vite @vitejs/plugin-react
ls node_modules/@fontsource/lato/ | grep -E '^latin-(300|400|700)\.css$'
```
Expected: the three `latin-*.css` files exist. (If the package names them differently, use its per-subset, per-weight files for `latin`, weights 300, 400 and 700.)

- [ ] **Step 2: Write the failing shell tests**

`apps/web/App.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './lib/db';
import { renderAt } from './lib/testRouter';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('App routes', () => {
  it('shows Not Found for an unknown address, with a way back', async () => {
    renderAt(<App />, '/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notes' })).toHaveAttribute('href', '/');
  });

  it('opens the editor straight from its address', async () => {
    renderAt(<App />, '/note?id=missing');
    expect(await screen.findByText('Note not found')).toBeInTheDocument();
  });

  it('opens a board straight from its address', async () => {
    renderAt(<App />, '/board?id=missing');
    expect(await screen.findByText('Board not found')).toBeInTheDocument();
  });
});
```

`apps/web/prepaint.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The inline script in index.html runs before first paint.
const script = () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('no inline script in index.html');
  return match[1];
};

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('data-sidebar');
});

describe('the pre-paint script', () => {
  it('applies the saved theme and the collapsed sidebar', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('sidebar', 'rail');
    new Function(script())();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('rail');
  });

  it('defaults to light with the full sidebar', () => {
    new Function(script())();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});
```
(`window.matchMedia` is stubbed in `vitest.setup.ts` with `matches: false`, so "no saved theme" resolves to light.)

Run: `npm test -- App.test.tsx prepaint.test.ts`
Expected: FAIL. `./App` and `index.html` don't exist yet.

- [ ] **Step 3: Vite config, HTML, entry and shell**

`apps/web/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 4000, strictPort: true },
  preview: { port: 4100, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'dev-dist/**'],
  },
});
```

`apps/web/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Noteboard</title>
    <meta name="description" content="Notes and lists by Nine Technology" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="shortcut icon" href="/icon.png" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <meta name="theme-color" content="#fff" />
    <!-- Runs before first paint: apply the saved theme and the collapsed
         sidebar. Keep in sync with lib/theme.ts. -->
    <script>
      try{var s=localStorage,d=document.documentElement,t=s.getItem("theme");d.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";if(s.getItem("sidebar")==="rail")d.setAttribute("data-sidebar","rail")}catch(e){}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```
(React 19 puts each page's `<title>` before this one, so the page's own title wins.)

`apps/web/main.tsx`:
```tsx
import '@fontsource/lato/latin-300.css';
import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import './styles/tokens.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`apps/web/App.tsx`:
```tsx
import { MotionConfig } from 'framer-motion';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import ReminderAlerts from './components/ui/ReminderAlerts';
import StorageBanner from './components/ui/StorageBanner';
import { ToastProvider } from './components/ui/Toast';
import { useScrollToTop } from './lib/navigation';
import { useGlobalShortcuts } from './lib/shortcuts';
import { useSystemThemeSync } from './lib/theme';
import Home from './routes/Home';
import { BoardPage, NotePage } from './routes/lazyPages';
import NotFoundPage from './routes/NotFoundPage';
import PageLoading from './routes/PageLoading';

const App = () => {
  useGlobalShortcuts();
  useSystemThemeSync();
  useScrollToTop();
  return (
    <MotionConfig reducedMotion='user'>
      <ToastProvider>
        <StorageBanner />
        {/* Before the page: it sits at the top, so it comes first in tab order. */}
        <ReminderAlerts />
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/note' element={<NotePage />} />
            <Route path='/board' element={<BoardPage />} />
            <Route path='*' element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </MotionConfig>
  );
};

export default App;
```

`apps/web/routes/lazyPages.ts`:
```ts
import { lazy } from 'react';

// Separate chunks: the editor (with Tiptap) and boards load when first opened.
// Home preloads the editor's chunk once the board has settled.
export const loadNotePage = () => import('./NotePage');
export const NotePage = lazy(loadNotePage);
export const BoardPage = lazy(() => import('./BoardPage'));
```

`apps/web/routes/PageLoading.tsx`:
```tsx
import styles from '../styles/NotePage.module.css';

const PageLoading = () => <div className={styles.loading} aria-busy='true' />;

export default PageLoading;
```

`apps/web/routes/NotFoundPage.tsx`:
```tsx
import NotFound from '../components/NotFound';
import { Link } from '../lib/navigation';
import styles from '../styles/NotePage.module.css';

const NotFoundPage = () => (
  <div className={styles.missing}>
    <title>Not found | Noteboard</title>
    <NotFound text='Page not found' />
    <Link to='/' className={styles.backLink}>
      Back to notes
    </Link>
  </div>
);

export default NotFoundPage;
```

`styles/globals.css`: add `font-family: Lato, sans-serif;` to the existing `html, body` rule (it replaces the `<style jsx global>` block from `_app`).

Move and delete:
```bash
cd apps/web
git mv pages/index.tsx routes/Home.tsx
git mv pages/note.tsx routes/NotePage.tsx
git mv pages/board.tsx routes/BoardPage.tsx
git rm pages/_app.tsx pages/_document.jsx pages/_offline.tsx next.config.js next-env.d.ts vitest.config.mts ecosystem.config.js
rm -f public/sw.js public/workbox-*.js public/worker-*.js public/fallback-*.js public/*.js.map
cd ../..
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client"]
  },
  "include": ["**/*.ts", "**/*.tsx", "../../packages/shared/src/**/*.ts"],
  "exclude": ["node_modules", "dist", "dev-dist"]
}
```

`apps/web/package.json` scripts:
```json
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
```
Remove `start`. Add `"preview": "npm run preview -w @noteboard/web"` to the root scripts.

`vitest.setup.ts`: delete the `next/image` mock and its comment, and the now-unused `createElement` import.

- [ ] **Step 4: Rewrite `lib/routes.ts` (test first)**

Replace `apps/web/lib/routes.test.ts` with:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nav } from './navigation';
import { BOARDS_HREF, boardHref, homeHref, leaveEditor, markOnBoard, newNoteHref, noteHref, openEditor } from './routes';

const fakeNav = (path: string, url = path): Nav => ({ path, url, go: vi.fn(), swap: vi.fn(), back: vi.fn() });

beforeEach(() => {
  markOnBoard();
  sessionStorage.clear();
});

describe('hrefs', () => {
  it('builds editor URLs', () => {
    expect(noteHref('abc')).toBe('/note?id=abc');
    const href = newNoteHref('list');
    expect(href).toMatch(/^\/note\?new=list&id=[\w-]+$/);
    expect(newNoteHref('list')).not.toBe(href);
  });

  it('builds board links', () => {
    expect(boardHref('b1')).toBe('/board?id=b1');
    expect(BOARDS_HREF).toBe('/?view=boards');
  });

  it('builds a new card link with its place', () => {
    const query = new URLSearchParams(newNoteHref('list', { columnId: 'c1', boardId: 'b1', at: 'bottom' }).split('?')[1]);
    expect(Object.fromEntries(query)).toMatchObject({ new: 'list', column: 'c1', at: 'bottom', board: 'b1' });
    expect(query.get('id')).toEqual(expect.any(String));
  });

  it('builds board-view links, leaving out defaults', () => {
    expect(homeHref({ view: 'all', labelId: null, query: '' })).toBe('/');
    expect(homeHref({ view: 'lists', labelId: null, query: 'eggs & milk' })).toBe('/?view=lists&q=eggs+%26+milk');
  });
});

describe('openEditor / leaveEditor', () => {
  it('goes back to the board it came from', () => {
    const board = fakeNav('/');
    openEditor(board, noteHref('a'));
    expect(board.go).toHaveBeenCalledWith('/note?id=a');

    const editor = fakeNav('/note');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
    expect(editor.go).not.toHaveBeenCalled();
  });

  it('goes home when the editor was opened directly', () => {
    const editor = fakeNav('/note');
    leaveEditor(editor);
    expect(editor.go).toHaveBeenCalledWith('/');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('replaces history when opening a note from the editor', () => {
    openEditor(fakeNav('/'), noteHref('a'));
    const editor = fakeNav('/note');
    openEditor(editor, noteHref('b'));
    expect(editor.swap).toHaveBeenCalledWith('/note?id=b');
    leaveEditor(editor);
    expect(editor.back).toHaveBeenCalled();
  });
});

describe('after a refresh in the editor', () => {
  it('returns to the board with the filter it was opened from', async () => {
    openEditor(fakeNav('/', '/?view=lists'), noteHref('a'));
    vi.resetModules();
    const fresh = await import('./routes');
    const editor = fakeNav('/note');
    fresh.leaveEditor(editor);
    expect(editor.go).toHaveBeenCalledWith('/?view=lists');
    expect(editor.back).not.toHaveBeenCalled();
  });

  it('remembers the board scroll position for the way back', () => {
    window.scrollY = 320;
    openEditor(fakeNav('/', '/?label=l1'), noteHref('a'));
    expect(JSON.parse(sessionStorage.getItem('boardScroll') ?? 'null')).toEqual({ url: '/?label=l1', y: 320 });
    window.scrollY = 0;
  });
});
```

Run: `npm test -- lib/routes.test.ts`
Expected: FAIL. The hrefs are still objects, and `homeHref` doesn't exist.

Replace the top of `lib/routes.ts`, through `BOARDS_HREF`, with:
```ts
import { v4 as uuid } from 'uuid';
import { filterToQuery } from './filters';
import type { Nav } from './navigation';
import type { BoardFilter, NoteKind } from './types';

const withQuery = (path: string, query: Record<string, string>) => {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
};

export const noteHref = (id: string) => withQuery('/note', { id });

export type NewCardPlace = { columnId: string; boardId?: string; at: 'top' | 'bottom' };

// New notes get their id up front so the editor's URL and identity stay the
// same when the note is first saved. A new card also carries its column.
export const newNoteHref = (kind: NoteKind, place?: NewCardPlace) =>
  withQuery('/note', {
    new: kind,
    id: uuid(),
    ...(place ? { column: place.columnId, at: place.at, ...(place.boardId ? { board: place.boardId } : {}) } : {}),
  });

export const boardHref = (id: string) => withQuery('/board', { id });
export const BOARDS_HREF = '/?view=boards';
export const homeHref = (filter: BoardFilter) => withQuery('/', filterToQuery(filter));
```
Change the comment on `BOARD_SCROLL_KEY` from `(see pages/index.tsx)` to `(see routes/Home.tsx)`. Replace `openEditor` and `leaveEditor` with:
```ts
export const openEditor = (nav: Nav, href: string) => {
  // From the board or a kanban board: Back returns there.
  if (nav.path === '/' || nav.path === '/board') {
    openedFromBoard = true;
    rememberBoard(nav.url);
    nav.go(href);
  } else {
    // Editor to editor (Make a copy, shortcuts): keep one history entry so
    // Back still lands on the board.
    nav.swap(href);
  }
};

// Back from the editor: pop history when we came from the board, so it keeps
// its filter and scroll position; otherwise reopen the last board view.
export const leaveEditor = (nav: Nav) => {
  if (openedFromBoard) {
    openedFromBoard = false;
    nav.back();
  } else {
    nav.go(savedBoardUrl());
  }
};
```
Check that `lib/filters.ts` doesn't import `lib/routes.ts`, which would make a cycle: `grep -n "routes" apps/web/lib/filters.ts` should print nothing.

Run: `npm test -- lib/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Convert the three routes**

`routes/Home.tsx`:
- Imports:
  - Remove `NextPage`, `Head` and `useRouter`.
  - Add `import { useNav, usePopKey, useQuery } from '../lib/navigation';` and `import { loadNotePage } from './lazyPages';`.
  - In the `../lib/routes` import, add `homeHref`.
  - Other relative imports (`'../…'`) stay as they are: `routes/` sits where `pages/` was.
- `const Home: NextPage = () => {` becomes `const Home = () => {`.
- `const router = useRouter();` becomes `const nav = useNav();`, and `const filter = parseFilter(router.query);` becomes `const filter = parseFilter(useQuery());`.
- Delete the `historyKey` state, its comment, and the whole `useEffect` with `popstate` and `routeChangeComplete`. In their place:
```ts
  // Changes after Back/Forward, so the search box picks up the URL's query
  // (typing only replaces the URL, so it never changes this).
  const popKey = usePopKey();
```
- The preload effect: call both loaders.
```ts
      preloadRichEditor().catch(() => {});
      loadNotePage().catch(() => {});
```
  Update its comment to `// Load the note editor's code once the board has settled, so opening a note doesn't wait for it.` (unchanged wording is fine).
- Scroll restore: `takeBoardScroll(router.asPath)` becomes `takeBoardScroll(nav.url)`, and its deps become `[loaded, nav.url]`.
- `showFilter`: `nav.go(homeHref({ ...filter, ...next }))`.
- `search`: `nav.swap(homeHref({ ...filter, view, query }))`.
- `openNote` and `newNote`: pass `nav` instead of `router`.
- `BoardTiles onOpen`: `(id) => nav.go(boardHref(id))`.
- `<Head>…</Head>` becomes `<title>Noteboard</title>` (the description meta is in `index.html` now).
- `searchKey={router.isReady ? \`ready-${historyKey}\` : 'loading'}` becomes `searchKey={\`pop-${popKey}\`}`.

`routes/NotePage.tsx`:
- Imports: remove `NextPage`, `Link` (next) and `useRouter`; add `import { Link, useNav, useQuery } from '../lib/navigation';` and `import PageLoading from './PageLoading';`.
- Delete the local `Loading` and use `<PageLoading />` wherever `<Loading />` was.
- `Missing`: `<Link href='/'` becomes `<Link to='/'`.
- `NotePage`: `const NotePage = () => {`, `const nav = useNav(); const query = useQuery();`. Replace each `router.query.` with `query.`.
- The effect:
```ts
  // `/note?new=list` without an id: give the draft its id up front.
  useEffect(() => {
    if (newKind && !id) nav.swap(newNoteHref(newKind));
  }, [nav, newKind, id]);

  if (status === 'pending') return <PageLoading />;
```
  (No `isReady`: without server rendering the URL is known on the first render.)

`routes/BoardPage.tsx`: the same pattern.
- Remove `NextPage`, `Link` (next) and `useRouter`.
- `Missing` uses `<Link to='/?view=boards'`.
- Delete the local `Loading` and use `PageLoading`.
- `const id = single(useQuery().id);`
- `if (status === 'pending') return <PageLoading />;`
- `const BoardPage = () => {`

- [ ] **Step 6: Convert the components**

Each one:
- `import { useRouter } from 'next/router'` becomes `import { useNav } from '../../lib/navigation'`, and `const router = useRouter()` becomes `const nav = useNav()`.
- `router.push(x)` becomes `nav.go(x)` (drop the `void`).
- `router.asPath` becomes `nav.url`.
- `openEditor(router, …)` and `leaveEditor(router)` take `nav`.
- Every dependency array that listed `router` lists `nav`.
- `next/link` becomes `Link` from `lib/navigation`, with `href=` turned into `to=` and any `shallow` prop removed.
- `<Head><title>…</title></Head>` becomes just `<title>…</title>`.

- `components/editor/NoteEditor.tsx`: the two `void router.replace(noteHref(noteId), undefined, { shallow: true })` become `nav.swap(noteHref(noteId), { keepScroll: true })`. The `<Head>` title becomes `<title>{\`${draft.title || 'Untitled'} | Noteboard\`}</title>`. Keep the `mountedRef.current` guards.
- `components/kanban/BoardView.tsx`: `takeBoardScroll(nav.url)` with deps `[nav.url]`; both `router.push(BOARDS_HREF)` become `nav.go(BOARDS_HREF)`; `<title>` as above.
- `components/kanban/BoardTiles.tsx`: `<Link to={boardHref(board.id)} …>`. Keep `onClickCapture`: React Router's `Link` skips navigation when the click's default is prevented.
- `components/shell/Sidebar.tsx`: `const filter = parseFilter(useQuery());` (import `useQuery` and `Link` from `../../lib/navigation`); `<Link to={to}` without `shallow`.
- `components/ui/ReminderAlerts.tsx`: `(url) => nav.go(url)`, `nav.go(data.url)`, deps `[nav]`, `openEditor(nav, noteHref(id))`, and `<Link to='/?view=upcoming'`.
- `lib/shortcuts.ts`: `useNav` from `./navigation`, `openEditor(nav, …)`, deps `[nav]`.
- `components/NotFound/NotFound.tsx`: replace `next/image` with a plain image. Vite imports the SVG as a URL string:
```tsx
import styles from './NotFound.module.css';
import NoNotesIcon from '../../assets/no_notes.svg';

type Props = {
  text?: string;
};

const NotFound = (props: Props) => {
  const { text = 'Not Found' } = props;

  return (
    <div className={styles.root}>
      <img src={NoNotesIcon} className={styles.image} alt='Notes by nine.technology' width={648} height={632} />
      <p>{text}</p>
    </div>
  );
};

export default NotFound;
```
- `components/board/TopBar.tsx:10`: change the comment to `// remounts the input after Back/Forward`.

Then confirm nothing still uses Next:
```bash
grep -rn "next/\|useRouter\|NextPage\|NextRouter\|UrlObject\|router\." apps/web --include=*.ts --include=*.tsx --include=*.js | grep -v node_modules
grep -rln "from 'react-router'" apps/web --include=*.ts --include=*.tsx | grep -v node_modules
```
Expected: the first grep prints nothing. The second prints only `lib/navigation.ts`, `lib/testRouter.tsx`, `App.tsx` and `main.tsx`.

- [ ] **Step 7: Run the shell tests**

Run: `npm test -- App.test.tsx prepaint.test.ts lib/routes.test.ts lib/navigation.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: errors only in the test files Step 9 converts (they still mock `next/router`). Fix any error outside those files now.

- [ ] **Step 9: Move the tests onto the real router**

These 14 files need converting:
- `components/board/Home.test.tsx`
- `components/shell/Sidebar.test.tsx`
- `components/ui/ReminderAlerts.test.tsx`
- `components/kanban/BoardPage.test.tsx`, `BoardFilter.test.tsx`, `CardMoves.test.tsx`, `CardMenu.test.tsx`, `BoardTiles.test.tsx`
- `components/editor/NotePage.test.tsx`, `NotePageEditor.test.tsx`, `NoteDates.test.tsx`, `NoteBoards.test.tsx`, `NotePageFallback.test.tsx`, `NoteImages.test.tsx`

The same recipe applies to each file:
1. Delete the `const router = vi.hoisted(...)` block and the `vi.mock('next/router', …)` and `vi.mock('next/head', …)` lines. Delete `router.query = …` and `router.asPath = …` lines from `beforeEach`, along with any `vi.clearAllMocks()` that existed only for the router (keep it if other mocks need it).
2. Import `renderAt` from `'../../lib/testRouter'`.
3. Every `router.query = X; render(<Page />)` becomes `renderAt(<Page />, url)`, where `url` is the page path plus `X` as a query string. For example, `{ id }` on the board becomes `` `/board?id=${id}` ``, and `{ new: 'note', id: 'n1' }` on the note page becomes `'/note?new=note&id=n1'`. Helpers like `open(query)` build the URL with `` `/note?${new URLSearchParams(query)}` ``. Home's queries go on `/`. The Sidebar's go on `/`.
4. Imports of `../../pages/index`, `../../pages/note` and `../../pages/board` become `../../routes/Home`, `../../routes/NotePage` and `../../routes/BoardPage`.
5. `BoardTiles.test.tsx` has no router mock: change its `render(` calls to `renderAt(` (the tiles are `Link`s, which need a router).

The assertions that checked router calls change like this. `view` is the value `renderAt` returns, so capture it (`const view = renderAt(…)`):

`Home.test.tsx`
- `'shows the search from the URL after Back'` becomes:
```tsx
  it('shows the search from the URL after Back, and keeps typing in place', async () => {
    const user = userEvent.setup();
    const view = renderAt(<Home />, ['/?q=milk', '/']);
    const box = screen.getByRole('searchbox', { name: 'Search notes' });
    await user.type(box, 'eggs');
    expect(view.url()).toBe('/?q=eggs');
    // Typing replaces the URL without remounting the box, so it keeps focus.
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toBe(box);
    expect(box).toHaveFocus();
    view.back();
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('milk');
  });
```
- `'starts a new note straight away…'`: each `expect(router.push.mock.lastCall?.[0]).toMatchObject({ pathname: '/note', query: { new: 'note' } })` becomes `expect(view.path()).toBe('/note'); expect(view.query()).toMatchObject({ new: 'note' });`. Replace `router.push.mockClear();` with `view.back();`.
- `'links to Upcoming from the sidebar'`: the second render becomes `const { unmount } = renderAt(<Home />, '/?view=upcoming');` (delete the `router.query` line).
- `'searches all notes from the Boards view'`: the final assertion becomes `expect(view.url()).toBe('/?q=x'); expect(view.action()).toBe('REPLACE');`.
- `'restores the scroll position…'`: unchanged apart from `renderAt(<Home />)` (the saved URL `/` matches).

`Sidebar.test.tsx`: `router.query = { view: 'lists' }; render(<Sidebar …/>)` becomes `renderAt(<Sidebar …/>, '/?view=lists')`. Every other `render(` becomes `renderAt(`, with its query as the URL.

`ReminderAlerts.test.tsx`: `renderPanel` returns `renderAt(...)`; capture it as `const view = renderPanel()` in the two tests below.
- `expect(router.push).toHaveBeenCalledWith({ pathname: '/note', query: { id: 'n1' } })` becomes `expect(view.url()).toBe('/note?id=n1')`.
- `expect(router.push).toHaveBeenCalledWith('/note?id=n9')` becomes `expect(view.url()).toBe('/note?id=n9')`.

`BoardPage.test.tsx`: `open(id)` returns `renderAt(<ToastProvider><BoardPage /></ToastProvider>, \`/board?id=${id}\`)`. In each test below, capture `const view = open(board.id)`.
- `expect(router.push).toHaveBeenLastCalledWith({ pathname: '/note', query: { id: 'n1' } })` becomes `expect(view.url()).toBe('/note?id=n1')`, then `view.back()` before the next click (the board stays rendered either way, so `back` only keeps `openEditor` pushing from `/board`).
- Each `toMatchObject({ query: { new: 'note', column: columns[0].id, at: 'bottom' } })` becomes `expect(view.query()).toMatchObject({ new: 'note', column: columns[0].id, at: 'bottom' })`, followed by `view.back()`. The same goes for the `list` and `top` lines.
- `'opens a typed quick-add card…'`: `await waitFor(() => expect(view.path()).toBe('/note'));` then `expect(view.query()).toMatchObject({ id: note?.id });`.
- Both `expect(router.push).toHaveBeenLastCalledWith({ pathname: '/', query: { view: 'boards' } })` become `expect(view.url()).toBe('/?view=boards')`.
- `'forgets "opened from a board"…'` becomes:
```tsx
  it('forgets “opened from a board” once the board shows again', async () => {
    const { board } = await setup();
    const fromBoard: Nav = { path: '/board', url: `/board?id=${board.id}`, go: vi.fn(), swap: vi.fn(), back: vi.fn() };
    openEditor(fromBoard, noteHref('n1'));
    open(board.id);
    await screen.findByRole('heading', { level: 1, name: 'Website redesign' });
    const editor: Nav = { path: '/note', url: '/note?id=n1', go: vi.fn(), swap: vi.fn(), back: vi.fn() };
    leaveEditor(editor);
    expect(editor.back).not.toHaveBeenCalled();
  });
```
  Add `import type { Nav } from '../../lib/navigation';`.

`NotePage.test.tsx`: add `const view = …` where needed.
- `'keeps the same editor and text when a new note is first saved'`:
```tsx
    const view = renderAt(<NotePage />, '/note?new=note&id=n1');
    const body = await screen.findByRole('textbox', { name: 'Note' });
    await user.type(body, 'Milk');
    await waitFor(() => expect(view.url()).toBe('/note?id=n1'));
    expect(view.action()).toBe('REPLACE');
    await user.type(body, ' and eggs');
```
  Delete the `rerender` lines: the page re-renders from the URL itself. Keep the rest of the test.
- `'does not navigate back into a new note saved while leaving'`: `expect(router.replace).not.toHaveBeenCalled()` becomes `expect(view.url()).toBe('/note?new=note&id=n7')` (the history outlives the unmount).
- `'goes home on Escape when opened directly'`: `expect(view.url()).toBe('/')`.
- `'stays in the editor when Escape ends an IME composition'`: `expect(view.url()).toBe('/note?id=n8')`.
- `'gives a new note an id when the URL has none'`: `await waitFor(() => expect(view.url()).toMatch(/^\/note\?new=note&id=[\w-]+$/)); expect(view.action()).toBe('REPLACE');`.
- Add, to cover Review Focus 4:
```tsx
  it('keeps the scroll position when a new note is first saved', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const Page = () => {
      useScrollToTop();
      return <NotePage />;
    };
    const view = renderAt(<Page />, '/note?new=note&id=n12');
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Milk');
    await waitFor(() => expect(view.url()).toBe('/note?id=n12'));
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });
```
  (Import `useScrollToTop` from `'../../lib/navigation'`.)

`NoteImages.test.tsx`: `open(query)` returns `renderAt(…, \`/note?${new URLSearchParams(query)}\`)`; `expect(router.replace).toHaveBeenCalled()` becomes `expect(view.url()).toBe('/note?id=fresh')` (capture `view` from `open`).

`BoardFilter`, `CardMoves`, `CardMenu`, `NotePageEditor`, `NoteDates`, `NoteBoards`, `NotePageFallback`: only the recipe (no router assertions).

Run: `npm test 2>&1 | tail -6`
Expected: everything passes, and the count is the previous task's total plus the tests this task added (App ×3, pre-paint ×2, NotePage scroll ×1, and one more in `routes.test.ts`). Any failure is a real regression: debug it (superpowers:systematic-debugging). Don't loosen a test to make it pass.

- [ ] **Step 10: Typecheck, lint, build, dev**

```bash
npm run typecheck && npm run lint && npm run build 2>&1 | tail -15
npm run dev > .superpowers/dev.log 2>&1 &
sleep 4; curl -s http://localhost:4000/ | grep -c '<div id="root">'; curl -s 'http://localhost:4000/note?id=x' | grep -c '<div id="root">'; kill %1
cat .superpowers/dev.log
```
Expected:
- Typecheck, lint and build are clean, and `apps/web/dist/index.html` exists. The build may warn about chunk size: note the sizes in the ledger, but don't act on them.
- Both curls print 1.
- `dev.log` shows no warnings or errors.
- If port 4000 is already taken by the old dev server, stop that one first. It runs the user's Next dev server from before this branch.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Run on Vite and React Router: index.html, App shell, routes, links and tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```

---

### Task 6: The service worker through vite-plugin-pwa

**Files:**
- Create: `apps/web/worker/cleanup.js`, `apps/web/worker/navigation.js`
- Move: `worker/index.js` → `worker/sw.js` (rewritten)
- Test: `apps/web/worker/cleanup.test.ts`, `apps/web/worker/navigation.test.ts`
- Modify: `apps/web/vite.config.ts`, `apps/web/main.tsx`, `apps/web/package.json`

**Interfaces:**
- Produces: `deleteCachesExcept(cacheStorage, keep: string[]): Promise<void>`; `isAppNavigation(request, origin): boolean`; `answerNavigation(fetchPage: () => Promise<Response>, cachedShell: () => Promise<Response | undefined>): Promise<Response>`; `NETWORK_TIMEOUT_MS = 3000`.

- [ ] **Step 1: Write the failing tests**

`apps/web/worker/cleanup.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deleteCachesExcept } from './cleanup';

const fakeCaches = (names: string[]) => {
  const left = new Set(names);
  return {
    left,
    keys: async () => [...left],
    delete: async (name: string) => left.delete(name),
  };
};

describe('deleteCachesExcept', () => {
  it('clears what the old worker cached and keeps the precache', async () => {
    const caches = fakeCaches([
      'workbox-precache-v2-https://notes.example/',
      'app-shell',
      'start-url',
      'next-static-js-assets',
      'others',
    ]);
    await deleteCachesExcept(caches, ['workbox-precache-v2-https://notes.example/']);
    expect([...caches.left]).toEqual(['workbox-precache-v2-https://notes.example/']);
  });

  it('does nothing when only the precache is there', async () => {
    const caches = fakeCaches(['workbox-precache-v2-https://notes.example/']);
    await deleteCachesExcept(caches, ['workbox-precache-v2-https://notes.example/']);
    expect(caches.left.size).toBe(1);
  });
});
```

`apps/web/worker/navigation.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { answerNavigation, isAppNavigation } from './navigation';

const request = (url: string, mode: RequestMode) => ({ url, mode }) as Request;

describe('isAppNavigation', () => {
  it('takes page loads on our own site, at any address', () => {
    expect(isAppNavigation(request('https://notes.example/note?id=1', 'navigate'), 'https://notes.example')).toBe(true);
    expect(isAppNavigation(request('https://notes.example/anything', 'navigate'), 'https://notes.example')).toBe(true);
  });

  it('leaves other requests alone', () => {
    expect(isAppNavigation(request('https://notes.example/assets/app.js', 'cors'), 'https://notes.example')).toBe(false);
    expect(isAppNavigation(request('https://other.example/', 'navigate'), 'https://notes.example')).toBe(false);
  });
});

describe('answerNavigation', () => {
  it('uses the network when it answers', async () => {
    const page = await answerNavigation(async () => new Response('fresh'), async () => new Response('shell'));
    expect(await page.text()).toBe('fresh');
  });

  it('answers from the precached page when offline', async () => {
    const page = await answerNavigation(
      () => Promise.reject(new TypeError('offline')),
      async () => new Response('shell'),
    );
    expect(await page.text()).toBe('shell');
  });

  it('fails like the network would when nothing is cached', async () => {
    const page = await answerNavigation(
      () => Promise.reject(new TypeError('offline')),
      async () => undefined,
    );
    expect(page.type).toBe('error');
  });
});
```

Run: `npm test -- worker/cleanup.test.ts worker/navigation.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 2: Implement the helpers**

`apps/web/worker/cleanup.js`:
```js
// Deletes every cache not named in `keep`.
export const deleteCachesExcept = async (cacheStorage, keep) => {
  const names = await cacheStorage.keys();
  await Promise.all(names.filter((name) => !keep.includes(name)).map((name) => cacheStorage.delete(name)));
};
```

`apps/web/worker/navigation.js`:
```js
import { networkFirst } from './networkFirst';

export const NETWORK_TIMEOUT_MS = 3000;

// Every page is the same index.html (a single-page app), so any page load on
// our site, including notes and boards never opened before, can be answered.
export const isAppNavigation = (request, origin) =>
  request.mode === 'navigate' && new URL(request.url).origin === origin;

// The network first, so a deploy shows on the next load; the precached page
// when offline or slow.
export const answerNavigation = (fetchPage, cachedShell) =>
  networkFirst(fetchPage, cachedShell, NETWORK_TIMEOUT_MS).catch(() => Response.error());
```

Run: `npm test -- worker/`
Expected: PASS. That includes the existing `networkFirst` and `notificationClick` tests, unchanged.

- [ ] **Step 3: The worker itself**

```bash
cd apps/web && git mv worker/index.js worker/sw.js && cd ../..
npm install -D -w @noteboard/web vite-plugin-pwa workbox-precaching workbox-core
```

`apps/web/worker/sw.js` (replace the whole file):
```js
// Built by vite-plugin-pwa (injectManifest) into /sw.js, the address the old
// next-pwa worker used, so installed copies update to this one by themselves.
import { cacheNames, clientsClaim } from 'workbox-core';
import { matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { deleteCachesExcept } from './cleanup';
import { answerNavigation, isAppNavigation } from './navigation';
import { openFromNotification } from './notificationClick';

// Take over at once; pages pick up the new version on their next load.
self.addEventListener('install', () => {
  self.skipWaiting();
});
clientsClaim();

// Registered before Workbox's route, so page loads go network first.
self.addEventListener('fetch', (event) => {
  if (!isAppNavigation(event.request, self.location.origin)) return;
  event.respondWith(answerNavigation(() => fetch(event.request), () => matchPrecache('/index.html')));
  event.stopImmediatePropagation();
});

// Scripts, styles, fonts, icons and index.html from the build.
precacheAndRoute(self.__WB_MANIFEST);

// Clears what the old worker cached (next-pwa's caches and 'app-shell').
// Notes and images live in IndexedDB, not here.
self.addEventListener('activate', (event) => {
  event.waitUntil(deleteCachesExcept(caches, [cacheNames.precache]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(openFromNotification(self.clients, self.location.origin, url));
});
```

`apps/web/vite.config.ts`: add the plugin (left out under Vitest, which doesn't need it):
```ts
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    !process.env.VITEST &&
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'worker',
        filename: 'sw.js',
        // Registered in main.tsx; the manifest is public/manifest.json.
        injectRegister: false,
        manifest: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,json}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
  ],
  server: { port: 4000, strictPort: true },
  preview: { port: 4100, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'dev-dist/**'],
  },
});
```

`apps/web/main.tsx`: add after the imports:
```ts
// Production only, as before: in development the worker would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

- [ ] **Step 4: Build and inspect**

```bash
npm run build 2>&1 | tail -12
ls apps/web/dist/sw.js && grep -c '"index.html"\|index.html' apps/web/dist/sw.js && grep -c 'woff2' apps/web/dist/sw.js
grep -c '__WB_MANIFEST' apps/web/dist/sw.js
```
Expected:
- The build reports the injected precache entries.
- `dist/sw.js` exists, and the first two counts are ≥ 1 (index.html and the fonts are in the manifest).
- The `__WB_MANIFEST` count is 0 (it was replaced).
- No "will not be precached" warnings. If one appears, the file was too big: say which in the ledger.

- [ ] **Step 5: Full checks and commit**

```bash
npm test 2>&1 | tail -4
npm run typecheck && npm run lint
git add -A
git commit -m "Build the service worker with vite-plugin-pwa at /sw.js, clearing the old caches

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```
Expected: all pass (the previous total plus 7).

---

### Task 7: Vercel, ignore rules and README

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore`, `README.md`

This is configuration (a TDD exception). It is verified by the build output and by the preview deploy in Task 8.

- [ ] **Step 1: `vercel.json` (repo root)**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```
(Vercel applies rewrites only when no file matches, so `/sw.js`, `/manifest.json` and `/assets/*` are served as files.)

- [ ] **Step 2: `.gitignore`**

- `/node_modules` becomes `node_modules/`.
- Replace the `# next.js` block (`/.next/`, `/out/`) with:
```
# build output
dist/
dev-dist/
```
- Delete the whole `# PWA Files` block (next-pwa's generated files).
- Keep the rest (`.superpowers/`, `.vercel`, env files, `*.tsbuildinfo`).

Check: `git status --short` shows no stray build files.

- [ ] **Step 3: README**

Update `README.md` to match:
- Intro: "built with [Vite](https://vite.dev/) and [React Router](https://reactrouter.com/), in an npm workspaces monorepo (`apps/web` is the app, `packages/shared` the data types)". Keep the rest of the paragraph.
- Scripts table:

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server on port 4000 (the service worker is off) |
| `npm run build` | Production build into `apps/web/dist`, with the service worker |
| `npm run preview` | Serves the production build on port 4100 |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |

- Remove any mention of Turbopack, `next start`, PM2 or `ecosystem.config.js`. Mention that Vercel builds from `vercel.json`.

Read the rest of the README and correct anything else that names Next.

- [ ] **Step 4: Verify and commit**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))" && rm -rf apps/web/dist && npm run build > /dev/null && ls apps/web/dist/index.html apps/web/dist/sw.js
grep -n -i "next" README.md
git add -A
git commit -m "Build on Vercel from vercel.json; update ignore rules and README for Vite

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
```
Expected: both files exist. The README grep finds no mention of Next.js (words like "next 7 days" are fine).

---

### Task 8: Verification, review and merge

**Files:** none (fixes found here go in their own commits, each with a test that failed first).

- [ ] **Step 1: The whole suite and tools, from clean**

```bash
rm -rf node_modules apps/web/node_modules apps/web/dist && npm ci
npm test 2>&1 | tail -4 && npm run typecheck && npm run lint && npm run build 2>&1 | tail -5
```
Expected: everything passes.

- [ ] **Step 2: Dev server**

Start `npm run dev` in the background, open http://localhost:4000 in Chrome, and read the console (filter on warnings and errors).
Expected: no warnings or errors from the app. Leave the user's test notes on :4000 alone.

- [ ] **Step 3: Production walkthrough**

`npm run build && npm run preview` (port 4100), in Chrome:
1. Notes view. Switch Notes / Upcoming / Boards / a label / Archive / Trash from the sidebar: the URL changes, the page scrolls to the top, Back and Forward go through the views, and the search box follows Back/Forward.
2. Type a search: the URL updates, the box keeps focus, and matches are highlighted.
3. Scroll down, open a note, edit it, press ←: you're back on the board at the same scroll position and filter. Escape does the same.
4. New note via + New and via `n`; type, so the URL loses `new` with no jump and no focus loss. Then Make a copy, and Back lands on the board.
5. Open a board: open a card, quick add, filter, move a card, Back to boards.
6. Refresh on `/note?id=…` and on `/board?id=…`: each opens directly. `/nowhere` shows "Page not found" with Back to notes.
7. Theme: switch to dark and reload, and the page doesn't flash light. Collapse the sidebar and reload, and it doesn't flash.
8. Reminders: a note due a minute ahead shows the alert row, and Open opens the note.
9. Offline: once the worker is active (`navigator.serviceWorker.controller` is set), stop the preview server and reload `/`, `/note?id=<existing>` and `/board?id=<existing>`. All three load with their data. Restart the server afterwards.

- [ ] **Step 4: The upgrade from the Next build**

Use port 4200, a separate origin, so the user's data isn't touched:
```bash
SCRATCH=/private/tmp/claude-501/-Users-ganesh-Projects-NineTechnology-noteboard/808ff6af-6e9b-45f1-b280-4c77d0165058/scratchpad
git worktree add "$SCRATCH/next-build" d2806c3
cd "$SCRATCH/next-build" && npm ci && npm run build && npx next start -p 4200
```
In Chrome on http://localhost:4200:
1. Wait for `navigator.serviceWorker.controller`. Add two notes, a label and a board with a card.
2. Record `await caches.keys()`.
3. Stop the Next server. Serve the new build on the same port: `cd apps/web && npx vite preview --port 4200 --strictPort`.
4. Reload twice. Check that `navigator.serviceWorker.controller.scriptURL` ends in `/sw.js` and that the new worker is active (`(await navigator.serviceWorker.getRegistration()).active`).
5. Check that the notes, label and board are all there. `await caches.keys()` should list only `workbox-precache-v2-…`, with no `app-shell`, `start-url` or `next-*` caches.
6. Stop the server, then remove the worktree: `git worktree remove "$SCRATCH/next-build"`.

Record what each check showed in the ledger.

- [ ] **Step 5: Final review**

Dispatch one reviewer on the most capable model, with the branch diff (`git merge-base dev HEAD`..HEAD), the spec and this plan, and the Review Focus list. Fix every finding, minor ones included, each with a test that fails first, and run the full suite after each fix.

- [ ] **Step 6: Merge and push**

```bash
git switch dev
git merge --no-ff feature/vite-migration -m "Merge feature/vite-migration: Vite + React Router in a monorepo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ouEoYupiMXTXnQfHyZ1sB"
npm test 2>&1 | tail -4 && npm run build > /dev/null && git push origin dev && git branch -d feature/vite-migration
```
Then open the dev branch's Vercel preview deploy (the link is in the commit's status on GitHub). Check that it builds, that `/`, `/note?id=x`, `/board?id=x` and `/nowhere` load, and that `/sw.js` is served. If the build fails because the project settings override `vercel.json`, report the exact error to the user rather than changing their Vercel settings.
