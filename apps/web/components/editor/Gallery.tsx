import { useImageFile } from '../../lib/attachments';
import type { Attachment } from '../../lib/types';
import { useObjectUrl } from '../../lib/useObjectUrl';
import styles from './Gallery.module.css';

type ItemProps = { image: Attachment; index: number; total: number; single: boolean; onOpen: (index: number) => void };

const GalleryItem = ({ image, index, total, single, onOpen }: ItemProps) => {
  // A single image is shown large, so it uses the full image once loaded.
  const file = useImageFile(single ? image.id : null);
  const full = useObjectUrl(`${image.id}:full`, file?.bytes, image.type);
  const thumb = useObjectUrl(`${image.id}:thumb`, image.thumb, image.thumbType);
  const url = full ?? thumb;
  return (
    <button
      type='button'
      className={styles.item}
      data-gallery-index={index}
      aria-label={`Open image ${index + 1} of ${total}${image.alt ? `: ${image.alt}` : ''}`}
      onClick={() => onOpen(index)}
    >
      {url && <img src={url} alt='' className={styles.image} draggable={false} />}
    </button>
  );
};

type Props = { images: Attachment[]; pending: number; onOpen: (index: number) => void };

// The note's images, above the title.
const Gallery = ({ images, pending, onOpen }: Props) => {
  const count = images.length + pending;
  return (
    <>
      {count > 0 && (
        <div className={styles.gallery} data-count={Math.min(count, 3)}>
          {images.map((image, index) => (
            <GalleryItem
              key={image.id}
              image={image}
              index={index}
              total={images.length}
              single={count === 1}
              onOpen={onOpen}
            />
          ))}
          {Array.from({ length: pending }, (_, index) => (
            <span key={`pending-${index}`} className={styles.pending} aria-hidden />
          ))}
        </div>
      )}
      {/* Always present: screen readers announce a status region's changes,
          not one that appears with its text already in it. */}
      <p role='status' className={styles.srOnly}>
        {pending === 0 ? '' : pending === 1 ? 'Adding 1 image…' : `Adding ${pending} images…`}
      </p>
    </>
  );
};

export default Gallery;
