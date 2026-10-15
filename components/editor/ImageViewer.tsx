import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { KeyboardEvent } from 'react';
import { useImageFile } from '../../lib/attachments';
import type { Attachment } from '../../lib/types';
import { useObjectUrl } from '../../lib/useObjectUrl';
import IconButton from '../ui/IconButton';
import styles from './ImageViewer.module.css';

const FullImage = ({ image, label }: { image: Attachment; label: string }) => {
  const file = useImageFile(image.id);
  const url = useObjectUrl(file?.bytes, image.type);
  if (file === null) return <p className={styles.missing}>Image unavailable</p>;
  // Local blob URLs: next/image can't optimise them.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={image.alt || label} className={styles.image} /> : <div className={styles.loading} />;
};

type Props = {
  images: Attachment[];
  index: number | null; // open when set
  readOnly: boolean;
  onIndexChange: (index: number | null) => void;
  onRemove: (image: Attachment) => void;
  onDescribe: (image: Attachment, alt: string) => void;
};

// Full-screen view of one image; Esc closes it and focus goes back to the
// gallery button that opened it.
const ImageViewer = ({ images, index, readOnly, onIndexChange, onRemove, onDescribe }: Props) => {
  const image = index === null ? undefined : images[index];
  const label = index === null ? '' : `Image ${index + 1} of ${images.length}`;
  const go = (next: number) => {
    if (next >= 0 && next < images.length) onIndexChange(next);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (index === null || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft') go(index - 1);
    if (event.key === 'ArrowRight') go(index + 1);
  };

  return (
    <Dialog.Root open={image !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined} onKeyDown={onKeyDown}>
          {image && index !== null && (
            <>
              <div className={styles.bar}>
                <Dialog.Title className={styles.title}>{label}</Dialog.Title>
                {!readOnly && (
                  <IconButton label='Remove image' onClick={() => onRemove(image)}>
                    <Trash2 size={18} aria-hidden />
                  </IconButton>
                )}
                <Dialog.Close asChild>
                  <IconButton label='Close'>
                    <X size={18} aria-hidden />
                  </IconButton>
                </Dialog.Close>
              </div>
              <div className={styles.stage}>
                {/* aria-disabled, not disabled: a disabled button would drop
                    focus out of the viewer at the first or last image. */}
                <IconButton label='Previous image' aria-disabled={index === 0} onClick={() => go(index - 1)}>
                  <ChevronLeft size={22} aria-hidden />
                </IconButton>
                <FullImage key={image.id} image={image} label={label} />
                <IconButton
                  label='Next image'
                  aria-disabled={index === images.length - 1}
                  onClick={() => go(index + 1)}
                >
                  <ChevronRight size={22} aria-hidden />
                </IconButton>
              </div>
              {readOnly ? (
                image.alt && <p className={styles.alt}>{image.alt}</p>
              ) : (
                <label className={styles.describe}>
                  Description
                  <input
                    key={image.id}
                    className={styles.input}
                    defaultValue={image.alt}
                    placeholder='Describe this image'
                    onBlur={(e) => onDescribe(image, e.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ImageViewer;
