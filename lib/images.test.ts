import { describe, expect, it, vi } from 'vitest';
import { ImageError, fitWithin, outputFormat, processImage, type ImageTools } from './images';

const fakeTools = ({ width = 4000, height = 3000, hasAlpha = false, webp = true, failDecode = false } = {}) => {
  const encoded: { width: number; height: number; type: string; quality?: number }[] = [];
  const close = vi.fn();
  const tools: ImageTools = {
    decode: async () => {
      if (failDecode) throw new Error('bad data');
      return { width, height, hasAlpha, source: {} as CanvasImageSource, close };
    },
    encode: async (_image, w, h, type, quality) => {
      encoded.push({ width: w, height: h, type, quality });
      return new Blob([`${w}x${h}`], { type });
    },
    canWriteWebp: async () => webp,
  };
  return { tools, encoded, close };
};

const file = (size: number, type = 'image/jpeg', name = 'photo.jpg') => {
  const f = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('fitWithin', () => {
  it('scales the longest side down, never up', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1000, 4000, 480)).toEqual({ width: 120, height: 480 });
    expect(fitWithin(300, 200, 480)).toEqual({ width: 300, height: 200 });
  });
});

describe('outputFormat', () => {
  it('uses JPEG unless the image has transparency', () => {
    expect(outputFormat(false, true)).toBe('image/jpeg');
    expect(outputFormat(true, true)).toBe('image/webp');
    expect(outputFormat(true, false)).toBe('image/png');
  });
});

describe('processImage', () => {
  it('shrinks a large photo and makes a thumbnail', async () => {
    const { tools, encoded, close } = fakeTools();
    const result = await processImage(file(5_000_000), tools);
    expect(encoded).toEqual([
      { width: 480, height: 360, type: 'image/jpeg', quality: 0.85 },
      { width: 2048, height: 1536, type: 'image/jpeg', quality: 0.85 },
    ]);
    expect(result).toMatchObject({ type: 'image/jpeg', width: 2048, height: 1536, thumbType: 'image/jpeg' });
    expect(close).toHaveBeenCalled();
  });

  it('keeps a small image as it is', async () => {
    const { tools, encoded } = fakeTools({ width: 800, height: 600 });
    const result = await processImage(file(200_000, 'image/png', 'shot.png'), tools);
    expect(encoded).toHaveLength(1); // only the thumbnail
    expect(result).toMatchObject({ type: 'image/png', width: 800, height: 600 });
    expect(result.bytes.byteLength).toBe(1024);
  });

  it('keeps transparency', async () => {
    expect((await processImage(file(5_000_000, 'image/png'), fakeTools({ hasAlpha: true }).tools)).type).toBe('image/webp');
    expect((await processImage(file(5_000_000, 'image/png'), fakeTools({ hasAlpha: true, webp: false }).tools)).type).toBe(
      'image/png',
    );
  });

  it('refuses files it can not use', async () => {
    await expect(processImage(file(100, 'application/pdf', 'a.pdf'), fakeTools().tools)).rejects.toEqual(
      new ImageError('unreadable'),
    );
    await expect(processImage(file(26 * 1024 * 1024), fakeTools().tools)).rejects.toEqual(new ImageError('too-large'));
    await expect(processImage(file(100), fakeTools({ failDecode: true }).tools)).rejects.toEqual(new ImageError('unreadable'));
  });

  it('re-encodes small images in formats browsers may not show', async () => {
    const { tools, encoded } = fakeTools({ width: 800, height: 600 });
    const result = await processImage(file(200_000, 'image/bmp', 'scan.bmp'), tools);
    expect(encoded).toHaveLength(2);
    expect(result.type).toBe('image/jpeg');
  });
});
