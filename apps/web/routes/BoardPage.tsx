import BoardView from '../components/kanban/BoardView';
import NotFound from '../components/NotFound';
import { Link, useQuery } from '../lib/navigation';
import { useBoard } from '../lib/boards';
import { useStartup } from '../lib/startup';
import styles from '../styles/NotePage.module.css';
import PageLoading from './PageLoading';

const single = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

const Missing = () => (
  <div className={styles.missing}>
    <NotFound text='Board not found' />
    <Link to='/?view=boards' className={styles.backLink}>
      Back to boards
    </Link>
  </div>
);

const BoardLoader = ({ id }: { id: string }) => {
  const data = useBoard(id);
  if (data === undefined) return <PageLoading />;
  if (data === null) return <Missing />;
  return <BoardView data={data} />;
};

const BoardPage = () => {
  const status = useStartup();
  const id = single(useQuery().id);
  if (status === 'pending') return <PageLoading />;
  if (!id) return <Missing />;
  return <BoardLoader key={id} id={id} />;
};

export default BoardPage;
