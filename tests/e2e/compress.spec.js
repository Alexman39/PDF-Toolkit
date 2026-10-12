import { expect, test } from '@playwright/test';
import { labels, pageTexts, readPages } from '../unit/helpers/pdf.js';
import { addFiles, download, fixture, trackCspViolations } from './helpers/app.js';

/** @type {() => Promise<string[]>} */
let cspViolations;
/** @type {string[]} */
let fallbackWarnings;

test.beforeEach(async ({ page }) => {
  cspViolations = await trackCspViolations(page);
  fallbackWarnings = [];
  page.on('console', (message) => {
    if (message.text().includes('retrying on the main thread')) {
      fallbackWarnings.push(message.text());
    }
  });
  await page.goto('./#/compress');
});

test.afterEach(async () => {
  expect(await cspViolations()).toEqual([]);
  // compressStrong warns when worker rendering fails and it falls back; that must not happen
  // silently in a browser that claims support.
  expect(fallbackWarnings).toEqual([]);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} fixtureName
 * @param {string} [name]
 */
async function open(page, fixtureName, name = 'report.pdf') {
  await addFiles(page, [{ name, buffer: await fixture(fixtureName) }]);
  await expect(page.getByRole('group', { name: 'How to compress' })).toBeVisible();
}

/**
 * Picks Strong, confirms the warning and sets the resolution.
 * @param {import('@playwright/test').Page} page
 * @param {number} dpi
 */
async function chooseStrong(page, dpi) {
  await page.getByLabel('Strong (lossy)').check();
  await page.getByLabel(/I understand/).check();
  await page.getByLabel(`${dpi} DPI`).check();
}

/** @param {import('@playwright/test').Page} page */
const compressButton = (page) => page.getByRole('button', { name: 'Compress PDF' });

test('optimise saves a smaller lossless copy', async ({ page }) => {
  const original = await fixture('ten-pages.pdf');
  await open(page, 'ten-pages.pdf');
  await expect(page.getByText('Saves a lossless copy.')).toBeVisible();

  const { name, bytes } = await download(page, () => compressButton(page).click());
  expect(name).toBe('report_compressed.pdf');
  expect(bytes.length).toBeLessThan(original.length);
  // Lossless: the text is still there.
  expect(await pageTexts(bytes)).toEqual(labels(1, 10));
  await expect(page.locator('.status-panel')).toHaveText(
    /Saved report_compressed\.pdf: .* → .* \(\d+% smaller\)\./,
  );
  await expect(page.getByRole('button', { name: 'Download again' })).toBeFocused();
});

test('strong mode shows the warning and needs it confirmed before it can run', async ({ page }) => {
  await open(page, 'scanned.pdf');
  // By text: the large-file notice shares the class.
  const warning = page.locator('.note--warning', { hasText: 'Strong compression turns' });
  await expect(warning).toBeHidden();

  await page.getByLabel('Strong (lossy)').check();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Text can no longer be selected, searched or copied');
  await expect(compressButton(page)).toBeDisabled();
  await expect(page.getByText('Tick the box in the warning above to continue.')).toBeVisible();

  await page.getByLabel(/I understand/).check();
  await expect(compressButton(page)).toBeEnabled();
  await expect(page.getByText('Renders 3 pages at 110 DPI.')).toBeVisible();

  // Switching back to Optimise needs no confirmation.
  await page.getByLabel(/I understand/).uncheck();
  await page.getByLabel('Optimise (lossless)').check();
  await expect(compressButton(page)).toBeEnabled();
});

test('strong mode shrinks a scan significantly', async ({ page }) => {
  const original = await fixture('scanned.pdf');
  const mainThreadRenderer = [];
  page.on('request', (request) => {
    if (/\/rasterise-[\w-]+\.js$/.test(request.url())) mainThreadRenderer.push(request.url());
  });
  await open(page, 'scanned.pdf', 'scan.pdf');
  await chooseStrong(page, 72);

  const { name, bytes } = await download(page, () => compressButton(page).click());
  expect(name).toBe('scan_compressed.pdf');
  expect(bytes.length).toBeLessThan(original.length * 0.6);
  const pages = await readPages(bytes);
  expect(pages).toHaveLength(3);
  await expect(page.locator('.status-panel')).toHaveText(/\(\d+% smaller\)/);
  // Chromium supports OffscreenCanvas in workers, so the main thread never loads pdf.js.
  expect(mainThreadRenderer).toEqual([]);
});

test('a text PDF gets an honest "not smaller" and the original back', async ({ page }) => {
  const original = await fixture('three-pages.pdf');
  const downloads = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await open(page, 'three-pages.pdf');
  await chooseStrong(page, 110);
  await compressButton(page).click();

  const status = page.locator('.status-panel');
  await expect(status).toContainText("The result isn't smaller");
  await expect(status).toContainText(/× larger\)/);
  // Nothing was handed over automatically.
  expect(downloads).toEqual([]);

  const kept = await download(page, () =>
    page.getByRole('button', { name: 'Keep original' }).click(),
  );
  expect(kept.name).toBe('report.pdf');
  expect(kept.bytes).toEqual(new Uint8Array(original));

  const anyway = await download(page, () =>
    page.getByRole('button', { name: 'Download anyway' }).click(),
  );
  expect(anyway.name).toBe('report_compressed.pdf');
  expect(anyway.bytes.length).toBeGreaterThan(original.length);
  // Rendered pages have no text left; this is what the warning promised.
  expect(await pageTexts(anyway.bytes)).toEqual([undefined, undefined, undefined]);
});

test('renders on the main thread when the worker has no OffscreenCanvas', async ({ page }) => {
  // Removes OffscreenCanvas inside the PDF worker only, as in browsers without support. The
  // check runs on the first message, after this line.
  await page.route(/\/assets\/pdf\.worker-[\w-]+\.js$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `globalThis.OffscreenCanvas = undefined;\n${await response.text()}`,
    });
  });
  const mainThreadRenderer = [];
  page.on('request', (request) => {
    if (/\/rasterise-[\w-]+\.js$/.test(request.url())) mainThreadRenderer.push(request.url());
  });
  const original = await fixture('scanned.pdf');
  await open(page, 'scanned.pdf');
  await chooseStrong(page, 72);

  const { bytes } = await download(page, () => compressButton(page).click());
  expect(mainThreadRenderer).toHaveLength(1);
  expect(bytes.length).toBeLessThan(original.length * 0.6);
  expect(await readPages(bytes)).toHaveLength(3);
});

test('strong mode is unavailable for JPEG 2000 images, with the reason', async ({ page }) => {
  await open(page, 'jpeg2000-image.pdf');
  const strong = page.getByRole('radio', { name: /Strong \(lossy\)/ });
  await expect(strong).toBeDisabled();
  await expect(
    page.getByText(/contains JPEG 2000 images, which this tool can't draw yet/),
  ).toBeVisible();
  await expect(compressButton(page)).toBeEnabled(); // Optimise still works.
});

test('cancel stops strong compression and keeps the settings', async ({ page }) => {
  await open(page, 'hundred-fifty-pages.pdf');
  await chooseStrong(page, 150);
  await compressButton(page).click();

  const progress = page.getByRole('progressbar');
  // Counts rendered pages, so the bar becomes determinate.
  await expect(progress).toHaveAttribute('max', '150');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.status-panel')).toHaveText(
    'Cancelled. Your settings are still here.',
  );
  await expect(progress).toBeHidden();
  await expect(page.getByLabel('Strong (lossy)')).toBeChecked();
  await expect(page.getByLabel('150 DPI')).toBeChecked();
  await expect(page.getByLabel(/I understand/)).toBeChecked();
});

for (const [fixtureName, message] of [
  ['encrypted.pdf', 'This PDF is password-protected; unlock it first.'],
  ['corrupt.pdf', 'This PDF is damaged and could not be read.'],
]) {
  test(`${fixtureName} gets a friendly message`, async ({ page }) => {
    await addFiles(page, [{ name: 'bad.pdf', buffer: await fixture(fixtureName) }]);
    await expect(page.getByRole('alert')).toHaveText(`bad.pdf: ${message}`);
    await expect(page.getByRole('group', { name: 'How to compress' })).toBeHidden();
  });
}
