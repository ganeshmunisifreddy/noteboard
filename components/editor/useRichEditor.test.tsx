import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RichEditorProps } from './RichEditor';
import { useRichEditor } from './useRichEditor';

const Editor = (_props: RichEditorProps) => null;
const loads = () => Promise.resolve({ default: Editor });
const fails = () => Promise.reject(new Error('offline'));

describe('useRichEditor', () => {
  it('gives the editor once its code has loaded', async () => {
    const { result } = renderHook(() => useRichEditor(loads));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', Editor }));
  });

  it('reports a failed load', async () => {
    const { result } = renderHook(() => useRichEditor(fails));
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });
});
