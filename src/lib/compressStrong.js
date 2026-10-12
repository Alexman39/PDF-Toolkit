import { PdfToolkitError } from '../core/errors.js';
import { runPdfJob } from './pdfWorkerClient.js';

/**
 * @typedef {object} StrongOptions
 * @property {number} dpi
 * @property {number} quality  JPEG quality from 0 to 1.
 * @property {boolean} canRenderInWorker  From the `inspect` op with `forCompress: true`.
 * @property {AbortSignal} signal
 * @property {(done: number, total: number) => void} [onProgress]  Once per rendered page.
 */

/**
 * Strong (lossy) compression: every page becomes a JPEG. Renders in the PDF worker where the
 * browser allows it, otherwise on the main thread, with only the assembly in the worker.
 * @param {File | Blob} file
 * @param {StrongOptions} options
 * @returns {Promise<Uint8Array>}
 */
export async function compressStrong(
  file,
  { dpi, quality, canRenderInWorker, signal, onProgress },
) {
  if (canRenderInWorker) {
    try {
      const payload = { bytes: await file.arrayBuffer(), dpi, quality };
      const { bytes } = await runPdfJob('compressStrong', payload, { signal, onProgress });
      return bytes;
    } catch (error) {
      // A damaged file fails the same way on either thread, and a cancel is a cancel.
      if (signal.aborted || error instanceof PdfToolkitError) throw error;
      // Worker rendering leans on newer APIs (OffscreenCanvas, fonts in workers) that a
      // browser can claim to support yet get wrong; the main thread is the proven path.
      console.warn('Rendering in the worker failed; retrying on the main thread', error);
    }
  }

  // Only loaded when needed: it brings pdf.js into the main thread.
  const { rasterisePdf } = await import('./rasterise.js');
  const pages = await rasterisePdf(await file.arrayBuffer(), {
    dpi,
    quality,
    signal,
    onProgress,
    createCanvas: (width, height) =>
      Object.assign(document.createElement('canvas'), { width, height }),
  });
  const { bytes } = await runPdfJob('buildImagePdf', { pages }, { signal });
  return bytes;
}
