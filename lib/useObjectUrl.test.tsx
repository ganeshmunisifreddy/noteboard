import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesOf } from './testUtils';
import { useObjectUrl } from './useObjectUrl';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useObjectUrl', () => {
  it('shares one URL per image and frees it after the last user leaves', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const bytes = bytesOf('image');
    const first = renderHook(() => useObjectUrl(bytes, 'image/jpeg'));
    const second = renderHook(() => useObjectUrl(bytes, 'image/jpeg'));
    expect(first.result.current).toBe('blob:one');
    expect(second.result.current).toBe('blob:one');
    expect(create).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:one');
  });

  it('gives nothing without bytes', () => {
    expect(renderHook(() => useObjectUrl(null, 'image/jpeg')).result.current).toBeNull();
  });
});
