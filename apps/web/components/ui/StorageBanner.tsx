import { useStartup } from '../../lib/startup';
import styles from './StorageBanner.module.css';

const StorageBanner = () => {
  const status = useStartup();
  if (status !== 'unavailable') return null;
  return (
    <div role='alert' className={styles.banner}>
      Storage is unavailable, so notes won’t be saved.
    </div>
  );
};

export default StorageBanner;
