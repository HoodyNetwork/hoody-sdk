// Playwright: a script can be run from its detail. "Try it" in the header and in More actions both open
// the Test tab with Send focused, each press again, and never send; a later visit to Test by its tab keeps focus on the
// tab. The Overview names a preset schedule in words, as the list does, in both the facts and the Schedule panel.
import { type Page, expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const WEATHER = '/scripts?sel=atlas.00a1~weather.ts';
const detail = (page: Page) => page.getByRole('region', { name: 'Details' });
const send = (page: Page) => page.getByRole('button', { name: strings['test.send'], exact: true });
const header = (page: Page) => detail(page).getByRole('button', { name: strings['try.primary'], exact: true });
const answer = (page: Page) => page.getByRole('figure', { name: strings['test.answer'] });
// An answer shows its Show body button; the body itself (the Answer figure) draws only after that press.
const showBody = (page: Page) => page.getByRole('button', { name: strings['test.showBody'], exact: true });
const fromMenu = async (page: Page) => {
  await detail(page).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: strings['try.primary'] }).click();
};

// Nothing was sent: no answer shows (no Show body). The control at the end sends once, so the probe is shown to see a
// real send: its answer offers Show body, and the body shows after that press.
async function noSendThenControl(page: Page) {
  await expect(showBody(page)).toHaveCount(0);
  await expect(answer(page)).toHaveCount(0);
  await send(page).press('Enter');
  await expect(showBody(page)).toBeVisible();
  await showBody(page).click();
  await expect(answer(page)).toBeVisible();
}

test('Try it in the header opens Test with Send focused, focuses Send again on a second press, and sends nothing', async ({ hubPage: page }) => {
  await gotoHub(page, WEATHER);
  await header(page).click();
  await expect(page).toHaveURL(/tab=test/);
  await expect(send(page)).toBeFocused();
  await page.getByRole('tab', { name: strings['tab.test'] }).focus();
  await expect(send(page)).not.toBeFocused();
  await header(page).click();
  await expect(send(page)).toBeFocused();
  await noSendThenControl(page);
});

test('Try it in More actions opens Test with Send focused, again while Test is open, and sends nothing', async ({ hubPage: page }) => {
  await gotoHub(page, WEATHER);
  await fromMenu(page);
  await expect(page).toHaveURL(/tab=test/);
  await expect(send(page)).toBeFocused();
  await page.getByRole('tab', { name: strings['tab.test'] }).focus();
  await fromMenu(page);
  await expect(send(page)).toBeFocused();
  await noSendThenControl(page);
});

test('after Try it, moving to Test with the arrow keys keeps focus on the tab', async ({ hubPage: page }) => {
  await gotoHub(page, WEATHER);
  await header(page).click();
  await expect(send(page)).toBeFocused();
  const code = page.getByRole('tab', { name: strings['tab.code'] });
  await code.click();
  await expect(page).toHaveURL(/tab=code/);
  await code.focus();
  await page.keyboard.press('ArrowRight');
  const testTab = page.getByRole('tab', { name: strings['tab.test'] });
  await expect(send(page)).toBeVisible();
  await expect(testTab).toBeFocused();
  await expect(send(page)).not.toBeFocused();
});

test('the Overview names the daily preset in words in its facts and in the Schedule panel', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts?sel=atlas.00a1~daily-digest.ts');
  const facts = detail(page).locator('dl');
  await expect(facts.getByText(strings['sched.daily'], { exact: true })).toBeVisible();
  // Two places name it: the facts and the Schedule panel.
  await expect(detail(page).getByText(strings['sched.daily'])).toHaveCount(2);
  await expect(detail(page).getByText('0 8 * * *')).toHaveCount(0);
});

test('the Overview names the hourly preset in words in its facts and in the Schedule panel', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts?sel=atlas.00a1~jobs%2Fjob-01.ts', { state: 'long' });
  const facts = detail(page).locator('dl');
  await expect(facts.getByText(strings['sched.hourly'], { exact: true })).toBeVisible();
  // Two places name it: the facts and the Schedule panel.
  await expect(detail(page).getByText(strings['sched.hourly'])).toHaveCount(2);
  await expect(detail(page).getByText('0 * * * *')).toHaveCount(0);
});
