import { describe, expect, it } from 'vitest';
import { PageRangeError } from '../../src/core/errors.js';
import { parsePageRanges, rangesToPageIndexes } from '../../src/core/pageRanges.js';

/** Runs `fn` and returns the error it throws, so tests can inspect its fields. */
function catchError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

describe('parsePageRanges', () => {
  it('parses the canonical example', () => {
    expect(parsePageRanges('1-3, 5, 8-', 10)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
      { from: 8, to: 10 },
    ]);
  });

  it('ignores whitespace anywhere around numbers and separators', () => {
    expect(parsePageRanges('  1 -3 ,5 ,\t8 - 9 ', 10)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
      { from: 8, to: 9 },
    ]);
  });

  it('treats en and em dashes as hyphens', () => {
    expect(parsePageRanges('1–3, 4—5', 10)).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 5 },
    ]);
  });

  it('supports an open start ("-3" means 1-3)', () => {
    expect(parsePageRanges('-3', 10)).toEqual([{ from: 1, to: 3 }]);
  });

  it('supports an open end ("8-" means 8 to the last page)', () => {
    expect(parsePageRanges('8-', 10)).toEqual([{ from: 8, to: 10 }]);
  });

  it('accepts a single-page range written as "4-4"', () => {
    expect(parsePageRanges('4-4', 10)).toEqual([{ from: 4, to: 4 }]);
  });

  it('accepts the first and last page exactly', () => {
    expect(parsePageRanges('1, 10', 10)).toEqual([
      { from: 1, to: 1 },
      { from: 10, to: 10 },
    ]);
  });

  it('keeps ranges in typed order and keeps duplicates (split needs one output each)', () => {
    expect(parsePageRanges('5, 1-2, 5', 10)).toEqual([
      { from: 5, to: 5 },
      { from: 1, to: 2 },
      { from: 5, to: 5 },
    ]);
  });

  it('ignores empty segments from stray commas', () => {
    expect(parsePageRanges(',1,,2,', 10)).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
    ]);
  });

  it('allows leading zeros', () => {
    expect(parsePageRanges('03', 10)).toEqual([{ from: 3, to: 3 }]);
  });

  describe('errors', () => {
    it.each(['', '   ', ' , ,'])('rejects empty input %j', (input) => {
      const error = catchError(() => parsePageRanges(input, 10));
      expect(error).toBeInstanceOf(PageRangeError);
      expect(error.message).toMatch(/at least one page/i);
    });

    it.each(['abc', '1.5', '1-2-3', '--', '-', '1a', '+2', '1 2', '#3'])(
      'rejects garbage %j and names the token',
      (input) => {
        const error = catchError(() => parsePageRanges(`1, ${input}`, 10));
        expect(error).toBeInstanceOf(PageRangeError);
        expect(error.token).toBe(input);
        expect(error.message).toContain(`"${input}"`);
      },
    );

    it('rejects page 0', () => {
      const error = catchError(() => parsePageRanges('0-2', 10));
      expect(error).toBeInstanceOf(PageRangeError);
      expect(error.token).toBe('0-2');
      expect(error.message).toMatch(/start at 1/);
    });

    it.each([
      ['12', 10],
      ['8-11', 10],
      ['8-', 5],
    ])('rejects %j beyond a %i-page document and says how many pages there are', (input, pages) => {
      const error = catchError(() => parsePageRanges(input, pages));
      expect(error).toBeInstanceOf(PageRangeError);
      expect(error.token).toBe(input);
      expect(error.message).toContain(`${pages} page`);
    });

    it('rejects a reversed range instead of silently swapping it', () => {
      const error = catchError(() => parsePageRanges('5-3', 10));
      expect(error).toBeInstanceOf(PageRangeError);
      expect(error.token).toBe('5-3');
      expect(error.message).toMatch(/3-5/);
    });

    it('uses singular "page" for a one-page document', () => {
      const error = catchError(() => parsePageRanges('2', 1));
      expect(error.message).toMatch(/has 1 page\b/);
    });

    it.each([0, -1, 1.5, NaN, '10'])('rejects an invalid page count %j', (pageCount) => {
      expect(() => parsePageRanges('1', pageCount)).toThrow(TypeError);
    });

    it('rejects non-string input', () => {
      expect(() => parsePageRanges(null, 10)).toThrow(TypeError);
    });
  });
});

describe('rangesToPageIndexes', () => {
  it('flattens ranges into zero-based indexes', () => {
    expect(rangesToPageIndexes(parsePageRanges('1-3, 5, 8-', 10))).toEqual([0, 1, 2, 4, 7, 8, 9]);
  });

  it('removes duplicates but keeps the first-seen order', () => {
    expect(rangesToPageIndexes(parsePageRanges('5, 1-3, 2, 5-6', 10))).toEqual([4, 0, 1, 2, 5]);
  });

  it('returns an empty array for no ranges', () => {
    expect(rangesToPageIndexes([])).toEqual([]);
  });
});
