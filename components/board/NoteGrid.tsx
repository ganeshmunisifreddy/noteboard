import { AnimatePresence, motion } from 'framer-motion';
import type { Note } from '../../lib/types';
import NoteCard, { type CardMode } from './NoteCard';
import styles from './NoteGrid.module.css';

type Props = {
  notes: Note[];
  labelNames: Map<string, string>;
  mode: CardMode;
  onOpen: (id: string) => void;
};

const NoteGrid = ({ notes, labelNames, mode, onOpen }: Props) => (
  <div className={styles.grid}>
    <AnimatePresence initial={false}>
      {notes.map((note) => (
        <motion.div
          key={note.id}
          className={styles.cell}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2 }}
        >
          <NoteCard
            note={note}
            mode={mode}
            onOpen={onOpen}
            labelNames={note.labelIds.map((id) => labelNames.get(id)).filter((name): name is string => !!name)}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

export default NoteGrid;
