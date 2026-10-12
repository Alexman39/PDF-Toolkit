import { expect, test } from '@playwright/test';

test('home page shows the four tools', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'PDF Toolkit' })).toBeVisible();
  await expect(page.getByText('Your files never leave this device.')).toBeVisible();

  const tools = page.getByRole('list', { name: 'Tools' }).getByRole('link');
  await expect(tools).toHaveCount(4);
  for (const name of ['Merge', 'Split', 'Rotate', 'Compress']) {
    await expect(tools.filter({ hasText: name })).toHaveCount(1);
  }
});

test('production build ships a CSP that forbids network connections', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'none'");
});

test('a tool card opens its screen, and Back returns focus to that card', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /^Split/ }).click();
  await expect(page).toHaveURL(/#\/split$/);
  await expect(page.getByRole('heading', { name: 'Split', level: 2 })).toBeFocused();
  await expect(page).toHaveTitle('Split · PDF Toolkit');

  await page.getByRole('link', { name: 'All tools' }).click();
  await expect(page.getByRole('link', { name: /^Split/ })).toBeFocused();
  await expect(page).toHaveTitle('PDF Toolkit');
});

test('the browser Back button leaves a tool screen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /^Rotate/ }).click();
  await expect(page.getByRole('heading', { name: 'Rotate', level: 2 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('list', { name: 'Tools' })).toBeVisible();
});

test('a deep link opens the tool directly, and an unknown one shows home', async ({ page }) => {
  await page.goto('./#/merge');
  await expect(page.getByRole('heading', { name: 'Merge', level: 2 })).toBeVisible();
  await page.goto('./#/nope');
  await expect(page.getByRole('list', { name: 'Tools' })).toBeVisible();
});

test('the FAQ answers open from the keyboard', async ({ page }) => {
  await page.goto('./');
  const question = page.getByText('Are my files uploaded anywhere?');
  const answer = page.getByText(/Every tool runs inside your browser/);
  await expect(answer).toBeHidden();
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(answer).toBeVisible();
});

test.describe('when a screen cannot be downloaded', () => {
  // Otherwise the service worker could answer from its cache, out of page.route()'s reach.
  test.use({ serviceWorkers: 'block' });

  test('shows an error with Try again instead of a blank page', async ({ page }) => {
    await page.goto('./');
    await page.route('**/assets/merge-*.js', (route) => route.abort('internetdisconnected'));
    await page.getByRole('link', { name: /^Merge/ }).click();
    await expect(page.getByRole('heading', { name: 'Merge', level: 2 })).toBeFocused();
    await expect(page.getByRole('alert')).toContainText("The Merge tool couldn't be loaded.");

    await page.unroute('**/assets/merge-*.js');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Drop PDFs here')).toBeVisible();
  });
});
