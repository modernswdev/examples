// END-TO-END TESTS
// Scope: a real Chromium browser talking to the real server over real HTTP.
// Playwright starts `node server.js` for us (see playwright.config.js) and
// drives the page the way a user would: type, click, look. Nothing in the
// front end or back end is mocked; only the database is the in-memory fake.
const { test, expect } = require('@playwright/test');

test('shows the login form when not signed in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('username')).toBeVisible();
  await expect(page.getByPlaceholder('password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});

test('wrong password shows a "login failed" alert and stays on the form', async ({ page }) => {
  const alerts = [];
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message());
    await dialog.dismiss();
  });

  await page.goto('/');
  await page.getByPlaceholder('username').fill('admin');
  await page.getByPlaceholder('password').fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect.poll(() => alerts).toEqual(['login failed']);
  await expect(page.getByPlaceholder('username')).toBeVisible();
});

test('login shows the widgets, logout returns to the form', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('username').fill('admin');
  await page.getByPlaceholder('password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Widget A' })).toBeVisible();
  await expect(page.getByText('$9.99')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByPlaceholder('username')).toBeVisible();
});
