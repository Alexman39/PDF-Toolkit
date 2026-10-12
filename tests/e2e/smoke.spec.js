import { expect, test } from '@playwright/test';

test('home page shows the four tools', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'PDF Toolkit' })).toBeVisible();
  await expect(page.getByText('Your files never leave this device.')).toBeVisible();

  const tools = page.getByRole('list', { name: 'Tools' }).getByRole('button');
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
