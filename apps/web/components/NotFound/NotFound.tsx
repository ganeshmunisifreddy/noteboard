import styles from './NotFound.module.css';
import NoNotesIcon from '../../assets/no_notes.svg';

type Props = {
  text?: string;
};

const NotFound = (props: Props) => {
  const { text = 'Not Found' } = props;

  return (
    <div className={styles.root}>
      <img src={NoNotesIcon} className={styles.image} alt='Notes by nine.technology' width={648} height={632} />
      <p>{text}</p>
    </div>
  );
};

export default NotFound;
