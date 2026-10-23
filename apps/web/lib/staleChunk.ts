const RELOADED_AT_KEY = 'chunkReloadAt';
const GUARD_MS = 10_000;

// After a deploy, a tab that was already open asks for code chunks that no
// longer exist. A fresh load picks up the new version, as Next.js did. The
// guard stops a reload loop when a chunk is missing for another reason.
export const reloadOnStaleChunk = (reload = () => window.location.reload(), now = Date.now()) => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY));
    if (last && now - last < GUARD_MS) return;
    sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // Storage unavailable: reload anyway, once per failed chunk.
  }
  reload();
};
