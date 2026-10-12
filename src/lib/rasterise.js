// The first half of strong compression: every page drawn with pdf.js and saved as a JPEG.
// Runs in pdf.worker.js (OffscreenCanvas) or on the main thread (<canvas>); the caller passes
// what differs between the two.
import { pdfjs } from './pdfjs.js';

/** @typedef {import('../core/compress.js').ImagePage} ImagePage */
/** @typedef {HTMLCanvasElement | OffscreenCanvas} AnyCanvas */

const POINTS_PER_INCH = 72;
// iOS Safari refuses canvases above ~16.7 million pixels (4096²) and draws nothing. Large
// pages (posters, drawings) get a lower DPI instead of a blank image.
const MAX_CANVAS_PIXELS = 4096 * 4096;

/**
 * @typedef {object} RasteriseOptions
 * @property {number} dpi      Pixels per inch of the page, e.g. 72, 110 or 150.
 * @property {number} quality  JPEG quality from 0 to 1.
 * @property {(width: number, height: number) => AnyCanvas} createCanvas
 * @property {object} [documentOptions]  Extra pdf.js `getDocument` options for this thread.
 * @property {(done: number, total: number) => void} [onProgress]  Once per page.
 * @property {AbortSignal} [signal]
 */

/**
 * @param {ArrayBuffer | Uint8Array} bytes  pdf.js transfers this to its worker, leaving it empty.
 * @param {RasteriseOptions} options
 * @returns {Promise<ImagePage[]>}
 */
export async function rasterisePdf(bytes, { documentOptions, onProgress, signal, ...page }) {
  const task = pdfjs.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    // The CSP forbids eval; saying so up front avoids a CSP violation on every PostScript
    // function, which pdf.js then interprets instead.
    isEvalSupported: false,
    ...documentOptions,
  });
  try {
    const doc = await task.promise;
    /** @type {ImagePage[]} */
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      signal?.throwIfAborted();
      pages.push(await rasterisePage(await doc.getPage(number), { ...page, signal }));
      onProgress?.(number, doc.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {Pick<RasteriseOptions, 'dpi' | 'quality' | 'createCanvas' | 'signal'>} options
 * @returns {Promise<ImagePage>}
 */
async function rasterisePage(page, { dpi, quality, createCanvas, signal }) {
  try {
    // At scale 1 a viewport is measured in points, with the page's /Rotate already applied:
    // exactly the size the new, upright page needs.
    const { width, height } = page.getViewport({ scale: 1 });
    const scale = Math.min(dpi / POINTS_PER_INCH, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    try {
      // JPEG has no transparency: without a white background, empty areas would turn black.
      const renderTask = page.render({ canvas, viewport, background: '#ffffff' });
      const cancel = () => renderTask.cancel();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        await renderTask.promise;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
      const blob = await encodeJpeg(canvas, quality);
      return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
    } finally {
      // Frees the pixels now (~9 MB for A4 at 150 DPI) rather than at garbage collection.
      canvas.width = canvas.height = 0;
    }
  } finally {
    // Drops the page's decoded fonts and images from pdf.js's caches.
    page.cleanup();
  }
}

/**
 * @param {AnyCanvas} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function encodeJpeg(canvas, quality) {
  const type = 'image/jpeg';
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
      type,
      quality,
    );
  });
}
