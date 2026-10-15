import { Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardFilter, BoardView, Label } from '../../lib/types';
import styles from './FilterChips.module.css';

type Selection = Pick<BoardFilter, 'view' | 'labelId'>;

type Props = {
  filter: BoardFilter;
  labels: Label[];
  onSelect: (next: Selection) => void;
};

const FilterChips = ({ filter, labels, onSelect }: Props) => {
  const isView = (view: BoardView) => filter.view === view && filter.labelId === null;

  const chip = (key: string, content: ReactNode, active: boolean, next: Selection) => (
    <button key={key} type='button' className={styles.chip} aria-pressed={active} onClick={() => onSelect(next)}>
      {content}
    </button>
  );

  return (
    <nav className={styles.bar} aria-label='Filters'>
      <div className={styles.chips}>
        {chip('all', 'All', isView('all'), { view: 'all', labelId: null })}
        {chip('notes', 'Notes', isView('notes'), { view: 'notes', labelId: null })}
        {chip('lists', 'Lists', isView('lists'), { view: 'lists', labelId: null })}
        {chip('upcoming', 'Upcoming', isView('upcoming'), { view: 'upcoming', labelId: null })}
        {filter.view !== 'upcoming' &&
          labels.map((label) =>
            chip(
              label.id,
              <>
                <Tag size={14} aria-hidden />
                {label.name}
              </>,
              filter.labelId === label.id,
              { view: 'all', labelId: label.id },
            ),
          )}
        {filter.view === 'archive' && chip('archive', 'Archive', true, { view: 'archive', labelId: null })}
        {filter.view === 'trash' && chip('trash', 'Trash', true, { view: 'trash', labelId: null })}
      </div>
    </nav>
  );
};

export default FilterChips;
