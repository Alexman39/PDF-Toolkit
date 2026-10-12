import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { pageTexts } from '../unit/helpers/pdf.js';
import { addFiles, download, fixture, trackCspViolations } from './helpers/app.js';

/** @type {() => Promise<string[]>} */
let cspViolations;

test.beforeEach(async ({ page }) => {
  cspViolations = await trackCspViolations(page);
  await page.goto('./#/split');
});

test.afterEach(async () => {
  expect(await cspViolations()).toEqual([]);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} fixtureName
 * @param {string} [name]
 */
async function open(page, fixtureName, name = 'ten.pdf') {
  await addFiles(page, [{ name, buffer: await fixture(fixtureName) }]);
  await expect(page.getByRole('group', { name: 'How to split' })).toBeVisible();
}

/**
 * Clicks Split and reads the download: a zip's entries, or a lone PDF, as page labels.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ name: string, files: Record<string, string[]> }>}
 */
async function splitAndRead(page) {
  const { name, bytes } = await download(page, () =>
    page.getByRole('button', { name: 'Split PDF' }).click(),
  );
  const entries = name.endsWith('.zip') ? unzipSync(bytes) : { [name]: bytes };
  const files = {};
  for (const [entry, pdf] of Object.entries(entries)) files[entry] = await pageTexts(pdf);
  return { name, files };
}

const summary = (page) => page.locator('.tool-actions__hint');

test('page ranges: each range becomes a file inside one zip', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  const split = page.getByRole('button', { name: 'Split PDF' });
  await expect(split).toBeDisabled();
  await expect(summary(page)).toHaveText('Enter the pages to extract.');

  await page.getByLabel('Pages', { exact: true }).fill('1-3, 5, 8-');
  await expect(summary(page)).toHaveText(
    'Creates 3 files: ten_p1-3.pdf, ten_p5.pdf, ten_p8-10.pdf. They download together as ten_split.zip.',
  );
  const { name, files } = await splitAndRead(page);
  expect(name).toBe('ten_split.zip');
  expect(files).toEqual({
    'ten_p1-3.pdf': ['Page 1', 'Page 2', 'Page 3'],
    'ten_p5.pdf': ['Page 5'],
    'ten_p8-10.pdf': ['Page 8', 'Page 9', 'Page 10'],
  });
  await expect(page.locator('.status-panel')).toHaveText(/Created 3 files in ten_split\.zip/);
  await expect(page.getByRole('button', { name: 'Download again' })).toBeFocused();
});

test('page ranges: a single range downloads a plain PDF', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  await page.getByLabel('Pages', { exact: true }).fill('2-4');
  const { name, files } = await splitAndRead(page);
  expect(name).toBe('ten_p2-4.pdf');
  expect(files['ten_p2-4.pdf']).toEqual(['Page 2', 'Page 3', 'Page 4']);
});

test('page ranges: repeated ranges get numbered names instead of overwriting', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  await page.getByLabel('Pages', { exact: true }).fill('1-2, 1-2');
  const { files } = await splitAndRead(page);
  expect(Object.keys(files)).toEqual(['ten_p1-2.pdf', 'ten_p1-2 (2).pdf']);
});

test('page ranges: a bad range is explained next to the field', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  const input = page.getByLabel('Pages', { exact: true });
  await input.fill('3-12');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  // The error is linked with aria-describedby, so screen readers hear it with the field.
  await expect(input).toHaveAccessibleDescription(/^"3-12" is out of range; this PDF has 10 pages/);
  await expect(page.getByRole('button', { name: 'Split PDF' })).toBeDisabled();

  await input.fill('3-5');
  await expect(input).not.toHaveAttribute('aria-invalid');
  await expect(page.getByRole('button', { name: 'Split PDF' })).toBeEnabled();
});

test('every N pages', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  await page.getByLabel('Every N pages').check();
  await page.getByLabel('Pages per file').fill('4');
  const { files } = await splitAndRead(page);
  expect(Object.keys(files)).toEqual(['ten_p1-4.pdf', 'ten_p5-8.pdf', 'ten_p9-10.pdf']);

  await page.getByLabel('Pages per file').fill('0');
  await expect(page.getByLabel('Pages per file')).toHaveAccessibleDescription(
    /^Enter a whole number from 1 to 10\./,
  );
});

test('pick pages: one file in page order, or one per page', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  await page.getByLabel('Pick pages').check();
  await expect(page.getByRole('button', { name: 'Split PDF' })).toBeDisabled();
  await expect(summary(page)).toHaveText('Select at least one page.');

  const pages = page.getByRole('list', { name: 'Pages to extract' }).getByRole('listitem');
  await page.getByLabel('Select page 5').check();
  // Clicking the preview works too, for mouse and touch users.
  await pages.nth(1).locator('.thumbnail__frame').click();
  await expect(page.getByLabel('Select page 2')).toBeChecked();
  await expect(pages.nth(1)).toHaveClass(/is-selected/);

  const single = await splitAndRead(page);
  expect(single.files).toEqual({ 'ten_p2_5.pdf': ['Page 2', 'Page 5'] });

  await page.getByLabel('Save each selected page as its own file').check();
  const separate = await splitAndRead(page);
  expect(separate.files).toEqual({ 'ten_p2.pdf': ['Page 2'], 'ten_p5.pdf': ['Page 5'] });

  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByLabel('Select page 2')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Split PDF' })).toBeDisabled();
});

test('one file per page', async ({ page }) => {
  await open(page, 'three-pages.pdf', 'three.pdf');
  await page.getByLabel('One file per page').check();
  const { name, files } = await splitAndRead(page);
  expect(name).toBe('three_split.zip');
  expect(files).toEqual({
    'three_p1.pdf': ['Page 1'],
    'three_p2.pdf': ['Page 2'],
    'three_p3.pdf': ['Page 3'],
  });
});

test('thumbnails are only rendered in Pick pages mode', async ({ page }) => {
  await open(page, 'ten-pages.pdf');
  await expect(page.locator('.thumbnail')).toHaveCount(0);
  await page.getByLabel('Pick pages').check();
  await expect(page.locator('.thumbnail.is-rendered').first()).toBeVisible();
});

for (const [fixtureName, message] of [
  ['encrypted.pdf', 'This PDF is password-protected; unlock it first.'],
  ['corrupt.pdf', 'This PDF is damaged and could not be read.'],
]) {
  test(`${fixtureName} gets a friendly message`, async ({ page }) => {
    await addFiles(page, [{ name: 'bad.pdf', buffer: await fixture(fixtureName) }]);
    await expect(page.getByRole('alert')).toHaveText(`bad.pdf: ${message}`);
    await expect(page.getByRole('group', { name: 'How to split' })).toBeHidden();
  });
}
