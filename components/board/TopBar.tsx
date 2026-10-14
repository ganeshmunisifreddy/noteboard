import { ListTodo, Plus, Search, StickyNote } from 'lucide-react';
import { SEARCH_INPUT_ID } from '../../lib/shortcuts';
import type { NoteKind } from '../../lib/types';
import Menu, { type MenuItem } from '../ui/Menu';
import styles from './TopBar.module.css';

type Props = {
  initialQuery: string;
  searchKey: string; // remounts the input once the URL is known
  onQueryChange: (query: string) => void;
  onNew: (kind: NoteKind) => void;
};

const TopBar = ({ initialQuery, searchKey, onQueryChange, onNew }: Props) => {
  const newItems: MenuItem[] = [
    { label: 'Note', icon: <StickyNote size={16} aria-hidden />, onSelect: () => onNew('note') },
    { label: 'List', icon: <ListTodo size={16} aria-hidden />, onSelect: () => onNew('list') },
  ];

  return (
    <header className={styles.bar}>
      <span className={styles.logo}>Noteboard</span>
      <label className={styles.search}>
        <Search size={16} aria-hidden />
        <input
          key={searchKey}
          id={SEARCH_INPUT_ID}
          type='search'
          placeholder='Search notes'
          aria-label='Search notes'
          defaultValue={initialQuery}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <Menu
        items={newItems}
        trigger={
          <button type='button' className={styles.newButton}>
            <Plus size={16} aria-hidden />
            New
          </button>
        }
      />
      <Menu
        items={newItems}
        trigger={
          <button type='button' className={styles.fab} aria-label='New note or list'>
            <Plus size={24} aria-hidden />
          </button>
        }
      />
    </header>
  );
};

export default TopBar;
