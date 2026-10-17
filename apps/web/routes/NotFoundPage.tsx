import NotFound from '../components/NotFound';
import { Link } from '../lib/navigation';
import styles from '../styles/NotePage.module.css';

const NotFoundPage = () => (
  <div className={styles.missing}>
    <title>Not found | Noteboard</title>
    <NotFound text='Page not found' />
    <Link to='/' className={styles.backLink}>
      Back to notes
    </Link>
  </div>
);

export default NotFoundPage;
