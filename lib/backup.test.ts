import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  NEWER_VERSION,
  NOT_A_BACKUP,
  backupFileName,
  collectBackup,
  buildBackup,
  markdownFileName,
  parseBackup,
  planMerge,
  restoreBackup,
  restoreErrorMessage,
  restoredMessage,
  toMarkdown,
} from './backup';
import { addImages, getAttachments } from './attachments';
import { db } from './db';
import type { ProcessedImage } from './images';
import { createLabel, createNote, getAllData } from './notes';
import { bytesOf, makeNote } from './testUtils';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const file = (value: unknown) => JSON.stringify(value);
const backupOf = (notes: unknown[], labels: unknown[] = [], version = 1) =>
  file({ format: 'noteboard-backup', version, exportedAt: 'x', notes, labels });

describe('buildBackup', () => {
  it('wraps notes and labels with the format and version', () => {
    const note = makeNote({ id: 'a' });
    const backup = buildBackup([note], [{ id: 'l', name: 'Work' }], new Date('2026-10-14T12:00:00Z'));
    expect(backup).toEqual({
      format: 'noteboard-backup',
      version: 2,
      exportedAt: '2026-10-14T12:00:00.000Z',
      notes: [note],
      labels: [{ id: 'l', name: 'Work' }],
      attachments: [],
    });
  });
});

describe('parseBackup', () => {
  it('rejects files that are not backups', () => {
    for (const text of ['{oops', file([]), file({ format: 'other', version: 1, notes: [], labels: [] }), file({ format: 'noteboard-backup', version: 1, notes: {}, labels: [] })]) {
      expect(() => parseBackup(text)).toThrow(new BackupError(NOT_A_BACKUP));
    }
  });

  it('rejects backups from a newer version', () => {
    expect(() => parseBackup(backupOf([], [], 3))).toThrow(new BackupError(NEWER_VERSION));
  });

  it('skips broken entries and fills defaults', () => {
    const { notes, labels } = parseBackup(
      backupOf(
        [null, 7, { id: 'a', kind: 'weird', color: 'neon', title: 5, items: 'x', pinned: true, archived: true }],
        [{ id: 'l', name: '  Work ' }, { id: 'm' }, 'x'],
      ),
    );
    expect(labels).toEqual([{ id: 'l', name: 'Work' }]);
    expect(notes).toEqual([
      {
        id: 'a',
        kind: 'note',
        title: '',
        content: '',
        items: [],
        color: 'default',
        labelIds: [],
        pinned: false,
        archived: true,
        trashedAt: null,
        createdAt: 0,
        updatedAt: 0,
        position: null,
      },
    ]);
  });

  it('keeps the newest copy of a note that appears twice', () => {
    const { notes } = parseBackup(backupOf([{ id: 'a', title: 'old', updatedAt: 1 }, { id: 'a', title: 'new', updatedAt: 2 }]));
    expect(notes.map((n) => n.title)).toEqual(['new']);
  });
});

describe('planMerge', () => {
  it('adds new notes and places ones without a position after the last note', () => {
    const local = [makeNote({ id: 'x', position: 4 })];
    const imported = parseBackup(backupOf([{ id: 'a', position: 0 }, { id: 'b' }]));
    const plan = planMerge(local, [], imported);
    expect(plan.notes.map((n) => [n.id, n.position])).toEqual([
      ['a', 0],
      ['b', 5],
    ]);
    expect(plan.counts).toEqual({ added: 2, updated: 0, unchanged: 0, labels: 0 });
  });

  it('replaces older local notes and keeps newer ones', () => {
    const local = [makeNote({ id: 'a', title: 'local', updatedAt: 5 }), makeNote({ id: 'b', title: 'local', updatedAt: 9 })];
    const imported = parseBackup(backupOf([{ id: 'a', title: 'backup', updatedAt: 7 }, { id: 'b', title: 'backup', updatedAt: 9 }]));
    const plan = planMerge(local, [], imported);
    expect(plan.notes.map((n) => [n.id, n.title])).toEqual([['a', 'backup']]);
    expect(plan.counts).toEqual({ added: 0, updated: 1, unchanged: 1, labels: 0 });
  });

  it('maps labels by name and keeps ids unique', () => {
    const localLabels = [{ id: 'w1', name: 'Work' }];
    const imported = parseBackup(
      backupOf(
        [{ id: 'a', labelIds: ['x', 'h', 'w1', 'gone'] }],
        [
          { id: 'x', name: 'work' },
          { id: 'h', name: 'Home' },
          { id: 'w1', name: 'Other' },
        ],
      ),
    );
    const plan = planMerge([], localLabels, imported);
    const other = plan.labels.find((l) => l.name === 'Other');
    expect(plan.labels.map((l) => l.name)).toEqual(['Home', 'Other']);
    expect(plan.labels.find((l) => l.name === 'Home')?.id).toBe('h');
    expect(other?.id).not.toBe('w1');
    expect(plan.notes[0].labelIds).toEqual(['w1', 'h', other?.id]);
  });
});

describe('restoreBackup', () => {
  it('restores a backup into an empty database exactly', async () => {
    const work = await createLabel('Work');
    await createNote({ id: 'a', kind: 'list', title: 'List', items: [{ id: 'i', text: 'Milk', done: true }], labelIds: [work.id] });
    await createNote({ id: 'b', kind: 'note', title: 'Note', archived: true });
    const before = await getAllData();
    const text = JSON.stringify(buildBackup(before.notes, before.labels));
    await db.delete();
    await db.open();

    expect(await restoreBackup(text)).toEqual({ added: 2, updated: 0, unchanged: 0, labels: 1 });
    const after = await getAllData();
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(after.notes)).toEqual(byId(before.notes));
    expect(byId(after.labels)).toEqual(byId(before.labels));
    expect(localStorage.getItem('hasNotes')).toBe('1');
  });

  it('changes nothing when the same backup is restored twice', async () => {
    await createNote({ id: 'a', kind: 'note', title: 'A' });
    const { notes, labels } = await getAllData();
    const text = JSON.stringify(buildBackup(notes, labels));
    expect(await restoreBackup(text)).toEqual({ added: 0, updated: 0, unchanged: 1, labels: 0 });
  });

  it('changes nothing when the restore fails', async () => {
    const text = backupOf([{ id: 'a', updatedAt: 1 }], [{ id: 'l', name: 'Work' }]);
    vi.spyOn(db.notes, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(restoreBackup(text)).rejects.toThrow('boom');
    expect(await db.labels.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });
});

describe('toMarkdown', () => {
  it('writes active notes in board order, then archived ones', () => {
    const labels = [{ id: 'l1', name: 'Home' }];
    const notes = [
      makeNote({ id: 'p', kind: 'note', title: 'Plan', content: 'Book hotel\nPack', position: 1 }),
      makeNote({
        id: 'g',
        kind: 'list',
        title: 'Groceries',
        pinned: true,
        labelIds: ['l1'],
        position: 5,
        items: [
          { id: '1', text: 'Bread', done: true },
          { id: '2', text: 'Milk', done: false },
        ],
      }),
      makeNote({ id: 'u', kind: 'note', title: '', content: 'Idea', position: 2 }),
      makeNote({ id: 'o', kind: 'note', title: 'Old', content: 'Done', archived: true }),
      makeNote({ id: 't', kind: 'note', title: 'Gone', content: 'x', trashedAt: 1 }),
    ];
    expect(toMarkdown(notes, labels)).toBe(
      [
        '## Groceries\nLabels: Home\n\n- [ ] Milk\n- [x] Bread',
        '## Plan\n\nBook hotel\nPack',
        '## Untitled\n\nIdea',
        '# Archived\n\n## Old\n\nDone',
      ].join('\n\n---\n\n') + '\n',
    );
  });

  it('is empty with no notes', () => {
    expect(toMarkdown([], [])).toBe('');
  });
});

describe('messages and file names', () => {
  it('summarises a restore', () => {
    expect(restoredMessage({ added: 8, updated: 3, unchanged: 1, labels: 2 })).toBe(
      'Restored 12 notes: 8 added, 3 updated, 1 already up to date',
    );
    expect(restoredMessage({ added: 1, updated: 0, unchanged: 0, labels: 0 })).toBe(
      'Restored 1 note: 1 added, 0 updated, 0 already up to date',
    );
    expect(restoredMessage({ added: 0, updated: 0, unchanged: 0, labels: 0 })).toBe('That backup has no notes.');
  });

  it('mentions labels when a backup has labels but no notes', () => {
    expect(restoredMessage({ added: 0, updated: 0, unchanged: 0, labels: 2 })).toBe(
      'That backup has no notes. Added 2 labels.',
    );
    expect(restoredMessage({ added: 0, updated: 0, unchanged: 0, labels: 1 })).toBe(
      'That backup has no notes. Added 1 label.',
    );
  });

  it('explains restore errors', () => {
    expect(restoreErrorMessage(new BackupError(NOT_A_BACKUP))).toBe(NOT_A_BACKUP);
    expect(restoreErrorMessage({ name: 'QuotaExceededError' })).toBe('Couldn’t restore: storage is full.');
    expect(restoreErrorMessage(new Error('x'))).toBe('Couldn’t restore that backup.');
  });

  it('names files with the local date', () => {
    const date = new Date(2026, 0, 5, 23, 30);
    expect(backupFileName(date)).toBe('noteboard-backup-2026-01-05.json');
    expect(markdownFileName(date)).toBe('noteboard-notes-2026-01-05.md');
  });
});

const fakeImage = async (file: File): Promise<ProcessedImage> => ({
  bytes: bytesOf(`full-${file.name}`),
  type: 'image/jpeg',
  width: 10,
  height: 10,
  thumb: bytesOf(`thumb-${file.name}`),
  thumbType: 'image/jpeg',
});
const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const asText = (bytes: ArrayBuffer | undefined) => (bytes ? new TextDecoder().decode(new Uint8Array(bytes)) : undefined);

describe('backups with images', () => {
  it('restores images into an empty database', async () => {
    await createNote({ id: 'p', kind: 'note', title: 'Receipt' });
    await addImages('p', [photo('r.jpg')], fakeImage);
    const text = JSON.stringify(await collectBackup());
    await db.delete();
    await db.open();
    await restoreBackup(text);
    const [image] = await getAttachments('p');
    expect(asText(image.thumb)).toBe('thumb-r.jpg');
    expect(asText((await db.imageFiles.get(image.id))?.bytes)).toBe('full-r.jpg');
  });

  it('still restores version 1 backups', async () => {
    expect(await restoreBackup(backupOf([{ id: 'old', title: 'Old', updatedAt: 1 }]))).toMatchObject({ added: 1 });
    expect(await db.attachments.count()).toBe(0);
  });

  it('replaces the images of a note the backup has a newer copy of', async () => {
    await createNote({ id: 'p', kind: 'note' });
    await addImages('p', [photo('local.jpg')], fakeImage);
    const backup = JSON.parse(JSON.stringify(await collectBackup()));
    await db.attachments.clear();
    await db.imageFiles.clear();
    await addImages('p', [photo('other.jpg')], fakeImage);
    backup.notes[0].updatedAt = Date.now() + 1000;
    await restoreBackup(JSON.stringify(backup));
    expect((await getAttachments('p')).map((a) => asText(a.thumb))).toEqual(['thumb-local.jpg']);
  });

  it('keeps local images when the local note is newer', async () => {
    await createNote({ id: 'p', kind: 'note' });
    await addImages('p', [photo('backup.jpg')], fakeImage);
    const backup = JSON.stringify(await collectBackup());
    await db.attachments.clear();
    await db.imageFiles.clear();
    await addImages('p', [photo('mine.jpg')], fakeImage);
    await db.notes.update('p', { updatedAt: Date.now() + 1000 });
    await restoreBackup(backup);
    expect((await getAttachments('p')).map((a) => asText(a.thumb))).toEqual(['thumb-mine.jpg']);
  });

  it('skips broken images and images of notes not in the backup', async () => {
    const image = (id: string, noteId: string, data: string) => ({
      id, noteId, position: 0, type: 'image/jpeg', width: 1, height: 1, alt: '', createdAt: 0,
      thumbType: 'image/jpeg', data, thumb: 'aGk=',
    });
    const text = JSON.stringify({
      format: 'noteboard-backup',
      version: 2,
      exportedAt: 'x',
      notes: [{ id: 'n', title: 'N', updatedAt: 5 }],
      labels: [],
      attachments: [image('good', 'n', 'aGk='), image('broken', 'n', 'not base64!'), image('orphan', 'gone', 'aGk=')],
    });
    await restoreBackup(text);
    expect((await db.attachments.toArray()).map((a) => a.id)).toEqual(['good']);
  });

  it('skips images of types that are not safe to show', async () => {
    const image = (id: string, type: string, thumbType: string) => ({
      id, noteId: 'n', position: 0, type, width: 1, height: 1, alt: '', createdAt: 0, thumbType, data: 'aGk=', thumb: 'aGk=',
    });
    const text = JSON.stringify({
      format: 'noteboard-backup',
      version: 2,
      exportedAt: 'x',
      notes: [{ id: 'n', title: 'N', updatedAt: 5 }],
      labels: [],
      attachments: [
        image('ok', 'image/png', 'image/webp'),
        image('svg', 'image/svg+xml', 'image/jpeg'),
        image('svg-thumb', 'image/jpeg', 'image/svg+xml'),
      ],
    });
    await restoreBackup(text);
    expect((await db.attachments.toArray()).map((a) => a.id)).toEqual(['ok']);
  });
});

describe('toMarkdown with images', () => {
  it('notes how many images a note has', () => {
    const notes = [makeNote({ id: 'a', title: 'Trip', content: 'Pack' }), makeNote({ id: 'b', title: 'One' })];
    const counts = new Map([
      ['a', 3],
      ['b', 1],
    ]);
    const markdown = toMarkdown(notes, [], counts);
    expect(markdown).toContain('## Trip\n_3 images (not included in the Markdown export)_\n\nPack');
    expect(markdown).toContain('## One\n_1 image (not included in the Markdown export)_');
  });
});
