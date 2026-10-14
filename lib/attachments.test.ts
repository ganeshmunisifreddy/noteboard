import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_IMAGES,
  addImages,
  describeAttachment,
  failureMessages,
  getAttachments,
  removeAttachment,
  restoreAttachment,
} from './attachments';
import { db } from './db';
import { ImageError, type ProcessedImage } from './images';
import { createNote, deleteForever, duplicateNote, emptyTrash, purgeOldTrash, trashNote } from './notes';
import { bytesOf } from './testUtils';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const text = (bytes: ArrayBuffer | undefined) => (bytes ? new TextDecoder().decode(new Uint8Array(bytes)) : undefined);
const fake = async (file: File): Promise<ProcessedImage> => ({
  bytes: bytesOf(`full-${file.name}`),
  type: 'image/jpeg',
  width: 100,
  height: 50,
  thumb: bytesOf(`thumb-${file.name}`),
  thumbType: 'image/jpeg',
});
const files = (...names: string[]) => names.map((name) => new File(['x'], name, { type: 'image/jpeg' }));

describe('addImages', () => {
  it('saves images in order with thumbnails and marks the note edited', async () => {
    await createNote({ id: 'n', kind: 'note' });
    await db.notes.update('n', { updatedAt: 1 });
    expect(await addImages('n', files('a.jpg', 'b.jpg'), fake)).toEqual([]);
    const list = await getAttachments('n');
    expect(list.map((a) => [a.position, text(a.thumb)])).toEqual([
      [0, 'thumb-a.jpg'],
      [1, 'thumb-b.jpg'],
    ]);
    expect(text((await db.imageFiles.get(list[1].id))?.bytes)).toBe('full-b.jpg');
    expect((await db.notes.get('n'))?.updatedAt).toBeGreaterThan(1);
  });

  it(`stops at ${MAX_IMAGES} images`, async () => {
    await createNote({ id: 'n', kind: 'note' });
    const many = files(...Array.from({ length: MAX_IMAGES + 2 }, (_, i) => `${i}.jpg`));
    const failures = await addImages('n', many, fake);
    expect(await db.attachments.count()).toBe(MAX_IMAGES);
    expect(failures.map((f) => f.reason)).toEqual(['limit', 'limit']);
    expect(failureMessages(failures)).toEqual(['Notes can have up to 20 images.']);
  });

  it('reports files it could not use and adds the rest', async () => {
    await createNote({ id: 'n', kind: 'note' });
    const process = async (file: File) => {
      if (file.name === 'big.jpg') throw new ImageError('too-large');
      if (file.name === 'odd.heic') throw new ImageError('unreadable');
      return fake(file);
    };
    const failures = await addImages('n', files('big.jpg', 'ok.jpg', 'odd.heic'), process);
    expect(await db.attachments.count()).toBe(1);
    expect(failureMessages(failures)).toEqual([
      'That image is too large (over 25 MB).',
      'Couldn’t add odd.heic: this browser can’t read it.',
    ]);
  });

  it('leaves nothing half-saved when storage is full', async () => {
    await createNote({ id: 'n', kind: 'note' });
    await addImages('n', files('first.jpg'), fake);
    vi.spyOn(db.imageFiles, 'add').mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    const failures = await addImages('n', files('second.jpg'), fake);
    vi.restoreAllMocks();
    expect((await getAttachments('n')).map((a) => text(a.thumb))).toEqual(['thumb-first.jpg']);
    expect(await db.imageFiles.count()).toBe(1);
    expect(failureMessages(failures)).toEqual(['Couldn’t add the image: storage is full.']);
  });
});

describe('removing and describing', () => {
  it('removes an image and puts it back on Undo', async () => {
    await createNote({ id: 'n', kind: 'note' });
    await addImages('n', files('a.jpg'), fake);
    const [image] = await getAttachments('n');
    const removed = await removeAttachment(image.id);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.imageFiles.count()).toBe(0);
    await restoreAttachment(removed!);
    expect((await getAttachments('n'))[0].id).toBe(image.id);
    expect(text((await db.imageFiles.get(image.id))?.bytes)).toBe('full-a.jpg');
  });

  it('saves a description and marks the note edited', async () => {
    await createNote({ id: 'n', kind: 'note' });
    await addImages('n', files('a.jpg'), fake);
    const [image] = await getAttachments('n');
    await db.notes.update('n', { updatedAt: 1 });
    await describeAttachment(image.id, '  Receipt  ');
    expect((await db.attachments.get(image.id))?.alt).toBe('Receipt');
    expect((await db.notes.get('n'))?.updatedAt).toBeGreaterThan(1);
  });
});

describe('images and the note life cycle', () => {
  it('copies images with the note', async () => {
    await createNote({ id: 'n', kind: 'note', title: 'With photo' });
    await addImages('n', files('a.jpg'), fake);
    const copy = await duplicateNote('n');
    const [original] = await getAttachments('n');
    const [copied] = await getAttachments(copy!.id);
    expect(copied.id).not.toBe(original.id);
    expect(text(copied.thumb)).toBe('thumb-a.jpg');
    expect(text((await db.imageFiles.get(copied.id))?.bytes)).toBe('full-a.jpg');
  });

  it('deletes a note’s images with the note, and only those', async () => {
    for (const id of ['keep', 'gone', 'trashed', 'old']) {
      await createNote({ id, kind: 'note' });
      await addImages(id, files(`${id}.jpg`), fake);
    }
    await deleteForever('gone');
    await trashNote('trashed');
    await emptyTrash();
    await trashNote('old');
    await db.notes.update('old', { trashedAt: 1 });
    await purgeOldTrash();
    const left = await db.attachments.toArray();
    expect(left.map((a) => a.noteId)).toEqual(['keep']);
    expect(await db.imageFiles.count()).toBe(1);
  });
});
