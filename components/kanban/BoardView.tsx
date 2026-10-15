import { ArrowLeft, EllipsisVertical, Plus } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useBoardImages } from '../../lib/attachments';
import { BOARD_NAME_MAX, deleteBoard, renameBoard, restoreBoard, type BoardData } from '../../lib/boards';
import { useLabels } from '../../lib/notes';
import { BOARDS_HREF, newNoteHref, noteHref, openEditor } from '../../lib/routes';
import type { NoteKind } from '../../lib/types';
import IconButton from '../ui/IconButton';
import Menu from '../ui/Menu';
import { useToast } from '../ui/Toast';
import styles from './Board.module.css';
import BoardColumns from './BoardColumns';
import DeleteBoardDialog from './DeleteBoardDialog';
import InlineName from './InlineName';

const BoardView = ({ data }: { data: BoardData }) => {
  const router = useRouter();
  const toast = useToast();
  const labels = useLabels();
  const images = useBoardImages();
  const [renaming, setRenaming] = useState(false);
  const [addingColumn, setAddingColumn] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const { board, columns, cards } = data;
  const labelNames = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);
  const noteCount = [...cards.values()].reduce((sum, list) => sum + list.length, 0);

  const addCard = (columnId: string, kind: NoteKind, at: 'top' | 'bottom' = 'bottom') =>
    openEditor(router, newNoteHref(kind, { columnId, at }));

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
              setRenaming(false);
              void renameBoard(board.id, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h1 className={styles.boardTitle}>{board.name}</h1>
        )}
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
            { label: 'Rename board', onSelect: () => setRenaming(true) },
            { label: 'Add column', onSelect: () => setAddingColumn((n) => n + 1) },
            { label: 'Delete board…', danger: true, onSelect: () => setDeleting(true) },
          ]}
          trigger={
            <IconButton label='Board actions'>
              <EllipsisVertical size={18} aria-hidden />
            </IconButton>
          }
        />
      </header>
      <main className={styles.main}>
        <BoardColumns
          key={addingColumn}
          data={data}
          labelNames={labelNames}
          images={images}
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
