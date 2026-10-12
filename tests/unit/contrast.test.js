// Reads the colour tokens from main.css, so changing a colour can't quietly break contrast
// in either theme (WCAG 1.4.3 for text, 1.4.11 for control edges and focus rings).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8');

/**
 * @param {string} block
 * @returns {Record<string, string>}  Token name (without `--`) → hex colour.
 */
function readTokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [name, hex]),
  );
}

const light = readTokens(css.match(/^:root\s*{([^}]*)}/m)[1]);
const dark = {
  ...light,
  ...readTokens(css.match(/prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/)[1]),
};

/**
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// [foreground, background, minimum ratio]
const PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'danger-surface', 4.5],
  ['text', 'warning-surface', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'danger-surface', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['on-accent', 'accent', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'danger-surface', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['focus', 'danger-surface', 3],
  ['border-strong', 'bg', 3],
  ['border-strong', 'surface', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_theme, tokens) => {
  it.each(PAIRS)('%s on %s reaches %s:1', (foreground, background, minimum) => {
    expect(tokens[foreground], foreground).toBeDefined();
    expect(tokens[background], background).toBeDefined();
    expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum);
  });
});
