import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RemeasureDroppables } from './NoteGrid';

const dnd = vi.hoisted(() => ({ active: null as { id: string } | null, measure: vi.fn() }));
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  useDndContext: () => ({ active: dnd.active, measureDroppableContainers: dnd.measure }),
}));

describe('RemeasureDroppables', () => {
  it('measures drop targets again when the layout changes during a drag', () => {
    dnd.active = { id: 'a' };
    const { rerender } = render(<RemeasureDroppables layoutKey='one' />);
    const before = dnd.measure.mock.calls.length;
    rerender(<RemeasureDroppables layoutKey='two' />);
    expect(dnd.measure.mock.calls.length).toBe(before + 1);
  });

  it('does nothing when nothing is being dragged', () => {
    dnd.active = null;
    dnd.measure.mockClear();
    const { rerender } = render(<RemeasureDroppables layoutKey='one' />);
    rerender(<RemeasureDroppables layoutKey='two' />);
    expect(dnd.measure).not.toHaveBeenCalled();
  });
});
