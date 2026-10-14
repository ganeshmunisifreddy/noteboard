import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import NoteEditor from '../components/editor/NoteEditor';
import NotFound from '../components/NotFound';
import { useNote } from '../lib/notes';
import { newNoteHref } from '../lib/routes';
import { useStartup } from '../lib/startup';
import type { NoteKind } from '../lib/types';
import styles from '../styles/NotePage.module.css';

const single = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

const parseKind = (value: string | string[] | undefined): NoteKind | null =>
  value === 'note' || value === 'list' ? value : null;

const Loading = () => <div className={styles.loading} aria-busy='true' />;

const Missing = () => (
  <div className={styles.missing}>
    <NotFound text='Note not found' />
    <Link href='/' className={styles.backLink}>
      Back to notes
    </Link>
  </div>
);

const EditorLoader = ({ id, newKind }: { id: string; newKind: NoteKind | null }) => {
  const stored = useNote(id);
  const [editing, setEditing] = useState(false);
  const canEdit = stored !== undefined && (stored !== null || newKind !== null);
  // Once open, stay open: right after a new note's first save the URL drops
  // `new` before the live query has caught up, and remounting would lose focus.
  if (canEdit && !editing) setEditing(true);
  if (editing || canEdit) return <NoteEditor key={id} noteId={id} stored={stored ?? null} newKind={newKind} />;
  if (stored === undefined) return <Loading />;
  return <Missing />;
};

const NotePage: NextPage = () => {
  const router = useRouter();
  const status = useStartup();
  const id = single(router.query.id);
  const newKind = parseKind(router.query.new);

  // `/note?new=list` without an id: give the draft its id up front.
  useEffect(() => {
    if (router.isReady && newKind && !id) void router.replace(newNoteHref(newKind));
  }, [router, newKind, id]);

  if (!router.isReady || status === 'pending') return <Loading />;
  if (id) return <EditorLoader key={id} id={id} newKind={newKind} />;
  if (newKind) return <Loading />;
  return <Missing />;
};

export default NotePage;
