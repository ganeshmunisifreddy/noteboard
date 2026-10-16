import { Check } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ReactElement } from 'react';
import { useBoardColumns } from '../../lib/boards';
import menuStyles from '../ui/Menu.module.css';
import styles from './BoardPicker.module.css';

type Props = {
  columnId: string | null;
  trigger: ReactElement;
  onPick: (columnId: string) => void;
  onRemove: () => void;
};

// Boards, each with its columns (the current one checked), and Remove from board.
const BoardMenu = ({ columnId, trigger, onPick, onRemove }: Props) => {
  const boards = useBoardColumns() ?? [];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuStyles.content} align='end' sideOffset={6}>
          {boards.length === 0 && (
            <DropdownMenu.Item className={menuStyles.item} disabled>
              No boards yet
            </DropdownMenu.Item>
          )}
          {boards.map(({ board, columns }) => (
            <DropdownMenu.Sub key={board.id}>
              <DropdownMenu.SubTrigger className={menuStyles.item} disabled={columns.length === 0}>
                {board.name}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={menuStyles.content} sideOffset={4}>
                  <DropdownMenu.RadioGroup value={columnId ?? ''} onValueChange={onPick}>
                    {columns.map((column) => (
                      <DropdownMenu.RadioItem key={column.id} value={column.id} className={menuStyles.item}>
                        {column.name}
                        <DropdownMenu.ItemIndicator className={styles.check}>
                          <Check size={16} aria-hidden />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ))}
          {columnId && (
            <DropdownMenu.Item className={menuStyles.item} onSelect={onRemove}>
              Remove from board
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default BoardMenu;
