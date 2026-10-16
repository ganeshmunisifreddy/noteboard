import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  NEWER_VERSION,
  NOT_A_BACKUP,
  backupFileName,
  backupParts,
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
import { newDue } from './due';
import type { ProcessedImage } from './images';
import { createLabel, createNote, getAllData } from './notes';
import { presetRepeat } from './repeat';
import { bytesOf, makeNote } from './testUtils';
import type { Board, Column } from './types';

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
      version: 5,
      exportedAt: '2026-10-14T12:00:00.000Z',
      notes: [note],
      labels: [{ id: 'l', name: 'Work' }],
      attachments: [],
      boards: [],
      columns: [],
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
    expect(() => parseBackup(backupOf([], [], 6))).toThrow(new BackupError(NEWER_VERSION));
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
        due: null,
        boardId: null,
        columnId: null,
        boardPosition: 0,
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

  it('writes the backup file in parts, one per image', async () => {
    await createNote({ id: 'p', kind: 'note' });
    await addImages('p', [photo('a.jpg'), photo('b.jpg')], fakeImage);
    const backup = await collectBackup();
    const parts = backupParts(backup);
    expect(JSON.parse(parts.join(''))).toEqual(JSON.parse(JSON.stringify(backup)));
    expect(parts.filter((part) => part.includes('"data"'))).toHaveLength(2);
  });

  it('keeps another note’s image when a restored image has the same id', async () => {
    await createNote({ id: 'mine', kind: 'note' });
    await addImages('mine', [photo('mine.jpg')], fakeImage);
    const [local] = await getAttachments('mine');
    const text = JSON.stringify({
      format: 'noteboard-backup',
      version: 2,
      exportedAt: 'x',
      notes: [{ id: 'theirs', title: 'Theirs', updatedAt: 5 }],
      labels: [],
      attachments: [
        { id: local.id, noteId: 'theirs', position: 0, type: 'image/jpeg', width: 1, height: 1, alt: '', createdAt: 0, thumbType: 'image/jpeg', data: 'aGk=', thumb: 'aGk=' },
      ],
    });
    await restoreBackup(text);
    expect((await getAttachments('mine')).map((a) => a.id)).toEqual([local.id]);
    const [theirs] = await getAttachments('theirs');
    expect(theirs.id).not.toBe(local.id);
    expect(asText((await db.imageFiles.get(theirs.id))?.bytes)).toBe('hi');
    expect(asText((await db.imageFiles.get(local.id))?.bytes)).toBe('full-mine.jpg');
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

describe('dates in backups', () => {
  const dated = (due: unknown) => backupOf([{ id: 'a', title: 'Bill', updatedAt: 1, due }], [], 3);

  it('reads a valid date', () => {
    const due = { ...newDue('2026-10-20', '18:00', presetRepeat('weekly', '2026-10-20')), doneAt: 5 };
    expect(parseBackup(dated(due)).notes[0].due).toEqual(due);
    const ending = newDue('2026-10-20', null, {
      ...presetRepeat('daily', '2026-10-20'),
      ends: { type: 'after', count: 3, done: 0 },
    });
    expect(parseBackup(dated(ending)).notes[0].due).toEqual(ending);
    const ended = { ...ending, repeat: { ...ending.repeat!, ends: { type: 'after' as const, count: 3, done: 3 } }, doneAt: 9 };
    expect(parseBackup(dated(ended)).notes[0].due).toEqual(ended);
  });

  it('drops a broken date and keeps the note', () => {
    for (const broken of [
      { date: '2026-02-30', time: null },
      { date: '2026-10-20', time: '25:00' },
      { date: '2026-10-20', time: null, repeat: { every: 0, unit: 'day', weekdays: [], anchor: '2026-10-20', ends: { type: 'never' } } },
      { date: '2026-10-20', time: null, repeat: { every: 1, unit: 'fortnight', weekdays: [], anchor: '2026-10-20', ends: { type: 'never' } } },
      { date: '2026-10-20', time: null, repeat: { every: 1, unit: 'week', weekdays: [9], anchor: '2026-10-20', ends: { type: 'never' } } },
      { date: '2026-10-20', time: null, repeat: { every: 1, unit: 'day', weekdays: [], anchor: '2026-10-20', ends: { type: 'after', count: 2, done: 5 } } },
      'tomorrow',
    ]) {
      const { notes } = parseBackup(dated(broken));
      expect(notes[0]).toMatchObject({ title: 'Bill', due: null });
    }
  });

  it('restores older backups without dates', () => {
    const { notes } = parseBackup(backupOf([{ id: 'a', title: 'Old' }], [], 2));
    expect(notes[0].due).toBeNull();
  });

  it('quiets past-due notes so a restore doesn’t set off old alerts', () => {
    const past = newDue('2020-01-01', '09:00', null);
    const future = newDue('2999-01-01', '09:00', null);
    const imported = parseBackup(
      backupOf([
        { id: 'past', updatedAt: 1, due: past },
        { id: 'future', updatedAt: 1, due: future },
      ], [], 3),
    );
    const now = Date.UTC(2026, 9, 15);
    const plan = planMerge([], [], imported, now);
    const byId = new Map(plan.notes.map((n) => [n.id, n]));
    expect(byId.get('past')?.due?.alertedAt).toBe(now);
    expect(byId.get('future')?.due?.alertedAt).toBeNull();
  });

  it('writes the date line in the Markdown export', () => {
    const notes = [
      makeNote({ id: 'a', title: 'Retro', due: newDue('2026-10-16', null, presetRepeat('weekly', '2026-10-16')) }),
      makeNote({ id: 'b', title: 'Bill', due: { ...newDue('2026-10-16', null, null), doneAt: 1 } }),
    ];
    const markdown = toMarkdown(notes, []);
    expect(markdown).toContain('## Retro\n⏰ Due Fri 16 Oct 2026 · repeats weekly');
    expect(markdown).toContain('## Bill\n⏰ Done (was due Fri 16 Oct 2026)');
  });
});

describe('boards in backups', () => {
  const board: Board = { id: 'b1', name: 'Website', position: 0, starred: false, createdAt: 1, updatedAt: 1 };
  const columns: Column[] = [
    { id: 'c1', boardId: 'b1', name: 'To do', position: 0, done: false, updatedAt: 1 },
    { id: 'c2', boardId: 'b1', name: 'Done', position: 1, done: true, updatedAt: 1 },
  ];
  const v4 = (notes: unknown[], boards: unknown[] = [board], cols: unknown[] = columns) =>
    file({ format: 'noteboard-backup', version: 4, exportedAt: 'x', notes, labels: [], attachments: [], boards, columns: cols });

  it('keeps stars, and reads boards from older backups as unstarred', () => {
    const starred = { ...board, starred: true };
    const v5 = file({ format: 'noteboard-backup', version: 5, exportedAt: 'x', notes: [], labels: [], attachments: [], boards: [starred], columns });
    expect(parseBackup(v5).boards).toEqual([starred]);
    const old = { id: 'b1', name: 'Website', position: 0, createdAt: 1, updatedAt: 1 };
    expect(parseBackup(v4([], [old])).boards).toEqual([{ ...old, starred: false }]);
  });

  it('keeps one Done column per board after a merge', () => {
    const localDone: Column = { ...columns[0], done: true, updatedAt: 9 };
    const imported = parseBackup(v4([], [board], columns));
    const plan = planMerge([], [], imported, Date.now(), [board], [localDone, { ...columns[1], updatedAt: 0 }]);
    const merged = new Map([[localDone.id, localDone], ...plan.columns.map((c) => [c.id, c] as const)]);
    expect([...merged.values()].filter((c) => c.done)).toHaveLength(1);
  });

  it('round-trips boards, columns and places', async () => {
    const card = makeNote({ id: 'n1', boardId: 'b1', columnId: 'c2', boardPosition: 3, updatedAt: 5 });
    const contents = JSON.stringify(buildBackup([card], [], new Date(), [], [board], columns));
    const counts = await restoreBackup(contents);
    expect(counts.boards).toBe(1);
    expect(await db.boards.get('b1')).toEqual(board);
    expect(await db.columns.toArray()).toEqual(columns);
    expect(await db.notes.get('n1')).toMatchObject({ boardId: 'b1', columnId: 'c2', boardPosition: 3 });
  });

  it('restores older backups with every note on the main board', () => {
    const { notes, boards } = parseBackup(
      file({ format: 'noteboard-backup', version: 3, notes: [{ id: 'a', boardId: 'b1', columnId: 'c1' }], labels: [] }),
    );
    expect(boards).toEqual([]);
    expect(notes[0]).toMatchObject({ boardId: 'b1', columnId: 'c1' });
    const plan = planMerge([], [], parseBackup(file({ format: 'noteboard-backup', version: 3, notes: [{ id: 'a' }], labels: [] })));
    expect(plan.notes[0]).toMatchObject({ boardId: null, columnId: null, boardPosition: 0 });
  });

  it('puts notes with a broken place on the main board', () => {
    const other: Board = { ...board, id: 'b2', name: 'Other' };
    const imported = parseBackup(
      v4(
        [
          { id: 'wrong-board', updatedAt: 1, boardId: 'b2', columnId: 'c1', boardPosition: 1 },
          { id: 'no-column', updatedAt: 1, boardId: 'b1', columnId: 'gone', boardPosition: 1 },
          { id: 'fine', updatedAt: 1, boardId: 'b1', columnId: 'c1', boardPosition: 1 },
        ],
        [board, other],
      ),
    );
    const byId = new Map(planMerge([], [], imported).notes.map((n) => [n.id, n]));
    expect(byId.get('wrong-board')).toMatchObject({ boardId: null, columnId: null, boardPosition: 0 });
    expect(byId.get('no-column')).toMatchObject({ boardId: null, columnId: null });
    expect(byId.get('fine')).toMatchObject({ boardId: 'b1', columnId: 'c1', boardPosition: 1 });
  });

  it('keeps a same-name board as a second board and the newer copy of each', () => {
    const local: Board = { ...board, id: 'mine', name: 'Website', updatedAt: 1 };
    const localColumn: Column = { ...columns[0], id: 'mc', boardId: 'mine', updatedAt: 9 };
    const imported = parseBackup(
      v4([], [board, { ...local, name: 'Renamed', updatedAt: 5 }], [...columns, { ...localColumn, name: 'Old', updatedAt: 2 }]),
    );
    const plan = planMerge([], [], imported, Date.now(), [local], [localColumn]);
    expect(plan.boards.map((b) => [b.id, b.name])).toEqual([
      ['b1', 'Website'],
      ['mine', 'Renamed'],
    ]);
    expect(plan.columns.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(plan.counts.boards).toBe(1);
  });

  it('skips invalid boards and columns', () => {
    const { boards, columns: cols } = parseBackup(
      v4([], [board, { id: '', name: 'x' }, { id: 'b3', name: '  ' }, 7], [
        ...columns,
        { id: 'c9', boardId: 'nowhere', name: 'Lost', position: 0 },
        { id: 'c8', boardId: 'b1', name: '' },
      ]),
    );
    expect(boards.map((b) => b.id)).toEqual(['b1']);
    expect(cols.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('says how many boards were added', () => {
    expect(restoredMessage({ added: 1, updated: 0, unchanged: 0, labels: 0, boards: 2 })).toBe(
      'Restored 1 note: 1 added, 0 updated, 0 already up to date. Added 2 boards.',
    );
  });

  it('writes board sections in the Markdown export', () => {
    const notes = [
      makeNote({ id: 'm', title: 'Main' }),
      makeNote({ id: 'x', title: 'Logo', boardId: 'b1', columnId: 'c1', boardPosition: 1 }),
      makeNote({ id: 'y', title: 'Fonts', boardId: 'b1', columnId: 'c1', boardPosition: 0 }),
    ];
    expect(toMarkdown(notes, [], new Map(), [board], columns)).toBe(
      '## Main\n\n---\n\n# Board: Website\n\n## To do\n\n### Fonts\n\n### Logo\n\n## Done\n\n_No cards_\n',
    );
  });
});
