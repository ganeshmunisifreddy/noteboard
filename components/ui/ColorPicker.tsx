import { Check } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { ReactElement } from 'react';
import { COLOR_NAMES, NOTE_COLORS, type NoteColor } from '../../lib/types';
import styles from './ColorPicker.module.css';

type Props = {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  trigger: ReactElement;
};

const ColorPicker = ({ value, onChange, trigger }: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className={styles.content} sideOffset={6} aria-label='Note colour'>
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            type='button'
            data-color={color}
            className={styles.swatch}
            aria-label={COLOR_NAMES[color]}
            title={COLOR_NAMES[color]}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
          >
            {color === value && <Check size={16} aria-hidden />}
          </button>
        ))}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default ColorPicker;
