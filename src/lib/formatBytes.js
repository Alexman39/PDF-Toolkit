const UNITS = ['B', 'KB', 'MB', 'GB'];

/**
 * Human-readable size: 1536 → "1.5 KB". Uses 1024 steps, like most file managers.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError(`Invalid size: ${bytes}`);
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  // One decimal only where it carries information: "1.5 MB" but "120 MB" and "12 B".
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}
