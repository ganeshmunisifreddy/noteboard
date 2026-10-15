import { Archive, Bell, Search, StickyNote, Tag, Trash2 } from 'lucide-react';
import type { BoardFilter } from '../../lib/types';
import styles from './EmptyState.module.css';

const ICON = { size: 64, strokeWidth: 1.25, 'aria-hidden': true } as const;

const iconFor = (filter: BoardFilter) => {
  if (filter.query.trim()) return <Search {...ICON} />;
  if (filter.view === 'archive') return <Archive {...ICON} />;
  if (filter.view === 'trash') return <Trash2 {...ICON} />;
  if (filter.view === 'upcoming') return <Bell {...ICON} />;
  if (filter.labelId) return <Tag {...ICON} />;
  return <StickyNote {...ICON} />;
};

// A small icon in the theme's colours and one line of text.
const EmptyState = ({ filter, text }: { filter: BoardFilter; text: string }) => (
  <div className={styles.empty}>
    {iconFor(filter)}
    <p>{text}</p>
  </div>
);

export default EmptyState;
