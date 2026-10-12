// Worker side of the protocol in messages.js: runs core operations and posts the outcome.
// Free of `self` so Node tests can call it directly.

import { buildImagePdf, findUnsupportedImages, optimisePdf } from '../core/compress.js';
import { loadPdf } from '../core/loadPdf.js';
import { mergePdfs } from '../core/merge.js';
import { rotatePages } from '../core/rotate.js';
import { splitPdf } from '../core/split.js';
import { packageSplitOutputs } from '../core/zip.js';
import { canRenderInWorker } from './canRenderInWorker.js';
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
  // `forCompress` is opt-in because it walks every object, which only Compress needs. It also
  // says where strong compression can render, so the screen needs no extra round trip.
  async inspect({ bytes, forCompress = false }) {
    const doc = await loadPdf(bytes);
    const pageCount = doc.getPageCount();
    if (!forCompress) return { pageCount };
    return {
      pageCount,
      unsupportedImages: findUnsupportedImages(doc),
      canRenderInWorker: canRenderInWorker(),
    };
  },
  async merge({ inputs }, onProgress) {
    return { bytes: await mergePdfs(inputs, { onProgress }) };
  },
  // Zipped here rather than on the main thread: hashing (CRC-32) every byte of a large split
  // would otherwise freeze the page.
  async split({ bytes, mode, fileName }, onProgress) {
    return packageSplitOutputs(await splitPdf(bytes, mode, { onProgress }), fileName);
  },
  async rotate({ bytes, deltas }) {
    return { bytes: await rotatePages(bytes, deltas) };
  },
  async optimise({ bytes, options }) {
    return { bytes: await optimisePdf(bytes, options) };
  },
  // Progress counts rendered pages only: rendering takes nearly all the time.
  async compressStrong({ bytes, dpi, quality }, onProgress) {
    const { rasteriseInWorker } = await import('./renderInWorker.js');
    const pages = await rasteriseInWorker(bytes, { dpi, quality, onProgress });
    return { bytes: await buildImagePdf(pages) };
  },
  // Strong compression when the pages had to be rendered on the main thread: only the
  // assembly runs here.
  async buildImagePdf({ pages }, onProgress) {
    return { bytes: await buildImagePdf(pages, { onProgress }) };
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
