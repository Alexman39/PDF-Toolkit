import { PDFDocument } from 'pdf-lib';
import { PdfToolkitError } from './errors.js';
import { loadPdf } from './loadPdf.js';
import { assertPageIndexes } from './pageRanges.js';

/**
 * @typedef {object} MergeInput
 * @property {Uint8Array | ArrayBuffer} bytes
 * @property {number[]} [pageIndexes]  Zero-based pages to take, in order. All pages when omitted.
 */

/**
 * Joins PDFs into one, in the order given.
 * @param {MergeInput[]} inputs
 * @returns {Promise<Uint8Array>}
 * @throws {PdfToolkitError} When any input fails to load. `fileIndex` on the error says which
 *   one, so the UI can flag that file instead of producing a merge that silently lacks it.
 */
export async function mergePdfs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError('inputs must be a non-empty array');
  }

  // Load everything before copying anything, so a bad last file fails fast.
  const sources = [];
  for (const [fileIndex, { bytes }] of inputs.entries()) {
    try {
      sources.push(await loadPdf(bytes));
    } catch (error) {
      if (error instanceof PdfToolkitError) error.fileIndex = fileIndex;
      throw error;
    }
  }

  const merged = await PDFDocument.create();
  for (const [fileIndex, source] of sources.entries()) {
    const pageIndexes = inputs[fileIndex].pageIndexes ?? source.getPageIndices();
    assertPageIndexes(pageIndexes, source.getPageCount());
    const pages = await merged.copyPages(source, pageIndexes);
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}
