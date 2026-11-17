// Playwright: the framed lock on pages. In a framed Hub (?fxframed=1 boots the fixtures as a framed page) a sensitive
// page (manifest `sensitive: true`) shows the refusal and never requests its view's module; a page that is not
// sensitive draws as ever, and an unframed Hub draws the sensitive page. At 1440 (desktop) and 390 (coarse), light and dark.
import { type Page, expect } from '@playwright/test';
import { hubUrl, noSideScroll, test } from '@app/e2e';
import kitStrings from '@kit/strings.en.json';

type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/** Opens a Hub path, framed or not, and lists every module the page asks the dev server for. */
async function open(page: Page, path: string, theme: Theme, framed: boolean): Promise<string[]> {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await page.goto('about:blank');
  const url = hubUrl(path, { theme });
  await page.goto(framed ? url.replace('/?', '/?fxframed=1&') : url);
  await page.locator('#hub-main').waitFor();
  return asked;
}

const refusal = (page: Page) => page.locator('#hub-main').getByText(kitStrings['page.framed.title'], { exact: true });

async function refusedBilling(page: Page, theme: Theme, shot: string): Promise<void> {
  const asked = await open(page, '/billing', theme, true);
  await expect(refusal(page)).toBeVisible();
  await expect(page.locator('#hub-main').getByText(kitStrings['page.framed.body'], { exact: true })).toBeVisible();
  await expect(page.locator('#hub-main').getByRole('link', { name: kitStrings['page.framed.open'] })).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({ path: shot });
  expect(asked.filter((p) => /\/pages\/billing\/view(\.tsx)?$/.test(p))).toEqual([]);
}

for (const theme of THEMES) {
  test(`framed: Billing is refused, its view never requested (1440, ${theme})`, async ({ hubPage }, info) => {
    await refusedBilling(hubPage, theme, info.outputPath(`framed-billing-1440-${theme}.png`));
  });
  test(`framed: Billing is refused, its view never requested (390 coarse, ${theme})`, async ({ hubPageCoarse }, info) => {
    await refusedBilling(hubPageCoarse, theme, info.outputPath(`framed-billing-390-${theme}.png`));
  });
}

test('framed: Keys is refused; a page that is not sensitive (Computers) draws as ever', async ({ hubPage }) => {
  const asked = await open(hubPage, '/keys', 'light', true);
  await expect(refusal(hubPage)).toBeVisible();
  expect(asked.filter((p) => /\/pages\/keys\/view(\.tsx)?$/.test(p))).toEqual([]);
  await open(hubPage, '/computers', 'light', true);
  await expect(hubPage.locator('#hub-main [data-hub-title]').first()).toBeVisible();
  await expect(refusal(hubPage)).toHaveCount(0);
});

test('framed: hovering, focusing and pressing the Billing nav link never requests its view; the refusal link opens the page in a new tab', async ({ page }) => {
  const asked = await open(page, '/computers', 'light', true);
  const nav = page.getByRole('navigation').getByRole('link', { name: 'Plans & Billing', exact: true });
  await nav.hover();
  await nav.focus();
  await nav.click();
  await expect(refusal(page)).toBeVisible();
  await expect(page.locator('#hub-main h1[data-hub-title]')).toHaveText('Plans & Billing');
  expect(asked.filter((p) => /\/pages\/billing\/view(\.tsx)?$/.test(p))).toEqual([]);
  const [tab] = await Promise.all([page.context().waitForEvent('page'), page.locator('#hub-main').getByRole('link', { name: kitStrings['page.framed.open'] }).click()]);
  await tab.waitForLoadState('domcontentloaded');
  expect(new URL(tab.url()).hash).toBe('#/billing');
  await tab.close();
});

test('unframed: Billing draws its own page, no refusal', async ({ hubPage }) => {
  const asked = await open(hubPage, '/billing', 'light', false);
  await expect(hubPage.locator('#hub-main [data-hub-title]').first()).toBeVisible();
  await expect(refusal(hubPage)).toHaveCount(0);
  expect(asked.some((p) => /\/pages\/billing\/view(\.tsx)?$/.test(p))).toBe(true);
});
