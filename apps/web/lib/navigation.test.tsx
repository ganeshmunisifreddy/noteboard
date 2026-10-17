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

describe('nav.current', () => {
  let nav: Nav;
  const Probe = () => {
    nav = useNav();
    return null;
  };

  it('reads the address straight away, before the page renders it', () => {
    renderAt(<Probe />, '/note?id=a');
    let during = '';
    act(() => {
      nav.go('/board?id=b');
      during = nav.current();
    });
    expect(during).toBe('/board?id=b');
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
