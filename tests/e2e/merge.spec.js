import { expect, test } from '@playwright/test';
import { readPages } from '../unit/helpers/pdf.js';
import { addFiles, download, fixture, trackFrameGaps } from './helpers/app.js';

const A4 = [595.28, 841.89];

/** @param {import('@playwright/test').Page} page */
const listedNames = (page) =>
  page.getByRole('list', { name: 'Files to merge' }).locator('.file-list__name').allTextContents();

test.beforeEach(async ({ page }) => {
  await trackFrameGaps(page);
  await page.goto('./#/merge');
});

test('empty state asks for two files and keeps Merge disabled', async ({ page }) => {
  const merge = page.getByRole('button', { name: 'Merge PDFs' });
  await expect(merge).toBeDisabled();
  await expect(page.getByText('Add at least two PDFs to merge.')).toBeVisible();

  await addFiles(page, [{ name: 'a.pdf', buffer: await fixture('three-pages.pdf') }]);
  await expect(merge).toBeDisabled();
  await expect(page.getByText('Add one more PDF to merge.')).toBeVisible();
});

test('merges in the order shown, then offers Download again and Start over', async ({ page }) => {
  await addFiles(page, [
    { name: 'three.pdf', buffer: await fixture('three-pages.pdf') },
    { name: 'mixed.pdf', buffer: await fixture('mixed-sizes.pdf') },
  ]);
  await page.getByRole('button', { name: 'Move mixed.pdf up' }).click();
  expect(await listedNames(page)).toEqual(['mixed.pdf', 'three.pdf']);

  const { name, bytes } = await download(page, () =>
    page.getByRole('button', { name: 'Merge PDFs' }).click(),
  );
  expect(name).toBe('merged.pdf');
  const pages = await readPages(bytes);
  expect(pages.map((p) => p.text)).toEqual([
    'Page 1',
    'Page 2',
    'Page 3',
    'Page 1',
    'Page 2',
    'Page 3',
  ]);
  // mixed-sizes.pdf starts A4, Letter, A5 landscape; three-pages.pdf is all A4.
  expect(pages[1].size).toEqual([612, 792]);
  expect(pages[3].size).toEqual(A4);

  await expect(page.locator('.status-panel')).toHaveText(/Merged 2 files into merged\.pdf/);
  const again = page.getByRole('button', { name: 'Download again' });
  await expect(again).toBeFocused();
  const second = await download(page, () => again.click());
  expect(second.bytes).toEqual(bytes);

  await page.getByRole('button', { name: 'Start over' }).click();
  expect(await listedNames(page)).toEqual([]);
  await expect(page.locator('.status-panel')).toBeHidden();
});

test('flags the encrypted file in its row and in an alert, without losing the others', async ({
  page,
}) => {
  await addFiles(page, [
    { name: 'ok.pdf', buffer: await fixture('three-pages.pdf') },
    { name: 'locked.pdf', buffer: await fixture('encrypted.pdf') },
  ]);
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'locked.pdf: This PDF is password-protected; unlock it first. Remove it and try again.',
  );
  await expect(page.locator('.file-list__item.has-error .file-list__name')).toHaveText(
    'locked.pdf',
  );

  await page.getByRole('button', { name: 'Remove locked.pdf' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
  await addFiles(page, [{ name: 'other.pdf', buffer: await fixture('ten-pages.pdf') }]);
  const { bytes } = await download(page, () =>
    page.getByRole('button', { name: 'Merge PDFs' }).click(),
  );
  expect(await readPages(bytes)).toHaveLength(13);
});

test('a corrupt file gets a friendly message', async ({ page }) => {
  await addFiles(page, [
    { name: 'broken.pdf', buffer: await fixture('corrupt.pdf') },
    { name: 'ok.pdf', buffer: await fixture('three-pages.pdf') },
  ]);
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'broken.pdf: This PDF is damaged and could not be read. Remove it and try again.',
  );
});

test('a non-PDF is rejected by its header when dropped', async ({ page }) => {
  await addFiles(page, [{ name: 'fake.pdf', buffer: Buffer.from('not a pdf') }]);
  await expect(page.getByRole('alert')).toHaveText(/fake\.pdf: This file is not a PDF\./);
  expect(await listedNames(page)).toEqual([]);
});

test.describe('large jobs', () => {
  test.beforeEach(async ({ page }) => {
    const buffer = await fixture('hundred-fifty-pages.pdf');
    await addFiles(
      page,
      Array.from({ length: 20 }, (_, i) => ({ name: `big${i}.pdf`, buffer })),
    );
  });

  test('keeps the UI responsive while merging 3000 pages', async ({ page }) => {
    await page.evaluate(() => window.frameGaps.reset());
    const result = download(page, () => page.getByRole('button', { name: 'Merge PDFs' }).click());
    await expect(page.getByRole('progressbar', { name: 'Merging 20 files…' })).toBeVisible();
    await result;
    // Measured on 2026-10-12: ~17 ms (one frame) via the worker, ~130 ms when the same merge
    // runs on the main thread. 100 ms (RAIL's "feels instant") sits between.
    expect(await page.evaluate(() => window.frameGaps.max())).toBeLessThan(100);
  });

  test('cancel terminates the worker, keeps the files, and the next job gets a fresh one', async ({
    page,
  }) => {
    const workers = [];
    page.on('worker', (worker) => {
      const entry = { closed: false };
      worker.on('close', () => (entry.closed = true));
      workers.push(entry);
    });

    await page.getByRole('button', { name: 'Merge PDFs' }).click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.status-panel')).toHaveText(
      'Merge cancelled. Your files are still here.',
    );
    await expect(page.getByRole('progressbar')).toBeHidden();
    await expect.poll(() => workers.map((w) => w.closed)).toEqual([true]);
    expect(await listedNames(page)).toHaveLength(20);

    await page.getByRole('button', { name: 'Remove big0.pdf' }).click();
    await download(page, () => page.getByRole('button', { name: 'Merge PDFs' }).click());
    expect(workers).toHaveLength(2);
  });
});
