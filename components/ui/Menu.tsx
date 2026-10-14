import { DropdownMenu } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import styles from './Menu.module.css';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
};

type Props = {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
};

const Menu = ({ trigger, items, align = 'end' }: Props) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={styles.content} align={align} sideOffset={6}>
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.label}
            className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
            onSelect={item.onSelect}
          >
            {item.icon}
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export default Menu;
