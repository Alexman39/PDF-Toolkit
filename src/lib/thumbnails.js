// Page previews rendered with pdf.js. This module is only imported by screens that show
// thumbnails, so pdf.js (~1 MB with its worker) never loads on the home page or in Merge.
//
// The legacy build polyfills the very new APIs the modern build relies on
// (e.g. Map.prototype.getOrInsertComputed), which many phones don't have yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// `?url` makes Vite copy the worker into dist/ and hand us its URL: pdf.js loads it from our own
// origin, never from a CDN.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Small JPEGs are ~10–20 KB per page; keeping a full canvas per page instead would hold
// about 0.5 MB of pixels each, ~100 MB for a 200-page document.
const IMAGE_TYPE = 'image/jpeg';
const IMAGE_QUALITY = 0.8;

/**
 * @typedef {object} Thumbnail
 * @property {string} url     A blob: URL, valid until the source is destroyed.
 * @property {number} width   CSS pixels.
 * @property {number} height  CSS pixels.
 */

/**
 * @typedef {object} ThumbnailSource
 * @property {number} pageCount
 * @property {(pageIndex: number, options: { width: number, signal?: AbortSignal }) => Promise<Thumbnail>} render
 * @property {() => Promise<void>} destroy  Frees pdf.js's worker and every thumbnail URL.
 */

/**
 * Opens a PDF for rendering thumbnails.
 *
 * No font, CMap or wasm URLs are configured on purpose: pdf.js would fetch them, which the CSP
 * (`connect-src 'none'`) forbids. Without them pdf.js falls back to system fonts, which is
 * fine at thumbnail size; JPEG 2000 images may not show.
 * @param {ArrayBuffer | Uint8Array} bytes  pdf.js transfers this to its worker, leaving it empty.
 * @returns {Promise<ThumbnailSource>}
 */
export async function openThumbnails(bytes) {
  const task = pdfjs.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const doc = await task.promise;
  /** @type {Set<string>} */
  const urls = new Set();

  return {
    pageCount: doc.numPages,

    async render(pageIndex, { width, signal }) {
      signal?.throwIfAborted();
      const page = await doc.getPage(pageIndex + 1);
      try {
        signal?.throwIfAborted();
        const base = page.getViewport({ scale: 1 });
        // Render at device resolution so previews are sharp on high-density screens.
        const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const renderTask = page.render({ canvas, viewport });
        const cancel = () => renderTask.cancel();
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          await renderTask.promise;
        } finally {
          signal?.removeEventListener('abort', cancel);
        }

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('Canvas encoding failed'))),
            IMAGE_TYPE,
            IMAGE_QUALITY,
          );
        });
        // Free the pixels now rather than whenever the canvas is garbage-collected.
        canvas.width = canvas.height = 0;
        signal?.throwIfAborted();

        const url = URL.createObjectURL(blob);
        urls.add(url);
        return { url, width: viewport.width / pixelRatio, height: viewport.height / pixelRatio };
      } finally {
        // Drops the page's decoded fonts and images from pdf.js's caches.
        page.cleanup();
      }
    },

    async destroy() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      await task.destroy();
    },
  };
}
