import { test, expect } from '@playwright/test';

test.describe('JHS Mock Exam Tracker', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('Add a student', async ({ page }) => {

    await page.getByRole('button', { name: 'Management' }).click();

    await page.locator('#student-name-input').fill('Test Student');

    await page.getByRole('button', { name: 'Add Student' }).click();

    await expect(page.getByText('Test Student')).toBeVisible();
  });

  test('Heatmap page loads', async ({ page }) => {

    await page.getByRole('button', { name: 'Heatmap' }).click();

    await expect(page.locator('table')).toBeVisible();

  });

  test('Trends page loads', async ({ page }) => {

    await page.getByRole('button', { name: 'Trends' }).click();

    await expect(page.locator('#chart-student-select')).toBeVisible();

  });

});