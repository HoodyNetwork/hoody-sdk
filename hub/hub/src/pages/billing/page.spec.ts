// Playwright: the Plans & billing page's flows on fixtures (run by hub:check --page billing). The Bare metal view's
// tests (the bare-metal listings') carry the six URL-state tags; servers-spec-tags.test.ts keeps them present.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, noSideScroll } from '@app/e2e';
import { pickFilter } from '@app/e2e-toolbar';
import serverStrings from './servers/strings.en.json';
import strings from './strings.en.json';

test('the page opens on the plans; Wallet & usage lists subscriptions and usage', async ({ page }) => {
  await gotoHub(page, '/billing');
  await expect(page.locator('[data-section="plans"]')).toBeVisible();
  await page.getByRole('tab', { name: strings['view.wallet'] }).click();
  await expect(page).toHaveURL(/view=wallet/);
  await expect(page.getByRole('heading', { name: strings['subs.heading'] })).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible(); // reason: subscriptions and usage each draw a table; the first drawn proves rows render
});

test('at a narrow desktop width the page does not scroll sideways: AI usage turns to cards, the plan columns wrap', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  // Each view's measurement is only worth anything with its content drawn: wait for it first.
  await gotoHub(page, '/billing');
  await expect(page.locator('[data-section="plans"] [data-kit="plan-card"]').first()).toBeVisible(); // reason: any plan column drawn proves the plans rendered
  await noSideScroll(page);
  await gotoHub(page, '/billing?view=wallet');
  const usage = page.locator('[data-section="usage"] [data-usage]');
  await expect(usage).toBeVisible();
  // The usage table would drop a lane here, so it draws as cards (every lane kept, fit.spec.ts).
  await expect(usage).toHaveAttribute('data-usage', 'cards');
  await noSideScroll(page);
});

test('Add funds opens its drawer and Escape closes it', async ({ page }) => {
  await gotoHub(page, '/billing');
  await page.getByRole('button', { name: strings.addFunds }).click();
  await expect(page).toHaveURL(/sheet=funds/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// Add funds shows once at every width (the header's; the floating button on a phone), never also in the wallet card.
// The balance and its wallet card are on the Wallet & usage view; plain /billing opens the plans, which show Add funds once too.
for (const width of [1440, 1100, 768, 390]) {
  test(`Add funds shows once at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/billing?view=wallet');
    await expect(page.locator('[data-balance]')).toBeVisible();
    await expect(page.getByRole('button', { name: strings.addFunds })).toHaveCount(1);
    await expect(page.locator('[data-card="wallet"]').getByRole('button', { name: strings.addFunds })).toHaveCount(0);
    await gotoHub(page, '/billing');
    await expect(page.locator('[data-section="plans"]')).toBeVisible();
    await expect(page.getByRole('button', { name: strings.addFunds })).toHaveCount(1);
  });
}

test('a purchase needs the consent box, then shows its answer', async ({ page }) => {
  await gotoHub(page, '/billing?checkout=buy&plan=fam-plus');
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: strings['buy.confirm'] });
  await expect(confirm).toBeDisabled();
  // The consent sentence holds the Terms and Privacy links: press its box (the label's start), not the text. A filter's
  // `has` locator is matched inside each label, so it starts from the page, never from the dialog.
  await dialog.locator('label').filter({ has: page.getByRole('checkbox') }).click({ position: { x: 8, y: 8 } });
  await confirm.click();
  await expect(dialog.getByRole('button', { name: strings['action.done'] })).toBeVisible();
});

test('the drawer cannot be closed while the charge is in flight', async ({ page }) => {
  await gotoHub(page, '/billing?checkout=buy&plan=fam-plus', {
    state: 'send-slow',
  });
  const dialog = page.getByRole('dialog');
  await dialog.locator('label').filter({ has: page.getByRole('checkbox') }).click({ position: { x: 8, y: 8 } });
  await dialog.getByRole('button', { name: strings['buy.confirm'] }).click();
  await expect(dialog.getByText(strings['mkt.posting'])).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
});

// The functional e2e of the subscriptions list (the kit's standard data view): search, chip, sort, reload, no match.
const table = (page: Page) => page.getByRole('table', { name: strings['subs.heading'] });
const dataRows = (page: Page) => table(page).locator('tbody tr');

test('@search the search box narrows the subscriptions and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/billing?view=wallet');
  await expect(dataRows(page).first()).toBeVisible();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'fra-7',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText(/fra-7/i);
    },
  });
});

test('@filter a state chip filters the subscriptions and keeps its value in the URL', async ({ page }) => {
  await gotoHub(page, '/billing?view=wallet');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['col.state'] }).click();
  const option = page.getByRole('menuitemradio').nth(1); // reason: option 0 is "All"; option 1 is the first real state
  const label = ((await option.textContent()) ?? '').replace(/\d+$/, '').trim(); // the menu item ends with its row count
  await option.click();
  await expect(page).toHaveURL(/[?&]state=/);
  await expect.poll(() => dataRows(page).count()).toBeLessThanOrEqual(before);
  // Every row left shows that state, not just fewer rows.
  expect(label).not.toBe('');
  for (const row of await dataRows(page).all()) await expect(row).toContainText(label);
});

test('@sort the Plan header sorts the subscriptions and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/billing?view=wallet');
  const header = table(page).getByRole('columnheader', { name: strings['col.plan'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?plan/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  // The rows really are in that order.
  const plans = async () => (await dataRows(page).locator('td:first-child').allInnerTexts()).map((x) => x.trim());
  const dir = (await header.getAttribute('aria-sort')) === 'descending' ? -1 : 1;
  const got = await plans();
  const want = [...got].sort((a, b) => dir * a.localeCompare(b, 'en', { sensitivity: 'base' }));
  expect(got).toEqual(want);
});

test('@reload sort survives a reload, the search does not', async ({ page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link brings the search with the sort and page; the helper proves the search is adopted and gone after the
  // reload while every kept key keeps its value. 'fra-7' is the held subscription's server (the old 'n12' is too short).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'fra-7',
    path: '/billing?view=wallet',
    keep: { sort: '-plan', page: '1' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText(/fra-7/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(4);
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/billing?view=wallet');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

// ── Bare metal (the old Market's flows, driving /billing?view=servers) ──
const serverBodyRows = (page: Page) => page.getByRole('table', { name: serverStrings['tab.listings'] }).locator('tbody').getByRole('row');
const serverRows = (page: Page) => page.getByRole('table', { name: serverStrings['tab.listings'] }).getByRole('row');

test('servers: select a server, then Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers');
  await serverRows(page).filter({ hasText: 'Frankfurt L' }).click();
  await expect(page).toHaveURL(/sel=l01/);
  // The inspector shows the server; its buy button needs the Billing page, which this one-page shell lacks.
  await expect(page.getByRole('heading', { name: 'Frankfurt L' })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('servers: search narrows the list and never writes ?q @search', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers');
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'tokyo',
    searched: async () => {
      await expect(serverRows(page)).toHaveCount(3); // the header row and the two Tokyo listings
      for (const row of await serverBodyRows(page).all()) await expect(row).toContainText('Tokyo');
    },
  });
});

test('servers: the pager moves to page 2, keeps ?page and shows the next rows @page', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers', { state: 'servers-long' });
  await expect(serverRows(page).nth(1)).toBeVisible();
  const first = await serverRows(page).nth(1).innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(serverRows(page).nth(1)).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('servers: filter, sort and page survive a reload, the search does not @reload', async ({ page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link brings the search with the Kind filter, sort and page 2; the helper proves the search is adopted and gone
  // after the reload while every kept key keeps its value. 'ryzen' is the CPU of some listings (the old 'a' is too short).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'ryzen',
    path: '/billing?view=servers',
    goto: { state: 'servers-long' },
    keep: { kind: 'stock', sort: '-cores', page: '2' },
    searched: async () => {
      await expect(serverBodyRows(page)).toHaveCount(30); // 4 of the 9 stock listings have a Ryzen CPU; 26 of the 60 copies do
    },
    unsearched: async () => {
      await expect(serverBodyRows(page)).toHaveCount(19); // 69 stock listings: page 2 holds rows 51-69
    },
  });
});

test('servers: the Kind filter narrows to pre-orders @filter', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers');
  await pickFilter(page.locator('#hub-main'), serverStrings['filter.kind'], serverStrings['kind.offer']);
  await expect(page).toHaveURL(/kind=offer/);
  await expect(serverRows(page)).toHaveCount(4);
});

test('servers: sorting by a column header reorders and is kept in the URL @sort', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers');
  await expect(serverRows(page).nth(2)).toBeVisible(); // the data rows are drawn before the columns are read
  // The column is found by its header in the same read as the cells, so a changed column set cannot misalign them.
  const cores = async () =>
    page.getByRole('table', { name: serverStrings['tab.listings'] }).evaluate((table, label) => {
      const heads = [...table.querySelectorAll('thead th, [role="columnheader"]')].map((h) => (h.textContent ?? '').trim());
      const col = heads.findIndex((h) => h.includes(label));
      if (col < 0) return [] as number[];
      return [...table.querySelectorAll('tbody tr')]
        .map((r) => Number.parseFloat((r.querySelectorAll('td')[col]?.textContent ?? '').replace(/[^\d.]/g, '')))
        .filter((n) => Number.isFinite(n));
    }, serverStrings['col.cores']);
  const header = page.getByRole('columnheader', { name: serverStrings['col.cores'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/sort=-?cores/);
  await expect.poll(async () => (await cores()).length).toBeGreaterThan(1); // the rows are redrawn after the click
  const got = await cores();
  const asc = (await header.getAttribute('aria-sort')) === 'ascending';
  const want = [...got].sort((a, b) => (asc ? a - b : b - a));
  expect(got).toEqual(want);
});

test('servers: no match offers Clear filters @no-match', async ({ page }) => {
  await gotoHub(page, '/billing?view=servers');
  await page.getByRole('searchbox').fill('zzzz-no-such-server');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(serverBodyRows(page).first()).toBeVisible();
});

test('servers: with a server open at 1440 px, the list keeps its RAM column @ram', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/billing?view=servers&sel=l01');
  await expect(page.getByRole('heading', { name: 'Frankfurt L' })).toBeVisible();
  const table = page.getByRole('table', { name: serverStrings['tab.listings'] });
  await expect(table.getByRole('columnheader', { name: serverStrings['col.ram'] })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: serverStrings['col.from'] })).toBeVisible();
});
