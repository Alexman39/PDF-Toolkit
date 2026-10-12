// Worker side of the protocol in messages.js: runs core operations and posts the outcome.
// Free of `self` so Node tests can call it directly.

import { optimisePdf } from '../core/compress.js';
import { loadPdf } from '../core/loadPdf.js';
import { mergePdfs } from '../core/merge.js';
import { rotatePages } from '../core/rotate.js';
import { splitPdf } from '../core/split.js';
import { collectTransferables, serializeError } from './messages.js';

/** @typedef {import('./messages.js').PdfOperation} PdfOperation */
/** @typedef {import('./messages.js').JobMessage} JobMessage */

/**
 * @callback PostMessage
 * @param {object} message
 * @param {Transferable[]} [transfer]
 * @returns {void}
 */

/** @typedef {import('../core/merge.js').ProgressCallback} ProgressCallback */

/** @type {Record<PdfOperation, (payload: any, onProgress: ProgressCallback) => Promise<object>>} */
const OPERATIONS = {
  // Run when a file is picked, so encrypted or corrupt files are reported before the user
  // sets anything up. pdf.js (thumbnails) opens some files pdf-lib refuses, e.g. ones with
  // only an owner password, so its opinion isn't enough.
  async inspect({ bytes }) {
    const doc = await loadPdf(bytes);
    return { pageCount: doc.getPageCount() };
  },
  async merge({ inputs }, onProgress) {
    return { bytes: await mergePdfs(inputs, { onProgress }) };
  },
  async split({ bytes, mode }, onProgress) {
    return { outputs: await splitPdf(bytes, mode, { onProgress }) };
  },
  async rotate({ bytes, deltas }) {
    return { bytes: await rotatePages(bytes, deltas) };
  },
  async optimise({ bytes, options }) {
    return { bytes: await optimisePdf(bytes, options) };
  },
};

/**
 * Runs one job and reports progress, then exactly one result or error, through `post`.
 * Never throws: every failure becomes an error message, so the caller's promise always settles.
 * @param {JobMessage} message
 * @param {PostMessage} post
 * @returns {Promise<void>}
 */
export async function runJob({ id, op, payload }, post) {
  try {
    if (!Object.hasOwn(OPERATIONS, op)) throw new TypeError(`Unknown operation: ${op}`);
    const onProgress = (done, total) => post({ id, type: 'progress', done, total });
    const result = await OPERATIONS[op](payload, onProgress);
    post({ id, type: 'result', result }, collectTransferables(result));
  } catch (error) {
    post({ id, type: 'error', error: serializeError(error) });
  }
}
