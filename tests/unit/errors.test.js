import { describe, expect, it } from 'vitest';
import {
  CorruptPdfError,
  EncryptedPdfError,
  NotPdfError,
  PageRangeError,
  PdfToolkitError,
  TooLargeError,
} from '../../src/core/errors.js';

describe('typed errors', () => {
  const cases = [
    [NotPdfError, 'NOT_PDF'],
    [EncryptedPdfError, 'ENCRYPTED'],
    [CorruptPdfError, 'CORRUPT'],
    [PageRangeError, 'PAGE_RANGE'],
    [TooLargeError, 'TOO_LARGE'],
  ];

  it.each(cases)('%o has a stable code and extends PdfToolkitError', (ErrorClass, code) => {
    const error = new ErrorClass();
    expect(error).toBeInstanceOf(PdfToolkitError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.message).not.toBe('');
  });

  it('keeps a custom message and the original cause', () => {
    const cause = new Error('low-level parse failure');
    const error = new CorruptPdfError('Broken xref table', { cause });
    expect(error.message).toBe('Broken xref table');
    expect(error.cause).toBe(cause);
  });

  it('PageRangeError carries the offending token', () => {
    const error = new PageRangeError('Page 12 does not exist', { token: '12' });
    expect(error.token).toBe('12');
  });

  it('TooLargeError carries the size and limit', () => {
    const error = new TooLargeError(undefined, { bytes: 300, limit: 200 });
    expect(error.bytes).toBe(300);
    expect(error.limit).toBe(200);
  });
});
