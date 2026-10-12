import { formatBytes } from './formatBytes.js';

// A job holds the input, pdf-lib's parsed copy and the output in memory at once, so ~200 MB of
// input already means well over half a gigabyte; mobile browsers kill tabs well before that.
export const LARGE_INPUT_BYTES = 200 * 1024 * 1024;

/**
 * Returns a warning when the files are big enough to risk the tab running out of memory.
 * A warning, not a limit: desktops with plenty of memory often cope.
 * @param {readonly { size: number }[]} files
 * @returns {string | null}
 */
export function largeInputWarning(files) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= LARGE_INPUT_BYTES) return null;
  return `These files add up to ${formatBytes(total)}. Browsers may run out of memory above about ${formatBytes(LARGE_INPUT_BYTES)}; if it fails, try fewer files at a time.`;
}
