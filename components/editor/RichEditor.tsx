import { EditorContent, useEditor, type UseEditorOptions } from '@tiptap/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeUrl, tidyMarkdown } from '../../lib/markdown';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { editorExtensions } from './extensions';
import FormatBar from './FormatBar';
import styles from './RichEditor.module.css';

export type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  autoFocus: boolean;
  // Where the formatting bar is drawn (under the editor's top bar).
  barSlot?: HTMLElement | null;
};

// Plain clicks place the cursor; Cmd/Ctrl+click follows a safe link.
export const openLinkOnModClick = (event: MouseEvent): boolean => {
  if (!(event.metaKey || event.ctrlKey)) return false;
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  const url = safeUrl(link?.getAttribute('href') ?? '');
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
};

// A new note's text gets focus, unless the user has already moved on (e.g.
// into the title) while the editor was loading.
const nothingFocused = () => !document.activeElement || document.activeElement === document.body;

const RichEditor = ({ value, onChange, readOnly, autoFocus, barSlot }: RichEditorProps) => {
  // Markdown the editor reported that the page may still hand back (a save
  // can land after newer edits); seeing one again is an echo, not a change
  // from outside.
  const reported = useRef<string[]>([value]);
  // The editor's own Markdown for what it shows. Moving the cursor can make
  // the editor add an empty line (after a final list or heading), which
  // reports an update without changing the Markdown.
  const shown = useRef<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // Read when ProseMirror (re)applies the editor's attributes.
  const readOnlyNow = useRef(readOnly);
  // Options are read once: the content, editable state and focus are kept in
  // step by the effects below. New option objects on every render would make
  // Tiptap reconfigure the editor each time.
  const [options] = useState(
    (): UseEditorOptions => ({
      extensions: editorExtensions(),
      content: value,
      contentType: 'markdown',
      editable: !readOnly,
      autofocus: autoFocus && nothingFocused() ? 'end' : false,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: () => ({
          class: styles.prose,
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': 'Note',
          'aria-readonly': String(readOnlyNow.current),
        }),
        handleDOMEvents: {
          // ProseMirror cancels Escape, which would stop Esc from leaving
          // the editor. Returning true skips ProseMirror's own handling.
          keydown: (_view, event) => event.key === 'Escape' && !event.isComposing,
          // Links never navigate on a plain click (read-only notes in Trash
          // included); Cmd/Ctrl+click opens a safe link in a new tab.
          click: (_view, event) => {
            if (!(event.target instanceof Element) || !event.target.closest('a')) return false;
            event.preventDefault();
            openLinkOnModClick(event);
            return false;
          },
        },
        handleKeyDown: (_view, event) => {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false;
          setLinkOpen(true);
          return true;
        },
      },
    }),
  );
  const editor = useEditor(options);

  const report = useEffectEvent((markdown: string) => onChange(markdown));

  // Only edits are reported; loading a note is not an edit.
  useEffect(() => {
    shown.current = tidyMarkdown(editor.getMarkdown());
    const onUpdate = () => {
      const markdown = tidyMarkdown(editor.getMarkdown());
      if (markdown === shown.current) return;
      shown.current = markdown;
      reported.current = [...reported.current.slice(-19), markdown];
      report(markdown);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (reported.current.includes(value)) return;
    reported.current = [value];
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    shown.current = tidyMarkdown(editor.getMarkdown());
  }, [editor, value]);

  // On a phone the formatting bar docks above the keyboard while typing.
  const phone = useMediaQuery('(max-width: 600px)');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  useEffect(() => {
    readOnlyNow.current = readOnly;
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  return (
    <>
      {barSlot &&
        !readOnly &&
        createPortal(
          <FormatBar
            editor={editor}
            linkOpen={linkOpen}
            onLinkOpenChange={setLinkOpen}
            docked={phone && (focused || linkOpen)}
          />,
          barSlot,
        )}
      <EditorContent editor={editor} className={styles.content} />
    </>
  );
};

export default RichEditor;
