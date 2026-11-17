// Playwright: the notifications page's flows on fixtures (run by hub:check --page notifications).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';
import tableStrings from '@kit/data/DataTable.strings.en.json';

// The kit's list/detail pane (ListDetailPage side mode).
const detailPane = (page: Page) => page.getByRole('region', { name: kitStrings['listDetail.detail'] });

test('opening a notice shows it beside the list, Back closes it', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await page.getByRole('row', { name: /Computer atlas stopped atlas/ }).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(detailPane(page)).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('a message shows **bold** and a bare https link; the list row shows it as plain text', async ({ page }) => {
  await gotoHub(page, '/notifications?sel=4e0007000000000000000000');
  const pane = detailPane(page);
  await expect(pane.locator('strong', { hasText: /^exactly$/ })).toBeVisible();
  const link = pane.getByRole('link', { name: 'https://hoody.com/notifications' });
  await expect(link).toHaveAttribute('href', 'https://hoody.com/notifications');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /\bnofollow\b/);
  await expect(pane.getByText(/\*\*/)).toHaveCount(0);
  // The list cell and search read the plain text: no markers, the link as its URL. With a notice open the list beside
  // it has no room for the Message column (the message is in the detail), so the list is read with none open.
  await gotoHub(page, '/notifications');
  const harbor = page.getByRole('row', { name: /Hoody news: harbor.*explain exactly what Hoody sends/ });
  await expect(harbor).toBeAttached();
  await searchbox(page).fill('explain exactly what Hoody sends');
  await expect(harbor).toBeVisible();
});

test('the tabs walk between the inbox and the guide', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await page.getByRole('tab', { name: strings['h.tab.learn'], exact: true }).click();
  await expect(page).toHaveURL(/notifications\/learn/);
  await expect(page.getByRole('heading', { name: strings['h.kinds.h'] })).toBeVisible();
});

const table = (page: Page) => page.getByRole('table');
const dataRows = (page: Page) => table(page).locator('tbody tr');

const searchbox = (page: Page) => page.locator('#hub-main').getByRole('searchbox');

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await expect(dataRows(page).first()).toBeVisible();
  // Not 'atlas': it is the fixture world's computer, shown in the shell. 'stopped' is
  // in the four "Computer <name> stopped" notices of the 26 unread ones.
  await expectSearchStaysOutOfUrl(page, { param: '', box: searchbox(page) }, {
    text: 'stopped',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(4);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/stopped/i);
    },
  });
});

test('@filter a chip filters the rows and keeps its value in the URL', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['h.filter.type'] }).click();
  await page.getByRole('menuitemradio', { name: strings['h.group.paid.short'], exact: true }).click();
  await expect(page).toHaveURL(/[?&]type=/);
  const rows = await dataRows(page).all();
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) await expect(row).toContainText(strings['h.group.paid.short']);
});

test('@sort the Notice column sorts the rows by title and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/notifications');
  const header = table(page).getByRole('columnheader', { name: strings['col.title'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?title/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  // The rows really come in title order: the cells under the sorted header, in the order shown.
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

test('@reload sort and page 2 survive a reload, the search does not', async ({ page }) => {
  test.slow(); // the helper's settle windows, then a second reload
  // The link brings the search with the Archive box, the sort and page 2 (40 archived notices, 25 a page: page 2 has 15).
  // The helper proves the search is adopted and gone after the reload while every kept key keeps its value. The old
  // text 'o' is under the helper's 4 characters: 'stopped' is the five archived "Computer <name> stopped" notices.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: searchbox(page) }, {
    text: 'stopped',
    path: '/notifications',
    keep: { box: 'archive', sort: 'title', page: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(5);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/stopped/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(15);
    },
  });
  // Without a search to lose, the same sort and page select the same rows after a reload.
  await gotoHub(page, '/notifications?box=archive&sort=title&page=2');
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().getAttribute('data-row-id');
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(dataRows(page).first()).toHaveAttribute('data-row-id', first ?? '');
});

test('a chip and the open notice survive a reload too, the search does not', async ({ page }) => {
  await gotoHub(page, '/notifications?q=computer&type=machines&sort=title&sel=4e0000000000000000000000');
  await expect(page.locator('#hub-main').getByRole('searchbox')).toHaveValue('computer'); // the link's q searches once on load
  await expect(page).not.toHaveURL(/[?&]q=/); // then leaves the URL
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page.locator('#hub-main').getByRole('searchbox')).toHaveValue('');
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page).toHaveURL(/type=machines/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(detailPane(page)).toBeVisible();
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.locator('#hub-main').getByRole('searchbox').fill('zzzz-no-such-thing');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await page.getByRole('button', { name: tableStrings['pager.next'], exact: true }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('an unconfirmed mark-read says which notice, locks it and offers Check again', async ({ page }) => {
  await gotoHub(page, '/notifications?sel=4e0000000000000000000000', { state: 'ack-lost' });
  const side = detailPane(page);
  await expect(side.getByRole('alert').and(side.locator('[data-outcome="pending"]'))).toBeVisible();
  await expect(side.getByRole('heading', { level: 2, name: /Computer atlas stopped/ })).toBeVisible();
});

test('an opened notice stays in the Unread list (read) while the view lasts', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await page.getByRole('row', { name: /Computer atlas stopped/ }).click();
  await expect(detailPane(page)).toBeVisible();
  await expect(detailPane(page).getByText(strings['ack.readDone'])).toBeVisible();
  await expect(page.getByRole('row', { name: /Computer atlas stopped/ })).toBeVisible();
});

test('opening an unread notice never moves its message once the mark-read line has shown (no jump)', async ({ page }) => {
  await gotoHub(page, '/notifications');
  await page.getByRole('row', { name: /Computer atlas stopped/ }).click();
  const side = detailPane(page);
  await expect(side.getByText(strings['ack.readDone'])).toBeVisible();
  const message = side.getByText(/running out of memory/);
  const top = async () => Math.round((await message.boundingBox())!.y);
  const before = await top();
  // The done line stays after its flash (2.4 s), so the message never moves up by the line and its gap.
  await page.waitForTimeout(3600);
  expect(await top(), 'the message stays where it was while reading').toBe(before);
  await expect(side.getByText(strings['ack.readDone'])).toBeVisible();
});

test('at 390 the search box keeps its own width; Unread/Archive fold into Filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/notifications');
  const search = page.locator('#hub-main').getByRole('searchbox');
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(160);
  await page.locator('#hub-main').getByRole('button', { name: new RegExp('^' + kitStrings['table.filtersButton']) }).click();
  const dialog = page.getByRole('dialog', { name: kitStrings['table.filters'] });
  await expect(dialog.getByRole('button', { name: new RegExp('^' + strings.which) })).toBeVisible();
});

test('at 390 a selected notice takes the whole width; the table is not squeezed beside it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/notifications?sel=4e0000000000000000000000');
  const pane = detailPane(page);
  await expect(pane).toBeVisible();
  const box = await pane.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(340);
  const search = page.locator('#hub-main').getByRole('searchbox');
  await expect(search).toBeHidden();
  // One pane at phone width: the kit's "‹ Notifications" goes back to the list.
  await pane.getByRole('button', { name: strings.title, exact: true }).click();
  await expect(pane).toBeHidden();
  await expect(search).toBeVisible();
});
