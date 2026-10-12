import React from "react";
import styles from "../styles/Note.module.css";
import { Trash2, Palette, Pin } from "lucide-react";

const textEllipsis = (text: string) => {
  let sliceLength: number = 200;
  if (text.length <= sliceLength) {
    return text;
  }
  return text.slice(0, sliceLength) + "...";
};

const Note = (props: any) => {
  const { note, handleDelete, index, handleEdit, handlePin } = props;

  const handleAction = (event: any) => {
    event.stopPropagation();
  };

  const handleDeleteNote = (e: any, index: number) => {
    e.stopPropagation();
    let confirmDelete = confirm(
      "This action cannot be undone. Are you sure you want to delete this note?"
    );
    if (confirmDelete) handleDelete(index);
  };

  const handlePinNote = (e: any, index: number) => {
    e.stopPropagation();
    handlePin(index);
  };

  return (
    <div key={"note-" + note.id} className={styles.noteWrapper}>
      <div className={styles.note} onClick={() => handleEdit(index)}>
        <div className={styles.title}>{note.title}</div>
        <div className={styles.container}>
          <textarea
            className={styles.content}
            value={textEllipsis(note.content)}
            readOnly
          ></textarea>
        </div>
        <div className={styles.actions}>
          <div
            className={styles.iconButton}
            onClick={(e: any) => handlePinNote(e, index)}
          >
            <Pin size={16} fill={note.pinned ? "currentColor" : "none"} />
          </div>
          {/* <div className={styles.iconButton} onClick={handleAction}>
            <Palette size={16} />
          </div> */}
          <div
            className={styles.iconButton}
            onClick={(e: any) => handleDeleteNote(e, index)}
          >
            <Trash2 size={16} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Note;
