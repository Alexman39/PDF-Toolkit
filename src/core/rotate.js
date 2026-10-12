import { degrees } from 'pdf-lib';
import { loadPdf } from './loadPdf.js';
import { assertPageIndexes } from './pageRanges.js';

/**
 * Maps any multiple of 90 onto the four values PDF viewers understand: 0, 90, 180, 270.
 * @param {number} angle  Degrees, may be negative or above 360.
 * @returns {number}
 * @throws {RangeError} When `angle` is not a whole multiple of 90.
 */
export function normaliseRotation(angle) {
  if (!Number.isInteger(angle) || angle % 90 !== 0) {
    throw new RangeError(`Rotation must be a multiple of 90, got ${angle}`);
  }
  // JavaScript's % keeps the sign (-90 % 360 === -90), so shift into the positive range.
  return ((angle % 360) + 360) % 360;
}

/**
 * Rotates pages by adding to their current rotation. Only the /Rotate entry changes, so page
 * content is never re-encoded.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {Record<number, number>} deltas  Zero-based page index → degrees to add (±90, 180…).
 * @returns {Promise<Uint8Array>}
 * @throws {RangeError} When a page index or angle is invalid.
 */
export async function rotatePages(bytes, deltas) {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const changes = Object.entries(deltas).map(([index, delta]) => [Number(index), delta]);
  assertPageIndexes(
    changes.map(([index]) => index),
    pages.length,
  );

  for (const [index, delta] of changes) {
    const page = pages[index];
    page.setRotation(degrees(normaliseRotation(currentRotation(page) + normaliseRotation(delta))));
  }
  return doc.save();
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @returns {number}
 */
function currentRotation(page) {
  const { angle } = page.getRotation();
  // Viewers ignore a malformed /Rotate such as 45 and show the page upright, so we do too.
  return Number.isInteger(angle) && angle % 90 === 0 ? angle : 0;
}
