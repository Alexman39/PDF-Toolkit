import { describe, expect, it } from 'vitest';
import { describeSizeChange } from '../../src/lib/sizeChange.js';

const KB = 1024;
const MB = 1024 * KB;

describe('describeSizeChange', () => {
  it('describes a smaller result as a percentage saved', () => {
    expect(describeSizeChange(2 * MB, 600 * KB)).toEqual({
      smaller: true,
      text: '2 MB → 600 KB (71% smaller)',
    });
  });

  it('does not round a real saving down to 0%', () => {
    expect(describeSizeChange(1000 * KB, 999 * KB)).toEqual({
      smaller: true,
      text: '1000 KB → 999 KB (less than 1% smaller)',
    });
  });

  it('treats an identical size as not smaller', () => {
    expect(describeSizeChange(5 * KB, 5 * KB)).toEqual({
      smaller: false,
      text: '5 KB → 5 KB (no change)',
    });
  });

  it('describes a slightly larger result as a percentage', () => {
    expect(describeSizeChange(800 * KB, 880 * KB)).toEqual({
      smaller: false,
      text: '800 KB → 880 KB (10% larger)',
    });
  });

  it('describes a much larger result as a multiple', () => {
    // A text PDF turned into images: 2 KB → 40 KB.
    expect(describeSizeChange(2174, 40705).text).toBe('2.1 KB → 39.8 KB (19× larger)');
    expect(describeSizeChange(100 * KB, 250 * KB).text).toBe('100 KB → 250 KB (2.5× larger)');
  });
});
