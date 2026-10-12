import { describe, expect, it } from 'vitest';
import { CorruptPdfError, EncryptedPdfError, NotPdfError } from '../../src/core/errors.js';
import { mergePdfs } from '../../src/core/merge.js';
import { fixture, labels, pageTexts, readPages } from './helpers/pdf.js';

const three = fixture('three-pages.pdf');
const ten = fixture('ten-pages.pdf');

describe('mergePdfs', () => {
  it('appends files in the given order', async () => {
    const output = await mergePdfs([{ bytes: three }, { bytes: ten }]);
    expect(await pageTexts(output)).toEqual([...labels(1, 3), ...labels(1, 10)]);
  });

  it('follows a reordered file list', async () => {
    const output = await mergePdfs([{ bytes: ten }, { bytes: three }]);
    expect(await pageTexts(output)).toEqual([...labels(1, 10), ...labels(1, 3)]);
  });

  it('takes only the chosen pages, in the chosen order', async () => {
    const output = await mergePdfs([{ bytes: ten, pageIndexes: [2, 0, 9] }, { bytes: three }]);
    expect(await pageTexts(output)).toEqual(['Page 3', 'Page 1', 'Page 10', ...labels(1, 3)]);
  });

  it('accepts the same file twice', async () => {
    const output = await mergePdfs([{ bytes: three }, { bytes: three }]);
    expect(await pageTexts(output)).toEqual([...labels(1, 3), ...labels(1, 3)]);
  });

  it('handles a single file', async () => {
    const output = await mergePdfs([{ bytes: three.buffer }]);
    expect(await pageTexts(output)).toEqual(labels(1, 3));
  });

  it('keeps existing page rotation', async () => {
    const output = await mergePdfs([{ bytes: fixture('rotated.pdf') }, { bytes: three }]);
    const rotations = (await readPages(output)).map((page) => page.rotation);
    expect(rotations).toEqual([0, 90, 0, 0, 0, 0]);
  });

  it('keeps each page size', async () => {
    const mixed = fixture('mixed-sizes.pdf');
    const output = await mergePdfs([{ bytes: mixed }]);
    const sizes = (pages) => pages.map((page) => page.size);
    expect(sizes(await readPages(output))).toEqual(sizes(await readPages(mixed)));
  });

  it.each([
    ['encrypted.pdf', EncryptedPdfError],
    ['corrupt.pdf', CorruptPdfError],
  ])('fails on %s and reports which file it was', async (name, ErrorType) => {
    const result = mergePdfs([{ bytes: three }, { bytes: fixture(name) }, { bytes: ten }]);
    await expect(result).rejects.toBeInstanceOf(ErrorType);
    await expect(result).rejects.toMatchObject({ fileIndex: 1 });
  });

  it('reports a non-PDF file by index', async () => {
    const notPdf = new TextEncoder().encode('just text');
    const result = mergePdfs([{ bytes: notPdf }, { bytes: three }]);
    await expect(result).rejects.toBeInstanceOf(NotPdfError);
    await expect(result).rejects.toMatchObject({ fileIndex: 0 });
  });

  it('rejects an empty file list', async () => {
    await expect(mergePdfs([])).rejects.toThrow(TypeError);
  });

  it.each([[[]], [[3]], [[-1]], [[1.5]]])(
    'rejects invalid page indexes %j',
    async (pageIndexes) => {
      await expect(mergePdfs([{ bytes: three, pageIndexes }])).rejects.toThrow(RangeError);
    },
  );
});
