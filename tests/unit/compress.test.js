import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EncryptedPdfError } from '../../src/core/errors.js';
import { buildImagePdf, findUnsupportedImages, optimisePdf } from '../../src/core/compress.js';
import { loadPdf } from '../../src/core/loadPdf.js';
import { fixture, readPages, scannedJpeg } from './helpers/pdf.js';

const MARKER = PDFName.of('TestOrphanMarker');

/** True when any object in the PDF is a dictionary carrying the test marker key. */
async function containsMarker(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.context
    .enumerateIndirectObjects()
    .some(([, object]) => object instanceof PDFDict && object.has(MARKER));
}

/** Adds an indirect object that nothing references, like an editor's leftover. */
async function withOrphan(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.context.register(doc.context.obj({ TestOrphanMarker: true }));
  const output = await doc.save({ useObjectStreams: false });
  expect(await containsMarker(output)).toBe(true); // guard: the orphan really is there
  return output;
}

describe('optimisePdf', () => {
  it.each(['three-pages.pdf', 'ten-pages.pdf', 'mixed-sizes.pdf', 'rotated.pdf'])(
    'keeps pages, order, rotation and size of %s',
    async (name) => {
      const input = fixture(name);
      expect(await readPages(await optimisePdf(input))).toEqual(await readPages(input));
    },
  );

  it('makes the generated fixtures smaller', async () => {
    const input = fixture('ten-pages.pdf');
    expect((await optimisePdf(input)).length).toBeLessThan(input.length);
  });

  it('still produces a readable PDF from the scanned fixture', async () => {
    const input = fixture('scanned.pdf');
    const output = await optimisePdf(input);
    expect(await readPages(output)).toHaveLength((await readPages(input)).length);
  });

  it('drops objects that nothing references', async () => {
    const output = await optimisePdf(await withOrphan(fixture('three-pages.pdf')));
    expect(await containsMarker(output)).toBe(false);
  });

  it('keeps metadata by default', async () => {
    const output = await PDFDocument.load(await optimisePdf(fixture('three-pages.pdf')));
    expect(output.getTitle()).toBe('Three pages');
  });

  it('strips the info dictionary and XMP metadata on request', async () => {
    const doc = await PDFDocument.load(fixture('three-pages.pdf'), { updateMetadata: false });
    const xmp = doc.context.flateStream('<x:xmpmeta/>', { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp));
    const input = await doc.save();

    const output = await PDFDocument.load(await optimisePdf(input, { stripMetadata: true }), {
      updateMetadata: false,
    });
    expect(output.getTitle()).toBeUndefined();
    expect(output.getProducer()).toBeUndefined();
    expect(output.catalog.has(PDFName.of('Metadata'))).toBe(false);
    expect(await readPages(await output.save())).toHaveLength(3);
  });

  it('rejects an encrypted PDF', async () => {
    await expect(optimisePdf(fixture('encrypted.pdf'))).rejects.toBeInstanceOf(EncryptedPdfError);
  });
});

describe('buildImagePdf', () => {
  it('makes one page per image at the given size, upright and without text', async () => {
    const jpeg = await scannedJpeg();
    const output = await buildImagePdf([
      { jpeg, width: 595, height: 842 },
      { jpeg, width: 842, height: 595 },
    ]);
    expect(await readPages(output)).toEqual([
      { text: undefined, rotation: 0, size: [595, 842] },
      { text: undefined, rotation: 0, size: [842, 595] },
    ]);
  });

  it('embeds the JPEG bytes as they are, without re-encoding', async () => {
    const jpeg = await scannedJpeg();
    const doc = await PDFDocument.load(await buildImagePdf([{ jpeg, width: 100, height: 100 }]));
    const images = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object) => object.dict?.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images).toHaveLength(1);
    expect(images[0].contents).toEqual(jpeg);
  });

  it('reports progress once per page', async () => {
    const jpeg = await scannedJpeg();
    const calls = [];
    await buildImagePdf(
      Array.from({ length: 3 }, () => ({ jpeg, width: 100, height: 100 })),
      { onProgress: (done, total) => calls.push([done, total]) },
    );
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('refuses an empty page list', async () => {
    await expect(buildImagePdf([])).rejects.toBeInstanceOf(RangeError);
  });
});

describe('findUnsupportedImages', () => {
  it.each(['three-pages.pdf', 'scanned.pdf'])('finds nothing in %s', async (name) => {
    expect(findUnsupportedImages(await loadPdf(fixture(name)))).toEqual([]);
  });

  it('finds JPEG 2000 images', async () => {
    expect(findUnsupportedImages(await loadPdf(fixture('jpeg2000-image.pdf')))).toEqual([
      'JPXDecode',
    ]);
  });

  it('finds JBIG2 images inside a filter chain, once per filter', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    for (let i = 0; i < 2; i++) {
      const image = doc.context.stream(new Uint8Array(4), {
        Type: 'XObject',
        Subtype: 'Image',
        Filter: ['FlateDecode', 'JBIG2Decode'],
      });
      doc.context.register(image);
    }
    expect(findUnsupportedImages(doc)).toEqual(['JBIG2Decode']);
  });
});
