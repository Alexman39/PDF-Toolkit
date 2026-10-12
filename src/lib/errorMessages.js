// The only place error codes become user-facing text (CLAUDE.md §7).

/** @type {Record<string, string>} */
const MESSAGES = {
  NOT_PDF: 'This file is not a PDF.',
  ENCRYPTED: 'This PDF is password-protected; unlock it first.',
  CORRUPT: 'This PDF is damaged and could not be read.',
  TOO_LARGE: 'This is too large to process in the browser. Try fewer or smaller files.',
};

const GENERIC = 'Something went wrong while processing the PDF.';

/**
 * @param {unknown} error   Usually a PdfToolkitError rebuilt by the worker client.
 * @param {string} [fileName]  Prefixed so the user knows which file in a merge failed.
 * @returns {string}
 */
export function userMessageFor(error, fileName) {
  if (error?.name === 'AbortError') return 'Cancelled.';
  // pageRanges.js writes these messages for the user (e.g. "did you mean 3-5?").
  const text = error?.code === 'PAGE_RANGE' ? error.message : (MESSAGES[error?.code] ?? GENERIC);
  return fileName ? `${fileName}: ${text}` : text;
}
