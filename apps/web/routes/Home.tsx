import { useEffect, useMemo, useRef, useState } from 'react';
import MoreMenu from '../components/board/MoreMenu';
import type { CardMode } from '../components/board/NoteCard';
import NoteGrid from '../components/board/NoteGrid';
import TopBar from '../components/board/TopBar';
import UpcomingView from '../components/board/UpcomingView';
import ViewHeader from '../components/board/ViewHeader';
import EmptyState from '../components/board/EmptyState';
import { preloadRichEditor } from '../components/editor/useRichEditor';
import BoardTiles from '../components/kanban/BoardTiles';
import AppShell from '../components/shell/AppShell';
import LabelsDialog from '../components/ui/LabelsDialog';
import ThemeToggle from '../components/ui/ThemeToggle';
import { useToast } from '../components/ui/Toast';
import { useBoardImages } from '../lib/attachments';
import { usePlaceNames } from '../lib/boards';
import { downloadBackup, downloadMarkdown, restoreBackup, restoreErrorMessage, restoredMessage } from '../lib/backup';
import { upcomingSections } from '../lib/due';
import { emptyMessage, isReorderable, parseFilter } from '../lib/filters';
import { emptyTrash, useBoardNotes, useLabels } from '../lib/notes';
import { useNav, usePopKey, useQuery } from '../lib/navigation';
import { boardHref, homeHref, markOnBoard, newNoteHref, noteHref, openEditor, takeBoardScroll } from '../lib/routes';
import { useStartup } from '../lib/startup';
import { useNow } from '../lib/time';
import type { BoardFilter, NoteKind } from '../lib/types';
import styles from '../styles/Home.module.css';
import { loadNotePage } from './lazyPages';

const Home = () => {
  const nav = useNav();
  const toast = useToast();
  const status = useStartup();
  const filter = parseFilter(useQuery());
  const board = useBoardNotes(filter);
  const labels = useLabels();
  const placeNames = usePlaceNames();
  const [labelsOpen, setLabelsOpen] = useState(false);
  // Changes after Back/Forward, so the search box picks up the URL's query
  // (typing only replaces the URL, so it never changes this).
  const popKey = usePopKey();
  const restoreInput = useRef<HTMLInputElement>(null);
  // Loaded with the notes, so cards appear with their images in place.
  const images = useBoardImages();
  const now = useNow();
  const loaded = status !== 'pending' && board !== undefined && images !== undefined;

  useEffect(() => {
    markOnBoard();
  }, []);

  // Load the note editor's code once the board has settled, so opening a
  // note doesn't wait for it.
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadRichEditor().catch(() => {});
      loadNotePage().catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Back from the editor: return to where the user was on the board.
  useEffect(() => {
    if (!loaded) return;
    const y = takeBoardScroll(nav.url);
    if (y !== null) window.scrollTo(0, y);
  }, [loaded, nav.url]);

  const labelNames = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);

  const showFilter = (next: Pick<BoardFilter, 'view' | 'labelId'>) => nav.go(homeHref({ ...filter, ...next }));

  const search = (query: string) => {
    const view = filter.view === 'boards' && query ? 'all' : filter.view;
    nav.swap(homeHref({ ...filter, view, query }));
  };

  const openNote = (id: string) => openEditor(nav, noteHref(id));
  const newNote = (kind: NoteKind) => openEditor(nav, newNoteHref(kind));

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
  const sections = filter.view === 'upcoming' ? upcomingSections(others, now) : null;
  const total = sections
    ? sections.reduce((count, section) => count + section.notes.length, 0)
    : pinned.length + others.length;
  const headings = pinned.length > 0 && others.length > 0;
  const reorderable = isReorderable(filter);

  return (
    <>
      <title>Noteboard</title>
      <AppShell
        onEditLabels={() => setLabelsOpen(true)}
        renderTop={(onMenu) => (
          <TopBar
            initialQuery={filter.query}
            searchKey={`pop-${popKey}`}
            onQueryChange={search}
            onNew={newNote}
            onMenu={onMenu}
          >
            <ThemeToggle />
            <MoreMenu
              onBackup={() => void backUp()}
              onRestore={() => restoreInput.current?.click()}
              onExport={() => void exportMarkdown()}
            />
          </TopBar>
        )}
      >
        <main className={styles.main}>
          <ViewHeader
            filter={filter}
            labelName={filter.labelId ? labelNames.get(filter.labelId) : undefined}
            total={total}
            loaded={loaded}
            onView={(view) => showFilter({ view, labelId: null })}
            onEmptyTrash={() => void clearTrash()}
          />
          {filter.view === 'boards' ? (
            <BoardTiles onOpen={(id) => nav.go(boardHref(id))} />
          ) : sections ? (
            <UpcomingView sections={sections} labelNames={labelNames} onOpen={openNote} images={images} placeNames={placeNames} />
          ) : (
            <>
              {pinned.length > 0 && (
                <section className={styles.section} aria-label='Pinned notes'>
                  {headings && <h2 className={styles.sectionTitle}>Pinned</h2>}
                  <NoteGrid
                    notes={pinned}
                    labelNames={labelNames}
                    mode={mode}
                    onOpen={openNote}
                    reorderable={reorderable}
                    images={images}
                    placeNames={placeNames}
                    highlight={filter.query}
                  />
                </section>
              )}
              {others.length > 0 && (
                <section className={styles.section} aria-label={headings ? 'Other notes' : 'Notes'}>
                  {headings && <h2 className={styles.sectionTitle}>Others</h2>}
                  <NoteGrid
                    notes={others}
                    labelNames={labelNames}
                    mode={mode}
                    onOpen={openNote}
                    reorderable={reorderable}
                    images={images}
                    placeNames={placeNames}
                    highlight={filter.query}
                  />
                </section>
              )}
            </>
          )}
          {loaded && total === 0 && filter.view !== 'boards' && (
            <EmptyState filter={filter} text={emptyMessage(filter)} />
          )}
        </main>
      </AppShell>
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
