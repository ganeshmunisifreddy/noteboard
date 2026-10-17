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
// check that nothing navigated after the page closed. v5Compat makes push and
// replace notify the router, as MemoryRouter does.
export const renderAt = (ui: ReactElement, at: string | string[] = '/'): Harness => {
  const entries = Array.isArray(at) ? at : [at];
  const history = createMemoryHistory({ initialEntries: entries, initialIndex: entries.length - 1, v5Compat: true });
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
