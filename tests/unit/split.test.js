import { describe, expect, it } from 'vitest';
import { EncryptedPdfError } from '../../src/core/errors.js';
import { parsePageRanges } from '../../src/core/pageRanges.js';
import { splitPdf } from '../../src/core/split.js';
import { planSplit } from '../../src/core/splitPlan.js';
import { fixture, labels, pageTexts, readPages } from './helpers/pdf.js';

const ten = fixture('ten-pages.pdf');

/** Splits and reads every output back as its page labels. */
async function splitTexts(bytes, mode) {
  const outputs = await splitPdf(bytes, mode);
  return Promise.all(outputs.map(async ({ label, bytes }) => [label, await pageTexts(bytes)]));
}

describe('planSplit', () => {
  it('makes one part per range, in typed order', () => {
    const ranges = parsePageRanges('8-, 1-3, 5', 10);
    expect(planSplit(10, { type: 'ranges', ranges })).toEqual([
      { label: 'p8-10', pageIndexes: [7, 8, 9] },
      { label: 'p1-3', pageIndexes: [0, 1, 2] },
      { label: 'p5', pageIndexes: [4] },
    ]);
  });

  it.each([
    [3, ['p1-3', 'p4-6', 'p7-9', 'p10']],
    [5, ['p1-5', 'p6-10']],
    [1, Array.from({ length: 10 }, (_, i) => `p${i + 1}`)],
    [10, ['p1-10']],
    [25, ['p1-10']],
  ])('every %i pages gives %j', (n, expected) => {
    expect(planSplit(10, { type: 'everyN', n }).map((part) => part.label)).toEqual(expected);
  });

  it('sorts and de-duplicates selected pages into one part', () => {
    expect(planSplit(10, { type: 'selected', pageIndexes: [9, 4, 0, 1, 2, 4, 7, 8] })).toEqual([
      { label: 'p1-3_5_8-10', pageIndexes: [0, 1, 2, 4, 7, 8, 9] },
    ]);
  });

  it('makes one part per selected page when separate is set', () => {
    const parts = planSplit(10, { type: 'selected', pageIndexes: [5, 1], separate: true });
    expect(parts).toEqual([
      { label: 'p2', pageIndexes: [1] },
      { label: 'p6', pageIndexes: [5] },
    ]);
  });

  it('falls back to a short label for long scattered selections', () => {
    const everyOther = Array.from({ length: 50 }, (_, i) => i * 2);
    const [part] = planSplit(100, { type: 'selected', pageIndexes: everyOther });
    expect(part.label).toBe('extract');
    expect(part.pageIndexes).toHaveLength(50);
  });

  it('handles a single-page document in every mode', () => {
    const single = { label: 'p1', pageIndexes: [0] };
    expect(planSplit(1, { type: 'perPage' })).toEqual([single]);
    expect(planSplit(1, { type: 'everyN', n: 3 })).toEqual([single]);
    expect(planSplit(1, { type: 'selected', pageIndexes: [0] })).toEqual([single]);
    expect(planSplit(1, { type: 'ranges', ranges: parsePageRanges('1-', 1) })).toEqual([single]);
  });

  it.each([
    ['an empty selection', { type: 'selected', pageIndexes: [] }, RangeError],
    ['a selection past the end', { type: 'selected', pageIndexes: [10] }, RangeError],
    ['no ranges', { type: 'ranges', ranges: [] }, RangeError],
    ['a range past the end', { type: 'ranges', ranges: [{ from: 9, to: 11 }] }, RangeError],
    ['n = 0', { type: 'everyN', n: 0 }, RangeError],
    ['an unknown mode', { type: 'halves' }, TypeError],
  ])('rejects %s', (_, mode, ErrorType) => {
    expect(() => planSplit(10, mode)).toThrow(ErrorType);
  });
});

describe('splitPdf', () => {
  it('writes each range as its own PDF with the right pages', async () => {
    const ranges = parsePageRanges('1-3, 5, 8-', 10);
    expect(await splitTexts(ten, { type: 'ranges', ranges })).toEqual([
      ['p1-3', labels(1, 3)],
      ['p5', ['Page 5']],
      ['p8-10', labels(8, 10)],
    ]);
  });

  it('writes every-N parts including the shorter last one', async () => {
    expect(await splitTexts(ten, { type: 'everyN', n: 4 })).toEqual([
      ['p1-4', labels(1, 4)],
      ['p5-8', labels(5, 8)],
      ['p9-10', labels(9, 10)],
    ]);
  });

  it('writes selected pages into one file', async () => {
    const mode = { type: 'selected', pageIndexes: [6, 1, 2] };
    expect(await splitTexts(ten, mode)).toEqual([['p2-3_7', ['Page 2', 'Page 3', 'Page 7']]]);
  });

  it('writes one file per page', async () => {
    const outputs = await splitTexts(fixture('three-pages.pdf'), { type: 'perPage' });
    expect(outputs).toEqual([
      ['p1', ['Page 1']],
      ['p2', ['Page 2']],
      ['p3', ['Page 3']],
    ]);
  });

  it('keeps an already-rotated page rotated', async () => {
    const outputs = await splitPdf(fixture('rotated.pdf'), { type: 'perPage' });
    const rotations = await Promise.all(
      outputs.map(async ({ bytes }) => (await readPages(bytes))[0].rotation),
    );
    expect(rotations).toEqual([0, 90, 0]);
  });

  it('rejects an encrypted PDF', async () => {
    await expect(splitPdf(fixture('encrypted.pdf'), { type: 'perPage' })).rejects.toBeInstanceOf(
      EncryptedPdfError,
    );
  });
});
