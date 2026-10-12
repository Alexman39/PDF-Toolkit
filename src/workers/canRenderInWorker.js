/**
 * Whether this worker can render pages for strong compression. Kept apart from
 * renderInWorker.js so checking doesn't load pdf.js. Without support, the screen renders on the
 * main thread instead.
 *
 * Needs a 2D OffscreenCanvas that can encode JPEGs (Safari 16.4+), `fonts` for the PDF's
 * embedded fonts, and nested workers, because pdf.js parses in a worker of its own.
 * @returns {boolean}
 */
export function canRenderInWorker() {
  try {
    return (
      typeof OffscreenCanvas === 'function' &&
      typeof OffscreenCanvas.prototype.convertToBlob === 'function' &&
      typeof Worker === 'function' &&
      Boolean(globalThis.fonts) &&
      new OffscreenCanvas(1, 1).getContext('2d') !== null
    );
  } catch {
    return false;
  }
}
