// Reads output PDFs with pdf.js rather than pdf-lib, so tests also prove that a second,
// independent parser can open what pdf-lib wrote.
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * @param {string} name  File name inside tests/fixtures.
 * @returns {Uint8Array}
 */
export function fixture(name) {
  return new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url)));
}

/**
 * A real JPEG file: a DCTDecode image stream's bytes are a complete JPEG, so the scanned
 * fixture supplies one without checking a separate image into the repo.
 * @returns {Promise<Uint8Array>}
 */
export async function scannedJpeg() {
  const doc = await PDFDocument.load(fixture('scanned.pdf'));
  const stream = doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find(
      (object) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'),
    );
  return stream.contents;
}

/**
 * @typedef {object} PageInfo
 * @property {string | undefined} text  The fixture's "Page N" label, if the page has one.
 * @property {number} rotation          Effective /Rotate in degrees.
 * @property {[number, number]} size    Width and height in points, before rotation.
 */

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<PageInfo[]>}
 */
export async function readPages(bytes) {
  // pdf.js may transfer (detach) the buffer it is given, so hand it a copy.
  const task = getDocument({ data: bytes.slice(), verbosity: 0, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      const [x1, y1, x2, y2] = page.view;
      pages.push({
        text: items.map((item) => item.str).find((str) => /^Page \d+$/.test(str)),
        rotation: page.rotate,
        size: [x2 - x1, y2 - y1],
      });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<(string | undefined)[]>}
 */
export async function pageTexts(bytes) {
  return (await readPages(bytes)).map((page) => page.text);
}

/**
 * Builds the labels a fixture page sequence should have, e.g. labels(1, 3) → Page 1..Page 3.
 * @param {number} from
 * @param {number} to
 * @returns {string[]}
 */
export function labels(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => `Page ${from + i}`);
}
