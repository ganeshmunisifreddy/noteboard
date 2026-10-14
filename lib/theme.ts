import { useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

export const readTheme = (): ThemePref => {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): 'light' | 'dark' =>
  pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;

// Same logic as the inline script in pages/_document.jsx.
export const applyTheme = (pref: ThemePref = readTheme()) => {
  document.documentElement.dataset.theme = resolveTheme(pref, window.matchMedia(DARK_QUERY).matches);
};

export const setTheme = (pref: ThemePref) => {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Not saved, but still applied for this visit.
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useTheme = (): ThemePref =>
  useSyncExternalStore(subscribe, readTheme, () => 'system');

// Follows the device when the preference is "system".
export const useSystemThemeSync = () => {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
};
