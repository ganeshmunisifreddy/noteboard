import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { convertKind, isNoteEmpty } from '../../lib/checklist';
import {
  createNote,
  deleteForever,
  duplicateNote,
  getNote,
  restoreNote,
  restoreSnapshot,
  trashNote,
  undoTrash,
  updateNote,
  useLabels,
} from '../../lib/notes';
import {
  addImages,
  describeAttachment,
  failureMessages,
  removeAttachment,
  restoreAttachment,
  useNoteAttachments,
} from '../../lib/attachments';
import { leaveEditor, noteHref, openEditor } from '../../lib/routes';
import { isQuotaError } from '../../lib/storage';
import { formatEdited, useNow } from '../../lib/time';
import type { Attachment, Note, NoteKind } from '../../lib/types';
import MarkdownPreview from '../board/MarkdownPreview';
import { useToast } from '../ui/Toast';
import ChecklistEditor from './ChecklistEditor';
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

const EditedAt = ({ timestamp }: { timestamp: number }) => {
  const now = useNow();
  return <p className={styles.meta}>{formatEdited(timestamp, now)}</p>;
};

type Props = {
  noteId: string;
  stored: Note | null; // live copy from the database; null for an unsaved draft
  newKind: NoteKind | null;
};

const NoteEditor = ({ noteId, stored, newKind }: Props) => {
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
  const images = useNoteAttachments(noteId) ?? [];
  const [pendingImages, setPendingImages] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);

  const save = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const current = draftRef.current;
    try {
      if (createdRef.current) {
        await updateNote(noteId, current);
      } else if (!isNoteEmpty(current)) {
        await createNote({ id: noteId, ...current });
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
    queueRef.current = queueRef.current.then(save).then(async () => {
      if (createdRef.current) return;
      await createNote({ id: noteId, ...draftRef.current });
      createdRef.current = true;
      dirtyRef.current = false;
      if (mountedRef.current) void router.replace(noteHref(noteId), undefined, { shallow: true });
    });
    return queueRef.current;
  };

  const addFiles = async (files: File[]) => {
    const chosen = files.filter((file) => file.type.startsWith('image/'));
    if (trashed || chosen.length === 0) return;
    editedRef.current = true;
    try {
      await ensureCreated();
    } catch (error) {
      toast({ message: isQuotaError(error) ? 'Couldn’t save: storage is full.' : 'Couldn’t save your changes.' });
      return;
    }
    setPendingImages((n) => n + chosen.length);
    const failures = await addImages(noteId, chosen);
    setPendingImages((n) => n - chosen.length);
    for (const message of failureMessages(failures)) toast({ message });
  };

  const removeImage = async (image: Attachment) => {
    setViewerIndex(null);
    const removed = await removeAttachment(image.id);
    if (removed) {
      toast({ message: 'Image removed', actionLabel: 'Undo', onAction: () => void restoreAttachment(removed) });
    }
  };

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
      // A note the user emptied goes to Trash rather than lingering blank.
      if (
        !createdRef.current ||
        !editedRef.current ||
        trashed ||
        images.length > 0 ||
        !isNoteEmpty(draftRef.current)
      )
        return;
      await trashNote(noteId);
      toast({ message: 'Empty note moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(noteId) });
    });
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
    const duplicate = await duplicateNote(noteId);
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
        void addFiles([...e.dataTransfer.files]);
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
        {labelNames.length > 0 && (
          <ul className={styles.labels} aria-label='Labels'>
            {labelNames.map((name) => (
              <li key={name} className={styles.label}>
                {name}
              </li>
            ))}
          </ul>
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
