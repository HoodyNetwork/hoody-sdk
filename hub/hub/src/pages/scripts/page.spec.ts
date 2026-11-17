// Playwright: the scripts page's flows on fixtures (run by hub:check --page scripts).
import { type Page, expect } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
// The name cell of one row by its label (a row, not a text match that can also hit its card).
const rowOf = (page: Page, label: string) => dataRows(page).filter({ hasText: label }).locator('td').first();

test('select a script, then Back returns to the list', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await rowOf(page, 'Weather lookup').click();
  await expect(page).toHaveURL(/sel=atlas\.[0-9a-f]{4}(~|%7E)weather\.ts/);
  await expect(page.getByRole('tab', { name: strings['tab.code'] })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('the Code tab shows the source and keeps the key out of it', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await rowOf(page, 'Order status').click();
  await page.getByRole('tab', { name: strings['tab.code'] }).click();
  const editor = page.getByLabel(strings['code.label']);
  await expect(editor).toContainText('export default');
  await expect(editor).not.toContainText('@token');
});

test('New script: write the code, check it, then make it live', async ({ hubPage: page }) => {
  // /scripts/new opens a fresh draft in this tab; the write way, then Check, then Make it live.
  await gotoHub(page, '/scripts/new');
  await page.getByRole('button', { name: new RegExp(`^${strings['flow.what.writeCard']}`) }).click();
  await page.getByRole('textbox', { name: strings['new.address'] }).fill('/notes');
  await page.getByRole('button', { name: strings['flow.continue'] }).click();
  await page.getByRole('textbox', { name: strings['new.code'] }).fill('export default () => new Response("notes");');
  await page.getByRole('button', { name: strings['flow.continue'] }).click();
  await expect(page.getByText(strings['flow.check.ready'], { exact: true })).toBeVisible();
  await page.getByRole('button', { name: strings['flow.continue'] }).click();
  await page.getByRole('button', { name: strings['flow.live.go'] }).click();
  await expect(page.getByText(strings['flow.live.done'], { exact: true })).toBeVisible();
});

test('a new key is shown once and wiped on close', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await rowOf(page, 'Weather lookup').click();
  await page.getByRole('tab', { name: strings['tab.settings'] }).click();
  await page.getByRole('button', { name: strings['key.replace'] }).click();
  await page.getByRole('button', { name: strings['magic.review'] }).click();
  await page.getByRole('button', { name: /^Save \d+ changes$/ }).click();
  await expect(page.getByRole('dialog')).toContainText(strings['key.once']);
  await page.getByRole('button', { name: strings['key.done'] }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

// The standard data view: search, the Status chip, sort, reload and the no-match state. All but the search text are kept in the URL.
test('@search search narrows the rows and never writes ?q', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await dataRows(page).first().waitFor();
  // 'WEATHER' was in the row's link (weather.ts); 'CHECK' (upper case: the search
  // folds case) is only the label of "Health check", whose file is health.ts.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'CHECK',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText(/health check/i);
    },
  });
});

test('@filter the Status chip filters the rows and × clears it', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await dataRows(page).first().waitFor();
  const chips = page.getByRole('group', { name: 'Filters' });
  await chips.getByRole('button', { name: strings['filter.status'] }).click();
  await page.getByRole('menuitemradio', { name: strings['status.failing'] }).click();
  await expect(page).toHaveURL(/[?&]status=failing/);
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText('Order status');
  await chips.getByRole('button', { name: new RegExp(strings['filter.status']) }).last().click();
  await expect(page).not.toHaveURL(/status=/);
});

test('@sort a header sorts the rows and keeps ?sort', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await dataRows(page).first().waitFor();
  const names = async () => (await dataRows(page).locator('td:first-child').allInnerTexts()).map((x) => x.trim().toLowerCase());
  const before = await names();
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-name/);
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  // The rows really reorder: the first name now sorts after the last.
  await expect.poll(async () => { const n = await names(); return n.length > 1 && n[0]! > n[n.length - 1]!; }).toBe(true);
  expect(await names()).not.toEqual(before);
});

test('@reload chip, sort and page survive a reload, the search does not', async ({ hubPage: page }) => {
  // The link brings the search with the Status chip, the sort and page 2 (62 working jobs, 50 a page). The helper proves
  // the search is adopted and gone after the reload while every kept key keeps its value. The old text 'Job' is under
  // the helper's 4 characters: 'Job 11' is that one job (the file name says job-11, so no link carries
  // it); the search reads words, so 'Job 1' would match every job with a 1 in its number.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'Job 11',
    path: '/scripts',
    goto: { state: 'long' },
    keep: { status: 'working', sort: 'name', page: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText('Job 11');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(12);
    },
  });
});

test('@no-match nothing matches: Clear filters brings every row back', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts?q=zzzzzz');
  await expect(page.getByRole('button', { name: /clear (filters|all)/i })).toBeVisible();
  await page.getByRole('button', { name: /clear (filters|all)/i }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(dataRows(page).first()).toBeVisible();
});

test('Recently deleted lists what can come back, then Restore puts one back', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts');
  await page.getByRole('button', { name: /Recently deleted/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(strings['deleted.title']);
  await dialog.getByRole('listitem').filter({ hasText: '/scratch' }).getByRole('button', { name: strings['versions.restore'] }).click();
  await expect(page.getByText(strings['code.restored'])).toBeVisible();
});

test('@page the pager moves to page 2, keeps ?page, then sort and search reset it and Back steps through', async ({ hubPage: page }) => {
  await gotoHub(page, '/scripts', { state: 'long' });
  await dataRows(page).first().waitFor();
  const first = await dataRows(page).count();
  const firstRow = await dataRows(page).first().innerText();
  await page.getByRole('button', { name: /next page|page 2/i }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  const second = await dataRows(page).count();
  expect(second).toBeGreaterThan(0);
  await expect(dataRows(page).first()).not.toHaveText(firstRow);
  await page.getByRole('columnheader', { name: strings['col.name'] }).getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-name/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dataRows(page).first().waitFor();
  await expect(page).toHaveURL(/sort=-name/);
  await page.getByRole('searchbox').fill('Job 7');
  await expect(page).not.toHaveURL(/page=2/);
  await expect.poll(() => dataRows(page).count()).toBeLessThan(first);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/[?&]q=/);
  // Back to the entry from before the reload: this document never held its search (the page keeps it in memory, never in
  // history or the URL), so the box is empty, never the departing entry's 'Job 7'.
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

// The Versions panel beside the editor (narrowest at 1024 px) and stacked under it on a phone: its rows start where its
// heading starts, every Preview sits whole inside the frame, and each is named with its row's time.
for (const width of [1024, 1440, 390] as const) {
  test(`@versions at ${width} px the version rows line up with the heading and each Preview stays inside the panel`, async ({ hubPage: page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/scripts');
    await rowOf(page, 'Order status').click();
    await page.getByRole('tab', { name: strings['tab.code'] }).click();
    const panel = page.getByRole('complementary', { name: strings['versions.title'] });
    const rows = panel.getByRole('listitem');
    await expect(rows.first()).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    const frame = (await panel.boundingBox())!;
    const head = (await panel.getByRole('heading', { name: strings['versions.title'] }).boundingBox())!;
    for (const row of await rows.all()) {
      const r = (await row.boundingBox())!;
      expect(Math.abs(r.x - head.x)).toBeLessThanOrEqual(1);
      expect(r.x + r.width).toBeLessThanOrEqual(frame.x + frame.width - 8);
    }
    const previews = await panel.getByRole('button', { name: /^Preview/ }).all();
    expect(previews.length).toBe(await rows.count());
    for (const b of previews) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(frame.x + 8);
      expect(r.x + r.width).toBeLessThanOrEqual(frame.x + frame.width - 8);
      expect(await b.getAttribute('aria-label')).toMatch(/^Preview the version from \S/);
    }
  });
}
