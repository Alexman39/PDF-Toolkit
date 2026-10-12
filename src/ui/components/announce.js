/**
 * Reads `message` to screen-reader users through the page's #status live region.
 * @param {string} message
 * @returns {void}
 */
export function announce(message) {
  const region = document.getElementById('status');
  if (!region) return;
  // Clearing first, then writing on the next frame, makes screen readers repeat a message
  // identical to the previous one ("moved to position 2 of 3" twice in a row).
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
