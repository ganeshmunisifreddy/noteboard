// Built by vite-plugin-pwa (injectManifest) into /sw.js, the address the old
// next-pwa worker used, so installed copies update to this one by themselves.
import { cacheNames, clientsClaim } from 'workbox-core';
import { matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { deleteCachesExcept } from './cleanup';
import { answerNavigation, isAppNavigation } from './navigation';
import { openFromNotification } from './notificationClick';

// Take over at once; pages pick up the new version on their next load.
self.addEventListener('install', () => {
  self.skipWaiting();
});
clientsClaim();

// Registered before Workbox's route, so page loads go network first.
self.addEventListener('fetch', (event) => {
  if (!isAppNavigation(event.request, self.location.origin)) return;
  event.respondWith(answerNavigation(() => fetch(event.request), () => matchPrecache('/index.html')));
  event.stopImmediatePropagation();
});

// Scripts, styles, fonts, icons and index.html from the build.
precacheAndRoute(self.__WB_MANIFEST);

// Clears what the old worker cached (next-pwa's caches and 'app-shell').
// Notes and images live in IndexedDB, not here.
self.addEventListener('activate', (event) => {
  event.waitUntil(deleteCachesExcept(caches, [cacheNames.precache]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(openFromNotification(self.clients, self.location.origin, url));
});
