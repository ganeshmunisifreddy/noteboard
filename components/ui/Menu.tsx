import { DropdownMenu } from 'radix-ui';
import { useRef, type ReactElement, type ReactNode } from 'react';
import styles from './Menu.module.css';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  keepFocus?: boolean; // the item moves focus itself (e.g. opens a name field)
};

type Props = {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
};

const Menu = ({ trigger, items, align = 'end' }: Props) => {
  const keepFocus = useRef(false);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.content}
          align={align}
          sideOffset={6}
          onCloseAutoFocus={(event) => {
            if (!keepFocus.current) return;
            keepFocus.current = false;
            event.preventDefault();
          }}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
              onSelect={() => {
                keepFocus.current = !!item.keepFocus;
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default Menu;
