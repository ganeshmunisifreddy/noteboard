import { useEffect, type MouseEvent, type ReactNode } from 'react';
import styles from './Modal.module.css';

type Props = {
  children: ReactNode;
  onClose: () => void;
  label?: string;
};

const Modal = (props: Props) => {
  const { children, onClose, label } = props;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const preventClose = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div className={styles.root} onClick={onClose}>
      <div
        className={styles.container}
        onClick={preventClose}
        role='dialog'
        aria-modal='true'
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
