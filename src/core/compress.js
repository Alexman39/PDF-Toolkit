import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from 'pdf-lib';
import { loadPdf } from './loadPdf.js';

/** @typedef {import('./merge.js').ProgressCallback} ProgressCallback */

/**
 * @typedef {object} OptimiseOptions
 * @property {boolean} [stripMetadata=false]  Drop title, author, dates and XMP metadata.
 */

/**
 * Lossless compression: drops objects nothing refers to and packs the rest into compressed
 * object streams. Page content is untouched, so text stays selectable. Gains are usually
 * small; the strong mode (`buildImagePdf`) is what shrinks scans.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {OptimiseOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function optimisePdf(bytes, { stripMetadata = false } = {}) {
  const doc = await loadPdf(bytes);
  if (stripMetadata) {
    doc.catalog.delete(PDFName.of('Metadata'));
    doc.context.trailerInfo.Info = undefined;
  }
  removeUnreachableObjects(doc.context);
  return doc.save({ useObjectStreams: true });
}

/**
 * Incremental saves and careless editors leave orphaned objects (old page versions, replaced
 * images) that pdf-lib would otherwise write back out. Anything not reachable from the
 * trailer can't be shown by any viewer, so it is safe to drop.
 * @param {import('pdf-lib').PDFContext} context
 * @returns {void}
 */
function removeUnreachableObjects(context) {
  const reachable = new Set();
  const pending = [context.trailerInfo.Root, context.trailerInfo.Info].filter(Boolean);

  // An explicit stack instead of recursion: deep page trees could overflow the call stack.
  while (pending.length > 0) {
    const object = pending.pop();
    if (object instanceof PDFRef) {
      if (reachable.has(object)) continue; // PDFRef.of() interns refs, so identity works
      reachable.add(object);
      const target = context.lookup(object);
      if (target) pending.push(target);
    } else if (object instanceof PDFDict) {
      for (const value of object.values()) pending.push(value);
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) pending.push(value);
    } else if (object instanceof PDFStream) {
      pending.push(object.dict);
    }
  }

  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) context.delete(ref);
  }
}

/**
 * @typedef {object} ImagePage
 * @property {Uint8Array} jpeg  A rendered page.
 * @property {number} width     Page width in points, as the page was shown (rotation applied).
 * @property {number} height    Page height in points.
 */

/**
 * The second half of strong (lossy) compression: one JPEG per page becomes one page each.
 * Rendering happens elsewhere because it needs a canvas, which core can't touch. The images
 * already show any rotation, so pages come out upright with no /Rotate.
 * @param {ImagePage[]} pages
 * @param {{ onProgress?: ProgressCallback }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function buildImagePdf(pages, { onProgress } = {}) {
  if (pages.length === 0) throw new RangeError('buildImagePdf needs at least one page');
  // No metadata at all: the old title or author could otherwise be the only text left, and
  // pdf-lib's default "Producer" and dates would reveal when and how the file was made.
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const [index, { jpeg, width, height }] of pages.entries()) {
    // embedJpg copies the bytes into the PDF as a DCTDecode stream: no second lossy step.
    const image = await doc.embedJpg(jpeg);
    doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    onProgress?.(index + 1, pages.length);
  }
  return doc.save({ useObjectStreams: true });
}

// pdf.js decodes these with wasm modules it would have to fetch, which the CSP forbids, so it
// leaves such images out. Rendering those pages would silently produce blank output.
const UNSUPPORTED_FILTERS = new Map(
  ['JPXDecode', 'JBIG2Decode'].map((name) => [PDFName.of(name), name]),
);

/**
 * Lists the image formats in this PDF that strong compression can't render.
 * @param {PDFDocument} doc
 * @returns {string[]}  Filter names, e.g. `['JPXDecode']`; empty when every image is fine.
 */
export function findUnsupportedImages(doc) {
  const { context } = doc;
  const found = new Set();
  for (const [, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue;
    if (object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const filter = object.dict.lookup(PDFName.of('Filter'));
    // A filter chain is applied in order, so the unsupported codec can be anywhere in it.
    const filters = filter instanceof PDFArray ? filter.asArray() : [filter];
    for (const name of filters) {
      const unsupported = UNSUPPORTED_FILTERS.get(context.lookup(name));
      if (unsupported) found.add(unsupported);
    }
  }
  return [...found].sort();
}
