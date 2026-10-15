import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import styles from './Menu.module.css';

export type MenuItem = {
  label: string;
  key?: string; // when labels can repeat (e.g. two columns with one name)
  onSelect?: () => void;
  items?: MenuItem[]; // a submenu
  checked?: boolean; // a tickable item (e.g. the column a note is in)
  disabled?: boolean;
  icon?: ReactNode;
  danger?: boolean;
  keepFocus?: boolean; // the item moves focus itself (e.g. opens a name field)
};

type Props = {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
};

const Items = ({ items, keepFocus }: { items: MenuItem[]; keepFocus: RefObject<boolean> }) =>
  items.map((item) =>
    item.items ? (
      <DropdownMenu.Sub key={item.key ?? item.label}>
        <DropdownMenu.SubTrigger className={styles.item}>
          {item.icon}
          {item.label}
          <ChevronRight size={16} className={styles.indicator} aria-hidden />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent className={styles.content} sideOffset={4}>
            <Items items={item.items} keepFocus={keepFocus} />
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    ) : item.checked !== undefined ? (
      <DropdownMenu.CheckboxItem
        key={item.key ?? item.label}
        className={styles.item}
        checked={item.checked}
        disabled={item.disabled}
        onSelect={() => {
          keepFocus.current = !!item.keepFocus;
          item.onSelect?.();
        }}
      >
        {item.icon}
        {item.label}
        <DropdownMenu.ItemIndicator className={styles.indicator}>
          <Check size={16} aria-hidden />
        </DropdownMenu.ItemIndicator>
      </DropdownMenu.CheckboxItem>
    ) : (
      <DropdownMenu.Item
        key={item.key ?? item.label}
        className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
        disabled={item.disabled}
        onSelect={() => {
          keepFocus.current = !!item.keepFocus;
          item.onSelect?.();
        }}
      >
        {item.icon}
        {item.label}
      </DropdownMenu.Item>
    ),
  );

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
          <Items items={items} keepFocus={keepFocus} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default Menu;
