import { RadioGroup } from 'radix-ui';
import { viewTitle } from '../../lib/filters';
import type { BoardFilter, BoardView } from '../../lib/types';
import styles from './ViewHeader.module.css';

type Props = {
  filter: BoardFilter;
  labelName?: string;
  total: number;
  loaded?: boolean; // the count shows once the notes are in
  onView: (view: BoardView) => void;
  onEmptyTrash: () => void;
};

const KINDS: { view: BoardView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'notes', label: 'Text' },
  { view: 'lists', label: 'Lists' },
];

// The page's heading: the section's name, or the search and its count.
const ViewHeader = ({ filter, labelName, total, loaded = true, onView, onEmptyTrash }: Props) => {
  const query = filter.query.trim();
  const onNotes =
    !query && filter.labelId === null && (filter.view === 'all' || filter.view === 'notes' || filter.view === 'lists');
  return (
    <div className={styles.header}>
      <div className={styles.row}>
        <h1 className={styles.title}>{query ? `Results for “${query}”` : viewTitle(filter, labelName)}</h1>
        {/* Always there (empty when not searching), so each new count is announced. */}
        <p role='status' className={styles.count}>
          {query && loaded ? (total === 1 ? '1 note' : `${total} notes`) : ''}
        </p>
        {onNotes && (
          <RadioGroup.Root
            className={styles.switch}
            aria-label='Show'
            value={filter.view}
            onValueChange={(view) => onView(view as BoardView)}
            orientation='horizontal'
          >
            {KINDS.map(({ view, label }) => (
              <RadioGroup.Item key={view} value={view} className={styles.option}>
                {label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        )}
      </div>
      {filter.view === 'trash' && total > 0 && (
        <div className={styles.trash}>
          <p>Notes in Trash are deleted after 30 days.</p>
          <button type='button' className={styles.textButton} onClick={onEmptyTrash}>
            Empty trash
          </button>
        </div>
      )}
    </div>
  );
};

export default ViewHeader;
