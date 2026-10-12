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
 * @property {(root: HTMLElement, id: string) => void} renderLoadError
 *   Shown when a screen's code can't be downloaded, instead of leaving the old screen up.
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
export function startRouter({ root, routes, loadScreen, renderHome, renderLoadError }) {
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
    let mount;
    try {
      mount = await loadScreen(id);
    } catch (error) {
      if (ticket !== navigation) return;
      // Usually the network is down and the service worker hasn't cached this screen yet.
      console.error(`Could not load the ${id} screen`, error);
      renderLoadError(root, id);
      return;
    }
    if (ticket !== navigation) return;
    unmount = mount(root);
  }

  window.addEventListener('hashchange', render);
  render();
}
