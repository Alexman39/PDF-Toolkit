import { formatBytes } from './formatBytes.js';

/**
 * The before/after line for Compress, e.g. "2 MB → 600 KB (71% smaller)".
 * Large growth reads as a multiple, because "1772% larger" is hard to picture.
 * @param {number} before  Bytes.
 * @param {number} after   Bytes.
 * @returns {{ smaller: boolean, text: string }}
 */
export function describeSizeChange(before, after) {
  const sizes = `${formatBytes(before)} → ${formatBytes(after)}`;
  if (after === before) return { smaller: false, text: `${sizes} (no change)` };

  const ratio = after / before;
  if (ratio < 1) return { smaller: true, text: `${sizes} (${percent(1 - ratio)} smaller)` };
  if (ratio < 2) return { smaller: false, text: `${sizes} (${percent(ratio - 1)} larger)` };
  const multiple = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  return { smaller: false, text: `${sizes} (${multiple}× larger)` };
}

/**
 * @param {number} fraction  Greater than 0.
 * @returns {string}
 */
function percent(fraction) {
  const rounded = Math.round(fraction * 100);
  // "0% smaller" would contradict the sizes shown right next to it.
  return rounded < 1 ? 'less than 1%' : `${rounded}%`;
}
