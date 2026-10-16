import { Archive, Bell, Pencil, SquareKanban, StickyNote, Tag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { upcomingSections } from '../../lib/due';
import { filterToQuery, parseFilter, sectionOf } from '../../lib/filters';
import { useBoardNotes, useLabels } from '../../lib/notes';
import { useNow } from '../../lib/time';
import type { BoardFilter } from '../../lib/types';
import styles from './Sidebar.module.css';

type Props = {
  variant: 'side' | 'drawer';
  onNavigate?: () => void;
  onEditLabels: () => void;
};

const UPCOMING_FILTER: BoardFilter = { view: 'upcoming', labelId: null, query: '' };

// Every section, the labels, Archive and Trash. Links keep the current search.
const Sidebar = ({ variant, onNavigate, onEditLabels }: Props) => {
  const router = useRouter();
  const filter = parseFilter(router.query);
  const current = sectionOf(filter);
  const labels = [...(useLabels() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const now = useNow();
  const upcoming = useBoardNotes(UPCOMING_FILTER);
  const due = upcoming
    ? upcomingSections(upcoming.others, now)
        .filter((section) => section.key === 'overdue' || section.key === 'today')
        .reduce((count, section) => count + section.notes.length, 0)
    : 0;

  const href = (next: Pick<BoardFilter, 'view' | 'labelId'>) => {
    const query = new URLSearchParams(filterToQuery({ ...next, query: filter.query })).toString();
    return query ? `/?${query}` : '/';
  };

  const item = (key: string, to: string, icon: ReactNode, name: string, badge = 0) => (
    <li key={key}>
      <Link
        href={to}
        shallow
        className={styles.item}
        aria-current={current === key ? 'page' : undefined}
        aria-label={badge > 0 ? `${name}, ${badge} due` : undefined}
        title={name}
        onClick={onNavigate}
      >
        {icon}
        <span className={styles.text}>{name}</span>
        {badge > 0 && (
          <span className={styles.badge} aria-hidden>
            {badge}
          </span>
        )}
      </Link>
    </li>
  );

  return (
    <nav className={styles.nav} data-variant={variant} aria-label='Sections'>
      <ul className={styles.list}>
        {item('notes', href({ view: 'all', labelId: null }), <StickyNote size={20} aria-hidden />, 'Notes')}
        {item('upcoming', href({ view: 'upcoming', labelId: null }), <Bell size={20} aria-hidden />, 'Upcoming', due)}
        {item('boards', href({ view: 'boards', labelId: null }), <SquareKanban size={20} aria-hidden />, 'Boards')}
      </ul>
      <h2 className={styles.heading}>Labels</h2>
      <ul className={styles.list}>
        {labels.map((label) =>
          item(`label:${label.id}`, href({ view: 'all', labelId: label.id }), <Tag size={20} aria-hidden />, label.name),
        )}
        <li>
          <button type='button' className={styles.item} title='Edit labels' onClick={onEditLabels}>
            <Pencil size={20} aria-hidden />
            <span className={styles.text}>Edit labels</span>
          </button>
        </li>
      </ul>
      <ul className={`${styles.list} ${styles.end}`}>
        {item('archive', href({ view: 'archive', labelId: null }), <Archive size={20} aria-hidden />, 'Archive')}
        {item('trash', href({ view: 'trash', labelId: null }), <Trash2 size={20} aria-hidden />, 'Trash')}
      </ul>
    </nav>
  );
};

export default Sidebar;
