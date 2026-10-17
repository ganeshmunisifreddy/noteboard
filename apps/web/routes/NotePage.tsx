import { useEffect, useState } from 'react';
import NoteEditor from '../components/editor/NoteEditor';
import NotFound from '../components/NotFound';
import { Link, useNav, useQuery } from '../lib/navigation';
import { useNote } from '../lib/notes';
import { newNoteHref, type NewCardPlace } from '../lib/routes';
import { useStartup } from '../lib/startup';
import type { NoteKind } from '../lib/types';
import styles from '../styles/NotePage.module.css';
import PageLoading from './PageLoading';

const single = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

const parseKind = (value: string | string[] | undefined): NoteKind | null =>
  value === 'note' || value === 'list' ? value : null;

const Missing = () => (
  <div className={styles.missing}>
    <NotFound text='Note not found' />
    <Link to='/' className={styles.backLink}>
      Back to notes
    </Link>
  </div>
);

type LoaderProps = { id: string; newKind: NoteKind | null; newPlace: NewCardPlace | null };

const EditorLoader = ({ id, newKind, newPlace }: LoaderProps) => {
  const stored = useNote(id);
  const [editing, setEditing] = useState(false);
  const canEdit = stored !== undefined && (stored !== null || newKind !== null);
  // Once open, stay open: right after a new note's first save the URL drops
  // `new` before the live query has caught up, and remounting would lose focus.
  if (canEdit && !editing) setEditing(true);
  if (editing || canEdit) {
    return <NoteEditor key={id} noteId={id} stored={stored ?? null} newKind={newKind} newPlace={newPlace} />;
  }
  if (stored === undefined) return <PageLoading />;
  return <Missing />;
};

const NotePage = () => {
  const nav = useNav();
  const query = useQuery();
  const status = useStartup();
  const id = single(query.id);
  const newKind = parseKind(query.new);
  // A new card from a board column carries its place.
  const column = single(query.column);
  const newPlace: NewCardPlace | null =
    newKind && column
      ? { columnId: column, boardId: single(query.board) ?? undefined, at: query.at === 'top' ? 'top' : 'bottom' }
      : null;

  // `/note?new=list` without an id: give the draft its id up front.
  useEffect(() => {
    if (newKind && !id) nav.swap(newNoteHref(newKind));
  }, [nav, newKind, id]);

  if (status === 'pending') return <PageLoading />;
  if (id) return <EditorLoader key={id} id={id} newKind={newKind} newPlace={newPlace} />;
  if (newKind) return <PageLoading />;
  return <Missing />;
};

export default NotePage;
