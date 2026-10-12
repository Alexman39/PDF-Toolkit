import { describe, expect, it } from 'vitest';
import {
  CorruptPdfError,
  EncryptedPdfError,
  NotPdfError,
  PageRangeError,
} from '../../src/core/errors.js';
import { userMessageFor } from '../../src/lib/errorMessages.js';

describe('userMessageFor', () => {
  it('maps typed errors to friendly text, never the developer message', () => {
    expect(userMessageFor(new EncryptedPdfError('pdf-lib internals'))).toBe(
      'This PDF is password-protected; unlock it first.',
    );
    expect(userMessageFor(new CorruptPdfError('xref broken'))).not.toContain('xref');
    expect(userMessageFor(new NotPdfError())).toBe('This file is not a PDF.');
  });

  it('shows page range messages, which are written for users', () => {
    const error = new PageRangeError('"9" is out of range; this PDF has 3 pages');
    expect(userMessageFor(error)).toBe(error.message);
  });

  it('names the file when given', () => {
    expect(userMessageFor(new EncryptedPdfError(), 'a.pdf')).toMatch(/^a\.pdf: /);
  });

  it('says "Cancelled." for aborts', () => {
    expect(userMessageFor(new DOMException('x', 'AbortError'))).toBe('Cancelled.');
  });

  it('falls back to a generic message for bugs and non-errors', () => {
    expect(userMessageFor(new TypeError('x is undefined'))).toMatch(/Something went wrong/);
    expect(userMessageFor(undefined)).toMatch(/Something went wrong/);
  });
});
