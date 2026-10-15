import { ImagePlus } from 'lucide-react';
import { useRef } from 'react';
import IconButton from '../ui/IconButton';

// Phones offer the camera from the same picker.
const AddImageButton = ({ onAdd }: { onAdd: (files: File[]) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton label='Add image' onClick={() => input.current?.click()}>
        <ImagePlus size={18} aria-hidden />
      </IconButton>
      <input
        ref={input}
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
    </>
  );
};

export default AddImageButton;
