import { createRenderQueue } from '../../lib/renderQueue.js';

/** @typedef {import('../../lib/thumbnails.js').ThumbnailSource} ThumbnailSource */

/**
 * @typedef {object} ThumbnailTile
 * @property {HTMLLIElement} element
 * @property {HTMLElement} frame     Holds the preview image; tools style it (e.g. rotation).
 * @property {HTMLElement} caption   "Page N"; tools may append to it.
 * @property {HTMLElement} controls  Empty; tools add their buttons here.
 */

/**
 * @typedef {object} ThumbnailGridOptions
 * @property {number} pageCount
 * @property {ThumbnailSource | null} source  Null when previews failed to load: tiles still
 *   appear, with page numbers only, so the tool keeps working.
 * @property {string} label  Accessible name of the list.
 * @property {(tile: ThumbnailTile, pageIndex: number) => void} [decorate]
 */

/**
 * @typedef {object} ThumbnailGrid
 * @property {HTMLOListElement} element
 * @property {ThumbnailTile[]} tiles
 * @property {() => void} destroy  Stops observing and rendering. Doesn't destroy `source`.
 */

// Width the previews are rendered at, in CSS pixels; the CSS grid uses the same size.
const THUMBNAIL_WIDTH = 140;

/**
 * A grid with one tile per page. A tile's preview is only rendered once the tile is near the
 * viewport, so opening a 200-page PDF renders the first screenful, not 200 pages.
 * @param {ThumbnailGridOptions} options
 * @returns {ThumbnailGrid}
 */
export function createThumbnailGrid({ pageCount, source, label, decorate }) {
  const element = document.createElement('ol');
  element.className = 'thumbnail-grid';
  element.setAttribute('aria-label', label);

  const queue = createRenderQueue({
    concurrency: 2,
    onError: (pageIndex) => markUnavailable(tiles[pageIndex]),
  });

  /** @type {ThumbnailTile[]} */
  const tiles = Array.from({ length: pageCount }, (_, pageIndex) => {
    const tile = createTile(pageIndex);
    decorate?.(tile, pageIndex);
    return tile;
  });
  element.append(...tiles.map((tile) => tile.element));

  /** @type {IntersectionObserver | null} */
  let observer = null;
  if (source) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageIndex = Number(/** @type {HTMLElement} */ (entry.target).dataset.pageIndex);
          if (entry.isIntersecting)
            queue.want(pageIndex, (signal) => renderTile(pageIndex, signal));
          else queue.unwant(pageIndex);
        }
      },
      // Start rendering about one screen ahead, so pages are usually ready by the time they
      // scroll in; much more would render pages the user never reaches.
      { rootMargin: '100% 0px' },
    );
    for (const tile of tiles) observer.observe(tile.element);
  } else {
    for (const tile of tiles) markUnavailable(tile);
  }

  /**
   * @param {number} pageIndex
   * @param {AbortSignal} signal
   */
  async function renderTile(pageIndex, signal) {
    const { url } = await source.render(pageIndex, { width: THUMBNAIL_WIDTH, signal });
    const tile = tiles[pageIndex];
    const image = document.createElement('img');
    // The caption already says "Page N"; repeating it as alt text would read it twice.
    image.alt = '';
    image.src = url;
    image.className = 'thumbnail__image';
    tile.frame.replaceChildren(image);
    tile.element.classList.add('is-rendered');
    // Rendered once; no need to keep watching this tile.
    observer?.unobserve(tile.element);
  }

  return {
    element,
    tiles,
    destroy() {
      observer?.disconnect();
      queue.clear();
    },
  };
}

/**
 * @param {number} pageIndex
 * @returns {ThumbnailTile}
 */
function createTile(pageIndex) {
  const element = document.createElement('li');
  element.className = 'thumbnail';
  element.dataset.pageIndex = String(pageIndex);

  const frame = document.createElement('div');
  frame.className = 'thumbnail__frame';

  const caption = document.createElement('span');
  caption.className = 'thumbnail__caption';
  caption.textContent = `Page ${pageIndex + 1}`;

  const controls = document.createElement('div');
  controls.className = 'thumbnail__controls';

  element.append(frame, caption, controls);
  return { element, frame, caption, controls };
}

/** @param {ThumbnailTile} tile */
function markUnavailable(tile) {
  const text = document.createElement('span');
  text.className = 'thumbnail__unavailable';
  text.textContent = 'No preview';
  tile.frame.replaceChildren(text);
}
