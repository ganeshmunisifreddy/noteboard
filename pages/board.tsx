import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BoardView from '../components/kanban/BoardView';
import NotFound from '../components/NotFound';
import { useBoard } from '../lib/boards';
import { useStartup } from '../lib/startup';
import styles from '../styles/NotePage.module.css';

const single = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

const Loading = () => <div className={styles.loading} aria-busy='true' />;

const Missing = () => (
  <div className={styles.missing}>
    <NotFound text='Board not found' />
    <Link href='/?view=boards' className={styles.backLink}>
      Back to boards
    </Link>
  </div>
);

const BoardLoader = ({ id }: { id: string }) => {
  const data = useBoard(id);
  if (data === undefined) return <Loading />;
  if (data === null) return <Missing />;
  return <BoardView data={data} />;
};

const BoardPage: NextPage = () => {
  const router = useRouter();
  const status = useStartup();
  const id = single(router.query.id);
  if (!router.isReady || status === 'pending') return <Loading />;
  if (!id) return <Missing />;
  return <BoardLoader key={id} id={id} />;
};

export default BoardPage;
