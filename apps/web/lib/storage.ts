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
