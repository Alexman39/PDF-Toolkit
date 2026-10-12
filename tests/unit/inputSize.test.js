import { describe, expect, it } from 'vitest';
import { LARGE_INPUT_BYTES, largeInputWarning } from '../../src/lib/inputSize.js';

describe('largeInputWarning', () => {
  it('stays quiet up to the threshold', () => {
    expect(largeInputWarning([])).toBeNull();
    expect(
      largeInputWarning([{ size: LARGE_INPUT_BYTES / 2 }, { size: LARGE_INPUT_BYTES / 2 }]),
    ).toBeNull();
  });

  it('warns with the total once the files add up to more', () => {
    const warning = largeInputWarning([{ size: LARGE_INPUT_BYTES }, { size: 50 * 1024 * 1024 }]);
    expect(warning).toMatch(/^These files add up to 250 MB\./);
    expect(warning).toContain('about 200 MB');
  });
});
