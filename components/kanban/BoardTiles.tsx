import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useBoardSummaries } from '../../lib/boards';
import { boardHref } from '../../lib/routes';
import styles from './BoardTiles.module.css';
import NewBoardDialog from './NewBoardDialog';

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

const BoardTiles = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const summaries = useBoardSummaries();
  const [creating, setCreating] = useState(false);
  if (!summaries) return null;
  return (
    <>
      {summaries.length === 0 && (
        <p className={styles.empty}>No boards yet. Create one to organise notes into columns.</p>
      )}
      <ul className={styles.tiles} aria-label='Boards'>
        {summaries.map(({ board, columns, total }) => (
          <li key={board.id}>
            <Link href={boardHref(board.id)} className={styles.tile}>
              <span className={styles.name}>{board.name}</span>
              <span className={styles.meta}>
                {plural(columns.length, 'column')} · {plural(total, 'card')}
              </span>
              <span className={styles.bars} aria-hidden>
                {columns.map((c) => (
                  <span key={c.id} className={styles.bar}>
                    <span className={styles.fill} style={{ height: `${total ? (c.count / total) * 100 : 0}%` }} />
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <button type='button' className={`${styles.tile} ${styles.new}`} onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden />
            New board
          </button>
        </li>
      </ul>
      <NewBoardDialog open={creating} onOpenChange={setCreating} onCreated={(board) => onOpen(board.id)} />
    </>
  );
};

export default BoardTiles;
