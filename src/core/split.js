import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './loadPdf.js';
import { assertPageIndexes } from './pageRanges.js';

/** @typedef {import('./pageRanges.js').PageRange} PageRange */

/**
 * @typedef {{ type: 'ranges', ranges: PageRange[] }
 *   | { type: 'everyN', n: number }
 *   | { type: 'selected', pageIndexes: number[], separate?: boolean }
 *   | { type: 'perPage' }} SplitMode
 * `selected` makes one file unless `separate` is set, because "these pages together" is the
 * one result no other mode can produce; one-file-per-page is already `perPage` or `ranges`.
 */

/**
 * @typedef {object} SplitPart
 * @property {string} label         File-name suffix such as `p1-3` or `p2_5_8-10`.
 * @property {number[]} pageIndexes Zero-based pages in output order.
 */

/**
 * @typedef {object} SplitOutput
 * @property {string} label
 * @property {Uint8Array} bytes
 */

// Long scattered selections would build names past file-system limits (255 bytes).
const MAX_LABEL_LENGTH = 40;
const FALLBACK_LABEL = 'extract';

/**
 * Works out which pages go into which output file, without touching any PDF.
 * @param {number} pageCount
 * @param {SplitMode} mode
 * @returns {SplitPart[]}
 * @throws {RangeError} When the mode would select no pages or pages outside the document.
 */
export function planSplit(pageCount, mode) {
  const groups = groupPages(pageCount, mode);
  if (groups.length === 0) throw new RangeError('Split would produce no files');
  for (const pageIndexes of groups) assertPageIndexes(pageIndexes, pageCount);
  return groups.map((pageIndexes) => ({ label: labelFor(pageIndexes), pageIndexes }));
}

/**
 * @param {number} pageCount
 * @param {SplitMode} mode
 * @returns {number[][]}
 */
function groupPages(pageCount, mode) {
  switch (mode?.type) {
    case 'ranges':
      return mode.ranges.map(({ from, to }) => span(from - 1, to - 1));
    case 'everyN': {
      if (!Number.isInteger(mode.n) || mode.n < 1) {
        throw new RangeError('n must be a positive integer');
      }
      const groups = [];
      for (let start = 0; start < pageCount; start += mode.n) {
        groups.push(span(start, Math.min(start + mode.n, pageCount) - 1));
      }
      return groups;
    }
    case 'selected': {
      // Thumbnail clicks arrive in click order; output follows page order to stay predictable.
      const pageIndexes = [...new Set(mode.pageIndexes)].sort((a, b) => a - b);
      return mode.separate ? pageIndexes.map((index) => [index]) : [pageIndexes];
    }
    case 'perPage':
      return span(0, pageCount - 1).map((index) => [index]);
    default:
      throw new TypeError(`Unknown split mode: ${mode?.type}`);
  }
}

/**
 * @param {number} first  Inclusive.
 * @param {number} last   Inclusive.
 * @returns {number[]}
 */
function span(first, last) {
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/**
 * Collapses consecutive pages into runs: [0,1,2,4] → `p1-3_5`.
 * @param {number[]} pageIndexes
 * @returns {string}
 */
function labelFor(pageIndexes) {
  const runs = [];
  let start = pageIndexes[0];
  for (let i = 1; i <= pageIndexes.length; i++) {
    const previous = pageIndexes[i - 1];
    if (pageIndexes[i] === previous + 1) continue;
    runs.push(start === previous ? `${start + 1}` : `${start + 1}-${previous + 1}`);
    start = pageIndexes[i];
  }
  const label = `p${runs.join('_')}`;
  return label.length > MAX_LABEL_LENGTH ? FALLBACK_LABEL : label;
}

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

/**
 * Builds the download name for a split part: `report.pdf` + `p1-3` → `report_p1-3.pdf`.
 * @param {string} originalName
 * @param {string} label
 * @returns {string}
 */
export function splitOutputName(originalName, label) {
  const base = originalName.replace(/\.pdf$/i, '') || 'document';
  return `${base}_${label}.pdf`;
}
