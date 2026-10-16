import { Archive, ArchiveRestore, EllipsisVertical, Palette, Pin, RotateCcw, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  deleteForever,
  restoreNote,
  restoreSnapshot,
  setArchived,
  toggleItem,
  togglePin,
  trashNote,
  undoTrash,
  updateNote,
} from '../../lib/notes';
import { toggleTask } from '../../lib/tasks';
import type { Attachment, Note } from '../../lib/types';
import ColorPicker from '../ui/ColorPicker';
import IconButton from '../ui/IconButton';
import Menu from '../ui/Menu';
import { useToast } from '../ui/Toast';
import CardDue from './CardDue';
import CardImages from './CardImages';
import Highlight from './Highlight';
import MarkdownPreview from './MarkdownPreview';
import styles from './NoteCard.module.css';

export type CardMode = 'board' | 'archive' | 'trash';

type Props = {
  note: Note;
  labelNames: string[];
  mode: CardMode;
  onOpen: (id: string) => void;
  dragHandle?: ReactNode;
  images?: Attachment[];
  imageCount?: number; // all of the note's images; `images` may be only the first few
  place?: string; // "Board · Column" for a board note shown outside its board
  highlight?: string; // the search, marked in the title and text
};

const PREVIEW_ITEMS = 8;

const NoteCard = ({
  note,
  labelNames,
  mode,
  onOpen,
  dragHandle,
  images = [],
  imageCount = images.length,
  place,
  highlight,
}: Props) => {
  const toast = useToast();
  const id = useId();
  // Open items first, then ticked ones (ticked and crossed out), as in the editor.
  const items = [...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)];
  const isEmpty =
    imageCount === 0 && !note.title && (note.kind === 'note' ? !note.content : note.items.length === 0);
  const showContent = note.kind === 'note' && !!note.content;
  const showItems = note.kind === 'list' && items.length > 0;
  // The open button is named by the title; the preview describes it.
  const describedBy = [
    imageCount > 0 && `${id}-images`,
    showContent && `${id}-content`,
    showItems && `${id}-items`,
    labelNames.length > 0 && `${id}-labels`,
    place && `${id}-place`,
    note.due && `${id}-due`,
  ]
    .filter(Boolean)
    .join(' ');

  const archive = async () => {
    await setArchived(note.id, true);
    toast({ message: 'Note archived', actionLabel: 'Undo', onAction: () => void restoreSnapshot(note) });
  };

  const trash = async () => {
    await trashNote(note.id);
    toast({ message: 'Moved to trash', actionLabel: 'Undo', onAction: () => void undoTrash(note.id) });
  };

  const removeForever = () => {
    if (window.confirm('Delete this note forever? This can’t be undone.')) void deleteForever(note.id);
  };

  return (
    <article
      className={styles.card}
      data-color={note.color}
      // Images and nothing else: they reach the card's edges.
      data-only-images={
        imageCount > 0 && !note.title && !showContent && !showItems && labelNames.length === 0 && !place && !note.due
          ? 'true'
          : undefined
      }
    >
      {/* Covers the card so a click anywhere opens it; checkboxes and
          actions sit above it and don't bubble into it. */}
      <button
        type='button'
        className={styles.open}
        aria-label={`Open note: ${note.title || 'Untitled'}`}
        aria-describedby={describedBy || undefined}
        onClick={() => onOpen(note.id)}
      />
      {imageCount > 0 && (
        <>
          <CardImages images={images} total={imageCount} />
          <span id={`${id}-images`} className={styles.srOnly}>
            {imageCount === 1 ? '1 image' : `${imageCount} images`}
          </span>
        </>
      )}
      {note.title && (
        <h3 className={styles.title}>
          <Highlight text={note.title} query={highlight} />
        </h3>
      )}
      {showContent && (
        <MarkdownPreview
          id={`${id}-content`}
          className={styles.content}
          markdown={note.content}
          clamp
          highlight={highlight}
          onToggleTask={
            mode === 'trash'
              ? undefined
              : (index) => void updateNote(note.id, { content: toggleTask(note.content, index) })
          }
        />
      )}
      {showItems && (
        <ul id={`${id}-items`} className={styles.items}>
          {items.slice(0, PREVIEW_ITEMS).map((item) => (
            <li key={item.id} className={styles.item} data-checked={item.done ? 'true' : undefined}>
              <input
                type='checkbox'
                checked={item.done}
                disabled={mode === 'trash'}
                aria-label={`Mark “${item.text || 'item'}” ${item.done ? 'not done' : 'done'}`}
                onChange={() => void toggleItem(note.id, item.id)}
              />
              <span>
                <Highlight text={item.text} query={highlight} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.length > PREVIEW_ITEMS && <p className={styles.more}>+{items.length - PREVIEW_ITEMS} more</p>}
      {isEmpty && <p className={styles.more}>Empty note</p>}
      {labelNames.length > 0 && (
        <ul id={`${id}-labels`} className={styles.labels} aria-label='Labels'>
          {labelNames.map((name) => (
            <li key={name} className={styles.label}>
              {name}
            </li>
          ))}
        </ul>
      )}
      {place && (
        <p id={`${id}-place`} className={styles.place}>
          {place}
        </p>
      )}
      {note.due && <CardDue due={note.due} id={`${id}-due`} />}
      <div className={styles.actions}>
        {dragHandle}
        {mode === 'trash' ? (
          <>
            <IconButton label='Restore' onClick={() => void restoreNote(note.id)}>
              <RotateCcw size={16} aria-hidden />
            </IconButton>
            <IconButton label='Delete forever' onClick={removeForever}>
              <Trash2 size={16} aria-hidden />
            </IconButton>
          </>
        ) : (
          <>
            {mode === 'board' && (
              <IconButton
                label={note.pinned ? 'Unpin note' : 'Pin note'}
                aria-pressed={note.pinned}
                onClick={() => void togglePin(note.id)}
              >
                <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} aria-hidden />
              </IconButton>
            )}
            <ColorPicker
              value={note.color}
              onChange={(color) => void updateNote(note.id, { color })}
              trigger={
                <IconButton label='Change colour'>
                  <Palette size={16} aria-hidden />
                </IconButton>
              }
            />
            {mode === 'archive' ? (
              <IconButton label='Unarchive' onClick={() => void setArchived(note.id, false)}>
                <ArchiveRestore size={16} aria-hidden />
              </IconButton>
            ) : (
              <IconButton label='Archive' onClick={() => void archive()}>
                <Archive size={16} aria-hidden />
              </IconButton>
            )}
            <Menu
              items={[
                {
                  label: 'Delete',
                  icon: <Trash2 size={16} aria-hidden />,
                  danger: true,
                  onSelect: () => void trash(),
                },
              ]}
              trigger={
                <IconButton label='More actions'>
                  <EllipsisVertical size={16} aria-hidden />
                </IconButton>
              }
            />
          </>
        )}
      </div>
    </article>
  );
};

export default NoteCard;
