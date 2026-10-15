import { Dialog } from 'radix-ui';
import { useId, useState, type FormEvent } from 'react';
import { BOARD_NAME_MAX, BOARD_TEMPLATES, createBoard, type BoardTemplate } from '../../lib/boards';
import type { Board } from '../../lib/types';
import styles from './Dialog.module.css';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (board: Board) => void };

// Mounted each time it opens, so it starts empty.
const NewBoardForm = ({ onCreated, onCancel }: { onCreated: (board: Board) => void; onCancel: () => void }) => {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<BoardTemplate>('basic');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      onCreated(await createBoard(name, template));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={styles.form}>
      <label className={styles.field}>
        Name
        <input
          className={styles.input}
          value={name}
          maxLength={BOARD_NAME_MAX}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p id={`${id}-error`} role='alert' className={styles.error}>
          {error}
        </p>
      )}
      <fieldset className={styles.options}>
        <legend>Template</legend>
        {BOARD_TEMPLATES.map((t) => (
          <div key={t.id} className={styles.option}>
            <label className={styles.option}>
              <input
                type='radio'
                name={`${id}-template`}
                checked={template === t.id}
                aria-describedby={t.columns.length > 0 ? `${id}-${t.id}` : undefined}
                onChange={() => setTemplate(t.id)}
              />
              {t.label}
            </label>
            {t.columns.length > 0 && (
              <span id={`${id}-${t.id}`} className={styles.hint}>
                {t.columns.map((c) => c.name).join(' · ')}
              </span>
            )}
          </div>
        ))}
      </fieldset>
      <div className={styles.actions}>
        <button type='button' className={styles.button} onClick={onCancel}>
          Cancel
        </button>
        <button type='submit' className={`${styles.button} ${styles.primary}`}>
          Create
        </button>
      </div>
    </form>
  );
};

const NewBoardDialog = ({ open, onOpenChange, onCreated }: Props) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.content} aria-describedby={undefined}>
        <Dialog.Title className={styles.title}>New board</Dialog.Title>
        <NewBoardForm
          onCreated={(board) => {
            onOpenChange(false);
            onCreated(board);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export default NewBoardDialog;
