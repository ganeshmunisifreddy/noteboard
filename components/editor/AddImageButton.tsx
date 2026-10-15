import { ImagePlus } from 'lucide-react';
import { useRef } from 'react';
import IconButton from '../ui/IconButton';

// A hidden file input and a way to open it (phones offer the camera from the
// same picker), for the toolbar button or a menu item.
export const useImagePicker = (onAdd: (files: File[]) => void) => {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type='file'
      accept='image/*'
      multiple
      hidden
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (files.length > 0) onAdd(files);
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
};

const AddImageButton = ({ onOpen }: { onOpen: () => void }) => (
  <IconButton label='Add image' onClick={onOpen}>
    <ImagePlus size={18} aria-hidden />
  </IconButton>
);

export default AddImageButton;
