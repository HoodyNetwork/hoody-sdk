// Playwright: the Notices view of the notifications page on fixtures:
// the six functional list tests, the drawer, and a reply whose outcome is unknown (held across a
// reload, never sent twice, freed only by the warned Stop tracking).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import tableStrings from '@kit/data/DataTable.strings.en.json';

const PATH = '/notifications/notices';
const OPEN = 'ab0000000000000000000000';
const PLAIN = 'ab0001000000000000000000';
const RESTRICTION = 'The suspension linked to this notice remains active. Resolving this notice does not lift that suspension.';

const table = (page: Page) => page.getByRole('table');
const dataRows = (page: Page) => table(page).locator('tbody tr');
const searchbox = (page: Page) => page.locator('#hub-main').getByRole('searchbox');
const drawer = (page: Page) => page.getByRole('dialog');

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, PATH);
  await expect(dataRows(page).first()).toBeVisible();
  // 'Phishing' is the title of every fourth notice: 10 of the 40.
  await expectSearchStaysOutOfUrl(page, { param: '', box: searchbox(page) }, {
    text: 'phishing',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/phishing/i);
    },
  });
});

test('@filter the status chip filters the rows and keeps ?status', async ({ page }) => {
  await gotoHub(page, PATH);
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['an.filter.status'] }).click();
  await page.getByRole('menuitemradio', { name: strings['an.status.resolved'], exact: true }).click();
  await expect(page).toHaveURL(/[?&]status=resolved/);
  await expect(dataRows(page)).toHaveCount(8);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['an.status.resolved']);
});

test('@sort the Notice column sorts the rows by title and keeps ?sort', async ({ page }) => {
  await gotoHub(page, PATH);
  const header = table(page).getByRole('columnheader', { name: strings['an.col.title'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?title/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const titles = await table(page).evaluate((t) => {
    const heads = [...t.querySelectorAll('thead th')];
    const i = heads.findIndex((th) => /ascending|descending/.test(th.getAttribute('aria-sort') ?? ''));
    return [...t.querySelectorAll('tbody tr')].map((r) => r.children[i]?.textContent?.trim() ?? '');
  });
  expect(titles.length).toBeGreaterThan(2);
  const asc = [...titles].sort((x, y) => x.localeCompare(y));
  const desc = /descending/.test((await header.getAttribute('aria-sort')) ?? '');
  expect(titles).toEqual(desc ? asc.reverse() : asc);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, PATH);
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await page.getByRole('button', { name: tableStrings['pager.next'], exact: true }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await expect(dataRows(page)).toHaveCount(15);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload the status chip, sort and page 2 survive a reload, the search does not', async ({ page }) => {
  test.slow(); // the helper's settle windows, then a second reload
  // 32 open notices, 25 a page: page 2 holds 7. 'phishing' among the open ones: 8 (one page).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: searchbox(page) }, {
    text: 'phishing',
    path: PATH,
    keep: { status: 'open', sort: 'title', page: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(8);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/phishing/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(7);
    },
  });
  // The open notice survives too.
  await gotoHub(page, `${PATH}?status=open&sort=title&sel=${OPEN}`);
  await expect(drawer(page).getByText(RESTRICTION)).toBeVisible();
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(new RegExp(`sel=${OPEN}`));
  await expect(drawer(page).getByText(RESTRICTION)).toBeVisible();
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, PATH);
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await searchbox(page).fill('zzzz-no-such-thing');
  await expect(page.getByText(strings['an.noMatch'])).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('opening a row opens its drawer with the restriction sentence; closing it drops ?sel', async ({ page }) => {
  await gotoHub(page, PATH);
  await dataRows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`sel=${OPEN}`));
  await expect(drawer(page).getByText(RESTRICTION)).toBeVisible();
  // The footer's Close (the header's x carries the same name).
  await drawer(page).locator('[data-variant="secondary"]').getByText(strings['an.close'], { exact: true }).click();
  await expect(page).not.toHaveURL(/sel=/);
});

test('a reply whose outcome is unknown is held across a reload, never sent twice, freed only by Stop tracking', async ({ page }) => {
  await gotoHub(page, `${PATH}?sel=${PLAIN}`, { state: 'notice-reply-unknown' });
  const d = drawer(page);
  const box = d.getByRole('textbox', { name: strings['an.reply.label'] });
  await box.fill('Removed the script.');
  await d.getByRole('button', { name: strings['an.reply.send'] }).click();
  const banner = d.locator('[data-outcome="pending"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(kitStrings['outcome.pending.title']);
  await expect(d.getByText(strings['an.held.known'])).toBeVisible();
  await expect(box).toHaveAttribute('readonly', '');
  await expect(d.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
  // Check again reads only.
  await d.getByRole('button', { name: kitStrings['outcome.pending.check'] }).click();
  await expect(d.getByText(/^Checked at /)).toBeVisible();
  await expect(banner).toBeVisible();
  // The server stored it once (its 502 came after storing): the fresh read shows exactly one such message, and the
  // read-only check sent nothing more.
  await expect(d.getByRole('list', { name: strings['an.s.messages'] }).getByText('Removed the script.', { exact: true })).toHaveCount(1);
  // A reload keeps the hold (stored), not the draft.
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(drawer(page).getByText(strings['an.held.known'])).toBeVisible();
  await expect(drawer(page).getByRole('textbox', { name: strings['an.reply.label'] })).toHaveAttribute('readonly', '');
  await expect(drawer(page).getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
  // The warned Stop tracking frees it and unlocks the box (Send stayed off while held: no second send could start).
  await drawer(page).getByRole('button', { name: kitStates['err.stopTracking'] }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'], exact: true }).click();
  await expect(drawer(page).getByText(strings['an.held.known'])).toHaveCount(0);
  await expect(drawer(page).getByRole('textbox', { name: strings['an.reply.label'] })).not.toHaveAttribute('readonly', '');
});

test('more than one page (130 notices): an older open notice past the newest 100 is found and opens', async ({ page }) => {
  await gotoHub(page, PATH, { state: 'notices-many' });
  await expect(dataRows(page).first()).toBeVisible();
  await expect(page.getByText(/^Showing the newest/)).toHaveCount(0);
  await searchbox(page).fill('Cryptocurrency');
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText('Cryptocurrency mining reported from your server');
  await dataRows(page).first().click();
  await expect(drawer(page).getByRole('textbox', { name: strings['an.reply.label'] })).toBeVisible();
});

test('a held reply keeps its banner when the notice cannot be read after a reload; Stop tracking still frees it', async ({ page }) => {
  await gotoHub(page, `${PATH}?sel=${PLAIN}`, { state: 'notice-reply-unknown' });
  const box = drawer(page).getByRole('textbox', { name: strings['an.reply.label'] });
  await box.fill('Removed the script.');
  await drawer(page).getByRole('button', { name: strings['an.reply.send'] }).click();
  await expect(drawer(page).getByText(strings['an.held.known'])).toBeVisible();
  // Settled here first (its send's answer stored, as in the reload test above): a reload before that lands shows the
  // send as still out in another tab, which offers no Stop tracking.
  await expect(box).toHaveAttribute('readonly', '');
  await drawer(page).getByRole('button', { name: kitStrings['outcome.pending.check'] }).click();
  await expect(drawer(page).getByText(/^Checked at /)).toBeVisible();
  // Reloaded where every read of the notice answers 500.
  await gotoHub(page, `${PATH}?sel=${PLAIN}`, { state: 'notice-get-500' });
  const d = drawer(page);
  await expect(d.getByText(strings['an.held.known'])).toBeVisible();
  await expect(d.getByRole('button', { name: kitStates['state.retry'] })).toBeVisible();
  await expect(d.getByRole('textbox', { name: strings['an.reply.label'] })).toHaveCount(0);
  await d.getByRole('button', { name: kitStrings['outcome.pending.check'] }).click();
  await expect(d.getByText(/^Couldn't read this notice/)).toBeVisible();
  await expect(d.getByText(strings['an.held.known'])).toBeVisible();
  await d.getByRole('button', { name: kitStates['err.stopTracking'] }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'], exact: true }).click();
  await expect(d.getByText(strings['an.held.known'])).toHaveCount(0);
});
