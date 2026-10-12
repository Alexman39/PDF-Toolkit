import { runPdfJob } from '../../lib/pdfWorkerClient.js';

/** @typedef {import('../../lib/thumbnails.js').ThumbnailSource} ThumbnailSource */

/**
 * @typedef {object} OpenedDocument
 * @property {number} pageCount
 * @property {ThumbnailSource | null} thumbnails  Null when pdf.js couldn't open the file;
 *   the tool still works, just without previews.
 */

/**
 * Checks a picked file with pdf-lib in the worker (so encrypted or corrupt files fail here,
 * before the user sets anything up), then opens it in pdf.js for previews.
 * @param {File} file
 * @param {AbortSignal} signal
 * @returns {Promise<OpenedDocument>}
 * @throws {import('../../core/errors.js').PdfToolkitError} When the file can't be processed.
 */
export async function openDocument(file, signal) {
  const { pageCount } = await runPdfJob('inspect', { bytes: await file.arrayBuffer() }, { signal });
  signal.throwIfAborted();

  let thumbnails = null;
  try {
    const { openThumbnails } = await import('../../lib/thumbnails.js');
    // A second read: the worker took ownership of the first buffer.
    thumbnails = await openThumbnails(await file.arrayBuffer());
  } catch (error) {
    // Previews are a convenience; pdf-lib already accepted the file, so carry on without them.
    console.warn('Thumbnails unavailable', error);
  }
  if (signal.aborted) {
    await thumbnails?.destroy();
    signal.throwIfAborted();
  }
  return { pageCount, thumbnails };
}
