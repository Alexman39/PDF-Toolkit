import { expect, it } from 'vitest';
import { plural } from '../../src/lib/plural.js';

it('pluralises with a plain s except for exactly one', () => {
  expect(plural(0, 'page')).toBe('0 pages');
  expect(plural(1, 'page')).toBe('1 page');
  expect(plural(150, 'file')).toBe('150 files');
});
