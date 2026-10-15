import { useEffect, useRef, useState } from 'react';
import styles from './Board.module.css';

type Props = {
  label: string; // e.g. "Column name"
  initial: string;
  maxLength: number;
  onSave: (name: string) => void;
  onCancel: () => void;
};

// Enter or leaving the field saves; Esc cancels. An empty name cancels.
const InlineName = ({ label, initial, maxLength, onSave, onCancel }: Props) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Opened from a menu: focus again once the menu has closed (it holds focus
  // until then). On a phone the field may be off to the side (a new column).
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const finish = () => (value.trim() ? onSave(value) : onCancel());
  return (
    <input
      ref={ref}
      className={styles.nameInput}
      aria-label={label}
      value={value}
      maxLength={maxLength}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    />
  );
};

export default InlineName;
