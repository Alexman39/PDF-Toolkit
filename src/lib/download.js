// Revoking straight after click() can cancel the download in Firefox and Safari, which read
// the blob asynchronously. A short delay is long enough and still frees memory soon.
const REVOKE_DELAY_MS = 10_000;

/**
 * Saves bytes as a file via a temporary object URL, then revokes the URL to free the memory
 * the Blob holds.
 * @param {Uint8Array | Blob} data
 * @param {string} fileName
 * @param {string} [type]  MIME type, ignored when `data` is already a Blob.
 * @returns {void}
 */
export function downloadBytes(data, fileName, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // Firefox ignores click() on links that are not in the document.
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
