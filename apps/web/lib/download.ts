// Saves text as a file; large text can come in parts (a single string has
// a size limit). The URL is revoked a little later because Safari
// can cancel a download if it is revoked straight after the click.
export const downloadFile = (name: string, contents: string | string[], type: string) => {
  const url = URL.createObjectURL(new Blob(Array.isArray(contents) ? contents : [contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
