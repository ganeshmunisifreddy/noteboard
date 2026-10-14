import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { newItem, toggleItemIn } from '../../lib/checklist';
import type { ChecklistItem } from '../../lib/types';
import IconButton from '../ui/IconButton';
import styles from './ChecklistEditor.module.css';

type Props = {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
};

const ChecklistEditor = ({ items, onChange, readOnly = false, autoFocus = false }: Props) => {
  const [showDone, setShowDone] = useState(true);
  // Item to focus as soon as its input renders.
  const focusId = useRef<string | null>(null);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const focusWhenReady = (id: string) => (el: HTMLInputElement | null) => {
    if (el && focusId.current === id) {
      focusId.current = null;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  };

  const setText = (id: string, text: string) =>
    onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));

  const insertAfter = (id: string) => {
    const item = newItem();
    const index = items.findIndex((i) => i.id === id);
    focusId.current = item.id;
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
  };

  const remove = (item: ChecklistItem, focusPrevious: boolean) => {
    if (focusPrevious) {
      const section = item.done ? done : open;
      const index = section.findIndex((i) => i.id === item.id);
      focusId.current = index > 0 ? section[index - 1].id : null;
    }
    onChange(items.filter((i) => i.id !== item.id));
  };

  const onItemKeyDown = (item: ChecklistItem) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(item.id);
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      remove(item, true);
    }
  };

  const addFromRow = (text: string) => {
    if (!text) return;
    const item = newItem(text);
    focusId.current = item.id;
    onChange([...items, item]);
  };

  const row = (item: ChecklistItem) => {
    const name = item.text || 'item';
    return (
      <li key={item.id} className={item.done ? `${styles.row} ${styles.done}` : styles.row}>
        <input
          type='checkbox'
          checked={item.done}
          disabled={readOnly}
          aria-label={item.done ? `Mark “${name}” not done` : `Mark “${name}” done`}
          onChange={() => onChange(toggleItemIn(items, item.id))}
        />
        <input
          ref={focusWhenReady(item.id)}
          className={styles.text}
          value={item.text}
          readOnly={readOnly}
          aria-label='List item'
          onChange={(e) => setText(item.id, e.target.value)}
          onKeyDown={onItemKeyDown(item)}
        />
        {!readOnly && (
          <IconButton label='Remove item' className={styles.remove} onClick={() => remove(item, false)}>
            <X size={16} aria-hidden />
          </IconButton>
        )}
      </li>
    );
  };

  return (
    <div className={styles.root}>
      {open.length > 0 && <ul className={styles.list}>{open.map(row)}</ul>}
      {!readOnly && (
        <label className={styles.addRow}>
          <Plus size={18} aria-hidden />
          <input
            className={styles.text}
            value=''
            placeholder='List item'
            aria-label='Add list item'
            autoFocus={autoFocus}
            onChange={(e) => addFromRow(e.target.value)}
          />
        </label>
      )}
      {done.length > 0 && (
        <>
          <button
            type='button'
            className={styles.doneToggle}
            aria-expanded={showDone}
            onClick={() => setShowDone((shown) => !shown)}
          >
            {showDone ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            {done.length} completed
          </button>
          {showDone && <ul className={styles.list}>{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
};

export default ChecklistEditor;
