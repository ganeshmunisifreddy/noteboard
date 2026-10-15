import type { ChainedCommands } from '@tiptap/core';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import { Toolbar } from 'radix-ui';
import { Fragment, type ReactNode } from 'react';
import { useKeyboardInset } from '../../lib/useKeyboardInset';
import IconButton from '../ui/IconButton';
import LinkPopover from './LinkPopover';
import styles from './FormatBar.module.css';

type Props = {
  editor: Editor;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
  docked?: boolean; // phones: fixed just above the on-screen keyboard
};

type Action = { label: string; icon: ReactNode; pressed?: boolean; apply: (chain: ChainedCommands) => ChainedCommands };

const FormatBar = ({ editor, linkOpen, onLinkOpenChange, docked = false }: Props) => {
  const keyboard = useKeyboardInset();
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h1: current.isActive('heading', { level: 1 }),
      h2: current.isActive('heading', { level: 2 }),
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      blockquote: current.isActive('blockquote'),
      codeBlock: current.isActive('codeBlock'),
      link: current.isActive('link'),
    }),
  });

  const groups: Action[][] = [
    [
      { label: 'Heading 1', icon: <Heading1 size={18} aria-hidden />, pressed: active.h1, apply: (c) => c.toggleHeading({ level: 1 }) },
      { label: 'Heading 2', icon: <Heading2 size={18} aria-hidden />, pressed: active.h2, apply: (c) => c.toggleHeading({ level: 2 }) },
    ],
    [
      { label: 'Bold', icon: <Bold size={18} aria-hidden />, pressed: active.bold, apply: (c) => c.toggleBold() },
      { label: 'Italic', icon: <Italic size={18} aria-hidden />, pressed: active.italic, apply: (c) => c.toggleItalic() },
      { label: 'Strikethrough', icon: <Strikethrough size={18} aria-hidden />, pressed: active.strike, apply: (c) => c.toggleStrike() },
      { label: 'Inline code', icon: <Code size={18} aria-hidden />, pressed: active.code, apply: (c) => c.toggleCode() },
    ],
    [
      { label: 'Bullet list', icon: <List size={18} aria-hidden />, pressed: active.bulletList, apply: (c) => c.toggleBulletList() },
      { label: 'Numbered list', icon: <ListOrdered size={18} aria-hidden />, pressed: active.orderedList, apply: (c) => c.toggleOrderedList() },
      { label: 'Tick boxes', icon: <ListChecks size={18} aria-hidden />, pressed: active.taskList, apply: (c) => c.toggleTaskList() },
      { label: 'Quote', icon: <Quote size={18} aria-hidden />, pressed: active.blockquote, apply: (c) => c.toggleBlockquote() },
      { label: 'Code block', icon: <SquareCode size={18} aria-hidden />, pressed: active.codeBlock, apply: (c) => c.toggleCodeBlock() },
      { label: 'Divider', icon: <Minus size={18} aria-hidden />, apply: (c) => c.setHorizontalRule() },
    ],
  ];

  return (
    <Toolbar.Root
      className={styles.bar}
      aria-label='Formatting'
      data-docked={docked ? 'true' : undefined}
      style={docked ? { bottom: keyboard } : undefined}
    >
      {groups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <Toolbar.Separator className={styles.separator} />}
          {group.map((action) => (
            <Toolbar.Button key={action.label} asChild>
              <IconButton
                label={action.label}
                aria-pressed={action.pressed}
                // Keep the text selection while clicking.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => action.apply(editor.chain().focus()).run()}
              >
                {action.icon}
              </IconButton>
            </Toolbar.Button>
          ))}
        </Fragment>
      ))}
      <Toolbar.Separator className={styles.separator} />
      <LinkPopover editor={editor} open={linkOpen} onOpenChange={onLinkOpenChange} active={active.link} />
    </Toolbar.Root>
  );
};

export default FormatBar;
