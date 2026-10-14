import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import FilterChips from '../components/board/FilterChips';
import type { CardMode } from '../components/board/NoteCard';
import NoteGrid from '../components/board/NoteGrid';
import TopBar from '../components/board/TopBar';
import NotFound from '../components/NotFound';
import LabelsDialog from '../components/ui/LabelsDialog';
import { useToast } from '../components/ui/Toast';
import { emptyMessage, filterToQuery, parseFilter } from '../lib/filters';
import { emptyTrash, useBoardNotes, useLabels } from '../lib/notes';
import { markOnBoard, newNoteHref, noteHref, openEditor } from '../lib/routes';
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
  const loaded = status !== 'pending' && board !== undefined;

  useEffect(() => {
    markOnBoard();
  }, []);

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

  const mode: CardMode = filter.view === 'trash' ? 'trash' : filter.view === 'archive' ? 'archive' : 'board';
  const pinned = loaded && board ? board.pinned : [];
  const others = loaded && board ? board.others : [];
  const total = pinned.length + others.length;
  const headings = pinned.length > 0 && others.length > 0;

  return (
    <>
      <Head>
        <title>Noteboard</title>
        <meta name='description' content='Notes and lists by Nine Technology' />
      </Head>
      <TopBar
        initialQuery={filter.query}
        searchKey={router.isReady ? 'ready' : 'loading'}
        onQueryChange={search}
        onNew={newNote}
      />
      <FilterChips
        filter={filter}
        labels={labels ?? []}
        onSelect={showFilter}
        onManageLabels={() => setLabelsOpen(true)}
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
            <NoteGrid notes={pinned} labelNames={labelNames} mode={mode} onOpen={openNote} />
          </section>
        )}
        {others.length > 0 && (
          <section className={styles.section} aria-label={headings ? 'Other notes' : 'Notes'}>
            {headings && <h2 className={styles.sectionTitle}>Others</h2>}
            <NoteGrid notes={others} labelNames={labelNames} mode={mode} onOpen={openNote} />
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
      <LabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
    </>
  );
};

export default Home;
