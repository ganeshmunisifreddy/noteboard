import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './IconButton.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ref?: Ref<HTMLButtonElement>;
};

// Spreads the rest so Radix `asChild` triggers can attach their handlers.
const IconButton = ({ label, className, ref, children, ...rest }: Props) => (
  <button
    ref={ref}
    type='button'
    aria-label={label}
    title={label}
    className={className ? `${styles.button} ${className}` : styles.button}
    {...rest}
  >
    {children}
  </button>
);

export default IconButton;
