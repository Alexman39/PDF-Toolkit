// Generates the synthetic fixture PDFs in tests/fixtures/. Run with `npm run fixtures`.
// Scanned, encrypted and corrupt fixtures are added by hand (see tests/fixtures/README.md).
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PageSizes, StandardFonts, degrees } from 'pdf-lib';

const FIXTURES_DIR = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));

// Fixed dates and ID keep the output byte-identical between runs, so regenerating
// does not create git noise.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

/**
 * @typedef {object} PageSpec
 * @property {[number, number]} size  Width and height in PDF points.
 * @property {number} [rotation]      Existing /Rotate value in degrees.
 * @property {boolean} [jpeg2000]     Attach a JPEG 2000 image to the page's resources.
 */

/**
 * Builds a PDF whose pages each say "Page N", so later tests can check page order.
 * @param {string} title
 * @param {PageSpec[]} pages
 * @returns {Promise<Uint8Array>}
 */
async function buildPdf(title, pages) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(title);
  doc.setProducer('PDF Toolkit fixture generator');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  pages.forEach(({ size, rotation = 0, jpeg2000 = false }, index) => {
    const page = doc.addPage(size);
    if (jpeg2000) page.node.setXObject(PDFName.of('Jpx1'), registerJpeg2000Image(doc));
    page.drawText(`Page ${index + 1}`, { x: 50, y: size[1] - 80, size: 36, font });
    page.drawText(`${title} - ${size[0]}x${size[1]} pt`, { x: 50, y: 50, size: 12, font });
    if (rotation) page.setRotation(degrees(rotation));
  });

  return doc.save({ useObjectStreams: false });
}

/**
 * A JPEG 2000 image XObject. Only the /JPXDecode filter matters (it tells the app that pdf.js
 * can't draw this page without its wasm decoder), so the data is a placeholder and the page
 * never paints it.
 * @param {PDFDocument} doc
 * @returns {import('pdf-lib').PDFRef}
 */
function registerJpeg2000Image(doc) {
  const image = doc.context.stream(new Uint8Array(16), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1,
    Height: 1,
    Filter: 'JPXDecode',
  });
  return doc.context.register(image);
}

const a4 = () => ({ size: PageSizes.A4 });

/** @type {Record<string, [string, PageSpec[]]>} */
const FIXTURES = {
  'three-pages.pdf': ['Three pages', Array.from({ length: 3 }, a4)],
  'ten-pages.pdf': ['Ten pages', Array.from({ length: 10 }, a4)],
  'mixed-sizes.pdf': [
    'Mixed sizes',
    [{ size: PageSizes.A4 }, { size: PageSizes.Letter }, { size: [...PageSizes.A5].reverse() }],
  ],
  'rotated.pdf': ['Rotated page 2', [a4(), { size: PageSizes.A4, rotation: 90 }, a4()]],
  // Big enough that worker jobs take visible time, for progress, cancel and freeze tests.
  'jpeg2000-image.pdf': ['JPEG 2000 image', [{ size: PageSizes.A4, jpeg2000: true }]],
  'hundred-fifty-pages.pdf': ['150 pages', Array.from({ length: 150 }, a4)],
};

for (const [fileName, [title, pages]] of Object.entries(FIXTURES)) {
  const bytes = await buildPdf(title, pages);
  await writeFile(FIXTURES_DIR + fileName, bytes);
  console.log(`wrote ${fileName} (${bytes.length} bytes)`);
}
