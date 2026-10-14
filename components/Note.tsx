import type { KeyboardEvent, MouseEvent } from 'react';
import styles from '../styles/Note.module.css';
import { Trash2, Pin } from 'lucide-react';
import type { Note } from '../lib/notes';

type Props = {
  note: Note;
  handleEdit: (id: string) => void;
  handlePin: (id: string) => void;
  handleDelete: (id: string) => void;
};

const textEllipsis = (text: string) => {
  let sliceLength: number = 200;
  if (text.length <= sliceLength) {
    return text;
  }
  return text.slice(0, sliceLength) + '...';
};

const NoteCard = (props: Props) => {
  const { note, handleDelete, handleEdit, handlePin } = props;

  const handleDeleteNote = (e: MouseEvent) => {
    e.stopPropagation();
    let confirmDelete = confirm(
      'This action cannot be undone. Are you sure you want to delete this note?',
    );
    if (confirmDelete) handleDelete(note.id);
  };

  const handlePinNote = (e: MouseEvent) => {
    e.stopPropagation();
    handlePin(note.id);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore keys pressed on the pin/delete buttons inside the card.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleEdit(note.id);
    }
  };

  return (
    <div
      className={styles.note}
      onClick={() => handleEdit(note.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className={styles.title}>{note.title}</div>
      <div className={styles.container}>
        <textarea
          className={styles.content}
          value={textEllipsis(note.content ?? '')}
          tabIndex={-1}
          readOnly
        ></textarea>
      </div>
      <div className={styles.actions}>
        <button
          type='button'
          className={styles.iconButton}
          onClick={handlePinNote}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          aria-pressed={!!note.pinned}
        >
          <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} />
        </button>
        {/* <button type='button' className={styles.iconButton} aria-label='Change color'>
          <Palette size={16} />
        </button> */}
        <button
          type='button'
          className={styles.iconButton}
          onClick={handleDeleteNote}
          aria-label='Delete note'
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default NoteCard;
