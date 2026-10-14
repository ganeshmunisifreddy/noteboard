import { Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { createLabel, deleteLabel, renameLabel, useLabels } from '../../lib/notes';
import type { Label } from '../../lib/types';
import IconButton from './IconButton';
import styles from './LabelsDialog.module.css';

const LabelRow = ({ label }: { label: Label }) => {
  const [name, setName] = useState(label.name);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    if (name.trim() === label.name) return;
    try {
      await renameLabel(label.id, name);
      setError(null);
    } catch (err) {
      setName(label.name);
      setError((err as Error).message);
    }
  };

  const remove = () => {
    if (window.confirm(`Delete the label “${label.name}”? Notes keep their content.`)) {
      void deleteLabel(label.id);
    }
  };

  return (
    <li className={styles.row}>
      <input
        className={styles.input}
        value={name}
        aria-label={`Rename label ${label.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <IconButton label={`Delete label ${label.name}`} onClick={remove}>
        <Trash2 size={16} aria-hidden />
      </IconButton>
      {error && (
        <p role='alert' className={styles.error}>
          {error}
        </p>
      )}
    </li>
  );
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LabelsDialog = ({ open, onOpenChange }: Props) => {
  const labels = useLabels() ?? [];
  const [newName, setNewName] = useState('');

  const add = async () => {
    if (!newName.trim()) return;
    await createLabel(newName);
    setNewName('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Labels</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label='Close'>
                <X size={18} aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Rename or delete labels. Deleting a label keeps its notes.
          </Dialog.Description>
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              className={styles.input}
              value={newName}
              placeholder='New label'
              aria-label='New label name'
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type='submit' className={styles.add}>
              Add
            </button>
          </form>
          {labels.length === 0 ? (
            <p className={styles.description}>No labels yet.</p>
          ) : (
            <ul className={styles.list}>
              {labels.map((label) => (
                <LabelRow key={label.id} label={label} />
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default LabelsDialog;
