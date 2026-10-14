import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import Modal from '../components/Modal';
import type { Note } from '../lib/notes';
import styles from '../styles/Note.module.css';

type EditableNote = Omit<Note, 'id'> & { id?: string };

type Props = {
  note?: Note;
  onClose: () => void;
  handleSave: (note: EditableNote) => void;
};

const defaultNote: EditableNote = {
  title: '',
  content: '',
  pinned: false,
};

const EditNote = (props: Props) => {
  const { onClose, note: eNote, handleSave } = props;
  // Mounted only while open, so the note being edited is known up front.
  const [note, setNote] = useState<EditableNote>(
    () => eNote || { ...defaultNote },
  );

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    type: 'title' | 'content',
  ) => {
    setNote({ ...note, [type]: e.target.value });
  };

  // const handleApply = () => {
  //   handleSave(note);
  // };

  const handleClose = () => {
    if (note.title.length || note.content.length) {
      handleSave(note);
    }
    onClose();
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Modal onClose={handleClose} label={eNote ? 'Edit note' : 'New note'}>
      <div className={styles.modalContainer}>
        <div className={styles.modalTitle}>
          <input
            className={styles.titleInput}
            placeholder='Title'
            aria-label='Title'
            value={note.title}
            onChange={(e) => handleChange(e, 'title')}
          />
        </div>
        <div className={styles.modalContent}>
          <textarea
            ref={inputRef}
            placeholder='Please enter your note...'
            aria-label='Note'
            className={styles.editArea}
            value={note.content}
            onChange={(e) => handleChange(e, 'content')}
          ></textarea>
        </div>
        {/* <div className={styles.modalActions}>
          <button
            onClick={onClose}
            className="button__primary"
            style={{ marginRight: 16 }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="button__primary"
            disabled={!note.content.length}
          >
            Save
          </button>
        </div> */}
      </div>
    </Modal>
  );
};

export default EditNote;
