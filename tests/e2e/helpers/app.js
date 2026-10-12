// Shared steps for the app's tool-screen tests.
import { readFile } from 'node:fs/promises';

/**
 * @param {string} name  File name inside tests/fixtures.
 * @returns {Promise<Buffer>}
 */
export const fixture = (name) => readFile(new URL(`../../fixtures/${name}`, import.meta.url));

/**
 * Picks files through the screen's real file input, as the native picker would.
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, buffer: Buffer }[]} files
 */
export async function addFiles(page, files) {
  const payload = files.map(({ name, buffer }) => ({ name, mimeType: 'application/pdf', buffer }));
  await page.locator('input[type="file"]').setInputFiles(payload);
}

/**
 * Starts the action that triggers a download and returns the downloaded bytes.
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<unknown>} action
 * @returns {Promise<{ name: string, bytes: Uint8Array }>}
 */
export async function download(page, action) {
  const downloadPromise = page.waitForEvent('download');
  await action();
  const file = await downloadPromise;
  return {
    name: file.suggestedFilename(),
    bytes: new Uint8Array(await readFile(await file.path())),
  };
}

/**
 * Records the longest gap between animation frames, so a frozen main thread shows up as one
 * huge gap. Call before page.goto().
 * @param {import('@playwright/test').Page} page
 */
export async function trackFrameGaps(page) {
  await page.addInitScript(() => {
    let maxGap = 0;
    let last = performance.now();
    const tick = (now) => {
      maxGap = Math.max(maxGap, now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.frameGaps = {
      reset() {
        maxGap = 0;
        last = performance.now();
      },
      max: () => maxGap,
    };
  });
}
