import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { bytesOf, makeAttachment } from '../../lib/testUtils';
import type { Attachment } from '../../lib/types';
import ImageViewer from './ImageViewer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:full');
});

const images = [makeAttachment({ id: 'i1', position: 0 }), makeAttachment({ id: 'i2', position: 1, alt: 'Receipt' })];

const Harness = (props: { readOnly?: boolean; onRemove?: (image: Attachment) => void; onDescribe?: (image: Attachment, alt: string) => void }) => {
  const [index, setIndex] = useState<number | null>(0);
  return (
    <ImageViewer
      images={images}
      index={index}
      readOnly={props.readOnly ?? false}
      onIndexChange={setIndex}
      onRemove={props.onRemove ?? vi.fn()}
      onDescribe={props.onDescribe ?? vi.fn()}
    />
  );
};

describe('ImageViewer', () => {
  it('moves between images with the buttons and the arrow keys', async () => {
    await db.imageFiles.bulkAdd([
      { id: 'i1', bytes: bytesOf('one') },
      { id: 'i2', bytes: bytesOf('two') },
    ]);
    const user = userEvent.setup();
    render(<Harness />);
    expect(await screen.findByRole('dialog', { name: 'Image 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous image' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Next image' }));
    // Focus stays in the viewer at the last image.
    expect(screen.getByRole('button', { name: 'Next image' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Image 2 of 2' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Receipt' })).toHaveAttribute('src', 'blob:full');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('dialog', { name: 'Image 1 of 2' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('starts with focus on the viewer, not on Remove', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('saves a description and removes an image', async () => {
    const onDescribe = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDescribe={onDescribe} onRemove={onRemove} />);
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Kitchen');
    await user.tab();
    expect(onDescribe).toHaveBeenCalledWith(images[0], 'Kitchen');
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onRemove).toHaveBeenCalledWith(images[0]);
  });

  it('saves a description when the viewer is closed with Esc', async () => {
    const onDescribe = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDescribe={onDescribe} />);
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Receipt');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDescribe).toHaveBeenCalledWith(images[0], 'Receipt');
  });

  it('is view-only in Trash', async () => {
    render(<Harness readOnly />);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  });

  it('says when an image is missing', async () => {
    render(<Harness />);
    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
  });
});
