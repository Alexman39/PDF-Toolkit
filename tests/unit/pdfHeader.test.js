import { describe, expect, it } from 'vitest';
import { hasPdfHeader } from '../../src/core/pdfHeader.js';

const encode = (text) => new TextEncoder().encode(text);

describe('hasPdfHeader', () => {
  it('accepts bytes starting with %PDF-', () => {
    expect(hasPdfHeader(encode('%PDF-1.7\n...'))).toBe(true);
  });

  it('accepts an ArrayBuffer', () => {
    expect(hasPdfHeader(encode('%PDF-2.0').buffer)).toBe(true);
  });

  it('tolerates leading junk within the first 1024 bytes', () => {
    expect(hasPdfHeader(encode(' '.repeat(500) + '%PDF-1.4'))).toBe(true);
  });

  it('rejects a header beyond the first 1024 bytes', () => {
    expect(hasPdfHeader(encode(' '.repeat(1100) + '%PDF-1.4'))).toBe(false);
  });

  it('rejects non-PDF content', () => {
    expect(hasPdfHeader(encode('PK\u0003\u0004 zip file'))).toBe(false);
  });

  it('rejects empty and too-short input', () => {
    expect(hasPdfHeader(new Uint8Array())).toBe(false);
    expect(hasPdfHeader(encode('%PDF'))).toBe(false);
  });
});
