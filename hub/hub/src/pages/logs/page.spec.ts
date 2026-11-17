// Playwright: the logs page's flows on fixtures (run by hub:check --page logs).
import { type Locator, type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const rowAt = (list: Locator, n = 0) => list.getByRole('button').nth(n); // reason: the rows of one list share a role and have no unique name
const firstText = (l: Locator) => l.first(); // reason: the rows of one list share a role and have no unique name
// The data rows of the list (not its dividers or buttons): each has a data-key, its title is the full ISO time.
const dataRowsOf = (list: Locator) => list.locator('button[data-key]');
// The Logs list is not a kit DataTable: the search proofs settle on the list region (data-hub-busy while it loads) and
// Program output on its own root. The search box is the toolbar's one searchbox; the search key is q (param '').
const listOf = (page: Page) => page.getByRole('region', { name: strings.list });
// Row counts of the fixture's default state: 40 failed report.pdf downloads in one burst, plus 10 report.pdf visits over the hour;
// around the burst (14 minutes back, +-5 minutes) the failed and the problem rows that name report are the 40 of the burst.
const N_PDF = 50;
const N_REPORT = 50;
const N_SEV = 40;
const N_AT = 40;
const logsView = (page: Page) => ({ param: '', box: page.getByRole('searchbox'), kind: 'cursor' as const, root: listOf(page) });
// Program output: one program's snapshot (the `program` key survives, no sort, page or cursor). Its root (the settle
// hook's element) is the output block's parent; while the snapshot loads there is no output block, so a waiter waits.
const programView = (page: Page) => ({ param: '', box: page.getByRole('searchbox'), kind: 'program' as const, root: page.getByLabel(strings['prog.title'], { exact: true }).locator('xpath=..') });
// The pages this load serves, read from the main navigation rather than from the control under test.
// The shell's main navigation (shell/strings.en.json nav.label); pages don't import shell strings.
const navItem = (page: Page, id: string) => page.getByRole('navigation', { name: 'Main navigation' }).locator(`a[href$="/${id}"]`);
async function served(page: Page, id: string): Promise<boolean> {
  await expect(navItem(page, 'logs')).toHaveCount(1); // the navigation is drawn, so a zero below means "not served"
  return (await navItem(page, id).count()) > 0;
}

test('a row opens its details and Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/logs');
  await rowAt(page.getByRole('region', { name: strings.list })).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: strings['det.group_request'], exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('@filter @reload a source and how it went are kept in the URL through a reload', async ({ page }) => {
  await gotoHub(page, '/logs');
  await expect(rowAt(page.getByRole('region', { name: strings.list }))).toBeVisible();
  await expect(async () => {
    await page.getByRole('radio', { name: strings['src.bots'] }).click();
    await expect(page).toHaveURL(/src=bots/, { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole('radio', { name: strings['src.bots'] })).toBeChecked();
});

test('@search @no-match search narrows the list and a no-match offers Clear filters', async ({ page }) => {
  await gotoHub(page, '/logs');
  const list = listOf(page);
  await expect(rowAt(list)).toBeVisible();
  const summary = firstText(page.getByText(/in the last hour/));
  const before = await summary.textContent();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, through a settle window).
  await expectSearchStaysOutOfUrl(page, logsView(page), {
    text: '/download/report.pdf',
    searched: async () => {
      await expect(summary).not.toHaveText(before ?? '');
      await expect(list).toHaveAttribute('data-rows', String(N_PDF));
      for (const row of await dataRowsOf(list).all()) await expect(row).toContainText('/download/report.pdf');
    },
  });
  await page.getByRole('searchbox').fill('zzzz-nothing');
  await expect(page.getByRole('button', { name: strings.clear })).toBeVisible();
  await page.getByRole('button', { name: strings.clear }).click();
  await expect(page).not.toHaveURL(/q=/);
});

test('a deep link from Computers shows the program as a removable chip', async ({ page }) => {
  await gotoHub(page, '/logs?computer=atlas.00a1&program=2');
  await expect(page.getByText(strings['prog.notTimed'])).toBeVisible();
  await expect(page).toHaveURL(/program=2/);
});

test('Export opens its dialog with the secrets note', async ({ page }) => {
  await gotoHub(page, '/logs');
  await page.getByRole('button', { name: strings['act.barMore'] }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${strings['act.export']}`) }).click();
  await expect(page.getByText(strings['ex.size'])).toBeVisible();
});

test('@sort the newest rows come first and Show older reads further back', async ({ page }) => {
  await gotoHub(page, '/logs');
  const list = page.getByRole('region', { name: strings.list });
  await expect(rowAt(list)).toBeVisible();
  // Compare each row's own time (its title is the full ISO time), never the shown HH:MM:SS text:
  // that text sorts wrong across midnight, so it would fail a correct list just after 00:00 UTC.
  const isos = await list.locator('button[data-key]').evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
  const times = isos.map((x) => Date.parse(x));
  expect(times.length).toBeGreaterThan(5);
  expect(times.every(Number.isFinite)).toBe(true);
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

test.describe('across midnight', () => {
  test.use({ timezoneId: 'UTC' });
  test('@sort rows that cross midnight stay newest first', async ({ page }) => {
    // Just after midnight the newest rows read 00:0x and the older ones 23:5x: a list ordered by the
    // shown time text would put 23:5x first. The clock is pinned here only, never in the test above.
    const midnight = Date.parse('2026-10-27T00:00:00Z');
    await page.clock.setFixedTime(midnight + 2 * 60_000);
    await gotoHub(page, '/logs');
    const list = page.getByRole('region', { name: strings.list });
    await expect(rowAt(list)).toBeVisible();
    const times = (await list.locator('button[data-key]').evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''))).map((x) => Date.parse(x));
    expect(times.every(Number.isFinite)).toBe(true);
    expect(times[0]).toBeGreaterThanOrEqual(midnight); // the newest row (00:0x) is drawn first, not a 23:5x one
    expect(times.some((t) => t < midnight)).toBe(true); // and the drawn rows really reach back past midnight
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

test('Live brings new rows in and holds them behind a pill while a row is open', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything', { state: 'live' });
  const list = page.getByRole('region', { name: strings.list });
  await expect(rowAt(list)).toBeVisible();
  const live = page.getByRole('switch', { name: strings['act.live'] });
  await expect(async () => {
    if (!(await live.isChecked())) await page.getByRole('group', { name: strings.title }).locator('label', { hasText: strings['act.live'] }).click();
    await expect(live).toBeChecked({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await rowAt(list, 3).click();
  await expect(page.getByRole('button', { name: /new · Jump to newest/ })).toBeVisible({ timeout: 15000 });
});

test('@filter @search @reload severity and search from a link are applied and shown; only the severity survives a reload', async ({ page }) => {
  // The link brings the search with the source, the severity and a time cursor (a cursor view must keep one of at/before/after/cursor;
  // the cursor is 14 minutes back, where the fixture's burst of failed report.pdf downloads sits inside the 5-minute window);
  // the helper proves the search is adopted once, out of the URL, and gone after the reload while every kept key survives.
  const at = Date.now() - 14 * 60_000;
  await expectLinkSearchDroppedOnReload(page, logsView(page), {
    text: 'report',
    path: '/logs',
    keep: { src: 'everything', sev: 'failed', at: String(at) },
    searched: async () => {
      await expect(listOf(page)).toHaveAttribute('data-rows', String(N_SEV));
      for (const row of await dataRowsOf(listOf(page)).all()) await expect(row).toContainText('report');
    },
    unsearched: async () => {
      // A row the search drops: the unsearched window also holds a Bot call (502) that is not a report.pdf download.
      await expect(dataRowsOf(listOf(page)).filter({ hasNotText: 'report' }).first()).toBeVisible();
    },
    before: async () => {
      await expect(firstText(page.getByText(strings['sev.failed']))).toBeVisible();
    },
  });
});

test('@search typing in the search box never writes q to the URL, and opening a row keeps the search', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything');
  const list = listOf(page);
  await expect(rowAt(list)).toBeVisible();
  await expectSearchStaysOutOfUrl(page, logsView(page), {
    text: 'report',
    searched: async () => {
      await expect(list).toHaveAttribute('data-rows', String(N_REPORT));
      for (const row of await dataRowsOf(list).all()) await expect(row).toContainText('report');
    },
  });
  await expect(rowAt(list)).toBeVisible();
  await rowAt(list).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page.getByRole('searchbox')).toHaveValue('report');
});

test('@sort @filter Show older pages further back and the source switch resets the list', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything', { state: 'manyRows' });
  const list = page.getByRole('region', { name: strings.list });
  await expect(rowAt(list)).toBeVisible();
  const count = async () => Number(await list.getAttribute('data-rows'));
  const before = await count();
  const older = page.getByRole('button', { name: strings['act.older'] });
  await older.scrollIntoViewIfNeeded();
  await expect(older).toBeVisible();
  await older.click();
  await expect.poll(count, { timeout: 10000 }).toBeGreaterThan(before);
  await page.getByRole('radio', { name: strings['src.bots'] }).click();
  await expect(page).toHaveURL(/src=bots/);
});

test('@search @reload the Program output search finds lines, never goes into the URL, and a reload clears it', async ({ page }) => {
  test.slow(); // two helper runs: five page loads
  await gotoHub(page, '/logs?src=programs&program=3');
  await expect(page.getByRole('searchbox')).toBeVisible();
  // The worker program's output is two lines; 'waiting' finds one of them (the other, 'worker started', goes).
  const found = async () => {
    await expect(page.getByText('waiting for jobs')).toBeVisible();
    await expect(page.getByText('worker started')).toHaveCount(0);
  };
  await expectSearchStaysOutOfUrl(page, programView(page), { text: 'waiting', searched: found });
  // The typed search itself is gone after a reload (the link proof below starts from a fresh document, so it cannot
  // see a typed search that survives one).
  await page.reload();
  await expect(page).toHaveURL(/program=3/);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByText('worker started')).toBeVisible();
  await expectLinkSearchDroppedOnReload(page, programView(page), {
    text: 'waiting',
    path: '/logs',
    keep: { src: 'programs', program: '3' },
    searched: found,
    unsearched: async () => {
      await expect(page.getByText('worker started')).toBeVisible();
      await expect(page.getByText('waiting for jobs')).toBeVisible();
    },
  });
});

test('@page the around-a-time window keeps its cursor (at=) in the URL and a reload restores it', async ({ page }) => {
  const at = Date.now() - 20 * 60_000;
  await gotoHub(page, `/logs?src=everything&at=${at}`);
  await expect(page).toHaveURL(/[?&]at=\d+/);
  await expect(rowAt(page.getByRole('region', { name: strings.list }))).toBeVisible();
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page).toHaveURL(/[?&]at=\d+/);
  await expect(rowAt(page.getByRole('region', { name: strings.list }))).toBeVisible();
});

test('@reload a filter and the time cursor survive a reload, the search does not', async ({ page }) => {
  const at = Date.now() - 14 * 60_000;
  await expectLinkSearchDroppedOnReload(page, logsView(page), {
    text: 'report',
    path: '/logs',
    keep: { src: 'everything', sev: 'problems', at: String(at) },
    searched: async () => {
      await expect(listOf(page)).toHaveAttribute('data-rows', String(N_AT));
      for (const row of await dataRowsOf(listOf(page)).all()) await expect(row).toContainText('report');
    },
    unsearched: async () => {
      // A row the search drops: the unsearched window also holds a Bot call (502) that is not a report.pdf download.
      await expect(dataRowsOf(listOf(page)).filter({ hasNotText: 'report' }).first()).toBeVisible();
    },
  });
});

test('a bare Logs link opens the default view: the view lives in the URL only', async ({ page }) => {
  await gotoHub(page, '/logs?src=bots');
  await expect(page.getByRole('radio', { name: strings['src.bots'] })).toBeChecked();
  await page.evaluate(() => { window.location.hash = '#/notifications'; });
  await expect(page).not.toHaveURL(/#\/logs/);
  await page.evaluate(() => { window.location.hash = '#/logs'; });
  await expect(page).toHaveURL(/#\/logs$/);
  await expect(page.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
  await expect(page.getByRole('radio', { name: strings['src.bots'] })).not.toBeChecked();
});

test('@filter Clear all removes the Computer and Program chips', async ({ page }) => {
  await gotoHub(page, '/logs?computer=c0a7150000000000000000a1&program=2');
  await expect(page.getByRole('group', { name: 'Filters' })).toBeVisible();
  await page.getByRole('button', { name: /clear all/i }).click();
  await expect(page).not.toHaveURL(/[?&](computer|program)=/);
  await expect(page.getByRole('group', { name: 'Filters' })).toHaveCount(0);
});

test('j and k move the active row, and opening a row adds a history step', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything');
  const list = page.getByRole('region', { name: strings.list });
  const first = rowAt(list);
  await expect(first).toBeVisible();
  const active = list.locator('[data-active="true"]');
  await page.keyboard.press('j');
  await expect(active).toHaveCount(1);
  const a = await active.getAttribute('data-key');
  await page.keyboard.press('j');
  await expect.poll(async () => active.getAttribute('data-key')).not.toBe(a);
  await page.keyboard.press('k');
  await expect.poll(async () => active.getAttribute('data-key')).toBe(a);
  await first.click();
  await expect(page).toHaveURL(/sel=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page).toHaveURL(/#\/logs/);
});

test('?exec= opens that run once, and closing it does not open it again', async ({ page }) => {
  await gotoHub(page, '/logs?src=scripts&script=deploy-site.sh&exec=run0002');
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: strings['det.group_request'], exact: true })).toBeVisible();
  const sel = new URL(page.url().replace('#', '')).searchParams.get('sel');
  expect(sel).toBeTruthy();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: strings['det.group_request'], exact: true })).toHaveCount(0);
});

test('an open row leads on to its computer and the other places it belongs to', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything');
  await rowAt(page.getByRole('region', { name: strings.list })).click();
  await expect(page.getByRole('heading', { name: strings['det.group_request'], exact: true })).toBeVisible();
  // A link to a page this load does not serve is hidden (there is no classic fallback); a served page is a Hub link.
  const link = page.getByRole('group', { name: strings['act.group'] }).getByRole('button', { name: strings['lk.computer'] });
  if (await served(page, 'computers')) {
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#\/computers/);
    await expect(page).not.toHaveURL(/view=/);
    await expect(navItem(page, 'computers')).toHaveAttribute('aria-current', 'page'); // the Computers page opened, not Not found
  } else {
    await expect(page.getByRole('button', { name: strings['lk.computer'] })).toHaveCount(0);
  }
});

test('@no-match an empty list says where entries come from and links there', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything&win=24h', { state: 'empty' });
  const link = page.getByRole('button', { name: strings['lk.programs'] });
  await expect(page.getByText(strings['st.empty'].replace(/\s*\{\{.*$/, ''))).toBeVisible(); // the empty state's title
  if (await served(page, 'programs')) {
    await expect(page.getByText(strings['lk.empty'])).toBeVisible();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#\/programs/);
    await expect(page).not.toHaveURL(/view=/);
    await expect(navItem(page, 'programs')).toHaveAttribute('aria-current', 'page'); // the Programs page opened, not Not found
  } else {
    // Programs is not served here: no link, and no sentence pointing at one.
    await expect(link).toHaveCount(0);
    await expect(page.getByText(strings['lk.empty'])).toHaveCount(0);
  }
});

test('@no-match a quiet window is the empty state; Clear filters from a computer link drops the computer too', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything&win=24h', { state: 'empty' });
  await expect(page.getByText(/^Nothing happened/)).toBeVisible();
  await expect(page.getByRole('button', { name: strings.clear })).toHaveCount(0);
  await gotoHub(page, '/logs?computer=c0a7150000000000000000a1&src=everything&win=24h', { state: 'empty' });
  await page.getByRole('button', { name: strings.clear }).click();
  await expect(page).not.toHaveURL(/[?&]computer=/);
});

test('Home and End jump to the ends of the list and Enter opens the active row', async ({ page }) => {
  await gotoHub(page, '/logs?src=everything', { state: 'quiet' });
  const list = page.getByRole('region', { name: strings.list });
  await expect(rowAt(list)).toBeVisible();
  const active = list.locator('[data-active="true"]');
  await page.keyboard.press('j');
  await expect(active).toHaveCount(1);
  await expect(active).toBeFocused();
  const first = await active.getAttribute('data-key');
  await page.keyboard.press('End');
  await expect.poll(async () => active.getAttribute('data-key')).not.toBe(first);
  await page.keyboard.press('Home');
  await expect.poll(async () => active.getAttribute('data-key')).toBe(first);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sel=/);
});

// Clear all, under the bar with the chips (in place of a Reset filters button in the bar).
const RESET = strings['act.reset'];

for (const src of ['account', 'helper', 'decisions', 'execVisits'] as const) {
  test(`@filter a link to ${src} shows it as the one selected source, and pressing Everything goes back`, async ({ page }) => {
    await gotoHub(page, `/logs?src=${src}`);
    const group = page.getByRole('radiogroup', { name: strings['f.source'] });
    await expect(group.getByRole('radio', { name: strings['src.everything'] })).not.toBeChecked();
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(group.getByRole('radio', { checked: true })).toHaveAccessibleName(strings[`src.${src}`]);
    await group.getByRole('radio', { name: strings['src.everything'] }).click();
    await expect(page).not.toHaveURL(/src=/);
    await expect(group.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(group.getByRole('radio', { name: strings[`src.${src}`] })).toHaveCount(0);
  });
}

test('@filter More chooses a source by keyboard; the group alone shows it as selected, the menu marks nothing', async ({ page }) => {
  await gotoHub(page, '/logs');
  const more = page.getByRole('button', { name: strings['src.more'], exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter'); // opens with the first item (Account) focused
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/src=helper/);
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  await expect(group.getByRole('radio', { checked: true })).toHaveAccessibleName(strings['src.helper']);
  await more.click();
  await expect(page.getByRole('menu').getByRole('menuitemcheckbox')).toHaveCount(0);
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
});

test('@filter Clear all shows only off the defaults and brings source, how it went and when back to them', async ({ page }) => {
  await gotoHub(page, '/logs');
  await expect(page.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
  await expect(page.getByRole('button', { name: RESET })).toHaveCount(0);
  await gotoHub(page, '/logs?src=visits&sev=failed&win=24h');
  await expect(page.getByRole('radio', { name: strings['src.visits'] })).toBeChecked();
  await page.getByRole('button', { name: RESET }).click();
  await expect(page).not.toHaveURL(/src=|sev=|win=/);
  await expect(page.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
  await expect(page.getByRole('button', { name: RESET })).toHaveCount(0);
});

test('@filter Clear all from a program view goes back to everything, with no program or port left', async ({ page }) => {
  await gotoHub(page, '/logs?src=programs&program=2&port=8001');
  await expect(page.getByRole('radio', { name: strings['src.programs'] })).toBeChecked();
  await page.getByRole('button', { name: RESET }).click();
  await expect(page).not.toHaveURL(/src=|program=|port=/);
  await expect(page.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
});

test('@filter switching source with a row open keeps exactly one source selected', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 }); // wide enough for the group beside an open inspector
  await gotoHub(page, '/logs?src=account');
  await page.getByRole('region', { name: strings.list }).getByRole('button').first().click(); // reason: rows share a role
  await expect(page).toHaveURL(/sel=/);
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  await group.getByRole('radio', { name: strings['src.bots'] }).click();
  await expect(page).toHaveURL(/src=bots/);
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(group.getByRole('radio', { checked: true })).toHaveAccessibleName(strings['src.bots']);
});

test('@filter on a phone the one source picker names a More or hand-off source it was given', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/logs?src=execVisits');
  await expect(page.getByRole('button', { name: new RegExp(strings['src.execVisits']) }).first()).toBeVisible(); // reason: the Select trigger shows its value in its name
  await expect(page.getByRole('radiogroup', { name: strings['f.source'] })).toHaveCount(0);
});

test('@reload a More source chosen before leaving or reloading is not restored on a bare Logs link', async ({ page }) => {
  await gotoHub(page, '/logs?src=helper');
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  await expect(group.getByRole('radio', { name: strings['src.helper'] })).toBeChecked();
  await page.evaluate(() => { window.location.hash = '#/notifications'; });
  await expect(page).not.toHaveURL(/#\/logs/);
  await page.evaluate(() => { window.location.hash = '#/logs'; });
  await expect(page).not.toHaveURL(/src=/);
  await expect(group.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: RESET })).toHaveCount(0);
  await page.reload();
  await expect(page).not.toHaveURL(/src=/);
  await expect(page.getByRole('radiogroup', { name: strings['f.source'] }).getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
});

// More source-control cases.
// The arrow keys move through the sources and Space chooses one: the bar is the kit Toolbar, a labelled group, so the
// segmented control keeps its own arrows (a role="toolbar" around it switched them off).
test('@filter the arrow keys move through the sources, Space chooses one, and the URL follows', async ({ page }) => {
  await gotoHub(page, '/logs');
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  await group.getByRole('radio', { name: strings['src.everything'] }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: strings['src.visits'] })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/src=visits/);
  await expect(group.getByRole('radio', { name: strings['src.visits'] })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: strings['src.everything'] })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).not.toHaveURL(/src=/);
  await expect(group.getByRole('radio', { name: strings['src.everything'] })).toBeChecked();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
});

test('@filter leaving a More source by keyboard drops its segment and keeps focus on the source chosen', async ({ page }) => {
  await gotoHub(page, '/logs?src=helper');
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  const helper = group.getByRole('radio', { name: strings['src.helper'] });
  await expect(helper).toBeChecked();
  await helper.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/src=programs/);
  await expect(helper).toHaveCount(0);
  await expect(group.getByRole('radio', { name: strings['src.programs'] })).toBeChecked();
  await expect(group.getByRole('radio', { name: strings['src.programs'] })).toBeFocused();
});

test('@filter on a phone the source picker goes back to Everything from a hand-off source', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/logs?src=execVisits');
  const trigger = page.getByRole('button', { name: new RegExp(strings['src.execVisits']) }).first(); // reason: the Select trigger shows its value in its name
  await trigger.click();
  await page.getByRole('option', { name: strings['src.everything'], exact: true }).click();
  await expect(page).not.toHaveURL(/src=/);
  await expect(page.getByRole('button', { name: new RegExp(strings['src.everything']) }).first()).toBeVisible(); // reason: as above
  await expect(page.getByRole('button', { name: new RegExp(strings['src.execVisits']) })).toHaveCount(0);
});

// A saved view that holds a source from the More menu reopens on that source. The view
// is saved through the page's own dialog (no second way to seed it), left through Clear all, and opened from the
// bar's ⋯ menu; the source segment, the severity and the URL all come back.
test('@filter a saved view with a More source reopens on that source, how it went and all', async ({ page }) => {
  await gotoHub(page, '/logs?src=helper&sev=failed');
  const group = page.getByRole('radiogroup', { name: strings['f.source'] });
  await expect(group.getByRole('radio', { name: strings['src.helper'] })).toBeChecked();
  const views = page.getByRole('button', { name: strings['act.barMore'] });
  await views.click();
  await page.getByRole('menuitem', { name: strings['v.save'] }).click();
  await page.getByRole('textbox', { name: strings['v.name'] }).fill('Helper trouble');
  await page.getByRole('button', { name: strings['v.saveGo'], exact: true }).click();
  await expect(page.getByText(strings['v.done'].replace('{{name}}', 'Helper trouble'))).toBeVisible();
  await page.getByRole('button', { name: strings['act.reset'] }).click();
  await expect(page).not.toHaveURL(/src=helper/);
  await expect(group.getByRole('radio', { name: strings['src.helper'] })).toHaveCount(0);
  await views.click();
  await page.getByRole('menuitem', { name: strings['v.open'].replace('{{name}}', 'Helper trouble') }).click();
  await expect(page).toHaveURL(/src=helper/);
  await expect(page).toHaveURL(/sev=failed/);
  await expect(group.getByRole('radio', { name: strings['src.helper'] })).toBeChecked();
});
