// Playwright: the Performance mode switch in This browser turns it on in place. Pressing it keeps the Hub
// where it is: the switch's hidden input sits inside the switch, so it neither makes the page itself scroll nor
// scrolls the shell out of view when it takes focus (kit/forms/fields.module.css .switch). Needs a real browser.
import { expect, test } from '@playwright/test';
import { hubUrl } from '@app/e2e';
import perf from '@kit/perf.strings.en.json';

test.skip(process.env.HUB_PAGE !== 'account' && process.env.HUB_PAGE !== '*', 'runs on the account page (HUB_PAGE=account)');

test('@perf pressing the switch turns it on and leaves the page where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(hubUrl('/account?section=browser'));
  const sw = page.getByRole('switch', { name: perf['perf.label'] });
  await sw.waitFor({ state: 'attached' });
  const pageScroll = () => page.evaluate(() => ({ y: scrollY, tall: document.documentElement.scrollHeight > innerHeight }));
  expect(await pageScroll()).toEqual({ y: 0, tall: false });
  await page.locator('label').filter({ has: sw }).click();
  await expect(page.getByText(perf['perf.on'], { exact: true })).toBeVisible();
  await expect(sw).toBeChecked();
  expect(await pageScroll()).toEqual({ y: 0, tall: false });
  await expect(page.locator('#hub-main')).toBeInViewport();
});
