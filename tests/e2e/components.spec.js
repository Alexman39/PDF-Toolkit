import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const HARNESS = 'tests/e2e/harness/components.html';

/** @param {string} name */
const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url));

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, buffer: Buffer }[]} files
 */
async function addFiles(page, files) {
  const payload = files.map(({ name, buffer }) => ({ name, mimeType: 'application/pdf', buffer }));
  await page.locator('input[type="file"]').setInputFiles(payload);
}

/** @param {import('@playwright/test').Page} page */
const listedNames = (page) =>
  page.getByRole('list', { name: 'Selected files' }).locator('.file-list__name').allTextContents();

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
});

test.describe('dropzone', () => {
  test('rejects a non-PDF named .pdf, by its header', async ({ page }) => {
    await addFiles(page, [{ name: 'fake.pdf', buffer: Buffer.from('not a pdf') }]);
    await expect(page.getByRole('alert')).toHaveText(/fake\.pdf: This file is not a PDF\./);
    expect(await listedNames(page)).toEqual([]);
  });

  test('is the first thing reached with Tab', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="file"]')).toBeFocused();
  });
});

test.describe('file list', () => {
  test.beforeEach(async ({ page }) => {
    const buffer = await fixture('three-pages.pdf');
    await addFiles(
      page,
      ['a.pdf', 'b.pdf', 'c.pdf'].map((name) => ({ name, buffer })),
    );
  });

  test('reorders with the keyboard, keeps focus on the moved row and announces it', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Move c.pdf up' }).focus();
    await page.keyboard.press('Enter');
    expect(await listedNames(page)).toEqual(['a.pdf', 'c.pdf', 'b.pdf']);
    await expect(page.getByRole('button', { name: 'Move c.pdf up' })).toBeFocused();

    await page.keyboard.press('Enter');
    expect(await listedNames(page)).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
    // "Up" is now disabled, so focus moves to the row's next usable button.
    await expect(page.getByRole('button', { name: 'Move c.pdf up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move c.pdf down' })).toBeFocused();
    await expect(page.locator('#status')).toHaveText('c.pdf, position 1 of 3');
  });

  test('removing a file moves focus to the row that took its place', async ({ page }) => {
    await page.getByRole('button', { name: 'Remove a.pdf' }).click();
    expect(await listedNames(page)).toEqual(['b.pdf', 'c.pdf']);
    await expect(page.getByRole('button', { name: 'Remove b.pdf' })).toBeFocused();
    await expect(page.locator('#status')).toHaveText('Removed a.pdf. 2 files.');
  });

  test('reorders by dragging the handle', async ({ page }) => {
    const items = page.locator('.file-list__item');
    const handle = await items.nth(0).locator('.file-list__handle').boundingBox();
    const target = await items.nth(2).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, target.y + target.height - 2, { steps: 10 });
    await page.mouse.up();
    expect(await listedNames(page)).toEqual(['b.pdf', 'c.pdf', 'a.pdf']);
    await expect(page.locator('#status')).toHaveText('a.pdf, position 3 of 3');
  });
});

test.describe('worker jobs', () => {
  test('merges in the worker and downloads merged.pdf', async ({ page }) => {
    await addFiles(page, [
      { name: 'a.pdf', buffer: await fixture('three-pages.pdf') },
      { name: 'b.pdf', buffer: await fixture('ten-pages.pdf') },
    ]);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Merge' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('merged.pdf');
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(page.getByText('Merged.')).toBeVisible();
  });

  test('names the encrypted file in a friendly alert', async ({ page }) => {
    await addFiles(page, [
      { name: 'ok.pdf', buffer: await fixture('three-pages.pdf') },
      { name: 'locked.pdf', buffer: await fixture('encrypted.pdf') },
    ]);
    await page.getByRole('button', { name: 'Merge' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      /locked\.pdf: This PDF is password-protected; unlock it first\./,
    );
  });

  test('keeps the UI responsive while merging 3000 pages', async ({ page }) => {
    const buffer = await fixture('hundred-fifty-pages.pdf');
    await addFiles(
      page,
      Array.from({ length: 20 }, (_, i) => ({ name: `big${i}.pdf`, buffer })),
    );
    await page.evaluate(() => window.harness.resetFrameGap());
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Merge' }).click();
    await expect(page.getByRole('progressbar', { name: 'Merging…' })).toBeVisible();
    await downloadPromise;
    // Measured on 2026-10-12: ~17 ms (one frame) via the worker, ~130 ms when the same merge
    // runs on the main thread. pdf-lib yields now and then, so even the main thread doesn't
    // fully freeze on this text-only fixture; 100 ms (RAIL's "feels instant") sits between.
    expect(await page.evaluate(() => window.harness.maxFrameGap())).toBeLessThan(100);
  });

  test('cancel terminates the worker, and the next job gets a fresh one', async ({ page }) => {
    const workers = [];
    page.on('worker', (worker) => {
      const entry = { closed: false };
      worker.on('close', () => (entry.closed = true));
      workers.push(entry);
    });
    const buffer = await fixture('hundred-fifty-pages.pdf');
    await addFiles(
      page,
      Array.from({ length: 20 }, (_, i) => ({ name: `big${i}.pdf`, buffer })),
    );

    await page.getByRole('button', { name: 'Merge' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Cancelled.')).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeHidden();
    await expect.poll(() => workers.map((w) => w.closed)).toEqual([true]);

    await page.getByRole('button', { name: 'Remove big0.pdf' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Merge' }).click();
    await downloadPromise;
    expect(workers).toHaveLength(2);
  });
});
