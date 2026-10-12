// Every tool, used on a phone with touch only: taps instead of clicks, and a finger drag to
// reorder. Runs in the "touch" project (a Pixel 7: touch screen, mobile viewport).
import { expect, test } from '@playwright/test';
import { addFiles, download, fixture } from './helpers/app.js';

/**
 * Drags with a finger. Playwright only offers taps, so this sends raw touch events through the
 * Chrome DevTools Protocol, which the browser turns into pointer events as a real finger would.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} target
 * @param {number} dy  Distance to move, in CSS pixels; negative is up.
 */
async function touchDrag(page, target, dy) {
  const box = await target.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x, y }]);
  const steps = 10;
  for (let step = 1; step <= steps; step++) {
    await touch('touchMove', [{ x, y: y + (dy * step) / steps }]);
  }
  await touch('touchEnd', []);
  // Chrome's gesture detector drops the click of a tap that starts within its double-tap
  // window after this touch ends (seen here: pointerup fires, click doesn't). A person's next
  // tap comes later than a script's, so wait the window out.
  await page.waitForTimeout(500);
}

/** @param {import('@playwright/test').Page} page */
async function expectNoSideways(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

test('merge: reorder by dragging a row with a finger, then merge', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /^Merge/ }).tap();
  await addFiles(page, [
    { name: 'a.pdf', buffer: await fixture('three-pages.pdf') },
    { name: 'b.pdf', buffer: await fixture('ten-pages.pdf') },
  ]);
  const names = page.locator('.file-list__name');
  await expect(names).toHaveText(['a.pdf', 'b.pdf']);

  const rows = page.locator('.file-list__item');
  const rowHeight = (await rows.first().boundingBox()).height;
  await touchDrag(page, rows.nth(1).locator('.file-list__handle'), -rowHeight * 1.5);
  await expect(names).toHaveText(['b.pdf', 'a.pdf']);

  // The arrow buttons work by tap too.
  await page.getByRole('button', { name: 'Move a.pdf up' }).tap();
  await expect(names).toHaveText(['a.pdf', 'b.pdf']);

  await expectNoSideways(page);
  const merged = await download(page, () => page.getByRole('button', { name: 'Merge PDFs' }).tap());
  expect(merged.name).toBe('merged.pdf');
});

test('split: pick a page by tapping its preview', async ({ page }) => {
  await page.goto('./#/split');
  await addFiles(page, [{ name: 'c.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByLabel('Pick pages').tap();
  await page.locator('.thumbnail').nth(1).locator('.thumbnail__frame').tap();
  await expect(page.getByLabel('Select page 2')).toBeChecked();

  await expectNoSideways(page);
  const split = await download(page, () => page.getByRole('button', { name: 'Split PDF' }).tap());
  expect(split.name).toBe('c_p2.pdf');
});

test('rotate: turn a page and save', async ({ page }) => {
  await page.goto('./#/rotate');
  await addFiles(page, [{ name: 'd.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByRole('button', { name: 'Rotate page 1 right' }).tap();
  await expect(page.getByText('Page 1 · 90° right')).toBeVisible();

  await expectNoSideways(page);
  const rotated = await download(page, () =>
    page.getByRole('button', { name: 'Save rotated PDF' }).tap(),
  );
  expect(rotated.name).toBe('d_rotated.pdf');
});

test('compress: confirm the warning and compress', async ({ page }) => {
  await page.goto('./#/compress');
  await addFiles(page, [{ name: 'e.pdf', buffer: await fixture('scanned.pdf') }]);
  await page.getByLabel('Strong (lossy)').tap();
  const compressButton = page.getByRole('button', { name: 'Compress PDF' });
  await expect(compressButton).toBeDisabled();
  await page.getByLabel(/I understand/).tap();
  await page.getByLabel('72 DPI').tap();

  await expectNoSideways(page);
  const compressed = await download(page, () => compressButton.tap());
  expect(compressed.name).toBe('e_compressed.pdf');
});

test.describe('on a 320px-wide phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('page previews still fit two to a row', async ({ page }) => {
    await page.goto('./#/rotate');
    await addFiles(page, [{ name: 'd.pdf', buffer: await fixture('three-pages.pdf') }]);
    const columns = await page
      .getByRole('list', { name: 'Pages' })
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    await expectNoSideways(page);
  });

  test('a checkbox with a long label keeps its size', async ({ page }) => {
    await page.goto('./#/compress');
    await addFiles(page, [{ name: 'e.pdf', buffer: await fixture('three-pages.pdf') }]);
    await page.getByLabel('Strong (lossy)').tap();
    const box = await page.getByLabel(/I understand/).boundingBox();
    expect(box.width).toBe(18);
    await expectNoSideways(page);
  });
});
