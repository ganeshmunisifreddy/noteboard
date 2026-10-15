import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from './db';
import { ImageError, processImage, type ProcessedImage } from './images';
import { isQuotaError } from './storage';
import type { Attachment, ImageFile } from './types';

export const MAX_IMAGES = 20;

export type AddFailure = { name: string; reason: 'unreadable' | 'too-large' | 'limit' | 'storage' | 'save' };

const byPosition = (a: Attachment, b: Attachment) => a.position - b.position;

// Images are part of the note: changing them is an edit.
const touch = (noteId: string) => db.notes.update(noteId, { updatedAt: Date.now() });

export const countAttachments = (noteId: string) => db.attachments.where('noteId').equals(noteId).count();

export const getAttachments = async (noteId: string) =>
  (await db.attachments.where('noteId').equals(noteId).toArray()).sort(byPosition);

// One image at a time, so a bad file doesn't stop the rest. Each image and
// the note's edit time are saved together or not at all.
export const addImages = async (
  noteId: string,
  files: File[],
  process: (file: File) => Promise<ProcessedImage> = processImage,
): Promise<AddFailure[]> => {
  const failures: AddFailure[] = [];
  for (const file of files) {
    if ((await db.attachments.where('noteId').equals(noteId).count()) >= MAX_IMAGES) {
      failures.push({ name: file.name, reason: 'limit' });
      continue;
    }
    let image: ProcessedImage;
    try {
      image = await process(file);
    } catch (error) {
      const tooLarge = error instanceof ImageError && error.kind === 'too-large';
      failures.push({ name: file.name, reason: tooLarge ? 'too-large' : 'unreadable' });
      continue;
    }
    try {
      await db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
        const last = (await getAttachments(noteId)).at(-1);
        const id = uuid();
        await db.attachments.add({
          id,
          noteId,
          position: (last?.position ?? -1) + 1,
          type: image.type,
          width: image.width,
          height: image.height,
          size: image.bytes.byteLength,
          alt: '',
          createdAt: Date.now(),
          thumb: image.thumb,
          thumbType: image.thumbType,
        });
        await db.imageFiles.add({ id, bytes: image.bytes });
        await touch(noteId);
      });
    } catch (error) {
      failures.push({ name: file.name, reason: isQuotaError(error) ? 'storage' : 'save' });
    }
  }
  return failures;
};

export const failureMessages = (failures: AddFailure[]): string[] => {
  const messages = failures.map((failure) => {
    switch (failure.reason) {
      case 'limit':
        return `Notes can have up to ${MAX_IMAGES} images.`;
      case 'too-large':
        return 'That image is too large (over 25 MB).';
      case 'storage':
        return 'Couldn’t add the image: storage is full.';
      case 'save':
        return `Couldn’t save ${failure.name}.`;
      default:
        return `Couldn’t add ${failure.name}: this browser can’t read it.`;
    }
  });
  return [...new Set(messages)];
};

export type RemovedImage = { attachment: Attachment; file: ImageFile | undefined };

export const removeAttachment = (id: string): Promise<RemovedImage | undefined> =>
  db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    const attachment = await db.attachments.get(id);
    if (!attachment) return undefined;
    const file = await db.imageFiles.get(id);
    await db.attachments.delete(id);
    await db.imageFiles.delete(id);
    await touch(attachment.noteId);
    return { attachment, file };
  });

// Undo for Remove: the same record comes back.
export const restoreAttachment = ({ attachment, file }: RemovedImage) =>
  db.transaction('rw', db.notes, db.attachments, db.imageFiles, async () => {
    await db.attachments.put(attachment);
    if (file) await db.imageFiles.put(file);
    await touch(attachment.noteId);
  });

export const describeAttachment = (id: string, alt: string) =>
  db.transaction('rw', db.notes, db.attachments, async () => {
    const attachment = await db.attachments.get(id);
    const next = alt.trim();
    if (!attachment || attachment.alt === next) return;
    await db.attachments.update(id, { alt: next });
    await touch(attachment.noteId);
  });

// Must run inside a transaction over attachments and imageFiles.
export const deleteAttachmentsOf = async (noteIds: string[]) => {
  if (noteIds.length === 0) return;
  const ids = await db.attachments.where('noteId').anyOf(noteIds).primaryKeys();
  await db.attachments.bulkDelete(ids);
  await db.imageFiles.bulkDelete(ids);
};

// Must run inside a transaction over attachments and imageFiles.
export const copyAttachments = async (fromNoteId: string, toNoteId: string) => {
  const list = await getAttachments(fromNoteId);
  const files = await db.imageFiles.bulkGet(list.map((a) => a.id));
  const copies = list.map((attachment) => ({ ...attachment, id: uuid(), noteId: toNoteId }));
  await db.attachments.bulkAdd(copies);
  await db.imageFiles.bulkAdd(
    copies.flatMap((copy, index) => {
      const file = files[index];
      return file ? [{ id: copy.id, bytes: file.bytes }] : [];
    }),
  );
};

export const getAllImages = async () => {
  const [attachments, files] = await Promise.all([db.attachments.toArray(), db.imageFiles.toArray()]);
  return { attachments: attachments.sort(byPosition), files };
};

// Queries swallow errors so a blocked database shows the storage banner
// (see lib/startup.ts) instead of crashing the page.
export const useNoteAttachments = (noteId: string): Attachment[] | undefined =>
  useLiveQuery(() => getAttachments(noteId).catch((): Attachment[] => []), [noteId]);

// undefined while loading, null when missing.
export const useImageFile = (id: string | null): ImageFile | null | undefined =>
  useLiveQuery(async () => {
    if (!id) return null;
    return (await db.imageFiles.get(id).catch(() => undefined)) ?? null;
  }, [id]);

// Thumbnails for every card, loaded with the board.
export const useBoardImages = (): Map<string, Attachment[]> | undefined =>
  useLiveQuery(async () => {
    const all = await db.attachments.toArray().catch((): Attachment[] => []);
    const byNote = new Map<string, Attachment[]>();
    for (const attachment of all.sort(byPosition)) {
      byNote.set(attachment.noteId, [...(byNote.get(attachment.noteId) ?? []), attachment]);
    }
    return byNote;
  }, []);
