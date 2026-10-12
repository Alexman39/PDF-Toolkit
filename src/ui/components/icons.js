// Inline SVG icons. Unicode arrows such as ⟲ are missing from many system fonts and show up
// as boxes; SVG looks the same everywhere and follows the text colour via currentColor.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @type {Record<string, string>} Path data on a 24×24 grid. */
const PATHS = {
  rotateLeft: 'M3 8v5h5 M3.5 12.5A8.5 8.5 0 1 0 6 6.3',
  rotateRight: 'M21 8v5h-5 M20.5 12.5A8.5 8.5 0 1 1 18 6.3',
  // Tools
  merge:
    'M8 7V4.5A1.5 1.5 0 0 1 9.5 3H16l4 4v9.5a1.5 1.5 0 0 1-1.5 1.5H16 M4 8.5A1.5 1.5 0 0 1 5.5 7H12l4 4v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 19.5z',
  split:
    'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M20 4 8.1 15.9 M14.5 14.5 20 20 M8.1 8.1 12 12',
  compress: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
  // Privacy points and other decoration
  lock: 'M7 11V7.5a5 5 0 0 1 10 0V11 M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
  offline:
    'M3 3l18 18 M8.5 16.4a5 5 0 0 1 7 0 M5 12.9a10 10 0 0 1 4.7-2.7 M19 12.9a10 10 0 0 0-2.4-1.7 M2 8.8a15 15 0 0 1 4.2-2.6 M22 8.8A15 15 0 0 0 11 5 M12 20h.01',
  code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  arrowUp: 'M12 19V5 M6 11l6-6 6 6',
  arrowDown: 'M12 5v14 M6 13l6 6 6-6',
  close: 'M6 6l12 12 M18 6 6 18',
  addFile: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v6 M9 14h6',
};

/**
 * @param {keyof typeof PATHS} name
 * @returns {SVGSVGElement}  Hidden from screen readers; the button carries the label.
 */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}
