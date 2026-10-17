import { Download, EllipsisVertical, FileText, MonitorSmartphone, Upload } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { setTheme, useTheme } from '../../lib/theme';
import IconButton from '../ui/IconButton';
import styles from '../ui/Menu.module.css';

type Props = {
  onBackup: () => void;
  onRestore: () => void;
  onExport: () => void;
};

// Backup and export; the sections (Archive, Trash, labels) are in the sidebar.
// Non-modal, so Restore's file picker doesn't fight the menu for focus.
const MoreMenu = ({ onBackup, onRestore, onExport }: Props) => {
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
          <DropdownMenu.Label className={styles.label}>Backup</DropdownMenu.Label>
          <DropdownMenu.Item className={styles.item} onSelect={onBackup}>
            <Download size={16} aria-hidden />
            Back up notes
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onRestore}>
            <Upload size={16} aria-hidden />
            Restore from backup…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onExport}>
            <FileText size={16} aria-hidden />
            Export as Markdown
          </DropdownMenu.Item>
          {/* The header's sun/moon button picks a theme; this goes back to
              following the device. */}
          {theme !== 'system' && (
            <>
              <DropdownMenu.Separator className={styles.separator} />
              <DropdownMenu.Item className={styles.item} onSelect={() => setTheme('system')}>
                <MonitorSmartphone size={16} aria-hidden />
                Use device theme
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default MoreMenu;
