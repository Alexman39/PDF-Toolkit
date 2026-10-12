// Takes the README screenshots from the production build. Run with `npm run screenshots`.
// A script rather than a test, so CI never fails over pixels and the images change only
// when someone decides to refresh them.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { build, preview } from 'vite';
import { addFiles, download, fixture } from '../tests/e2e/helpers/app.js';

const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PORT = 4180;
const DESKTOP = { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 };

/**
 * Opens a fresh page, so earlier screens and colour schemes can't leak into the next shot.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} baseURL
 * @param {import('@playwright/test').BrowserContextOptions} options
 */
async function openPage(browser, baseURL, options) {
  const context = await browser.newContext({ ...options, baseURL, acceptDownloads: true });
  return context.newPage();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {{ fullPage?: boolean }} [options]
 */
async function save(page, name, { fullPage = true } = {}) {
  // 'disabled' finishes CSS transitions, so a page caught mid-rotation isn't drawn at 45°.
  await page.screenshot({ path: `${OUT_DIR}${name}.png`, fullPage, animations: 'disabled' });
  await page.context().close();
  console.log(`docs/screenshots/${name}.png`);
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} baseURL
 */
async function takeScreenshots(browser, baseURL) {
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    const page = await openPage(browser, baseURL, { ...DESKTOP, colorScheme });
    await page.goto('./');
    await page.getByRole('link', { name: /Merge/ }).waitFor();
    await save(page, `home-${colorScheme}`);
  }

  const merge = await openPage(browser, baseURL, DESKTOP);
  await merge.goto('./#/merge');
  await addFiles(merge, [
    { name: 'contract.pdf', buffer: await fixture('three-pages.pdf') },
    { name: 'appendix-a.pdf', buffer: await fixture('mixed-sizes.pdf') },
    { name: 'scan.pdf', buffer: await fixture('scanned.pdf') },
  ]);
  await merge.getByRole('button', { name: 'Merge PDFs' }).waitFor();
  await save(merge, 'merge');

  const rotate = await openPage(browser, baseURL, DESKTOP);
  await rotate.goto('./#/rotate');
  await addFiles(rotate, [{ name: 'report.pdf', buffer: await fixture('ten-pages.pdf') }]);
  await rotate.locator('.thumbnail.is-rendered').first().waitFor();
  await rotate.getByRole('button', { name: 'Rotate page 2 right' }).click();
  // Wait for every visible tile, so the shot has no half-loaded placeholders.
  await rotate.waitForFunction(
    () => document.querySelectorAll('.thumbnail.is-rendered').length >= 8,
  );
  await save(rotate, 'rotate');

  const compress = await openPage(browser, baseURL, DESKTOP);
  await compress.goto('./#/compress');
  await addFiles(compress, [{ name: 'scan.pdf', buffer: await fixture('scanned.pdf') }]);
  await compress.getByLabel('Strong (lossy)').check();
  await compress.getByLabel(/I understand/).check();
  await compress.getByLabel('72 DPI').check();
  await download(compress, () => compress.getByRole('button', { name: 'Compress PDF' }).click());
  await compress.locator('.status-panel', { hasText: /% smaller/ }).waitFor();
  await save(compress, 'compress');

  // Scale 2 instead of the Pixel's 2.625 keeps the PNG small; one screen tall, like a phone.
  const phone = await openPage(browser, baseURL, { ...devices['Pixel 7'], deviceScaleFactor: 2 });
  await phone.goto('./#/split');
  await addFiles(phone, [{ name: 'report.pdf', buffer: await fixture('three-pages.pdf') }]);
  // Thumbnails only appear in Pick pages mode.
  await phone.getByLabel('Pick pages').check();
  await phone.getByLabel('Select page 2').check();
  await phone.waitForFunction(
    () => document.querySelectorAll('.thumbnail.is-rendered').length === 3,
  );
  await phone.locator('.thumbnail-grid').scrollIntoViewIfNeeded();
  await save(phone, 'split-phone', { fullPage: false });
}

await mkdir(OUT_DIR, { recursive: true });
await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
try {
  await takeScreenshots(browser, `http://localhost:${PORT}/PDF-Toolkit/`);
} finally {
  await browser.close();
  await server.close();
}
