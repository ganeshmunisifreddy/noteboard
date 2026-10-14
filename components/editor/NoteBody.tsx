import { useLayoutEffect, useRef } from 'react';
import styles from './NoteBody.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  autoFocus: boolean;
};

const NoteBody = ({ value, onChange, readOnly, autoFocus }: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text instead of scrolling inside the box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={styles.body}
      value={value}
      rows={6}
      placeholder='Note'
      aria-label='Note'
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

export default NoteBody;
