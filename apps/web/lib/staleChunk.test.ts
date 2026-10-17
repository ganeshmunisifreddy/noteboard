import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadOnStaleChunk } from './staleChunk';

beforeEach(() => {
  sessionStorage.clear();
});

describe('reloadOnStaleChunk', () => {
  it('reloads once to pick up the new version, not again straight away', () => {
    const reload = vi.fn();
    reloadOnStaleChunk(reload, 1_000);
    expect(reload).toHaveBeenCalledTimes(1);
    reloadOnStaleChunk(reload, 5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a later deploy', () => {
    const reload = vi.fn();
    reloadOnStaleChunk(reload, 1_000);
    reloadOnStaleChunk(reload, 60_000);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
