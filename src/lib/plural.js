/**
 * `1 page`, `3 pages`. Only for nouns that take a plain "s".
 * @param {number} count
 * @param {string} noun  Singular.
 * @returns {string}
 */
export function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
