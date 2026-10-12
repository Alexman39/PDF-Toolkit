// The message format between the UI and pdf.worker.js, and the helpers both sides need.
// Imports nothing heavy: the main thread loads this, so pulling in pdf-lib here would put it
// in the main bundle.
//
//   main → worker:  { id, op, payload }
//   worker → main:  { id, type: 'progress', done, total }
//                   { id, type: 'result', result }
//                   { id, type: 'error', error: SerializedError }
//
// Cancelling is not a message: pdf-lib never checks for one mid-operation, so the client
// terminates the worker instead (see lib/pdfWorkerClient.js).

import {
  CorruptPdfError,
  EncryptedPdfError,
  NotPdfError,
  PageRangeError,
  PdfToolkitError,
  TooLargeError,
} from '../core/errors.js';

/** @typedef {'merge' | 'split' | 'rotate' | 'optimise'} PdfOperation */

/**
 * @typedef {object} JobMessage
 * @property {number} id
 * @property {PdfOperation} op
 * @property {any} payload
 */

/**
 * @typedef {object} SerializedError
 * @property {string} name
 * @property {string} code     `UNKNOWN` for errors that are not PdfToolkitErrors (i.e. bugs).
 * @property {string} message
 * @property {number} [fileIndex]
 * @property {string} [token]
 * @property {number} [bytes]
 * @property {number} [limit]
 */

/**
 * Finds every ArrayBuffer in a message so postMessage can move it instead of copying it.
 * A Set, because listing the same buffer twice (e.g. merging one file with itself) throws.
 * @param {unknown} value  Plain objects, arrays, ArrayBuffers and typed arrays.
 * @returns {ArrayBuffer[]}
 */
export function collectTransferables(value) {
  const buffers = new Set();
  const pending = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item instanceof ArrayBuffer) buffers.add(item);
    else if (ArrayBuffer.isView(item)) buffers.add(item.buffer);
    else if (Array.isArray(item)) pending.push(...item);
    else if (item && typeof item === 'object') pending.push(...Object.values(item));
  }
  return [...buffers];
}

// Structured clone keeps only an Error's name and message, so the fields the UI relies on
// (code, fileIndex…) are copied by hand.
const EXTRA_FIELDS = ['fileIndex', 'token', 'bytes', 'limit'];

/** @type {Record<string, new (message?: string) => PdfToolkitError>} */
const ERRORS_BY_CODE = Object.fromEntries(
  [NotPdfError, EncryptedPdfError, CorruptPdfError, PageRangeError, TooLargeError].map((Class) => [
    Class.code,
    Class,
  ]),
);

/**
 * @param {unknown} error
 * @returns {SerializedError}
 */
export function serializeError(error) {
  if (!(error instanceof Error)) {
    return { name: 'Error', code: PdfToolkitError.code, message: String(error) };
  }
  const serialized = {
    name: error.name,
    code: error instanceof PdfToolkitError ? error.code : PdfToolkitError.code,
    message: error.message,
  };
  for (const field of EXTRA_FIELDS) {
    if (error[field] !== undefined) serialized[field] = error[field];
  }
  return serialized;
}

/**
 * Rebuilds the typed error class from `code`, so `instanceof EncryptedPdfError` works on the
 * main thread exactly as it does in tests.
 * @param {SerializedError} serialized
 * @returns {Error}
 */
export function deserializeError(serialized) {
  const Class = ERRORS_BY_CODE[serialized.code];
  const error = Class ? new Class(serialized.message) : new Error(serialized.message);
  if (!Class) {
    // Keeps e.g. "RangeError" visible in logs; `code` stays UNKNOWN so the UI shows a
    // generic message for bugs.
    error.name = serialized.name;
    error.code = serialized.code;
  }
  for (const field of EXTRA_FIELDS) {
    if (serialized[field] !== undefined) error[field] = serialized[field];
  }
  return error;
}
