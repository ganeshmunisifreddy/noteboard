import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeUrl, tidyMarkdown } from '../../lib/markdown';
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
  const [extensions] = useState(editorExtensions);
  // The Markdown the editor last reported, so a change from outside (not an
  // echo of the user's own edit) can be loaded in.
  const reported = useRef(value);
  // The editor's own Markdown for what it shows. Moving the cursor can make
  // the editor add an empty line (after a final list or heading), which
  // reports an update without changing the Markdown.
  const shown = useRef<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    autofocus: autoFocus && nothingFocused() ? 'end' : false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: styles.prose, role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note' },
      handleClick: (_view, _pos, event) => openLinkOnModClick(event),
      // ProseMirror cancels Escape, which would stop Esc from leaving the
      // editor. Returning true here skips ProseMirror's own key handling.
      handleDOMEvents: {
        keydown: (_view, event) => event.key === 'Escape' && !event.isComposing,
      },
      handleKeyDown: (_view, event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false;
        setLinkOpen(true);
        return true;
      },
    },
  });

  const report = useEffectEvent((markdown: string) => onChange(markdown));

  // Only edits are reported; loading a note is not an edit.
  useEffect(() => {
    shown.current = tidyMarkdown(editor.getMarkdown());
    const onUpdate = () => {
      const markdown = tidyMarkdown(editor.getMarkdown());
      if (markdown === shown.current) return;
      shown.current = markdown;
      reported.current = markdown;
      report(markdown);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    shown.current = tidyMarkdown(editor.getMarkdown());
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  return (
    <>
      {barSlot &&
        !readOnly &&
        createPortal(<FormatBar editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />, barSlot)}
      <EditorContent editor={editor} className={styles.content} />
    </>
  );
};

export default RichEditor;
