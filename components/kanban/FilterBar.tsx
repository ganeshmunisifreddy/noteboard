import { useEffect, useRef } from 'react';
import { DATE_FILTERS, EMPTY_FILTER, isFiltering, type CardFilter } from '../../lib/boardFilter';
import type { Label } from '../../lib/types';
import styles from './Board.module.css';

type Props = {
  id: string;
  filter: CardFilter;
  labels: Label[];
  onChange: (filter: CardFilter) => void;
  onClose: () => void; // Escape: clear and close
};

const FilterBar = ({ id, filter, labels, onChange, onClose }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const chip = (key: string, label: string, pressed: boolean, next: CardFilter) => (
    <button key={key} type='button' className={styles.chip} aria-pressed={pressed} onClick={() => onChange(next)}>
      {label}
    </button>
  );
  return (
    <div id={id} className={styles.filterBar} role='group' aria-label='Filter cards'>
      <input
        ref={input}
        type='search'
        className={styles.filterInput}
        placeholder='Filter cards'
        aria-label='Filter cards by text'
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div className={styles.chips}>
        {DATE_FILTERS.map(({ id: date, label }) =>
          chip(date, label, filter.date === date, { ...filter, date: filter.date === date ? null : date }),
        )}
        {labels.map((label) =>
          chip(label.id, label.name, filter.labelId === label.id, {
            ...filter,
            labelId: filter.labelId === label.id ? null : label.id,
          }),
        )}
      </div>
      {isFiltering(filter) && (
        <button type='button' className={styles.clear} onClick={() => onChange(EMPTY_FILTER)}>
          Clear
        </button>
      )}
    </div>
  );
};

export default FilterBar;
