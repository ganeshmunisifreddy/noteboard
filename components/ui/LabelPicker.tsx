import { Plus } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState, type ReactElement } from 'react';
import { createLabel, useLabels } from '../../lib/notes';
import styles from './LabelPicker.module.css';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  trigger?: ReactElement;
  // Opened from elsewhere (a menu item): controlled, anchored to `anchor`.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor?: ReactElement;
};

const LabelPicker = ({ selectedIds, onChange, trigger, open, onOpenChange, anchor }: Props) => {
  const labels = useLabels() ?? [];
  const [text, setText] = useState('');
  const needle = text.trim().toLowerCase();
  const shown = labels.filter((l) => l.name.toLowerCase().includes(needle));
  const canCreate = needle !== '' && !labels.some((l) => l.name.toLowerCase() === needle);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const create = async () => {
    const label = await createLabel(text);
    if (!selectedIds.includes(label.id)) onChange([...selectedIds, label.id]);
    setText('');
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {anchor ? <Popover.Anchor asChild>{anchor}</Popover.Anchor> : <Popover.Trigger asChild>{trigger}</Popover.Trigger>}
      <Popover.Portal>
        <Popover.Content className={styles.content} sideOffset={6} aria-label='Labels'>
          <input
            className={styles.filter}
            value={text}
            placeholder='Enter label name'
            aria-label='Label name'
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) {
                e.preventDefault();
                void create();
              }
            }}
          />
          {shown.length > 0 && (
            <ul className={styles.list}>
              {shown.map((label) => (
                <li key={label.id}>
                  <label className={styles.option}>
                    <input
                      type='checkbox'
                      checked={selectedIds.includes(label.id)}
                      onChange={() => toggle(label.id)}
                    />
                    {label.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <button type='button' className={styles.create} onClick={() => void create()}>
              <Plus size={16} aria-hidden />
              Create “{text.trim()}”
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default LabelPicker;
