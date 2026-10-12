// Typed errors thrown by src/core. The UI maps `code` to a user-facing message;
// it should never show `message` (developer-facing) or match on message text.

/**
 * Base class so callers can tell our expected failures apart from real bugs.
 */
export class PdfToolkitError extends Error {
  /** @type {string} */
  static code = 'UNKNOWN';

  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
    this.code = new.target.code;
  }
}

/** The bytes do not start with a `%PDF-` header. */
export class NotPdfError extends PdfToolkitError {
  static code = 'NOT_PDF';

  /**
   * @param {string} [message]
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message = 'File is not a PDF (missing %PDF- header)', options) {
    super(message, options);
  }
}

/** The PDF is encrypted; pdf-lib cannot decrypt it, so any output would be broken. */
export class EncryptedPdfError extends PdfToolkitError {
  static code = 'ENCRYPTED';

  /**
   * @param {string} [message]
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message = 'PDF is encrypted', options) {
    super(message, options);
  }
}

/** The file claims to be a PDF but cannot be parsed into usable pages. */
export class CorruptPdfError extends PdfToolkitError {
  static code = 'CORRUPT';

  /**
   * @param {string} [message]
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message = 'PDF is corrupt or unreadable', options) {
    super(message, options);
  }
}

/** The user's page range text is invalid for this document. */
export class PageRangeError extends PdfToolkitError {
  static code = 'PAGE_RANGE';

  /**
   * @param {string} [message]
   * @param {{ cause?: unknown, token?: string }} [options]
   */
  constructor(message = 'Invalid page range', { token, ...options } = {}) {
    super(message, options);
    /** The part of the input that failed, so the UI can highlight it. */
    this.token = token;
  }
}

/** The input exceeds what a browser tab can safely hold in memory. */
export class TooLargeError extends PdfToolkitError {
  static code = 'TOO_LARGE';

  /**
   * @param {string} [message]
   * @param {{ cause?: unknown, bytes?: number, limit?: number }} [options]
   */
  constructor(message = 'Input is too large to process in the browser', options = {}) {
    const { bytes, limit, ...rest } = options;
    super(message, rest);
    this.bytes = bytes;
    this.limit = limit;
  }
}
