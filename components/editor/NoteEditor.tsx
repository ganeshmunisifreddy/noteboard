import { Check, SquareKanban, Tag } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { convertKind, isNoteEmpty } from '../../lib/checklist';
import {
  createNote,
  deleteForever,
  duplicateNote,
  getNote,
  markDone,
  putBackDue,
  removeDue,
  reopenDue,
  restoreNote,
  restoreSnapshot,
  setDue,
  trashNote,
  undoTrash,
  updateNote,
  useLabels,
} from '../../lib/notes';
import {
  addImages,
  type AddFailure,
  countAttachments,
  describeAttachment,
  failureMessages,
  removeAttachment,
  restoreAttachment,
  useNoteAttachments,
} from '../../lib/attachments';
import { newCardPlace, placeAtEnd, putBackPlace, removeFromBoard } from '../../lib/cards';
import { useBoardColumns, usePlaceNames } from '../../lib/boards';
import { formatDue } from '../../lib/due';
import { leaveEditor, noteHref, openEditor, type NewCardPlace } from '../../lib/routes';
import { isQuotaError } from '../../lib/storage';
import { formatEdited, useNow } from '../../lib/time';
import type { Attachment, ChecklistItem, Note, NoteKind, Repeat } from '../../lib/types';
import MarkdownPreview from '../board/MarkdownPreview';
import IconButton from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import LabelPicker from '../ui/LabelPicker';
import type { MenuItem } from '../ui/Menu';
import BoardMenu from './BoardPicker';
import chipStyles from './BoardPicker.module.css';
import ChecklistEditor from './ChecklistEditor';
import DatePopover from './DatePopover';
import DueChip from './DueChip';
import EditorToolbar from './EditorToolbar';
import Gallery from './Gallery';
import ImageViewer from './ImageViewer';
import NoteBody from './NoteBody';
import styles from './NoteEditor.module.css';
import { preloadRichEditor, useRichEditor } from './useRichEditor';

// A note opened directly (not from the board) starts loading the editor as
// soon as this page's code runs, not after the first render.
if (typeof window !== 'undefined') preloadRichEditor().catch(() => {});

export type Draft = Pick<Note, 'kind' | 'title' | 'content' | 'items' | 'color' | 'labelIds' | 'pinned' | 'archived'>;

const NO_IMAGES: Attachment[] = [];

const SAVE_DELAY_MS = 300;

const blankDraft = (kind: NoteKind): Draft => ({
  kind,
  title: '',
  content: '',
  items: [],
  color: 'default',
  labelIds: [],
  pinned: false,
  archived: false,
});

const toDraft = ({ kind, title, content, items, color, labelIds, pinned, archived }: Note): Draft => ({
  kind,
  title,
  content,
  items,
  color,
  labelIds,
  pinned,
  archived,
});

const sameItems = (a: ChecklistItem[], b: ChecklistItem[]) => JSON.stringify(a) === JSON.stringify(b);

const EditedAt = ({ timestamp }: { timestamp: number }) => {
  const now = useNow();
  return <p className={styles.meta}>{formatEdited(timestamp, now)}</p>;
};

type Props = {
  noteId: string;
  stored: Note | null; // live copy from the database; null for an unsaved draft
  newKind: NoteKind | null;
  newPlace: NewCardPlace | null; // a new card's column, from a board
};

const NoteEditor = ({ noteId, stored, newKind, newPlace }: Props) => {
  const router = useRouter();
  const toast = useToast();
  const labels = useLabels() ?? [];
  // `stored` only seeds the draft; after that the draft is the source of truth.
  const [draft, setDraft] = useState<Draft>(() => (stored ? toDraft(stored) : blankDraft(newKind ?? 'note')));
  const draftRef = useRef(draft);
  const createdRef = useRef(stored !== null);
  const editedRef = useRef(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const trashed = stored?.trashedAt != null;
  const images = useNoteAttachments(noteId) ?? NO_IMAGES;
  const [pendingImages, setPendingImages] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  // Image adds still running; leaving waits for them before judging the note empty.
  const addingRef = useRef<Promise<unknown>>(Promise.resolve());
  const focusAfterRemove = useRef<{ id: string; index: number } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // Opened from the date chip: closing returns focus there, not to the ⏰ button.
  const openedFromChip = useRef(false);
  const due = stored?.due ?? null;

  useEffect(() => {
    const target = focusAfterRemove.current;
    if (!target || images.some((i) => i.id === target.id)) return;
    focusAfterRemove.current = null;
    const selector = target.index < 0 ? 'button[aria-label="Add image"]' : `[data-gallery-index="${target.index}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
  }, [images]);

  // A new card from a board column is created there, at the top or bottom.
  const create = async (draft: Draft) => {
    const place = newPlace ? await newCardPlace(newPlace.columnId, newPlace.at, newPlace.boardId) : null;
    await createNote({ id: noteId, ...draft, ...place });
  };

  const save = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const current = draftRef.current;
    try {
      if (createdRef.current) {
        await updateNote(noteId, current);
      } else if (!isNoteEmpty(current)) {
        await create(current);
        createdRef.current = true;
        // Saved while leaving: the router is already on another page, and
        // rewriting the URL now would navigate back into this note.
        if (mountedRef.current) void router.replace(noteHref(noteId), undefined, { shallow: true });
      }
    } catch (error) {
      dirtyRef.current = true;
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
    }
  };

  // Saves run one at a time, so the first save can't create the note twice.
  const flush = () => {
    clearTimeout(timerRef.current);
    queueRef.current = queueRef.current.then(save);
    return queueRef.current;
  };

  // Images belong to a saved note, so a new note is saved before its first
  // image (in the save queue, so it can't be created twice).
  const ensureCreated = () => {
    clearTimeout(timerRef.current);
    const run = queueRef.current.then(save).then(async () => {
      if (createdRef.current) return;
      await create(draftRef.current);
      createdRef.current = true;
      dirtyRef.current = false;
      if (mountedRef.current) void router.replace(noteHref(noteId), undefined, { shallow: true });
    });
    // A failed create must not block the saves queued after it.
    queueRef.current = run.catch(() => {});
    return run;
  };

  // `fromDrop`: other files dropped with images are ignored quietly; chosen
  // or pasted ones get a message.
  const addFiles = async (files: File[], fromDrop = false) => {
    if (trashed) return;
    const chosen = files.filter((file) => file.type.startsWith('image/'));
    const others: AddFailure[] = fromDrop
      ? []
      : files.filter((file) => !chosen.includes(file)).map((file) => ({ name: file.name, reason: 'unreadable' }));
    // All problems in one message, so none is pushed out of the toast stack.
    const report = (failures: AddFailure[]) => {
      const messages = failureMessages(failures);
      if (messages.length > 0) toast({ message: messages.join(' ') });
    };
    if (chosen.length === 0) {
      report(others);
      return;
    }
    editedRef.current = true;
    try {
      await ensureCreated();
    } catch (error) {
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
      return;
    }
    setPendingImages((n) => n + chosen.length);
    // Each placeholder goes as soon as its image is done.
    const adding = addImages(noteId, chosen, undefined, () => setPendingImages((n) => n - 1));
    addingRef.current = addingRef.current.then(() => adding).catch(() => {});
    report([...others, ...(await adding)]);
  };

  const removeImage = async (image: Attachment) => {
    // Once the gallery has updated, focus the next image (or Add image), as
    // the removed image's button goes away.
    const index = images.findIndex((i) => i.id === image.id);
    focusAfterRemove.current = { id: image.id, index: images.length > 1 ? Math.min(index, images.length - 2) : -1 };
    setViewerIndex(null);
    const removed = await removeAttachment(image.id);
    if (removed) {
      toast({ message: 'Image removed', actionLabel: 'Undo', onAction: () => void restoreAttachment(removed) });
    }
  };

  // Mark done can untick a list; the draft takes the new items (without
  // counting as an edit) so the next save keeps them.
  const takeItems = (items: ChecklistItem[]) => {
    draftRef.current = { ...draftRef.current, items };
    setDraft(draftRef.current);
  };

  const saveDue = async (date: string, time: string | null, repeat: Repeat | null) => {
    editedRef.current = true;
    try {
      await ensureCreated();
      await setDue(noteId, date, time, repeat);
    } catch (error) {
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
    }
  };

  const removeDate = async () => {
    if (!due) return;
    const before = due;
    await removeDue(noteId);
    toast({ message: 'Date removed', actionLabel: 'Undo', onAction: () => void putBackDue(noteId, before) });
  };

  // ⋮ › Board: each board's columns (the current one ticked), and Remove from board.
  const boardColumns = useBoardColumns() ?? [];
  const boardItems: MenuItem[] = boardColumns.map(({ board, columns }) => ({
    key: board.id,
    label: board.name,
    items: columns.map((column) => ({
      key: column.id,
      label: column.name,
      icon: column.id === stored?.columnId ? <Check size={16} aria-hidden /> : undefined,
      onSelect: () => void pickColumn(column.id),
    })),
  }));
  if (stored?.columnId) boardItems.push({ label: 'Remove from board', onSelect: () => void removeFromBoard(noteId) });
  if (boardItems.length === 0) boardItems.push({ label: 'No boards yet', onSelect: () => {} });

  const placeNames = usePlaceNames();
  const place = stored?.columnId ? placeNames?.get(stored.columnId) : undefined;

  const pickColumn = async (columnId: string) => {
    editedRef.current = true;
    try {
      await ensureCreated();
      const result = await placeAtEnd(noteId, columnId);
      if (result?.dateChanged) {
        const before = result.before;
        toast({
          message: before.due?.doneAt === null ? 'Marked done' : 'Date reopened',
          actionLabel: 'Undo',
          onAction: () => void putBackPlace(before),
        });
      }
    } catch (error) {
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
    }
  };

  const markDueDone = async () => {
    await flush();
    const before = await markDone(noteId);
    if (!before) return;
    const after = await getNote(noteId);
    if (after) takeItems(after.items);
    const movedTo = after?.due && after.due.doneAt === null ? formatDue(after.due, Date.now()) : null;
    toast({
      message: movedTo ? `Moved to ${movedTo}` : 'Marked done',
      actionLabel: 'Undo',
      onAction: () => void putBackPlace(before).then(() => takeItems(before.items)),
    });
  };

  // Items changed elsewhere (Mark done from a reminder) reach the draft. With
  // edits waiting to be saved, those stay and only the ticks that changed
  // in the database are taken, so the save doesn't put the old ticks back.
  const seenItemsRef = useRef(stored?.items);
  const onStoredItems = useEffectEvent((items: ChecklistItem[]) => {
    const before = seenItemsRef.current ?? items;
    seenItemsRef.current = items;
    if (sameItems(items, draftRef.current.items)) return;
    if (!dirtyRef.current) {
      takeItems(items);
      return;
    }
    const was = new Map(before.map((item) => [item.id, item.done]));
    const ticks = new Map(
      items.filter((item) => was.has(item.id) && was.get(item.id) !== item.done).map((item) => [item.id, item.done]),
    );
    if (ticks.size === 0) return;
    takeItems(draftRef.current.items.map((item) => ({ ...item, done: ticks.get(item.id) ?? item.done })));
  });
  const storedItems = stored?.items;
  useEffect(() => {
    if (storedItems) onStoredItems(storedItems);
  }, [storedItems]);

  const update = (changes: Partial<Draft>) => {
    const next = { ...draftRef.current, ...changes };
    draftRef.current = next;
    dirtyRef.current = true;
    editedRef.current = true;
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const onLeave = useEffectEvent(() => {
    void flush().then(async () => {
      // Images still being processed count as content.
      await addingRef.current;
      // A note the user emptied goes to Trash rather than lingering blank.
      if (!createdRef.current || !editedRef.current || trashed || !isNoteEmpty(draftRef.current)) return;
      if ((await countAttachments(noteId)) > 0) return;
      await trashNote(noteId);
      toast({ message: 'Empty note moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(noteId) });
    })
      // Tidying up an empty note is best effort; the page is already gone.
      .catch(() => {});
  });

  const onHide = useEffectEvent(() => {
    void flush();
  });

  // Pasted images go to the gallery wherever the cursor is. A paste that also
  // has text still pastes the text.
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (trashed || files.length === 0) return;
    if (!event.clipboardData?.types.includes('text/plain')) event.preventDefault();
    void addFiles(files);
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Escape also cancels IME composition (Japanese, Chinese, …).
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    // Popovers and menus close themselves on Escape.
    if (event.target instanceof Element && event.target.closest('[role="dialog"],[role="menu"]')) return;
    leaveEditor(router);
  });

  useEffect(() => {
    mountedRef.current = true;
    const hide = () => onHide();
    // Mobile browsers can kill a backgrounded tab without firing pagehide.
    const visibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    const key = (event: KeyboardEvent) => onKeyDown(event);
    const paste = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener('paste', paste);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', key);
      window.removeEventListener('paste', paste);
      mountedRef.current = false;
      onLeave();
    };
  }, []);

  const togglePin = () => update({ pinned: !draft.pinned, archived: draft.pinned ? draft.archived : false });

  const archive = async () => {
    const archiving = !draft.archived;
    // Snapshot after saving pending edits, so Undo restores this exact
    // version, including its pin and place on the board.
    await flush();
    const before = createdRef.current ? await getNote(noteId) : undefined;
    update({ archived: archiving, pinned: archiving ? false : draft.pinned });
    await flush();
    if (!archiving || !before) return;
    leaveEditor(router);
    toast({ message: 'Note archived', actionLabel: 'Undo', onAction: () => void restoreSnapshot(before) });
  };

  const remove = async () => {
    await flush();
    editedRef.current = false;
    if (createdRef.current) {
      await trashNote(noteId);
      toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(noteId) });
    }
    leaveEditor(router);
  };

  const copy = async () => {
    await flush();
    if (!createdRef.current) return;
    let duplicate: Note | undefined;
    try {
      duplicate = await duplicateNote(noteId);
    } catch (error) {
      toast({ message: isQuotaError(error) ? 'Couldn’t make a copy: storage is full.' : 'Couldn’t make a copy.' });
      return;
    }
    if (!duplicate) return;
    openEditor(router, noteHref(duplicate.id));
    toast({ message: 'Copy created' });
  };

  const restore = async () => {
    await restoreNote(noteId);
    toast({ message: 'Note restored' });
  };

  const removeForever = async () => {
    if (!window.confirm('Delete this note forever? This can’t be undone.')) return;
    editedRef.current = false;
    await deleteForever(noteId);
    leaveEditor(router);
  };

  const rich = useRichEditor();
  // The formatting bar is drawn here, under the top bar, by the rich editor.
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);

  const labelNames = draft.labelIds
    .map((id) => labels.find((l) => l.id === id)?.name)
    .filter((name): name is string => !!name);

  return (
    <div
      className={styles.page}
      data-color={draft.color}
      // Files only; a dropped file never replaces the page, even in Trash.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        if (!trashed) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(false);
        void addFiles([...e.dataTransfer.files], true);
      }}
    >
      {dropping && (
        <div className={styles.dropOverlay} aria-hidden>
          Drop to add images
        </div>
      )}
      <Head>
        <title>{`${draft.title || 'Untitled'} | Noteboard`}</title>
      </Head>
      <div className={styles.top}>
        <EditorToolbar
          draft={draft}
          trashed={trashed}
          onBack={() => leaveEditor(router)}
          onChange={update}
          onTogglePin={togglePin}
          onSwitchKind={() => update(convertKind(draftRef.current))}
          onArchive={() => void archive()}
          onCopy={() => void copy()}
          onDelete={() => void remove()}
          onRestore={() => void restore()}
          onDeleteForever={() => void removeForever()}
          onAddImages={(files) => void addFiles(files)}
          boardItems={boardItems}
          dateButton={
            <DatePopover
              due={due}
              open={dateOpen}
              onOpenChange={setDateOpen}
              onSave={(date, time, repeat) => void saveDue(date, time, repeat)}
              onRemove={() => void removeDate()}
              onCloseAutoFocus={(event) => {
                const chip = openedFromChip.current ? document.querySelector<HTMLElement>('[data-due-chip]') : null;
                openedFromChip.current = false;
                if (!chip) return;
                event.preventDefault();
                chip.focus();
              }}
            />
          }
        />
        <div ref={setBarSlot} />
      </div>
      <main className={styles.body}>
        {trashed && <p className={styles.notice}>This note is in Trash. Restore it to edit.</p>}
        <Gallery images={images} pending={pendingImages} onOpen={setViewerIndex} />
        <input
          className={styles.title}
          value={draft.title}
          placeholder='Title'
          aria-label='Title'
          readOnly={trashed}
          onChange={(e) => update({ title: e.target.value })}
        />
        {draft.kind === 'note' ? (
          rich.status === 'ready' ? (
            <rich.Editor
              value={draft.content}
              readOnly={trashed}
              autoFocus={stored === null}
              onChange={(content) => update({ content })}
              barSlot={barSlot}
            />
          ) : rich.status === 'loading' ? (
            // Shown read-only while the editor loads, so the page doesn't flash empty.
            <MarkdownPreview markdown={draft.content} className={styles.loading} />
          ) : (
            <>
              <p className={styles.notice} role='status'>
                Formatting tools couldn&apos;t load. You can still edit the text.
              </p>
              <NoteBody
                value={draft.content}
                readOnly={trashed}
                autoFocus={stored === null}
                onChange={(content) => update({ content })}
              />
            </>
          )
        ) : (
          <ChecklistEditor
            items={draft.items}
            readOnly={trashed}
            autoFocus={stored === null}
            onChange={(items) => update({ items })}
          />
        )}
        {(due || labelNames.length > 0 || place) && (
          <div className={styles.details} role='group' aria-label='Details'>
            {due && (
              <DueChip
                due={due}
                readOnly={trashed}
                onEdit={() => {
                  openedFromChip.current = true;
                  setDateOpen(true);
                }}
                onRemove={() =>
                  void removeDate().then(() => {
                    // The chip is gone; keep focus nearby on the date button.
                    document.querySelector<HTMLElement>('[data-date-button]')?.focus();
                  })
                }
                onMarkDone={() => void markDueDone()}
                onReopen={() => void reopenDue(noteId)}
              />
            )}
            {labelNames.map((name) =>
              trashed ? (
                <span key={name} className={styles.labelChip}>
                  {name}
                </span>
              ) : (
                <LabelPicker
                  key={name}
                  selectedIds={draft.labelIds}
                  onChange={(labelIds) => update({ labelIds })}
                  trigger={
                    <button type='button' className={styles.labelChip} aria-label={`Label: ${name}`}>
                      <Tag size={14} aria-hidden />
                      {name}
                    </button>
                  }
                />
              ),
            )}
            {place &&
              (trashed ? (
                <p className={chipStyles.chip}>{place}</p>
              ) : (
                <BoardMenu
                  columnId={stored?.columnId ?? null}
                  onPick={(columnId) => void pickColumn(columnId)}
                  onRemove={() => void removeFromBoard(noteId)}
                  trigger={
                    <button type='button' className={chipStyles.chip} aria-label={`Board: ${place}`}>
                      <SquareKanban size={16} aria-hidden />
                      {place}
                    </button>
                  }
                />
              ))}
          </div>
        )}
        {stored && <EditedAt timestamp={stored.updatedAt} />}
        <ImageViewer
          images={images}
          index={viewerIndex}
          readOnly={trashed}
          onIndexChange={setViewerIndex}
          onRemove={(image) => void removeImage(image)}
          onDescribe={(image, alt) => void describeAttachment(image.id, alt)}
        />
      </main>
    </div>
  );
};

export default NoteEditor;
