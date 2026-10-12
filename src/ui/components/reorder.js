/**
 * Returns a copy of `list` with the item at `from` moved to `to`. Out-of-range targets are
 * clamped, so "move up" on the first item is a harmless no-op.
 * @template T
 * @param {readonly T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
  if (!Number.isInteger(from) || from < 0 || from >= list.length) {
    throw new RangeError(`Cannot move item ${from} of ${list.length}`);
  }
  const target = Math.min(Math.max(to, 0), list.length - 1);
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item);
  return copy;
}
