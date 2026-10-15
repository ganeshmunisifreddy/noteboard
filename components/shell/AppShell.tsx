import { Dialog } from 'radix-ui';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import styles from './AppShell.module.css';
import { useMediaQuery } from '../../lib/useMediaQuery';
import Sidebar from './Sidebar';

const KEY = 'sidebar';
const DESKTOP = '(min-width: 1024px)';

// The remembered rail choice, shared by every shell on the page.
const listeners = new Set<() => void>();
const readRail = () => {
  try {
    return localStorage.getItem(KEY) === 'rail';
  } catch {
    return false;
  }
};
const writeRail = (rail: boolean) => {
  try {
    localStorage.setItem(KEY, rail ? 'rail' : 'open');
  } catch {
    // Only a preference.
  }
  // _document sets this before first paint, so the rail never flashes open.
  if (rail) document.documentElement.setAttribute('data-sidebar', 'rail');
  else document.documentElement.removeAttribute('data-sidebar');
  listeners.forEach((listener) => listener());
};

type Props = {
  renderTop: (onMenu: (opener: HTMLElement) => void) => ReactNode;
  onEditLabels: () => void;
  children: ReactNode;
};

// Header, sidebar and content. CSS picks the layout from the width (so the
// first paint is right); ☰ collapses the sidebar on desktop and opens a
// drawer below that.
const AppShell = ({ renderTop, onEditLabels, children }: Props) => {
  const rail = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    readRail,
    () => false,
  );
  const phone = useMediaQuery('(max-width: 600px)');
  const [drawer, setDrawer] = useState(false);
  // Focus goes back here when the drawer closes.
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  // The ☰ button itself (Safari doesn't focus buttons on click).
  const onMenu = (button: HTMLElement) => {
    setOpener(button);
    if (window.matchMedia(DESKTOP).matches) writeRail(!rail);
    else setDrawer(true);
  };

  return (
    <div className={styles.shell} data-sidebar={rail ? 'rail' : 'open'}>
      {renderTop(onMenu)}
      <div className={styles.body}>
        <aside className={styles.side}>
          {/* Phones use the drawer; CSS hides this before the media query is known. */}
          {!phone && <Sidebar variant='side' onEditLabels={onEditLabels} />}
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.scrim} />
          <Dialog.Content
            className={styles.drawer}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener?.focus();
            }}
          >
            <Dialog.Title className={styles.drawerTitle}>Sections</Dialog.Title>
            <Sidebar
              variant='drawer'
              onNavigate={() => setDrawer(false)}
              onEditLabels={() => {
                setDrawer(false);
                onEditLabels();
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default AppShell;
