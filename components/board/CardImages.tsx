import { useObjectUrl } from '../../lib/useObjectUrl';
import type { Attachment } from '../../lib/types';
import styles from './CardImages.module.css';

const Thumb = ({ image }: { image: Attachment }) => {
  const url = useObjectUrl(image.thumb, image.thumbType);
  // Local blob URLs: next/image can't optimise them.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt='' className={styles.image} draggable={false} /> : <span className={styles.image} />;
};

// Up to three thumbnails at the top of a card, with "+N" for the rest. The
// note's own gallery carries the descriptions, so these are decorative.
const CardImages = ({ images }: { images: Attachment[] }) => {
  const shown = images.slice(0, 3);
  const more = images.length - shown.length;
  return (
    <div className={styles.images} data-count={shown.length} aria-hidden>
      {shown.map((image, index) => (
        <div key={image.id} className={styles.cell}>
          <Thumb image={image} />
          {more > 0 && index === shown.length - 1 && <span className={styles.more}>+{more}</span>}
        </div>
      ))}
    </div>
  );
};

export default CardImages;
