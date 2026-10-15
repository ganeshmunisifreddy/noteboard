import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { BoardImages } from '../../lib/attachments';
import type { UpcomingSection } from '../../lib/due';
import type { Note } from '../../lib/types';
import NoteGrid from './NoteGrid';
import styles from './UpcomingView.module.css';

type Props = {
  sections: UpcomingSection<Note>[];
  labelNames: Map<string, string>;
  onOpen: (id: string) => void;
  images?: Map<string, BoardImages>;
};

// Dated notes by when they're due. Sorted by date, so no dragging here.
const UpcomingView = ({ sections, labelNames, onOpen, images }: Props) => {
  const [showDone, setShowDone] = useState(false);
  return (
    <>
      {sections.map(({ key, title, notes }) => {
        const headingId = `upcoming-${key}`;
        const grid = (
          <NoteGrid notes={notes} labelNames={labelNames} mode='board' onOpen={onOpen} reorderable={false} images={images} />
        );
        if (key === 'done') {
          return (
            <section key={key} className={styles.section} aria-labelledby={headingId}>
              <h2 id={headingId} className={styles.title}>
                <button
                  type='button'
                  className={styles.toggle}
                  aria-expanded={showDone}
                  onClick={() => setShowDone((open) => !open)}
                >
                  <ChevronRight size={16} aria-hidden className={styles.chevron} />
                  {`Done (${notes.length})`}
                </button>
              </h2>
              {showDone && grid}
            </section>
          );
        }
        return (
          <section key={key} className={styles.section} aria-labelledby={headingId}>
            <h2 id={headingId} className={styles.title} data-key={key}>
              {title}
            </h2>
            {grid}
          </section>
        );
      })}
    </>
  );
};

export default UpcomingView;
