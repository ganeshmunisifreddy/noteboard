import styles from './NotFound.module.css';
import Image from 'next/image';
import NoNotesIcon from '../../assets/no_notes.svg';

type Props = {
  text?: string;
};

const NotFound = (props: Props) => {
  const { text = 'Not Found' } = props;

  return (
    <div className={styles.root}>
      <Image
        src={NoNotesIcon}
        className={styles.image}
        alt='Notes by nine.technology'
        loading='eager'
      />
      <p>{text}</p>
    </div>
  );
};

export default NotFound;
