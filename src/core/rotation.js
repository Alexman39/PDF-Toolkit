// Rotation arithmetic only, with no pdf-lib import, so the Rotate screen can use it on the
// main thread without pulling pdf-lib into the page bundle.

/**
 * Maps any multiple of 90 onto the four values PDF viewers understand: 0, 90, 180, 270.
 * @param {number} angle  Degrees, may be negative or above 360.
 * @returns {number}
 * @throws {RangeError} When `angle` is not a whole multiple of 90.
 */
export function normaliseRotation(angle) {
  if (!Number.isInteger(angle) || angle % 90 !== 0) {
    throw new RangeError(`Rotation must be a multiple of 90, got ${angle}`);
  }
  // JavaScript's % keeps the sign (-90 % 360 === -90), so shift into the positive range.
  return ((angle % 360) + 360) % 360;
}

/**
 * Adds `delta` to the pending rotation of each page in `pageIndexes`. Pages that come back to
 * 0 are dropped, so an empty result means "nothing to save".
 * @param {Readonly<Record<number, number>>} deltas  Page index → pending degrees (90/180/270).
 * @param {readonly number[]} pageIndexes
 * @param {number} delta  ±90 or 180.
 * @returns {Record<number, number>}
 */
export function addRotation(deltas, pageIndexes, delta) {
  const next = { ...deltas };
  for (const index of pageIndexes) {
    const angle = normaliseRotation((next[index] ?? 0) + delta);
    if (angle === 0) delete next[index];
    else next[index] = angle;
  }
  return next;
}
