// Hash routes (`#/merge`), because GitHub Pages can't serve index.html for deep paths like
// /PDF-Toolkit/merge, and the browser's Back button works with hashes for free.

/**
 * @callback Unmount
 * @returns {void}
 */

/**
 * @callback Mount
 * @param {HTMLElement} root
 * @returns {Unmount}  Undoes everything the screen started: running jobs, observers, memory.
 */

/**
 * @typedef {object} RouterOptions
 * @property {HTMLElement} root
 * @property {readonly string[]} routes  Known screen ids, e.g. `['merge', 'split']`.
 * @property {(id: string) => Promise<Mount>} loadScreen
 * @property {(root: HTMLElement, from: string | null) => void} renderHome
 *   `from` is the screen the user just left, so home can put focus back on its card.
 */

/**
 * Turns a location hash into a screen id, or null for home. Unknown ids count as home so a
 * stale bookmark never shows a blank page.
 * @param {string} hash  e.g. `#/merge`, `#merge`, `` or `#/`.
 * @param {readonly string[]} routes
 * @returns {string | null}
 */
export function parseRoute(hash, routes) {
  const id = hash.replace(/^#\/?/, '').replace(/\/$/, '').toLowerCase();
  return routes.includes(id) ? id : null;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function hrefFor(id) {
  return `#/${id}`;
}

/**
 * Renders the screen for the current hash and re-renders on every change.
 * @param {RouterOptions} options
 * @returns {void}
 */
export function startRouter({ root, routes, loadScreen, renderHome }) {
  /** @type {Unmount | null} */
  let unmount = null;
  /** @type {string | null} */
  let current = null;
  // Screens load asynchronously; a quick Back press must not let a late import win.
  let navigation = 0;

  async function render() {
    const id = parseRoute(location.hash, routes);
    if (id === current && unmount) return;
    const ticket = ++navigation;
    const from = current;
    unmount?.();
    unmount = null;
    current = id;

    if (id === null) {
      renderHome(root, from);
      return;
    }
    const mount = await loadScreen(id);
    if (ticket !== navigation) return;
    unmount = mount(root);
  }

  window.addEventListener('hashchange', render);
  render();
}
