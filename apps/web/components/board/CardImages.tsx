import { useObjectUrl } from '../../lib/useObjectUrl';
import type { Attachment } from '../../lib/types';
import styles from './CardImages.module.css';

const Thumb = ({ image }: { image: Attachment }) => {
  const url = useObjectUrl(`${image.id}:thumb`, image.thumb, image.thumbType);
  return url ? <img src={url} alt='' className={styles.image} draggable={false} /> : <span className={styles.image} />;
};

// Up to three thumbnails at the top of a card, with "+N" for the rest. The
// note's own gallery carries the descriptions, so these are decorative.
// `total` counts images beyond the ones given (the board passes only three).
const CardImages = ({ images, total = images.length }: { images: Attachment[]; total?: number }) => {
  const shown = images.slice(0, 3);
  const more = total - shown.length;
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
