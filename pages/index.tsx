import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { AnimatePresence, motion } from 'framer-motion';
import NoteCard from '../components/Note';
import Header from '../components/Header';
import NoteModal from '../components/NoteModal';
import NotFound from '../components/NotFound';
import { saveNotes, useNotes, type Note } from '../lib/notes';
import styles from '../styles/Home.module.css';
import noteStyles from '../styles/Note.module.css';

const Home: NextPage = () => {
  const notes = useNotes();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Hydrated: the real notes are rendered now, so stop force-hiding the
  // empty state (set in _document to avoid a flash before hydration).
  useEffect(() => {
    document.documentElement.removeAttribute('data-has-notes');
  }, []);

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
  };

  const openModal = () => {
    setOpen(true);
  };

  const handleSave = (note: Omit<Note, 'id'> & { id?: string }) => {
    const { id } = note;
    if (id && notes.some((n) => n.id === id)) {
      saveNotes(notes.map((n) => (n.id === id ? { ...n, ...note, id } : n)));
    } else {
      saveNotes([{ ...note, id: uuid() }, ...notes]);
    }
    closeModal();
  };

  const handleEdit = (id: string) => {
    setOpen(true);
    setEditingId(id);
  };

  const handleDelete = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id));
  };

  const handlePin = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    saveNotes([
      { ...note, pinned: !note.pinned },
      ...notes.filter((n) => n.id !== id),
    ]);
  };

  return (
    <div className={styles.rootContainer}>
      <Head>
        <title>Notes | Nine Technology</title>
        <meta name='description' content='Notes app by Nine Technology' />
      </Head>

      <Header handleModal={openModal} />

      <main className={styles.main}>
        {notes.length > 0 && (
          <div className={styles.notes}>
            <AnimatePresence initial={false}>
              {notes.map((note) => (
                <motion.div
                  key={note.id}
                  className={noteStyles.noteWrapper}
                  initial={{ opacity: 0, y: 30, scale: 0.3 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.5,
                    transition: { duration: 0.3 },
                  }}
                  transition={{
                    type: 'tween',
                  }}
                  layout
                >
                  <NoteCard
                    note={note}
                    handleEdit={handleEdit}
                    handlePin={handlePin}
                    handleDelete={handleDelete}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {notes.length === 0 && (
          <div className={styles.emptyState}>
            <NotFound text='Notes you add appear here' />
          </div>
        )}
      </main>
      {open && (
        <NoteModal
          note={notes.find((n) => n.id === editingId)}
          onClose={closeModal}
          handleSave={handleSave}
        />
      )}
    </div>
  );
};

export default Home;
