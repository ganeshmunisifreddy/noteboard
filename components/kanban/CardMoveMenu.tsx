import { EllipsisVertical } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { CardMove } from '../../lib/cards';
import IconButton from '../ui/IconButton';
import menuStyles from '../ui/Menu.module.css';

type Props = {
  title: string;
  buttonId: string; // data-card-move, so focus can return after the card moves
  columns: { id: string; name: string }[]; // the other columns
  canMove: (move: CardMove) => boolean;
  onMove: (move: CardMove) => void;
  onMoveTo: (columnId: string) => void;
};

const MOVES: { move: CardMove; label: string }[] = [
  { move: 'up', label: 'Move up' },
  { move: 'down', label: 'Move down' },
  { move: 'top', label: 'Move to top' },
  { move: 'bottom', label: 'Move to bottom' },
];

// The way to move a card without dragging (WCAG 2.5.7). When it closes,
// focus goes back to this card's Move button wherever the card now is (the
// button may have moved within the column or into another one).
const CardMoveMenu = ({ title, buttonId, columns, canMove, onMove, onMoveTo }: Props) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <IconButton label={`Move ${title}`} data-card-move={buttonId}>
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
          requestAnimationFrame(() =>
            document.querySelector<HTMLElement>(`[data-card-move="${CSS.escape(buttonId)}"]`)?.focus(),
          );
        }}
      >
        {columns.map((column) => (
          <DropdownMenu.Item key={column.id} className={menuStyles.item} onSelect={() => onMoveTo(column.id)}>
            {`Move to ${column.name}`}
          </DropdownMenu.Item>
        ))}
        {MOVES.filter(({ move }) => canMove(move)).map(({ move, label }) => (
          <DropdownMenu.Item key={move} className={menuStyles.item} onSelect={() => onMove(move)}>
            {label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export default CardMoveMenu;
