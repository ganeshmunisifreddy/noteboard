import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  EllipsisVertical,
  FileText,
  ListChecks,
  Palette,
  Pin,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import ColorPicker from '../ui/ColorPicker';
import IconButton from '../ui/IconButton';
import LabelPicker from '../ui/LabelPicker';
import Menu from '../ui/Menu';
import AddImageButton from './AddImageButton';
import type { Draft } from './NoteEditor';
import styles from './EditorToolbar.module.css';

type Props = {
  draft: Draft;
  trashed: boolean;
  onBack: () => void;
  onChange: (changes: Partial<Draft>) => void;
  onTogglePin: () => void;
  onSwitchKind: () => void;
  onArchive: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
  onAddImages: (files: File[]) => void;
  dateButton?: ReactNode;
  boardButton?: ReactNode;
};

const EditorToolbar = ({
  draft,
  trashed,
  onBack,
  onChange,
  onTogglePin,
  onSwitchKind,
  onArchive,
  onCopy,
  onDelete,
  onRestore,
  onDeleteForever,
  onAddImages,
  dateButton,
  boardButton,
}: Props) => (
  <header className={styles.bar}>
    <IconButton label='Back to notes' onClick={onBack}>
      <ArrowLeft size={20} aria-hidden />
    </IconButton>
    <div className={styles.actions}>
      {trashed ? (
        <>
          <button type='button' className={styles.textButton} onClick={onRestore}>
            <RotateCcw size={16} aria-hidden />
            Restore
          </button>
          <IconButton label='Delete forever' onClick={onDeleteForever}>
            <Trash2 size={18} aria-hidden />
          </IconButton>
        </>
      ) : (
        <>
          <AddImageButton onAdd={onAddImages} />
          {dateButton}
          {boardButton}
          <IconButton label={draft.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={draft.pinned} onClick={onTogglePin}>
            <Pin size={18} fill={draft.pinned ? 'currentColor' : 'none'} aria-hidden />
          </IconButton>
          <ColorPicker
            value={draft.color}
            onChange={(color) => onChange({ color })}
            trigger={
              <IconButton label='Change colour'>
                <Palette size={18} aria-hidden />
              </IconButton>
            }
          />
          <LabelPicker
            selectedIds={draft.labelIds}
            onChange={(labelIds) => onChange({ labelIds })}
            trigger={
              <IconButton label='Labels'>
                <Tag size={18} aria-hidden />
              </IconButton>
            }
          />
          <IconButton label={draft.kind === 'note' ? 'Convert to list' : 'Convert to note'} onClick={onSwitchKind}>
            {draft.kind === 'note' ? <ListChecks size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
          </IconButton>
          <IconButton label={draft.archived ? 'Unarchive' : 'Archive'} onClick={onArchive}>
            {draft.archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}
          </IconButton>
          <Menu
            items={[
              { label: 'Make a copy', icon: <Copy size={16} aria-hidden />, onSelect: onCopy },
              { label: 'Delete', icon: <Trash2 size={16} aria-hidden />, danger: true, onSelect: onDelete },
            ]}
            trigger={
              <IconButton label='More actions'>
                <EllipsisVertical size={18} aria-hidden />
              </IconButton>
            }
          />
        </>
      )}
    </div>
  </header>
);

export default EditorToolbar;
