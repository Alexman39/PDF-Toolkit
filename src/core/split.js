import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './loadPdf.js';
import { planSplit } from './splitPlan.js';

/** @typedef {import('./splitPlan.js').SplitMode} SplitMode */

/**
 * @typedef {object} SplitOutput
 * @property {string} label
 * @property {Uint8Array} bytes
 */

/**
 * Splits one PDF into several according to `mode`.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {SplitMode} mode
 * @param {{ onProgress?: import('./merge.js').ProgressCallback }} [options]  Called once per part.
 * @returns {Promise<SplitOutput[]>}
 */
export async function splitPdf(bytes, mode, { onProgress } = {}) {
  const source = await loadPdf(bytes);
  const parts = planSplit(source.getPageCount(), mode);
  const outputs = [];
  for (const { label, pageIndexes } of parts) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(source, pageIndexes);
    for (const page of pages) part.addPage(page);
    outputs.push({ label, bytes: await part.save() });
    onProgress?.(outputs.length, parts.length);
  }
  return outputs;
}
