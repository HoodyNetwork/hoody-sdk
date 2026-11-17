// Playwright: with Curl stopped and no web request known, the page never blames Curl, and the web
// request choice of New schedule keeps its plain text: adding a web-request schedule starts Curl by itself. At 1440, 1100 and 390.
import { expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

for (const width of [1440, 1100, 390]) {
  test.describe(`a stopped Curl at ${width}`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    });

    test('is named nowhere, and the web request choice reads as usual', async ({ hubPage: page }) => {
      await gotoHub(page, '/schedules', { state: 'partial-empty' });
      await expect(page.getByText(strings['st.incomplete'])).toBeVisible();
      await expect(page.getByText(/No schedules found so far on/).first()).toBeVisible(); // "At least 0" read broken
      await expect(page.getByText(/At least 0/)).toHaveCount(0);
      await expect(page.getByText(strings['line.curl_stopped'])).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`curlstopped-page-${width}.png`) });
      await page.getByRole('button', { name: strings['action.new'] }).first().click(); // first: in partial-empty the page header and the incomplete-list empty state each offer New
      const web = page.getByRole('dialog').getByRole('button', { name: new RegExp(strings['new.web']) });
      await expect(web).toContainText(strings['new.webBody']);
      await expect(page.getByRole('dialog').getByText(/Curl is stopped/)).toHaveCount(0);
      await expect(web).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`curlstopped-choice-${width}.png`) });
    });
  });
}
