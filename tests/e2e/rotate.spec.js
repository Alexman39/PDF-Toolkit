import { expect, test } from '@playwright/test';
import { readPages } from '../unit/helpers/pdf.js';
import { addFiles, download, fixture, trackCspViolations } from './helpers/app.js';

/** @type {() => Promise<string[]>} */
let cspViolations;

test.beforeEach(async ({ page }) => {
  cspViolations = await trackCspViolations(page);
  await page.goto('./#/rotate');
});

test.afterEach(async () => {
  expect(await cspViolations()).toEqual([]);
});

/** @param {import('@playwright/test').Page} page */
const tiles = (page) => page.getByRole('list', { name: 'Pages' }).getByRole('listitem');

test('shows a preview for each page and saves the rotations', async ({ page }) => {
  await addFiles(page, [{ name: 'report.pdf', buffer: await fixture('rotated.pdf') }]);
  await expect(page.getByText('report.pdf · 3 pages')).toBeFocused();
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator('.thumbnail.is-rendered img[src^="blob:"]')).toHaveCount(3);

  const save = page.getByRole('button', { name: 'Save rotated PDF' });
  await expect(save).toBeDisabled();

  await page.getByRole('button', { name: 'Rotate all pages 180 degrees' }).click();
  await page.getByRole('button', { name: 'Rotate page 2 left' }).click();
  await expect(tiles(page).nth(1)).toContainText('Page 2 · 90° right');
  await expect(page.locator('#status')).toHaveText('Page 2: turned 90° right.');
  await expect(page.getByText('3 pages will be rotated.')).toBeVisible();

  const { name, bytes } = await download(page, () => save.click());
  expect(name).toBe('report_rotated.pdf');
  // Page 2 of the fixture already has /Rotate 90; rotations add to it.
  expect((await readPages(bytes)).map((p) => p.rotation)).toEqual([180, 180, 180]);
  await expect(page.locator('.status-panel')).toHaveText(/Saved report_rotated\.pdf/);
  await expect(page.getByRole('button', { name: 'Download again' })).toBeFocused();
});

test('Reset undoes every pending rotation', async ({ page }) => {
  await addFiles(page, [{ name: 'a.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByRole('button', { name: 'Rotate all pages right' }).click();
  await expect(page.locator('.thumbnail__frame[data-rotation="90"]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo all rotations' }).click();
  await expect(page.locator('.thumbnail__frame[data-rotation="0"]')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Save rotated PDF' })).toBeDisabled();
});

test('Choose another file goes back to the empty state', async ({ page }) => {
  await addFiles(page, [{ name: 'a.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByRole('button', { name: 'Choose another file' }).click();
  await expect(page.getByText('Drop a PDF here')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pages' })).toBeHidden();
  await addFiles(page, [{ name: 'b.pdf', buffer: await fixture('ten-pages.pdf') }]);
  await expect(tiles(page)).toHaveCount(10);
});

for (const [fixtureName, message] of [
  ['encrypted.pdf', 'This PDF is password-protected; unlock it first.'],
  ['corrupt.pdf', 'This PDF is damaged and could not be read.'],
]) {
  test(`${fixtureName} gets a friendly message and no grid`, async ({ page }) => {
    await addFiles(page, [{ name: 'bad.pdf', buffer: await fixture(fixtureName) }]);
    await expect(page.getByRole('alert')).toHaveText(`bad.pdf: ${message}`);
    await expect(page.getByRole('list', { name: 'Pages' })).toBeHidden();
    await expect(page.getByText('Drop a PDF here')).toBeVisible();
  });
}

test('renders thumbnails lazily, so 150 pages do not all render at once', async ({ page }) => {
  await addFiles(page, [{ name: 'big.pdf', buffer: await fixture('hundred-fifty-pages.pdf') }]);
  await expect(tiles(page)).toHaveCount(150);
  const rendered = page.locator('.thumbnail.is-rendered');
  await expect(tiles(page).first()).toHaveClass(/is-rendered/);
  // Let the queue drain whatever is near the viewport.
  await page.waitForTimeout(1000);
  const initial = await rendered.count();
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThan(60);
  await expect(tiles(page).last()).not.toHaveClass(/is-rendered/);

  await tiles(page).last().scrollIntoViewIfNeeded();
  await expect(tiles(page).last()).toHaveClass(/is-rendered/);
  // Flinging to the bottom skipped the middle: those pages were never wanted long enough.
  expect(await rendered.count()).toBeLessThan(150);
});
