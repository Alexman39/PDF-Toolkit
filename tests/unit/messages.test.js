import { describe, expect, it } from 'vitest';
import {
  CorruptPdfError,
  EncryptedPdfError,
  NotPdfError,
  PageRangeError,
} from '../../src/core/errors.js';
import {
  collectTransferables,
  deserializeError,
  serializeError,
} from '../../src/workers/messages.js';

describe('collectTransferables', () => {
  it('finds nested buffers once each', () => {
    const a = new Uint8Array(4);
    const b = new ArrayBuffer(8);
    const found = collectTransferables({
      inputs: [{ bytes: a }, { bytes: a }, { bytes: b }],
      n: 3,
    });
    expect(found).toHaveLength(2);
    expect(found).toContain(a.buffer);
    expect(found).toContain(b);
  });
});

describe('error serialization', () => {
  it.each([
    [new NotPdfError(), NotPdfError],
    [new EncryptedPdfError(), EncryptedPdfError],
    [new CorruptPdfError('broken'), CorruptPdfError],
  ])('round-trips %s to the same class', (error, Class) => {
    // structuredClone stands in for postMessage, which would drop the class otherwise.
    const restored = deserializeError(structuredClone(serializeError(error)));
    expect(restored).toBeInstanceOf(Class);
    expect(restored.code).toBe(error.code);
    expect(restored.message).toBe(error.message);
  });

  it('keeps extra fields', () => {
    const error = new PageRangeError('bad', { token: '9-' });
    error.fileIndex = 2;
    const restored = deserializeError(serializeError(error));
    expect(restored).toMatchObject({ token: '9-', fileIndex: 2, code: 'PAGE_RANGE' });
  });

  it('keeps the name of unexpected errors', () => {
    const restored = deserializeError(serializeError(new RangeError('oops')));
    expect(restored).toMatchObject({ name: 'RangeError', message: 'oops', code: 'UNKNOWN' });
  });

  it('handles thrown non-errors', () => {
    expect(serializeError('nope')).toEqual({ name: 'Error', code: 'UNKNOWN', message: 'nope' });
  });
});
