import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EncryptedPdfError } from '../../src/core/errors.js';
import { normaliseRotation, rotatePages } from '../../src/core/rotate.js';
import { fixture, labels, readPages } from './helpers/pdf.js';

const three = fixture('three-pages.pdf');
const rotated = fixture('rotated.pdf'); // page 2 already has /Rotate 90

const rotationsOf = async (bytes) => (await readPages(bytes)).map((page) => page.rotation);

describe('normaliseRotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [270, 270],
    [360, 0],
    [450, 90],
    [-90, 270],
    [-180, 180],
    [-450, 270],
  ])('%i → %i', (input, expected) => {
    expect(normaliseRotation(input)).toBe(expected);
  });

  it.each([45, 90.5, NaN, Infinity])('rejects %s', (angle) => {
    expect(() => normaliseRotation(angle)).toThrow(RangeError);
  });
});

describe('rotatePages', () => {
  it('rotates a single page and leaves the others alone', async () => {
    expect(await rotationsOf(await rotatePages(three, { 1: 90 }))).toEqual([0, 90, 0]);
  });

  it('rotates all pages', async () => {
    expect(await rotationsOf(await rotatePages(three, { 0: 180, 1: 180, 2: 180 }))).toEqual([
      180, 180, 180,
    ]);
  });

  it('adds to an existing rotation instead of replacing it', async () => {
    expect(await rotationsOf(await rotatePages(rotated, { 0: 90, 1: 90, 2: 90 }))).toEqual([
      90, 180, 90,
    ]);
  });

  it('normalises the sum', async () => {
    expect(await rotationsOf(await rotatePages(rotated, { 0: -90, 1: 270 }))).toEqual([270, 0, 0]);
  });

  it('keeps page order, text and size', async () => {
    const before = await readPages(three);
    const after = await readPages(await rotatePages(three, { 0: 90, 2: -90 }));
    expect(after.map((page) => page.text)).toEqual(labels(1, 3));
    expect(after.map((page) => page.size)).toEqual(before.map((page) => page.size));
  });

  it('treats a malformed existing /Rotate as upright', async () => {
    const doc = await PDFDocument.load(three);
    doc.getPage(0).node.set(PDFName.of('Rotate'), PDFNumber.of(45));
    const output = await rotatePages(await doc.save(), { 0: 90 });
    expect((await rotationsOf(output))[0]).toBe(90);
  });

  it.each([
    ['no pages', {}],
    ['a page past the end', { 3: 90 }],
    ['a negative page', { '-1': 90 }],
  ])('rejects %s', async (_, deltas) => {
    await expect(rotatePages(three, deltas)).rejects.toThrow(RangeError);
  });

  it('rejects an angle that is not a multiple of 90', async () => {
    await expect(rotatePages(three, { 0: 45 })).rejects.toThrow(RangeError);
  });

  it('rejects an encrypted PDF', async () => {
    await expect(rotatePages(fixture('encrypted.pdf'), { 0: 90 })).rejects.toBeInstanceOf(
      EncryptedPdfError,
    );
  });
});
