import { useEffect, useState, type ComponentType } from 'react';
import type { RichEditorProps } from './RichEditor';

type Load = () => Promise<{ default: ComponentType<RichEditorProps> }>;

export type RichEditorState =
  | { status: 'loading' }
  | { status: 'ready'; Editor: ComponentType<RichEditorProps> }
  | { status: 'failed' };

const loadRichEditor: Load = () => import('./RichEditor');

const loaded = new WeakMap<Load, ComponentType<RichEditorProps>>();
const loading = new WeakMap<Load, Promise<ComponentType<RichEditorProps>>>();

// Starts loading the editor's code (once). The board calls this when idle,
// so opening a note usually finds the editor ready.
export const preloadRichEditor = (load: Load = loadRichEditor) => {
  let promise = loading.get(load);
  if (!promise) {
    promise = load().then((module) => {
      loaded.set(load, module.default);
      return module.default;
    });
    // A failed load (offline) may be retried later.
    promise.catch(() => loading.delete(load));
    loading.set(load, promise);
  }
  return promise;
};

// The rich editor is a separate chunk, loaded only for the note page. If it
// can't load (offline before it was cached), the plain textarea is used.
export const useRichEditor = (load: Load = loadRichEditor): RichEditorState => {
  const [state, setState] = useState<RichEditorState>(() => {
    const Editor = loaded.get(load);
    return Editor ? { status: 'ready', Editor } : { status: 'loading' };
  });
  useEffect(() => {
    let live = true;
    preloadRichEditor(load).then(
      (Editor) => {
        if (live) setState((current) => (current.status === 'ready' && current.Editor === Editor ? current : { status: 'ready', Editor }));
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
