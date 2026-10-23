// Image bytes travel in the JSON backup as base64.
export const toBase64 = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export const fromBase64 = (text: string): ArrayBuffer | null => {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  try {
    const binary = atob(text);
    const view = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i);
    return view.buffer;
  } catch {
    return null;
  }
};
