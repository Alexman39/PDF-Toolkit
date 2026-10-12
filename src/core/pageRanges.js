import { PageRangeError } from './errors.js';

/**
 * @typedef {object} PageRange
 * @property {number} from  First page, 1-based, inclusive.
 * @property {number} to    Last page, 1-based, inclusive.
 */

// Users paste ranges from word processors, which auto-convert "-" into en/em dashes.
const DASHES = /[–—]/g;
const SINGLE = /^(\d+)$/;
const RANGE = /^(\d*)\s*-\s*(\d*)$/;

/**
 * Parses text like `"1-3, 5, 8-"` into page ranges and validates them against the document.
 * Ranges stay in typed order and duplicates are kept, because split mode makes one file per range.
 * @param {string} input       User-entered ranges, comma-separated.
 * @param {number} pageCount   Number of pages in the document.
 * @returns {PageRange[]}
 * @throws {PageRangeError} When the input is empty, malformed or outside the document.
 */
export function parsePageRanges(input, pageCount) {
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new TypeError('pageCount must be a positive integer');
  }

  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new PageRangeError('Enter at least one page or range');

  return tokens.map((token) => parseToken(token, pageCount));
}

/**
 * @param {string} token
 * @param {number} pageCount
 * @returns {PageRange}
 */
function parseToken(token, pageCount) {
  const normalised = token.replace(DASHES, '-');
  const single = SINGLE.exec(normalised);
  const range = RANGE.exec(normalised);

  let from;
  let to;
  if (single) {
    from = to = Number(single[1]);
  } else if (range && (range[1] || range[2])) {
    from = range[1] ? Number(range[1]) : 1;
    to = range[2] ? Number(range[2]) : pageCount;
  } else {
    throw new PageRangeError(`"${token}" is not a page number or range like 2-5`, { token });
  }

  if (from < 1) throw new PageRangeError(`"${token}": page numbers start at 1`, { token });
  // Checked before "reversed": an open end like "8-" on a 5-page PDF resolves to 8-5,
  // and "out of range" is the message that actually helps the user.
  if (from > pageCount || to > pageCount) {
    const pages = pageCount === 1 ? '1 page' : `${pageCount} pages`;
    throw new PageRangeError(`"${token}" is out of range; this PDF has ${pages}`, { token });
  }
  if (from > to) {
    throw new PageRangeError(`"${token}" is reversed; did you mean ${to}-${from}?`, { token });
  }
  return { from, to };
}

/**
 * Flattens ranges into zero-based page indexes for pdf-lib, dropping duplicates
 * (first occurrence wins) so a page is never copied twice by accident.
 * @param {PageRange[]} ranges
 * @returns {number[]}
 */
export function rangesToPageIndexes(ranges) {
  const indexes = new Set();
  for (const { from, to } of ranges) {
    for (let page = from; page <= to; page++) indexes.add(page - 1);
  }
  return [...indexes];
}
