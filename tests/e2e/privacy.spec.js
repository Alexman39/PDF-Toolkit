// The privacy promise (CLAUDE.md §1, §5): once the app has loaded, processing files makes no
// network request at all, and the app keeps working with the network off.
import { expect, test } from '@playwright/test';
import { addFiles, download, fixture, trackCspViolations } from './helpers/app.js';

/** @type {() => Promise<string[]>} */
let cspViolations;

test.beforeEach(async ({ page }) => {
  cspViolations = await trackCspViolations(page);
  await page.goto('./');
  await waitForOfflineReady(page);
});

test.afterEach(async () => {
  expect(await cspViolations()).toEqual([]);
});

/**
 * Waits until the service worker has cached the app and controls this page.
 * @param {import('@playwright/test').Page} page
 */
async function waitForOfflineReady(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  });
}

/**
 * Uses every tool once, the way a user would: from the home screen, then Back.
 * @param {import('@playwright/test').Page} page
 */
async function useEveryTool(page) {
  const open = (name) => page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  const back = () => page.getByRole('link', { name: 'All tools' }).click();

  await open('Merge');
  await addFiles(page, [
    { name: 'a.pdf', buffer: await fixture('three-pages.pdf') },
    { name: 'b.pdf', buffer: await fixture('ten-pages.pdf') },
  ]);
  const merged = await download(page, () =>
    page.getByRole('button', { name: 'Merge PDFs' }).click(),
  );
  expect(merged.name).toBe('merged.pdf');
  await back();

  // Pick pages, so pdf.js renders thumbnails too.
  await open('Split');
  await addFiles(page, [{ name: 'c.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByLabel('Pick pages').check();
  await expect(page.locator('.thumbnail.is-rendered').first()).toBeVisible();
  await page.getByLabel('Select page 2').check();
  const split = await download(page, () => page.getByRole('button', { name: 'Split PDF' }).click());
  expect(split.name).toBe('c_p2.pdf');
  await back();

  await open('Rotate');
  await addFiles(page, [{ name: 'd.pdf', buffer: await fixture('three-pages.pdf') }]);
  await page.getByRole('button', { name: 'Rotate page 1 right' }).click();
  const rotated = await download(page, () =>
    page.getByRole('button', { name: 'Save rotated PDF' }).click(),
  );
  expect(rotated.name).toBe('d_rotated.pdf');
  await back();

  // Strong mode loads the most code: pdf.js inside the worker, plus its own nested worker.
  await open('Compress');
  await addFiles(page, [{ name: 'e.pdf', buffer: await fixture('scanned.pdf') }]);
  await page.getByLabel('Strong (lossy)').check();
  await page.getByLabel(/I understand/).check();
  await page.getByLabel('72 DPI').check();
  const compressed = await download(page, () =>
    page.getByRole('button', { name: 'Compress PDF' }).click(),
  );
  expect(compressed.name).toBe('e_compressed.pdf');
  await back();
}

test('processing files makes no network request', async ({ page, context }) => {
  /** @type {import('@playwright/test').Request[]} */
  const requests = [];
  // Context-wide, so requests from workers and the service worker are seen too.
  context.on('request', (request) => requests.push(request));

  await useEveryTool(page);

  const network = [];
  for (const request of requests) {
    const url = request.url();
    // In-memory URLs: thumbnails and downloads. Nothing leaves the browser.
    if (url.startsWith('blob:') || url.startsWith('data:')) continue;
    // Answered from the service worker's cache without touching the network. A request the
    // service worker itself sends on (`request.serviceWorker()`) is a real one and fails.
    const response = await request.response();
    if (!request.serviceWorker() && response?.fromServiceWorker()) continue;
    network.push(`${request.method()} ${url}`);
  }
  expect(network).toEqual([]);
});

test('every tool works offline after the first visit', async ({ page, context }) => {
  await context.setOffline(true);
  // Screens not opened yet are loaded from the cache…
  await useEveryTool(page);
  // …and so is the whole app on a later visit.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Tools' })).toBeVisible();
  await useEveryTool(page);
});
