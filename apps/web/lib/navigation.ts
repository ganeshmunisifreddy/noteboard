import { useContext, useLayoutEffect, useMemo, useState } from 'react';
import { UNSAFE_NavigationContext, useLocation, useNavigate, useNavigationType } from 'react-router';

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
  // The address right now, even while the page for it is still loading
  // (navigations render in a transition, so `url` can lag behind).
  current: () => string;
};

type WithLocation = { location?: { pathname: string; search: string } };

export const useNav = (): Nav => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // The browser (or test) history behind the router.
  const { navigator } = useContext(UNSAFE_NavigationContext);
  return useMemo(
    () => ({
      path: pathname,
      url: pathname + search,
      go: (href) => void navigate(href),
      swap: (href, options) =>
        void navigate(href, { replace: true, state: options?.keepScroll ? { keepScroll: true } : undefined }),
      back: () => void navigate(-1),
      current: () => {
        const location = (navigator as WithLocation).location ?? window.location;
        return location.pathname + location.search;
      },
    }),
    [navigate, navigator, pathname, search],
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
