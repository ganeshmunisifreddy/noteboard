import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkFirst } from './networkFirst';

const never = () => new Promise<string>(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('networkFirst', () => {
  it('uses the network when it answers in time', async () => {
    const cache = vi.fn(async () => 'cached');
    expect(await networkFirst(async () => 'fresh', cache, 3000)).toBe('fresh');
    expect(cache).not.toHaveBeenCalled();
  });

  it('falls back to the cache when the network fails', async () => {
    const failing = () => Promise.reject(new Error('offline'));
    expect(await networkFirst(failing, async () => 'cached', 3000)).toBe('cached');
  });

  it('falls back to the cache when the network is too slow', async () => {
    vi.useFakeTimers();
    const result = networkFirst(never, async () => 'cached', 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBe('cached');
  });

  it('keeps waiting for a slow network when nothing is cached', async () => {
    vi.useFakeTimers();
    let answer: (value: string) => void = () => {};
    const slow = () => new Promise<string>((resolve) => (answer = resolve));
    const result = networkFirst(slow, async () => undefined, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    answer('late');
    expect(await result).toBe('late');
  });
});
