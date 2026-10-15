import { ArrowLeft, EllipsisVertical, ListFilter, Plus } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBoardImages } from '../../lib/attachments';
import { EMPTY_FILTER, isFiltering, matchesCard, type CardFilter } from '../../lib/boardFilter';
import {
  BOARD_NAME_MAX,
  deleteBoard,
  renameBoard,
  restoreBoard,
  starBoard,
  useBoardColumns,
  type BoardData,
} from '../../lib/boards';
import { useLabels } from '../../lib/notes';
import { BOARDS_HREF, markOnBoard, newNoteHref, noteHref, openEditor, takeBoardScroll } from '../../lib/routes';
import type { NoteKind } from '../../lib/types';
import IconButton from '../ui/IconButton';
import Menu from '../ui/Menu';
import { useToast } from '../ui/Toast';
import styles from './Board.module.css';
import BoardColumns from './BoardColumns';
import DeleteBoardDialog from './DeleteBoardDialog';
import FilterBar from './FilterBar';
import InlineName from './InlineName';

const BoardView = ({ data }: { data: BoardData }) => {
  const router = useRouter();
  const toast = useToast();
  const labels = useLabels();
  const images = useBoardImages();
  const boards = useBoardColumns();
  const [renaming, setRenaming] = useState(false);
  const [addingColumn, setAddingColumn] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const { board, columns, cards } = data;
  const boardActions = useRef<HTMLButtonElement>(null);

  // Back from a card: "opened from a board" starts over, and the page
  // returns to where it was scrolled (sideways scroll is kept by the columns).
  useEffect(() => {
    markOnBoard();
  }, []);
  useEffect(() => {
    const y = takeBoardScroll(router.asPath);
    if (y !== null) window.scrollTo(0, y);
  }, [router.asPath]);

  const stopRenaming = () => {
    setRenaming(false);
    requestAnimationFrame(() => boardActions.current?.focus());
  };

  const labelNames = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Cards added while filtering stay shown until the filter changes.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const filterButton = useRef<HTMLButtonElement>(null);
  const filtering = isFiltering(filter);

  const changeFilter = (next: CardFilter) => {
    setFilter(next);
    setKept(new Set());
    setNow(Date.now());
  };

  const closeFilter = () => {
    changeFilter(EMPTY_FILTER);
    setFilterOpen(false);
    requestAnimationFrame(() => filterButton.current?.focus());
  };

  const allCards = [...cards.values()].flat();
  const visibleIds = filtering
    ? new Set(allCards.filter((n) => kept.has(n.id) || matchesCard(n, filter, labelNames, now)).map((n) => n.id))
    : null;
  const matchCount = visibleIds?.size ?? 0;
  const noteCount = [...cards.values()].reduce((sum, list) => sum + list.length, 0);

  const addCard = (columnId: string, kind: NoteKind, at: 'top' | 'bottom' = 'bottom') =>
    openEditor(router, newNoteHref(kind, { columnId, boardId: board.id, at }));

  const remove = async (notesTo: 'keep' | 'trash') => {
    const snapshot = await deleteBoard(board.id, notesTo);
    void router.push(BOARDS_HREF);
    if (snapshot) toast({ message: 'Board deleted', actionLabel: 'Undo', onAction: () => void restoreBoard(snapshot) });
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>{`${board.name} | Noteboard`}</title>
      </Head>
      <header className={styles.bar}>
        <IconButton label='Back to boards' onClick={() => void router.push(BOARDS_HREF)}>
          <ArrowLeft size={20} aria-hidden />
        </IconButton>
        {renaming ? (
          <InlineName
            label='Board name'
            initial={board.name}
            maxLength={BOARD_NAME_MAX}
            onSave={(name) => {
              stopRenaming();
              void renameBoard(board.id, name);
            }}
            onCancel={stopRenaming}
          />
        ) : (
          <h1 className={styles.boardTitle}>{board.name}</h1>
        )}
        <button
          ref={filterButton}
          type='button'
          className={styles.filterButton}
          aria-expanded={filterOpen}
          aria-controls='board-filter'
          aria-label={
            filtering ? `Filter, ${matchCount} ${matchCount === 1 ? 'card matches' : 'cards match'}` : 'Filter'
          }
          onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
        >
          <ListFilter size={16} aria-hidden />
          Filter
          {filtering && <span className={styles.filterDot} aria-hidden />}
        </button>
        <button
          type='button'
          className={styles.primary}
          disabled={columns.length === 0}
          onClick={() => columns[0] && addCard(columns[0].id, 'note', 'top')}
        >
          <Plus size={16} aria-hidden />
          Add card
        </button>
        <Menu
          items={[
            { label: 'Rename board', keepFocus: true, onSelect: () => setRenaming(true) },
            { label: 'Add column', keepFocus: true, onSelect: () => setAddingColumn((n) => n + 1) },
            {
              label: board.starred ? 'Unstar board' : 'Star board',
              onSelect: () => void starBoard(board.id, !board.starred),
            },
            { label: 'Delete board…', danger: true, onSelect: () => setDeleting(true) },
          ]}
          trigger={
            <IconButton ref={boardActions} label='Board actions'>
              <EllipsisVertical size={18} aria-hidden />
            </IconButton>
          }
        />
      </header>
      {filterOpen && (
        <FilterBar id='board-filter' filter={filter} labels={labels ?? []} onChange={changeFilter} onClose={closeFilter} />
      )}
      {filtering && matchCount === 0 && (
        <p className={styles.noMatch}>
          No cards match the filter
          <button type='button' className={styles.clear} onClick={() => changeFilter(EMPTY_FILTER)}>
            Clear
          </button>
        </p>
      )}
      <main className={styles.main}>
        <BoardColumns
          key={addingColumn}
          data={data}
          labelNames={labelNames}
          images={images}
          boards={boards ?? []}
          visibleIds={visibleIds}
          onCardAdded={(id) => {
            if (filtering) setKept((ids) => new Set(ids).add(id));
          }}
          onOpen={(id) => openEditor(router, noteHref(id))}
          onAddCard={(columnId, kind) => addCard(columnId, kind)}
          startAddingColumn={addingColumn > 0}
        />
      </main>
      <DeleteBoardDialog
        open={deleting}
        name={board.name}
        notes={noteCount}
        onOpenChange={setDeleting}
        onDelete={(notesTo) => void remove(notesTo)}
      />
    </div>
  );
};

export default BoardView;
