const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

// The spec allows junk before the header and readers tolerate up to 1024 bytes of it.
const HEADER_SEARCH_LIMIT = 1024;

/**
 * Checks for the `%PDF-` signature instead of trusting the file extension.
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {boolean}
 */
export function hasPdfHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const lastStart = Math.min(bytes.length, HEADER_SEARCH_LIMIT) - PDF_MAGIC.length;
  for (let start = 0; start <= lastStart; start++) {
    if (PDF_MAGIC.every((byte, i) => bytes[start + i] === byte)) return true;
  }
  return false;
}
