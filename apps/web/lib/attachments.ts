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

// Thrown inside a save to give up on one image.
class NoteGone extends Error {}
class LimitReached extends Error {}

// One image at a time, so a bad file doesn't stop the rest. Each image and
// the note's edit time are saved together or not at all. `onProgress` is
// called after each file, whatever happened to it.
export const addImages = async (
  noteId: string,
  files: File[],
  process: (file: File) => Promise<ProcessedImage> = processImage,
  onProgress?: () => void,
): Promise<AddFailure[]> => {
  const failures: AddFailure[] = [];
  let storageFull = false;
  for (const file of files) {
    try {
      // Once storage is full, the rest would fail the same way.
      if (storageFull) {
        failures.push({ name: file.name, reason: 'storage' });
        continue;
      }
      if ((await countAttachments(noteId)) >= MAX_IMAGES) {
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
          // Checked again here: the note may be gone, or another batch may
          // have filled it while this image was processed.
          if (!(await db.notes.get(noteId))) throw new NoteGone();
          const existing = await getAttachments(noteId);
          if (existing.length >= MAX_IMAGES) throw new LimitReached();
          const id = uuid();
          await db.attachments.add({
            id,
            noteId,
            position: (existing.at(-1)?.position ?? -1) + 1,
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
        if (error instanceof NoteGone) continue;
        if (error instanceof LimitReached) failures.push({ name: file.name, reason: 'limit' });
        else if (isQuotaError(error)) {
          storageFull = true;
          failures.push({ name: file.name, reason: 'storage' });
        } else failures.push({ name: file.name, reason: 'save' });
      }
    } finally {
      onProgress?.();
    }
  }
  return failures;
};

// One message per kind of problem, so a big batch can't flood the toasts.
export const failureMessages = (failures: AddFailure[]): string[] => {
  const of = (reason: AddFailure['reason']) => failures.filter((f) => f.reason === reason);
  const messages: string[] = [];
  if (of('too-large').length > 0) messages.push('That image is too large (over 25 MB).');
  const unreadable = of('unreadable');
  if (unreadable.length === 1) messages.push(`Couldn’t add ${unreadable[0].name}: this browser can’t read it.`);
  if (unreadable.length > 1) messages.push(`Couldn’t add ${unreadable.length} files: this browser can’t read them.`);
  if (of('limit').length > 0) messages.push(`Notes can have up to ${MAX_IMAGES} images.`);
  if (of('storage').length > 0) messages.push('Couldn’t add the image: storage is full.');
  const unsaved = of('save');
  if (unsaved.length === 1) messages.push(`Couldn’t save ${unsaved[0].name}.`);
  if (unsaved.length > 1) messages.push(`Couldn’t save ${unsaved.length} files.`);
  return messages;
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
    // Not to a note deleted in the meantime.
    if (!(await db.notes.get(attachment.noteId))) return;
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

export type BoardImages = { shown: Attachment[]; total: number };

const CARD_IMAGES = 3;

// Cards show at most three thumbnails; the rest are only counted, so their
// bytes aren't kept for the board.
export const boardImages = async () => {
  const byNote = new Map<string, BoardImages>();
  for (const attachment of (await db.attachments.toArray()).sort(byPosition)) {
    const entry = byNote.get(attachment.noteId) ?? { shown: [], total: 0 };
    entry.total += 1;
    if (entry.shown.length < CARD_IMAGES) entry.shown.push(attachment);
    byNote.set(attachment.noteId, entry);
  }
  return byNote;
};

// Loaded with the board, so cards appear with their images in place.
export const useBoardImages = (): Map<string, BoardImages> | undefined =>
  useLiveQuery(() => boardImages().catch(() => new Map<string, BoardImages>()), []);
