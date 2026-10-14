import { Archive, Check, EllipsisVertical, Tags, Trash2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { setTheme, useTheme, type ThemePref } from '../../lib/theme';
import IconButton from '../ui/IconButton';
import styles from '../ui/Menu.module.css';

type Props = {
  onArchive: () => void;
  onTrash: () => void;
  onManageLabels: () => void;
};

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Non-modal so "Manage labels" can open its dialog without the menu
// fighting it for focus.
const MoreMenu = ({ onArchive, onTrash, onManageLabels }: Props) => {
  const theme = useTheme();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label='More options'>
          <EllipsisVertical size={18} aria-hidden />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align='end' sideOffset={6}>
          <DropdownMenu.Item className={styles.item} onSelect={onArchive}>
            <Archive size={16} aria-hidden />
            Archive
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onTrash}>
            <Trash2 size={16} aria-hidden />
            Trash
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onManageLabels}>
            <Tags size={16} aria-hidden />
            Manage labels
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.label}>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemePref)}>
            {THEMES.map((option) => (
              <DropdownMenu.RadioItem key={option.value} value={option.value} className={styles.item}>
                {option.label}
                <DropdownMenu.ItemIndicator className={styles.indicator}>
                  <Check size={16} aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default MoreMenu;
