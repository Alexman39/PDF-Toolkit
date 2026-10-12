import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute } from '../../src/ui/router.js';

const ROUTES = ['merge', 'split', 'rotate', 'compress'];

describe('parseRoute', () => {
  it.each([
    ['#/merge', 'merge'],
    ['#merge', 'merge'],
    ['#/split/', 'split'],
    ['#/ROTATE', 'rotate'],
  ])('reads %s as %s', (hash, id) => {
    expect(parseRoute(hash, ROUTES)).toBe(id);
  });

  it.each(['', '#', '#/', '#/unknown', '#/merge/extra'])('treats %j as home', (hash) => {
    expect(parseRoute(hash, ROUTES)).toBeNull();
  });

  it('round-trips with hrefFor', () => {
    for (const id of ROUTES) expect(parseRoute(hrefFor(id), ROUTES)).toBe(id);
  });
});
