export const FULL_SIZE = 2048;
export const THUMB_SIZE = 480;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

export class ImageError extends Error {
  kind: 'unreadable' | 'too-large';
  constructor(kind: 'unreadable' | 'too-large') {
    super(kind);
    this.kind = kind;
  }
}

export const fitWithin = (width: number, height: number, max: number) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

// JPEG for photos and anything opaque; transparency needs WebP or PNG.
export const outputFormat = (hasAlpha: boolean, webp: boolean) =>
  !hasAlpha ? 'image/jpeg' : webp ? 'image/webp' : 'image/png';

const QUALITY: Record<string, number | undefined> = { 'image/jpeg': 0.85, 'image/webp': 0.9 };

export type Decoded = { width: number; height: number; hasAlpha: boolean; source: CanvasImageSource; close: () => void };

export type ImageTools = {
  decode: (file: Blob) => Promise<Decoded>;
  encode: (image: Decoded, width: number, height: number, type: string, quality?: number) => Promise<Blob>;
  canWriteWebp: () => Promise<boolean>;
};

export type ProcessedImage = {
  bytes: ArrayBuffer;
  type: string;
  width: number;
  height: number;
  thumb: ArrayBuffer;
  thumbType: string;
};

const MAY_HAVE_ALPHA = /^image\/(png|webp|gif|avif)$/;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode'))), type, quality),
  );

// Looks at a small copy for any pixel that isn't fully opaque.
const hasTransparency = (bitmap: ImageBitmap) => {
  const size = fitWithin(bitmap.width, bitmap.height, 64);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return true;
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const { data } = context.getImageData(0, 0, size.width, size.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
};

let webpSupport: Promise<boolean> | null = null;

// The browser applies the photo's EXIF orientation when decoding.
export const browserTools: ImageTools = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: MAY_HAVE_ALPHA.test(file.type) && hasTransparency(bitmap),
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  encode: (image, width, height, type, quality) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('No canvas'));
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, width, height);
    return toBlob(canvas, type, quality);
  },
  // Some browsers silently write PNG when asked for WebP.
  canWriteWebp: () => {
    webpSupport ??= (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return toBlob(canvas, 'image/webp').then(
        (blob) => blob.type === 'image/webp',
        () => false,
      );
    })();
    return webpSupport;
  },
};

export const processImage = async (file: File, tools: ImageTools = browserTools): Promise<ProcessedImage> => {
  if (!file.type.startsWith('image/')) throw new ImageError('unreadable');
  if (file.size > MAX_FILE_BYTES) throw new ImageError('too-large');
  let image: Decoded;
  try {
    image = await tools.decode(file);
  } catch {
    throw new ImageError('unreadable');
  }
  try {
    const type = outputFormat(image.hasAlpha, image.hasAlpha && (await tools.canWriteWebp()));
    const thumbSize = fitWithin(image.width, image.height, THUMB_SIZE);
    const thumb = await tools.encode(image, thumbSize.width, thumbSize.height, type, QUALITY[type]);
    const thumbPart = { thumb: await thumb.arrayBuffer(), thumbType: thumb.type || type };
    if (Math.max(image.width, image.height) <= FULL_SIZE && file.size <= KEEP_AS_IS_BYTES) {
      return { bytes: await file.arrayBuffer(), type: file.type, width: image.width, height: image.height, ...thumbPart };
    }
    const size = fitWithin(image.width, image.height, FULL_SIZE);
    const full = await tools.encode(image, size.width, size.height, type, QUALITY[type]);
    return { bytes: await full.arrayBuffer(), type: full.type || type, width: size.width, height: size.height, ...thumbPart };
  } catch {
    throw new ImageError('unreadable');
  } finally {
    image.close();
  }
};
