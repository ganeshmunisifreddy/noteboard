import { Toast } from 'radix-ui';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ActiveToast = ToastOptions & { id: number };

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {});

let nextId = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const show = useCallback((toast: ToastOptions) => {
    nextId += 1;
    const id = nextId;
    // Keep at most three on screen.
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);

  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <Toast.Provider duration={6000} swipeDirection='down'>
      <ToastContext.Provider value={show}>{children}</ToastContext.Provider>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          className={styles.toast}
          onOpenChange={(open) => {
            if (!open) dismiss(toast.id);
          }}
        >
          <Toast.Description className={styles.message}>{toast.message}</Toast.Description>
          {toast.onAction && (
            <Toast.Action asChild altText={toast.actionLabel ?? 'Undo'}>
              <button type='button' className={styles.action} onClick={toast.onAction}>
                {toast.actionLabel ?? 'Undo'}
              </button>
            </Toast.Action>
          )}
        </Toast.Root>
      ))}
      <Toast.Viewport className={styles.viewport} />
    </Toast.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
