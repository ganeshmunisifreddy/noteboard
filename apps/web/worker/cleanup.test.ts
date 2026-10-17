import { describe, expect, it } from 'vitest';
import { deleteCachesExcept } from './cleanup';

const fakeCaches = (names: string[]) => {
  const left = new Set(names);
  return {
    left,
    keys: async () => [...left],
    delete: async (name: string) => left.delete(name),
  };
};

describe('deleteCachesExcept', () => {
  it('clears what the old worker cached and keeps the precache', async () => {
    const caches = fakeCaches([
      'workbox-precache-v2-https://notes.example/',
      'app-shell',
      'start-url',
      'next-static-js-assets',
      'others',
    ]);
    await deleteCachesExcept(caches, ['workbox-precache-v2-https://notes.example/']);
    expect([...caches.left]).toEqual(['workbox-precache-v2-https://notes.example/']);
  });

  it('does nothing when only the precache is there', async () => {
    const caches = fakeCaches(['workbox-precache-v2-https://notes.example/']);
    await deleteCachesExcept(caches, ['workbox-precache-v2-https://notes.example/']);
    expect(caches.left.size).toBe(1);
  });
});
