// Playwright: the vault page's flows on fixtures (run by hub:check --page vault).
// The six tagged tests are the functional e2e every list page keeps; they run on the
// long state (140 entries in the fixture world's first realm, every fourth one encrypted).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, hubUrl } from '@app/e2e';
import strings from './strings.en.json';

/** The vault in the shell's default realm (fixtureWorld's first, Personal): the top bar decides, not the URL. */
const IN = '/vault';
const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr');
const firstRow = (page: Page) => dataRows(page).first(); // reason: the list's first data row, whichever entry it is

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, IN, { state: 'long' });
  await expect(firstRow(page)).toBeVisible();
  // Of entry-001 .. entry-140, entry-010 .. entry-019 match 'entry-01'.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'entry-01',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('entry-01');
    },
  });
});

test('@filter a chip filters the rows and shows its value with ×', async ({ page }) => {
  await gotoHub(page, IN, { state: 'long' });
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['filter.lock'] }).click();
  await page
    .getByRole('menuitemradio', { name: strings['filter.encrypted'], exact: true })
    .or(page.getByRole('menuitem', { name: strings['filter.encrypted'], exact: true }))
    .click();
  await expect(page).toHaveURL(/[?&]lock=encrypted/);
  await expect(firstRow(page)).toBeVisible();
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['lock.yes']);
});

test('@sort a column header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, IN, { state: 'long' });
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?key/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const names = await dataRows(page).locator('td:first-child').allInnerTexts();
  const sorted = [...names].sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare);
  expect([names, [...names].reverse()]).toContainEqual(sorted);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, IN, { state: 'long' });
  await expect(firstRow(page)).toBeVisible();
  const first = await firstRow(page).innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(firstRow(page)).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload partition, chip, sort, page and the open entry survive a reload, the search does not', async ({ page }) => {
  test.slow(); // the helper opens the page three times and reloads it
  // The link brings the search with the Encryption chip, sort, page 2 and the open entry. 'entry' alone is not used: it is in
  // sel=entry-062, so the search text is 'entry-01' (it is not in 'entry-062'). Plain entries matching it: eight (two of
  // entry-010 .. entry-019 are encrypted); with no search page 2 of the 105 plain entries is 50 rows.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'entry-01',
    path: IN,
    goto: { state: 'long' },
    keep: { lock: 'plain', sort: '-key', page: '2', sel: 'entry-062' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(8);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('entry-01');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(50);
    },
    after: async () => {
      await expect(page).not.toHaveURL(/[?&]in=/);
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
      await expect(page.getByRole('heading', { name: strings['detail.facts'] })).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, IN, { state: 'long' });
  await expect(firstRow(page)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-entry');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('a value shows only after the eye, never in the URL, and hiding it drops it', async ({ page }) => {
  // Fixture mode answers in the page (no network to count): the request-level proof is data.test.ts.
  await gotoHub(page, `${IN}?sel=github-token`);
  await expect(page.getByRole('heading', { name: strings['detail.facts'] })).toBeVisible();
  await expect(page.getByRole('button', { name: strings['value.hideEye'] })).toHaveCount(0);
  await page.getByRole('button', { name: strings['value.showEye'] }).click();
  await expect(page.getByRole('button', { name: strings['value.hideEye'] })).toBeVisible();
  await expect(page.locator('[data-secret]')).not.toHaveCount(0);
  await expect(page).not.toHaveURL(/fixture-token-value/);
  await page.getByRole('button', { name: strings['value.hideEye'] }).click();
  await expect(page.getByRole('button', { name: strings['value.hideEye'] })).toHaveCount(0);
  await expect(page.getByRole('button', { name: strings['value.showEye'] })).toBeVisible();
});

test('the page has no picker of its own, and an old ?in= link is dropped while the top bar decides', async ({ page }) => {
  await gotoHub(page, `${IN}?in=global&sel=github-token`);
  await expect(page.getByRole('heading', { name: strings['detail.facts'] })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]in=/);
  await expect(page.getByText('Show entries of')).toHaveCount(0);
  await expect(table(page).getByText('shared-webhook-url')).toHaveCount(0);
});

test('"All realms" shows the Global entries and points at the top bar', async ({ page }) => {
  await page.goto(hubUrl(IN).replace('/?', '/?fxrealm=all&'));
  await page.locator('#hub-main').waitFor();
  await expect(table(page).getByText('shared-webhook-url')).toBeVisible();
  // exact: the vault FAQ answer (faq.scope.a) starts with the same sentence, so a substring match finds two elements
  await expect(page.getByText(strings['partition.noteGlobal'], { exact: true })).toBeVisible();
  await expect(page.getByText(strings['partition.pickHint'], { exact: true })).toBeVisible();
});

test('an unknown save locks the drawer and offers Check again, never a second send', async ({ page }) => {
  await gotoHub(page, IN, { state: 'unknown' });
  await page.getByRole('button', { name: strings['action.new'], exact: true }).click();
  // the drawer's own fields: the page's FAQ panels are labelled by questions that contain "name" and "value"
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel(strings['edit.name'], { exact: true }).fill('ci-token');
  await drawer.getByLabel(strings['edit.value'], { exact: true }).pressSequentially('fixture-value-ci');
  await page.getByRole('button', { name: strings['edit.save'] }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(page.getByRole('button', { name: strings['edit.save'], exact: true })).toHaveCount(0);
});

// The drawer opened by its button has its own history entry; a save closes it once, opens the
// new entry, and never asks to discard what was just saved.
for (const from of ['header', 'empty'] as const) {
  test(`a saved New entry from the ${from} button closes the drawer and opens the entry`, async ({ page }) => {
    await gotoHub(page, IN, from === 'empty' ? { state: 'empty' } : {});
    if (from === 'empty') await page.getByText(strings['empty.title']).waitFor();
    else await table(page).waitFor();
    await page.getByRole('button', { name: strings['action.new'], exact: true }).click();
    const drawer = page.getByRole('dialog', { name: strings['edit.newTitle'] });
    await drawer.getByRole('textbox', { name: strings['edit.name'] }).fill('walk-token');
    await drawer.getByLabel(strings['edit.value'], { exact: true }).pressSequentially('fixture-walk-value');
    await drawer.getByRole('button', { name: strings['edit.save'] }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByText('Discard changes?')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]sel=walk-token/);
    await expect(page.getByRole('heading', { name: 'walk-token' })).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]edit=/);
    await expect(drawer).toHaveCount(0);
  });
}

// Once a held save's drawer closes, the page's banner is its one place. On a phone the open entry's
// detail hides the list, so the banner for a save of another entry shows in that detail.
test.describe('a held save on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("another entry's detail shows the hold banner and its controls", async ({ page }) => {
    await gotoHub(page, IN, { state: 'unknown' });
    await page.getByRole('button', { name: strings['action.new'], exact: true }).tap();
    const drawer = page.getByRole('dialog', { name: strings['edit.newTitle'] });
    await drawer.getByRole('textbox', { name: strings['edit.name'] }).fill('held-token');
    await drawer.getByLabel(strings['edit.value'], { exact: true }).pressSequentially('fixture-held-value');
    await drawer.getByRole('button', { name: strings['edit.save'] }).tap();
    // The page's banner (the drawer's own band says the same words).
    const banner = page.locator('[role="alert"][data-outcome="pending"]').filter({ hasText: 'Saving held-token in Personal may have gone through' });
    await expect(banner).toBeVisible();
    await drawer.locator('button[data-variant="secondary"]', { hasText: 'Close' }).tap();
    await expect(drawer).toHaveCount(0);
    await page.getByText('db-password', { exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'db-password' })).toBeVisible();
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Check again' })).toBeVisible();
    await expect(banner.getByRole('button', { name: /^Stop tracking/ })).toBeVisible();
  });
});

// The palette's New entry, chosen from another page, lands on the vault with the New form open.
// 'Command palette' is the shell's palette label (pages may not import shell strings).
test('the palette New entry command opens the New form from another page', async ({ page }) => {
  await gotoHub(page, '/home');
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('searchbox').fill(strings['cmd.new']);
  await palette.getByRole('menuitem', { name: strings['cmd.new'] }).click();
  await expect(page).toHaveURL(/\/vault\?(.*&)?edit=new/);
  const drawer = page.getByRole('dialog', { name: strings['edit.newTitle'] });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: strings['edit.name'] })).toBeVisible();
});
