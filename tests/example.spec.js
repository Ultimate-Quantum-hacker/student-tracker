import { test, expect } from '@playwright/test';

test.describe('JHS Mock Exam Tracker', () => {

  test('index route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('http://localhost:3000/index.html');

    await expect(page).toHaveURL(/login\.html/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('login page renders expected auth controls', async ({ page }) => {
    await page.goto('http://localhost:3000/login.html');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create account/ })).toBeVisible();
  });

  test('signup page renders expected auth controls', async ({ page }) => {
    await page.goto('http://localhost:3000/signup.html');

    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel(/^Password$/)).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Already have an account\?/ })).toBeVisible();
  });

});