// Page rendering inside pdf.worker.js. Loaded with import() by the `compressStrong` op only, so
// pdf.js stays out of the worker for every other job.
import { rasterisePdf } from '../lib/rasterise.js';

/**
 * pdf.js draws masks and patterns on scratch canvases from this factory. Its default creates
 * <canvas> elements through `document`, which workers don't have.
 * Same interface as pdf.js's (unexported) BaseCanvasFactory.
 */
class OffscreenCanvasFactory {
  /**
   * @param {number} width
   * @param {number} height
   */
  create(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    // Matches pdf.js's default: it reads these canvases back often.
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  /**
   * @param {{ canvas: OffscreenCanvas }} canvasAndContext
   * @param {number} width
   * @param {number} height
   */
  reset({ canvas }, width, height) {
    canvas.width = width;
    canvas.height = height;
  }

  /** @param {{ canvas: OffscreenCanvas | null, context: unknown }} canvasAndContext */
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Renders every page to a JPEG on an OffscreenCanvas. Call only when `canRenderInWorker()`.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{ dpi: number, quality: number, onProgress?: (done: number, total: number) => void }} options
 * @returns {Promise<import('../core/compress.js').ImagePage[]>}
 */
export function rasteriseInWorker(bytes, options) {
  return rasterisePdf(bytes, {
    ...options,
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
    documentOptions: {
      CanvasFactory: OffscreenCanvasFactory,
      // pdf.js only needs `document.fonts` to load the PDF's fonts; a worker's own FontFaceSet
      // serves the same purpose and is what its OffscreenCanvases draw text with.
      ownerDocument: { fonts: self.fonts },
    },
  });
}
