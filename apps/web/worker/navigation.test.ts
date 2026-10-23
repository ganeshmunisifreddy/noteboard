import { describe, expect, it } from 'vitest';
import { answerNavigation, isAppNavigation } from './navigation';

const request = (url: string, mode: RequestMode) => ({ url, mode }) as Request;

describe('isAppNavigation', () => {
  it('takes page loads on our own site, at any address', () => {
    expect(isAppNavigation(request('https://notes.example/note?id=1', 'navigate'), 'https://notes.example')).toBe(true);
    expect(isAppNavigation(request('https://notes.example/anything', 'navigate'), 'https://notes.example')).toBe(true);
  });

  it('leaves other requests alone', () => {
    expect(isAppNavigation(request('https://notes.example/assets/app.js', 'cors'), 'https://notes.example')).toBe(false);
    expect(isAppNavigation(request('https://other.example/', 'navigate'), 'https://notes.example')).toBe(false);
  });
});

describe('answerNavigation', () => {
  it('uses the network when it answers', async () => {
    const page = await answerNavigation(async () => new Response('fresh'), async () => new Response('shell'));
    expect(await page.text()).toBe('fresh');
  });

  it('answers from the precached page when offline', async () => {
    const page = await answerNavigation(
      () => Promise.reject(new TypeError('offline')),
      async () => new Response('shell'),
    );
    expect(await page.text()).toBe('shell');
  });

  it('fails like the network would when nothing is cached', async () => {
    const page = await answerNavigation(
      () => Promise.reject(new TypeError('offline')),
      async () => undefined,
    );
    expect(page.type).toBe('error');
  });
});
