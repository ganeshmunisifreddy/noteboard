import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import FilterChips from '../components/board/FilterChips';
import type { CardMode } from '../components/board/NoteCard';
import NoteGrid from '../components/board/NoteGrid';
import TopBar from '../components/board/TopBar';
import { preloadRichEditor } from '../components/editor/useRichEditor';
import NotFound from '../components/NotFound';
import LabelsDialog from '../components/ui/LabelsDialog';
import { useToast } from '../components/ui/Toast';
import { downloadBackup, downloadMarkdown, restoreBackup, restoreErrorMessage, restoredMessage } from '../lib/backup';
import { emptyMessage, filterToQuery, isReorderable, parseFilter } from '../lib/filters';
import { emptyTrash, useBoardNotes, useLabels } from '../lib/notes';
import { markOnBoard, newNoteHref, noteHref, openEditor, takeBoardScroll } from '../lib/routes';
import { useStartup } from '../lib/startup';
import { hasNotesMarker } from '../lib/storage';
import type { BoardFilter, NoteKind } from '../lib/types';
import styles from '../styles/Home.module.css';

const Home: NextPage = () => {
  const router = useRouter();
  const toast = useToast();
  const status = useStartup();
  const filter = parseFilter(router.query);
  const board = useBoardNotes(filter);
  const labels = useLabels();
  const [labelsOpen, setLabelsOpen] = useState(false);
  // Bumped after Back/Forward so the search box picks up the URL's query
  // (typing only replaces the URL, so it never triggers this).
  const [historyKey, setHistoryKey] = useState(0);
  const restoreInput = useRef<HTMLInputElement>(null);
  const loaded = status !== 'pending' && board !== undefined;

  useEffect(() => {
    markOnBoard();
  }, []);

  // Load the note editor's code once the board has settled, so opening a
  // note doesn't wait for it.
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadRichEditor().catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let popped = false;
    const onPopState = () => {
      popped = true;
    };
    const onRouteChangeComplete = () => {
      if (!popped) return;
      popped = false;
      setHistoryKey((key) => key + 1);
    };
    window.addEventListener('popstate', onPopState);
    router.events.on('routeChangeComplete', onRouteChangeComplete);
    return () => {
      window.removeEventListener('popstate', onPopState);
      router.events.off('routeChangeComplete', onRouteChangeComplete);
    };
  }, [router.events]);

  // Coming back from the editor skips _document's pre-paint script, so hide
  // the empty state again until the notes have loaded.
  useLayoutEffect(() => {
    if (hasNotesMarker()) document.documentElement.setAttribute('data-has-notes', '');
  }, []);

  // Notes are on screen now, so stop force-hiding the empty state
  // (the attribute is set before first paint in _document).
  useEffect(() => {
    if (loaded) document.documentElement.removeAttribute('data-has-notes');
  }, [loaded]);

  // Back from the editor: return to where the user was on the board.
  useEffect(() => {
    if (!loaded) return;
    const y = takeBoardScroll(router.asPath);
    if (y !== null) window.scrollTo(0, y);
  }, [loaded, router.asPath]);

  const labelNames = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);

  const showFilter = (next: Pick<BoardFilter, 'view' | 'labelId'>) =>
    void router.push({ pathname: '/', query: filterToQuery({ ...filter, ...next }) }, undefined, { shallow: true });

  const search = (query: string) =>
    void router.replace({ pathname: '/', query: filterToQuery({ ...filter, query }) }, undefined, { shallow: true });

  const openNote = (id: string) => openEditor(router, noteHref(id));
  const newNote = (kind: NoteKind) => openEditor(router, newNoteHref(kind));

  const clearTrash = async () => {
    if (!window.confirm('Delete all notes in Trash forever? This can’t be undone.')) return;
    await emptyTrash();
    toast({ message: 'Trash emptied' });
  };

  const backUp = async () => {
    try {
      await downloadBackup();
      toast({ message: 'Backup downloaded' });
    } catch {
      toast({ message: 'Couldn’t create the backup.' });
    }
  };

  const exportMarkdown = async () => {
    try {
      await downloadMarkdown();
      toast({ message: 'Markdown file downloaded' });
    } catch {
      toast({ message: 'Couldn’t export your notes.' });
    }
  };

  const restore = async (file: File) => {
    try {
      toast({ message: restoredMessage(await restoreBackup(await file.text())) });
    } catch (error) {
      toast({ message: restoreErrorMessage(error) });
    }
  };

  const mode: CardMode = filter.view === 'trash' ? 'trash' : filter.view === 'archive' ? 'archive' : 'board';
  const pinned = loaded && board ? board.pinned : [];
  const others = loaded && board ? board.others : [];
  const total = pinned.length + others.length;
  const headings = pinned.length > 0 && others.length > 0;
  const reorderable = isReorderable(filter);

  return (
    <>
      <Head>
        <title>Noteboard</title>
        <meta name='description' content='Notes and lists by Nine Technology' />
      </Head>
      <TopBar
        initialQuery={filter.query}
        searchKey={router.isReady ? `ready-${historyKey}` : 'loading'}
        onQueryChange={search}
        onNew={newNote}
      />
      <FilterChips
        filter={filter}
        labels={labels ?? []}
        onSelect={showFilter}
        onManageLabels={() => setLabelsOpen(true)}
        onBackup={() => void backUp()}
        onRestore={() => restoreInput.current?.click()}
        onExport={() => void exportMarkdown()}
      />
      <main className={styles.main}>
        {mode === 'trash' && total > 0 && (
          <div className={styles.trashBar}>
            <p>Notes in Trash are deleted after 30 days.</p>
            <button type='button' className={styles.textButton} onClick={() => void clearTrash()}>
              Empty trash
            </button>
          </div>
        )}
        {pinned.length > 0 && (
          <section className={styles.section} aria-label='Pinned notes'>
            {headings && <h2 className={styles.sectionTitle}>Pinned</h2>}
            <NoteGrid notes={pinned} labelNames={labelNames} mode={mode} onOpen={openNote} reorderable={reorderable} />
          </section>
        )}
        {others.length > 0 && (
          <section className={styles.section} aria-label={headings ? 'Other notes' : 'Notes'}>
            {headings && <h2 className={styles.sectionTitle}>Others</h2>}
            <NoteGrid notes={others} labelNames={labelNames} mode={mode} onOpen={openNote} reorderable={reorderable} />
          </section>
        )}
        {/* Also rendered on the server and while loading; _document hides it
            before first paint when notes exist. */}
        {total === 0 && (
          <div className={styles.emptyState}>
            <NotFound text={emptyMessage(filter)} />
          </div>
        )}
      </main>
      <input
        ref={restoreInput}
        type='file'
        accept='.json,application/json'
        hidden
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void restore(file);
        }}
      />
      <LabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
    </>
  );
};

export default Home;
