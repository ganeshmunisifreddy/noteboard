import { useSyncExternalStore } from 'react';
import { db } from './db';
import { migrateFromLocalStorage } from './migrate';
import { purgeOldTrash } from './notes';

export type StartupStatus = 'pending' | 'ready' | 'unavailable';

export const runStartup = async (): Promise<'ready' | 'unavailable'> => {
  try {
    await db.open();
  } catch {
    return 'unavailable';
  }
  // Each step is independent; a failure in one must not block the app.
  await migrateFromLocalStorage().catch(() => {});
  await purgeOldTrash().catch(() => {});
  return 'ready';
};

let status: StartupStatus = 'pending';
let started = false;
const listeners = new Set<() => void>();

// Startup runs once per page load, the first time any component asks.
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!started) {
    started = true;
    void runStartup().then((result) => {
      status = result;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
  };
};

export const useStartup = (): StartupStatus =>
  useSyncExternalStore(
    subscribe,
    () => status,
    () => 'pending',
  );
