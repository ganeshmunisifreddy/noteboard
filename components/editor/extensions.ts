import { Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type { marked } from 'marked';
import { createMarked, looksLikeMarkdown, safeUrl } from '../../lib/markdown';

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
          handlePaste: (_view, event) => {
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

// A fresh set per editor: the Markdown extension registers itself on the
// marked instance it is given.
export const editorExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
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
  // Typed as the default marked export; a Marked instance has the same API.
  Markdown.configure({ marked: createMarked() as unknown as typeof marked }),
  Placeholder.configure({ placeholder: 'Note' }),
  MarkdownPaste,
];
