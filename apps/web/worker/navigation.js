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
