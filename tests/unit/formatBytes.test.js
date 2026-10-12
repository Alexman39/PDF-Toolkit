import { describe, expect, it } from 'vitest';
import { formatBytes } from '../../src/lib/formatBytes.js';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [12, '12 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [150 * 1024 * 1024, '150 MB'],
    [2.25 * 1024 ** 3, '2.3 GB'],
    [5 * 1024 ** 4, '5120 GB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('rejects negative and non-finite sizes', () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(NaN)).toThrow(RangeError);
  });
});
