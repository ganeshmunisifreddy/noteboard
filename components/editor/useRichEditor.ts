import { useEffect, useState, type ComponentType } from 'react';
import type { RichEditorProps } from './RichEditor';

type Load = () => Promise<{ default: ComponentType<RichEditorProps> }>;

export type RichEditorState =
  | { status: 'loading' }
  | { status: 'ready'; Editor: ComponentType<RichEditorProps> }
  | { status: 'failed' };

const loadRichEditor: Load = () => import('./RichEditor');

// The rich editor is a separate chunk, loaded only on the note page. If it
// can't load (offline before it was cached), the plain textarea is used.
export const useRichEditor = (load: Load = loadRichEditor): RichEditorState => {
  const [state, setState] = useState<RichEditorState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    load().then(
      (module) => {
        if (live) setState({ status: 'ready', Editor: module.default });
      },
      () => {
        if (live) setState({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [load]);
  return state;
};
