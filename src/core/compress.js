import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream } from 'pdf-lib';
import { loadPdf } from './loadPdf.js';

/**
 * @typedef {object} OptimiseOptions
 * @property {boolean} [stripMetadata=false]  Drop title, author, dates and XMP metadata.
 */

/**
 * Lossless compression: drops objects nothing refers to and packs the rest into compressed
 * object streams. Page content is untouched, so text stays selectable. Gains are usually
 * small; the lossy mode (Phase 5) is what shrinks scans.
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
