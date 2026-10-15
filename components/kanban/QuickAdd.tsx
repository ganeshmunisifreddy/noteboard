import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from '../ui/IconButton';
import styles from './Board.module.css';

type Props = {
  columnName: string;
  onAdd: (title: string) => void;
  onOpenEditor: (title: string) => void;
  onClose: (refocus: boolean) => void; // refocus: back to the column's Add card button
};

// Type a title, press Enter, keep typing. Escape or ✕ closes; clicking away closes too.
const QuickAdd = ({ columnName, onAdd, onOpenEditor, onClose }: Props) => {
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const add = () => {
    if (title.trim()) onAdd(title);
    setTitle('');
    input.current?.focus();
  };

  return (
    <div
      className={styles.quickAdd}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(false);
      }}
    >
      <input
        ref={input}
        type='text'
        className={styles.quickInput}
        aria-label={`Card title for ${columnName}`}
        placeholder='Card title'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose(true);
          }
        }}
      />
      <div className={styles.quickActions}>
        <button type='button' className={styles.primary} onClick={add}>
          Add
        </button>
        <IconButton
          label='Open in editor'
          onClick={() => {
            onOpenEditor(title);
            onClose(false);
          }}
        >
          <Maximize2 size={16} aria-hidden />
        </IconButton>
        <IconButton label='Close' onClick={() => onClose(true)}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
};

export default QuickAdd;
