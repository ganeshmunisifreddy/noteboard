import { AlertDialog } from 'radix-ui';
import styles from './Dialog.module.css';

type Props = {
  open: boolean;
  name: string;
  notes: number;
  onOpenChange: (open: boolean) => void;
  onDelete: (notesTo: 'keep' | 'trash') => void;
};

const DeleteBoardDialog = ({ open, name, notes, onOpenChange, onDelete }: Props) => (
  <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className={styles.overlay} />
      <AlertDialog.Content className={styles.content}>
        <AlertDialog.Title className={styles.title}>{`Delete “${name}”?`}</AlertDialog.Title>
        <AlertDialog.Description className={styles.description}>
          <span>{`It has ${notes} ${notes === 1 ? 'note' : 'notes'}.`}</span> Keeping them puts them back on your main
          board.
        </AlertDialog.Description>
        <div className={styles.actions}>
          <AlertDialog.Cancel className={styles.button}>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action className={styles.button} onClick={() => onDelete('keep')}>
            Keep the notes
          </AlertDialog.Action>
          <AlertDialog.Action className={`${styles.button} ${styles.danger}`} onClick={() => onDelete('trash')}>
            Move notes to Trash
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);

export default DeleteBoardDialog;
