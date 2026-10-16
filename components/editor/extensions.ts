import { Extension } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type { marked } from 'marked';
import { createMarked, escapeLineStarts, looksLikeMarkdown, safeUrl } from '../../lib/markdown';

// Plain-text pastes that look like Markdown arrive formatted. Pastes from
// web pages (text/html) are left to the editor, which keeps the formatting
// it supports.
const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            // Code is pasted as it is.
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code || editor.isActive('code')) return false;
            const data = event.clipboardData;
            if (!data || data.types.includes('text/html')) return false;
            const text = data.getData('text/plain');
            if (!looksLikeMarkdown(text)) return false;
            return editor.commands.insertContent(text, { contentType: 'markdown' });
          },
        },
      }),
    ];
  },
});

// Paragraph text that starts like a heading, list, quote or divider ("# tag",
// "1. one", "---") is saved escaped, so it reloads as the same text.
const LiteralParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    return escapeLineStarts(this.parent?.(node, helpers, context) ?? '');
  },
});

// A fresh set per editor: the Markdown extension registers itself on the
// marked instance it is given.
export const editorExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    paragraph: false,
    // Markdown can't store underline.
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      isAllowedUri: (url) => safeUrl(url) !== null,
    },
  }),
  // Tick boxes, saved as "- [ ]" / "- [x]".
  TaskList,
  TaskItem.configure({
    nested: true,
    a11y: { checkboxLabel: (node, checked) => `${checked ? 'Untick' : 'Tick'} ${node.textContent || 'empty item'}` },
  }),
  // Typed as the default marked export; a Marked instance has the same API.
  LiteralParagraph,
  Markdown.configure({ marked: createMarked() as unknown as typeof marked }),
  Placeholder.configure({ placeholder: 'Note' }),
  MarkdownPaste,
];
