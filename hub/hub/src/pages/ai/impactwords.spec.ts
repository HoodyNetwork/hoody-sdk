// Playwright: the confirm for a new Bots default says when each Bot switches,
// once its conversation restarts; the AI helper's confirm does not. At 1350 and 390, nothing scrolls sideways.
import { expect } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

for (const width of [1350, 390]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: 900 });
    });

    test('a new Bots default says each Bot switches when its conversation restarts', async ({ hubPage: page }) => {
      await gotoHub(page, '/ai/models?pick=bots');
      await page.getByRole('dialog').getByRole('option', { name: /GPT-5/ }).first().click(); // the chooser's Ready view lists GPT-5 under more than one provider; the first is OpenAI's
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText(strings['impact.bots']);
      await expect(confirm).toContainText(/each when its conversation restarts/);
      await noSideScroll(page);
    });

    test('the AI helper default does not', async ({ hubPage: page }) => {
      await gotoHub(page, '/ai/models?pick=helper');
      await page.getByRole('dialog').getByRole('option', { name: /GPT-5/ }).first().click(); // same chooser: the first GPT-5 option is OpenAI's
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText(strings['impact.helper']);
      await expect(confirm).not.toContainText(/conversation restarts/);
    });
  });
}
