// Inline SVG icons. Unicode arrows such as ⟲ are missing from many system fonts and show up
// as boxes; SVG looks the same everywhere and follows the text colour via currentColor.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @type {Record<string, string>} Path data on a 24×24 grid. */
const PATHS = {
  rotateLeft: 'M3 8v5h5 M3.5 12.5A8.5 8.5 0 1 0 6 6.3',
  rotateRight: 'M21 8v5h-5 M20.5 12.5A8.5 8.5 0 1 1 18 6.3',
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
