import { describe, expect, it } from 'vitest';
import { moveItem } from '../../src/ui/components/reorder.js';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  it.each([
    [0, 2, ['b', 'c', 'a', 'd']],
    [3, 0, ['d', 'a', 'b', 'c']],
    [1, 2, ['a', 'c', 'b', 'd']],
    [2, 2, ['a', 'b', 'c', 'd']],
  ])('moves %i to %i', (from, to, expected) => {
    expect(moveItem(list, from, to)).toEqual(expected);
  });

  it('clamps targets past either end', () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 3, 9)).toEqual(list);
  });

  it('does not mutate the input', () => {
    moveItem(list, 0, 3);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects a source index outside the list', () => {
    expect(() => moveItem(list, 4, 0)).toThrow(RangeError);
    expect(() => moveItem([], 0, 0)).toThrow(RangeError);
  });
});
