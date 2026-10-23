const TIMED_OUT = Symbol('timed out');

// Tries the network first, but gives up waiting after `timeoutMs` if a cached
// copy exists, so a flaky connection doesn't stall the page. With nothing
// cached it keeps waiting for the network. Rejects only if the network fails
// and nothing is cached.
export const networkFirst = async (network, fromCache, timeoutMs) => {
  const pending = network();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([pending, timeout]);
    if (result !== TIMED_OUT) return result;
  } catch {
    // Network failed; try the cache below.
  } finally {
    clearTimeout(timer);
  }
  const cached = await fromCache();
  return cached || pending;
};
