export const HAS_NOTES_KEY = 'hasNotes';

// Read by the inline script in pages/_document.jsx to hide the
// server-rendered empty state before first paint.
export const setHasNotesMarker = (hasNotes: boolean) => {
  try {
    if (hasNotes) localStorage.setItem(HAS_NOTES_KEY, '1');
    else localStorage.removeItem(HAS_NOTES_KEY);
  } catch {
    // Storage unavailable; the empty state may flash briefly, nothing worse.
  }
};

export const hasNotesMarker = () => {
  try {
    return localStorage.getItem(HAS_NOTES_KEY) !== null;
  } catch {
    return false;
  }
};

let persistRequested = false;

// Asks the browser not to evict our data under storage pressure (Safari
// otherwise clears it after weeks without a visit). Asked once per load.
export const requestPersistentStorage = () => {
  if (persistRequested) return;
  persistRequested = true;
  navigator.storage?.persist?.().catch(() => {});
};

export const isQuotaError = (error: unknown): boolean => {
  const e = error as { name?: string; inner?: { name?: string } } | null;
  return e?.name === 'QuotaExceededError' || e?.inner?.name === 'QuotaExceededError';
};
