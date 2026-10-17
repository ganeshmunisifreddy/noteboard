import type { Editor } from '@tiptap/react';
import { Link } from 'lucide-react';
import { Popover, Toolbar } from 'radix-ui';
import { useId, useState, type FormEvent } from 'react';
import { safeUrl } from '../../lib/markdown';
import IconButton from '../ui/IconButton';
import styles from './LinkPopover.module.css';

type FormProps = { editor: Editor; active: boolean; onDone: () => void };

// Mounted each time the popover opens, so it starts from the current link.
const LinkForm = ({ editor, active, onDone }: FormProps) => {
  const [address, setAddress] = useState(() => String(editor.getAttributes('link').href ?? ''));
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const errorId = useId();

  const save = (event: FormEvent) => {
    event.preventDefault();
    const url = safeUrl(address);
    if (!url) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href: url }).run();
    }
    onDone();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onDone();
  };

  return (
    <form className={styles.form} onSubmit={save}>
      <label htmlFor={inputId} className={styles.label}>
        Link address
      </label>
      <input
        id={inputId}
        className={styles.input}
        type='text'
        inputMode='url'
        autoComplete='off'
        autoFocus
        value={address}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => {
          setAddress(e.target.value);
          setInvalid(false);
        }}
      />
      {invalid && (
        <p id={errorId} role='alert' className={styles.error}>
          Enter a web or email address.
        </p>
      )}
      <div className={styles.actions}>
        {active && (
          <button type='button' className={styles.button} onClick={remove}>
            Remove link
          </button>
        )}
        <button type='submit' className={`${styles.button} ${styles.primary}`}>
          Save
        </button>
      </div>
    </form>
  );
};

type Props = { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void; active: boolean };

const LinkPopover = ({ editor, open, onOpenChange, active }: Props) => (
  <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Toolbar.Button asChild>
      <Popover.Trigger asChild>
        {/* A menu button reports "expanded", so being on a link shows in the
            name and the look, not as a pressed state. */}
        <IconButton
          label={active ? 'Edit link' : 'Add link'}
          data-active={active || undefined}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Link size={18} aria-hidden />
        </IconButton>
      </Popover.Trigger>
    </Toolbar.Button>
    <Popover.Portal>
      <Popover.Content
        className={styles.content}
        align='end'
        sideOffset={6}
        aria-label='Link'
        // Back to the text, not the button (unless the page is closing).
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!editor.isDestroyed) editor.commands.focus();
        }}
      >
        <LinkForm editor={editor} active={active} onDone={() => onOpenChange(false)} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default LinkPopover;
