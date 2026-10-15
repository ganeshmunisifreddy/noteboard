import { Check, ChevronRight, EllipsisVertical } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, useState, type ReactNode } from 'react';
import type { CardMove } from '../../lib/cards';
import {
  COLOR_NAMES,
  NOTE_COLORS,
  type Board,
  type Column,
  type Label,
  type Note,
  type NoteColor,
  type Repeat,
} from '../../lib/types';
import DatePopover from '../editor/DatePopover';
import IconButton from '../ui/IconButton';
import menuStyles from '../ui/Menu.module.css';
import styles from './Board.module.css';

type Props = {
  note: Note;
  labels: Label[];
  columns: { id: string; name: string }[]; // the other columns on this board
  boards: { board: Board; columns: Column[] }[]; // the other boards
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canMove: (move: CardMove) => boolean;
  onMove: (move: CardMove) => void;
  onMoveTo: (columnId: string) => void;
  onMoveToBoard: (columnId: string) => void;
  onColor: (color: NoteColor) => void;
  onToggleLabel: (labelId: string) => void;
  onSaveDate: (date: string, time: string | null, repeat: Repeat | null) => void;
  onRemoveDate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCloseFocus: () => void; // where focus goes after the menu or date picker closes
};

const MOVES: { move: CardMove; label: string }[] = [
  { move: 'up', label: 'Move up' },
  { move: 'down', label: 'Move down' },
  { move: 'top', label: 'Move to top' },
  { move: 'bottom', label: 'Move to bottom' },
];

const Sub = ({ label, children }: { label: string; children: ReactNode }) => (
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger className={menuStyles.item}>
      {label}
      <ChevronRight size={16} className={menuStyles.indicator} aria-hidden />
    </DropdownMenu.SubTrigger>
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent className={menuStyles.content} sideOffset={4}>
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  </DropdownMenu.Sub>
);

const Tick = () => (
  <DropdownMenu.ItemIndicator className={menuStyles.indicator}>
    <Check size={16} aria-hidden />
  </DropdownMenu.ItemIndicator>
);

// Everything a card can do without being opened. Moving is also the way to
// move a card without dragging (WCAG 2.5.7).
const CardMenu = (props: Props) => {
  const { note, labels, columns, boards, open, onOpenChange, canMove, onCloseFocus } = props;
  const title = note.title || 'Untitled';
  const [dateOpen, setDateOpen] = useState(false);
  const openingDate = useRef(false);
  const moves = MOVES.filter(({ move }) => canMove(move));
  const dropdown = (
    <span className={styles.menuAnchor}>
      <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Trigger asChild>
          <IconButton label={`Card actions for ${title}`} data-card-move={note.id}>
            <EllipsisVertical size={16} aria-hidden />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={menuStyles.content}
            align='end'
            sideOffset={6}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (openingDate.current) {
                openingDate.current = false;
                return;
              }
              requestAnimationFrame(onCloseFocus);
            }}
          >
            <Sub label='Colour'>
              <DropdownMenu.RadioGroup value={note.color} onValueChange={(c) => props.onColor(c as NoteColor)}>
                {NOTE_COLORS.map((color) => (
                  <DropdownMenu.RadioItem key={color} value={color} className={menuStyles.item}>
                    <span className={styles.swatch} data-color={color} aria-hidden />
                    {COLOR_NAMES[color]}
                    <Tick />
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </Sub>
            <Sub label='Labels'>
              {labels.length === 0 && (
                <DropdownMenu.Item className={menuStyles.item} disabled>
                  No labels yet
                </DropdownMenu.Item>
              )}
              {labels.map((label) => (
                <DropdownMenu.CheckboxItem
                  key={label.id}
                  className={menuStyles.item}
                  checked={note.labelIds.includes(label.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => props.onToggleLabel(label.id)}
                >
                  {label.name}
                  <Tick />
                </DropdownMenu.CheckboxItem>
              ))}
            </Sub>
            <DropdownMenu.Item
              className={menuStyles.item}
              onSelect={() => {
                openingDate.current = true;
                requestAnimationFrame(() => setDateOpen(true));
              }}
            >
              Date…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menuStyles.separator} />
            {(moves.length > 0 || columns.length > 0) && (
              <Sub label='Move'>
                {moves.map(({ move, label }) => (
                  <DropdownMenu.Item key={move} className={menuStyles.item} onSelect={() => props.onMove(move)}>
                    {label}
                  </DropdownMenu.Item>
                ))}
                {columns.map((column) => (
                  <DropdownMenu.Item key={column.id} className={menuStyles.item} onSelect={() => props.onMoveTo(column.id)}>
                    {`Move to ${column.name}`}
                  </DropdownMenu.Item>
                ))}
              </Sub>
            )}
            {boards.length > 0 && (
              <Sub label='Move to board'>
                {boards.map(({ board, columns: boardColumns }) =>
                  boardColumns.length === 0 ? (
                    <DropdownMenu.Item key={board.id} className={menuStyles.item} disabled>
                      {board.name}
                    </DropdownMenu.Item>
                  ) : (
                    <Sub key={board.id} label={board.name}>
                      {boardColumns.map((column) => (
                        <DropdownMenu.Item
                          key={column.id}
                          className={menuStyles.item}
                          onSelect={() => props.onMoveToBoard(column.id)}
                        >
                          {column.name}
                        </DropdownMenu.Item>
                      ))}
                    </Sub>
                  ),
                )}
              </Sub>
            )}
            <DropdownMenu.Separator className={menuStyles.separator} />
            <DropdownMenu.Item className={menuStyles.item} onSelect={props.onArchive}>
              Archive
            </DropdownMenu.Item>
            <DropdownMenu.Item className={`${menuStyles.item} ${menuStyles.danger}`} onSelect={props.onDelete}>
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  );
  return (
    <DatePopover
      due={note.due}
      open={dateOpen}
      onOpenChange={setDateOpen}
      onSave={props.onSaveDate}
      onRemove={props.onRemoveDate}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onCloseFocus();
      }}
      anchor={dropdown}
    />
  );
};

export default CardMenu;
