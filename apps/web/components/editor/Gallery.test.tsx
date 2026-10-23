import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { makeAttachment } from '../../lib/testUtils';
import Gallery from './Gallery';

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image');
});

describe('Gallery', () => {
  it('names each image and opens it', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const images = [makeAttachment({ position: 0 }), makeAttachment({ position: 1, alt: 'Receipt' })];
    render(<Gallery images={images} pending={0} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Open image 1 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open image 2 of 2: Receipt' }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('shows images being added', () => {
    render(<Gallery images={[]} pending={2} onOpen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Adding 2 images…');
  });

  it('shows no images without images', () => {
    render(<Gallery images={[]} pending={0} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps its status message in place, so screen readers hear it change', () => {
    const { rerender } = render(<Gallery images={[makeAttachment()]} pending={0} onOpen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    rerender(<Gallery images={[makeAttachment()]} pending={1} onOpen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Adding 1 image…');
  });
});
