// Playwright: the account page's flows on fixtures (run by hub:check --page account).
import { type Page, expect } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

test('the password drawer opens from the page, validates, and Back closes it', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  await page.getByRole('button', { name: strings['pw.change'] }).click();
  const drawer = page.getByRole('dialog', { name: strings['pw.title'] });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/sheet=password/);
  await page.goBack();
  await expect(drawer).toBeHidden();
  await page.goForward();
  await expect(drawer).toBeVisible();
  await drawer.getByLabel(strings['pw.current']).fill('old password');
  await drawer.getByLabel(strings['pw.new'], { exact: true }).fill('weak');
  await drawer.getByLabel(strings['pw.again']).fill('weak');
  await drawer.getByRole('button', { name: strings['pw.save'] }).click();
  await expect(drawer.getByText(strings['pw.eWeak'])).toBeVisible();
});

test('two-step setup shows the secrets once and asks for a six-digit code', async ({ hubPage: page }) => {
  await gotoHub(page, '/account', { state: 'twofa-off' });
  await page.getByRole('button', { name: strings['2fa.turnOn'] }).last().click();
  const drawer = page.getByRole('dialog', { name: strings['2fa.setupTitle'] });
  await drawer.getByLabel(strings['pw.current']).fill('password');
  await drawer.getByRole('button', { name: strings['2fa.next'] }).click();
  await expect(drawer.getByRole('img', { name: strings['2fa.qrAlt'] })).toBeVisible();
  await expect(drawer.getByText(/4k7p-9xqa/)).toHaveCount(0);
  await drawer.getByRole('button', { name: /^Show/ }).first().click(); // reason: the setup key and each backup code have a Show button; the first is the key's
  await drawer.getByRole('button', { name: /^Show/ }).first().click(); // reason: the setup key and each backup code have a Show button; the first is the key's
  await expect(drawer.getByText(/4k7p-9xqa/)).toBeVisible();
  await drawer.getByLabel(strings['2fa.code']).fill('123456');
  await expect(drawer.getByRole('button', { name: strings['2fa.confirm'] })).toBeDisabled();
  await drawer.getByText(strings['2fa.iSaved']).click();
  await expect(drawer.getByRole('button', { name: strings['2fa.confirm'] })).toBeEnabled();
  // Shown secrets and typed codes are unsaved input: Cancel asks first.
  await drawer.getByRole('button', { name: strings['action.cancel'] }).click();
  await expect(page.getByText('Discard changes?')).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(drawer).toBeHidden();
  await gotoHub(page, '/account?sheet=setup', { state: 'twofa-off' });
  await expect(page.getByText(/4k7p-9xqa/)).toHaveCount(0);
});

test('ending all other sessions asks first, then reports how many ended', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  await page.getByRole('button', { name: strings['s.endOthers'] }).click();
  const dialog = page.getByRole('alertdialog', { name: strings['s.endOthersTitle'] });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: strings['s.endOthers'] }).click();
  await expect(page.getByText('Sessions ended: 11.')).toBeVisible();
});

// The page has one search box per data view (sessions, history, SSH keys): the sessions one sits in the sessions region.
const sessionsBox = (page: Page) => page.getByRole('region', { name: strings['s.title'] }).getByRole('searchbox', { name: /search/i });
const sessionRows = (page: Page) => page.getByRole('table', { name: strings['s.title'] }).locator('tbody tr');

test('@search the sessions table searches by device (never in the URL) and switches to ended sessions', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  const table = page.getByRole('table', { name: strings['s.title'] });
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: sessionsBox(page) }, {
    text: 'firefox',
    searched: async () => {
      // Device names can repeat, so the rows are counted, not named.
      await expect(sessionRows(page)).toHaveCount(2);
      for (const row of await sessionRows(page).all()) await expect(row).toContainText('Firefox on Linux');
      await expect(table.getByText('Chrome on macOS')).toHaveCount(0);
    },
  });
});

test('@filter the Active | Ended filter picks the list and the URL keeps it', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  const table = page.getByRole('table', { name: strings['s.title'] });
  await page.getByRole('radio', { name: strings['s.ended'] }).click();
  await expect(page).toHaveURL(/state=ended/);
  await expect(table.getByText('Safari on iPhone').first()).toBeVisible(); // reason: several ended rows share the device name
});

test('@sort the sessions table sorts by a column header (?sort)', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  await page.getByRole('columnheader', { name: new RegExp(strings['s.col.device']) }).getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=/);
});

test('@page a deep link to a later page still shows the sessions table', async ({ hubPage: page }) => {
  await gotoHub(page, '/account?page=2');
  await expect(page.getByRole('table', { name: strings['s.title'] })).toBeVisible();
});

test('@reload a reload keeps the ended list but not the search', async ({ hubPage: page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link's q searches once on load; the helper proves it is adopted and gone after the reload, and that the ended
  // list (state), the sort and the page stay.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: sessionsBox(page) }, {
    text: 'safari',
    path: '/account',
    keep: { state: 'ended', sort: '-when', page: '1' },
    searched: async () => {
      // Device names can repeat, so the rows are counted, not named.
      await expect(sessionRows(page)).toHaveCount(1);
      for (const row of await sessionRows(page).all()) await expect(row).toContainText('Safari on iPhone');
    },
    unsearched: async () => {
      await expect(sessionRows(page)).toHaveCount(6);
      await expect(page.getByRole('table', { name: strings['s.title'] }).getByText('Safari on iPhone').first()).toBeVisible(); // reason: several ended rows share the device name
    },
  });
});

test('the account id is never shown whole', async ({ hubPage: page }) => {
  await gotoHub(page, '/account');
  await expect(page.getByText('64f0…0001')).toBeVisible();
  await expect(page.getByText('64f0ada00000000000000001')).toHaveCount(0);
});
