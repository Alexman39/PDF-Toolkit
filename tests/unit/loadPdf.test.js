import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CorruptPdfError, EncryptedPdfError, NotPdfError } from '../../src/core/errors.js';
import { loadPdf } from '../../src/core/loadPdf.js';

const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const fixture = (name) => new Uint8Array(readFileSync(fixturePath(name)));
const hasFixture = (name) => existsSync(fixturePath(name));
const encode = (text) => new TextEncoder().encode(text);

/** A valid PDF with an /Encrypt dictionary injected into its trailer. */
function withEncryptTrailer(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const encrypted = text.replace(
    'trailer\n<<',
    'trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>',
  );
  expect(encrypted).not.toBe(text); // guard: the fixture layout changed
  return Uint8Array.from(encrypted, (char) => char.charCodeAt(0));
}

describe('loadPdf', () => {
  it.each([
    ['three-pages.pdf', 3],
    ['ten-pages.pdf', 10],
    ['mixed-sizes.pdf', 3],
    ['rotated.pdf', 3],
  ])('loads %s with %i pages', async (name, pageCount) => {
    const doc = await loadPdf(fixture(name));
    expect(doc.getPageCount()).toBe(pageCount);
  });

  it('accepts an ArrayBuffer', async () => {
    const bytes = fixture('three-pages.pdf');
    const doc = await loadPdf(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    );
    expect(doc.getPageCount()).toBe(3);
  });

  it('exposes the existing rotation of the rotated fixture', async () => {
    const doc = await loadPdf(fixture('rotated.pdf'));
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([0, 90, 0]);
  });

  it('does not modify the input bytes', async () => {
    const bytes = fixture('three-pages.pdf');
    const copy = bytes.slice();
    await loadPdf(bytes);
    expect(bytes).toEqual(copy);
  });

  describe('NotPdfError', () => {
    it.each([
      ['empty input', new Uint8Array()],
      ['a zip file', encode('PK\u0003\u0004 not a pdf')],
      ['plain text', encode('Hello, world')],
    ])('is thrown for %s', async (_, bytes) => {
      await expect(loadPdf(bytes)).rejects.toBeInstanceOf(NotPdfError);
    });
  });

  describe('CorruptPdfError', () => {
    it('is thrown for a header followed by garbage', async () => {
      const error = await loadPdf(encode('%PDF-1.7\nnot really a pdf\n%%EOF')).catch((e) => e);
      expect(error).toBeInstanceOf(CorruptPdfError);
      expect(error.cause).toBeDefined();
    });

    it('is thrown for a PDF truncated mid-object', async () => {
      const bytes = fixture('three-pages.pdf');
      await expect(loadPdf(bytes.subarray(0, bytes.length / 2))).rejects.toBeInstanceOf(
        CorruptPdfError,
      );
    });

    it.skipIf(!hasFixture('corrupt.pdf'))('is thrown for the corrupt.pdf fixture', async () => {
      await expect(loadPdf(fixture('corrupt.pdf'))).rejects.toBeInstanceOf(CorruptPdfError);
    });
  });

  describe('EncryptedPdfError', () => {
    it('is thrown when the trailer has an /Encrypt dictionary', async () => {
      const bytes = withEncryptTrailer(fixture('three-pages.pdf'));
      await expect(loadPdf(bytes)).rejects.toBeInstanceOf(EncryptedPdfError);
    });

    it.skipIf(!hasFixture('encrypted.pdf'))('is thrown for the encrypted.pdf fixture', async () => {
      await expect(loadPdf(fixture('encrypted.pdf'))).rejects.toBeInstanceOf(EncryptedPdfError);
    });
  });

  it.skipIf(!hasFixture('scanned.pdf'))('loads the scanned.pdf fixture', async () => {
    const doc = await loadPdf(fixture('scanned.pdf'));
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });
});
