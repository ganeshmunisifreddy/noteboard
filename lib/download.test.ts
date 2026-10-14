import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadFile', () => {
  it('saves contents under the given name and frees the URL', async () => {
    vi.useFakeTimers();
    const create = vi.fn((blob: Blob) => (blob instanceof Blob ? 'blob:file' : ''));
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('notes.md');
      expect(this.href).toBe('blob:file');
    });

    downloadFile('notes.md', '# Hi', 'text/markdown');

    expect(click).toHaveBeenCalledOnce();
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('# Hi');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:file');
  });
});
