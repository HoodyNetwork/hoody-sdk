// Playwright: AI → Automations at /ai/auto/workflows, /loops and /todos.
// Each list gets the six tagged functional tests (FUNCTIONAL RULE): each proves its state in the URL. Fixtures: the ai
// page's states (default; autoMany adds rows past one page of 50).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import { links } from './links';
import loopStrings from './auto/loops/List.strings.en.json';
import todoStrings from './auto/todos/List.strings.en.json';
import wfStrings from './auto/workflows/strings.en.json';
import aiStrings from './strings.en.json';

interface List {
  name: string;
  url: string;
  table: string;
  noMatch: string;
  /** A search, the one row it leaves. */
  search: { q: string; row: string };
  /** Picks a filter value; `param` is how the URL carries it; every row left contains `row`. */
  filter: { pick: (page: Page) => Promise<void>; param: RegExp; row: string; count: number };
  /** A sortable header and how the URL names its sort. `fromDefault`: the list is already sorted by it, so one press
   *  turns it the other way. */
  sort: { header: string; param: RegExp; fromDefault?: boolean };
  /** A URL for the reload test: q, a filter, sort and page 2, all past one page in autoMany. `found`: the rows the filter
   *  leaves with the search; `rest`: the rows it leaves without it (the pager's total, past 50 in both). */
  reload: { q: string; filter: string; sort: string; found: number; rest: number };
}

const pickFromMenu = async (page: Page, label: string, option: string) => {
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: label }).click();
  await page.getByRole('menuitemradio', { name: option, exact: true }).or(page.getByRole('menuitem', { name: option, exact: true })).click();
};

const LISTS: List[] = [
  {
    name: 'Workflows',
    url: links.workflows,
    table: wfStrings['wf.title'],
    noMatch: wfStrings['wf.noMatch'],
    search: { q: 'release', row: 'Cut a release of the shop' },
    filter: { pick: (p) => pickFromMenu(p, wfStrings['wf.filter.origin'], wfStrings['wf.origin.project']), param: /[?&]origin=project/, row: 'review-pr', count: 1 },
    sort: { header: wfStrings['wf.col.name'], param: /[?&]sort=-name/, fromDefault: true },
    reload: { q: 'report', filter: 'origin=yours', sort: 'name', found: 56, rest: 57 },
  },
  {
    name: 'Loops',
    url: links.loops,
    table: loopStrings.title,
    noMatch: loopStrings.noMatch,
    search: { q: 'dependency', row: 'Look for dependency updates' },
    filter: { pick: (p) => pickFromMenu(p, loopStrings['filter.state'], loopStrings['f.paused']), param: /[?&]state=paused/, row: 'Look for dependency updates', count: 1 },
    sort: { header: loopStrings['col.loop'], param: /[?&]sort=-?prompt/ },
    reload: { q: 'shop', filter: 'state=active', sort: 'prompt', found: 57, rest: 58 },
  },
  {
    name: 'TODOs',
    url: links.todos,
    table: todoStrings.title,
    noMatch: todoStrings.noMatch,
    // A row of the default tab (Open): search narrows the tab shown. The checkout TODO waits for a person (its proposed
    // runs), so it is on Waiting for you, not Open.
    search: { q: 'refund', row: 'Answer the refund email' },
    filter: { pick: (p) => p.getByRole('radio', { name: todoStrings['tab.done'] }).click(), param: /[?&]tab=done/, row: 'Write the changelog', count: 1 },
    sort: { header: todoStrings['col.todo'], param: /[?&]sort=-?title/ },
    reload: { q: 'shop', filter: 'tab=open', sort: 'title', found: 56, rest: 58 },
  },
];

const table = (page: Page, l: List) => page.getByRole('table', { name: l.table });
const rows = (page: Page, l: List) => table(page, l).locator('tbody tr');
/** The list's first rows. The screens load lazily (tab.tsx): a first visit on a busy dev server compiles the screen's
 *  chunk before it reads, so this one wait gets longer than the default expect timeout. */
const shown = (page: Page, l: List) => expect(rows(page, l).first()).toBeVisible({ timeout: 20_000 });
/** The first cell of each row shown, in order. */
const firstCells = (page: Page, l: List) => rows(page, l).locator('td:first-child').allInnerTexts();

for (const l of LISTS) {
  test.describe(l.name, () => {
    test(`@search ${l.name}: the search box narrows the list and never writes ?q`, async ({ page }) => {
      await gotoHub(page, l.url);
      await shown(page, l);
      // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
      await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
        text: l.search.q,
        searched: async () => {
          await expect(rows(page, l)).toHaveCount(1);
          await expect(rows(page, l).first()).toContainText(l.search.row);
        },
      });
    });

    test(`@filter ${l.name}: a filter value keeps its key in the URL and only matching rows`, async ({ page }) => {
      await gotoHub(page, l.url);
      await shown(page, l);
      await l.filter.pick(page);
      await expect(page).toHaveURL(l.filter.param);
      await expect(rows(page, l)).toHaveCount(l.filter.count);
      await expect(rows(page, l).first()).toContainText(l.filter.row);
    });

    test(`@sort ${l.name}: a header sorts the rows both ways and keeps ?sort`, async ({ page }) => {
      await gotoHub(page, l.url);
      await shown(page, l);
      const header = table(page, l).getByRole('columnheader', { name: l.sort.header });
      if (l.sort.fromDefault) {
        await expect(header).toHaveAttribute('aria-sort', 'ascending');
        const before = await firstCells(page, l);
        expect(before.length).toBeGreaterThan(1);
        await header.getByRole('button').click();
        await expect(page).toHaveURL(l.sort.param);
        await expect(header).toHaveAttribute('aria-sort', 'descending');
        await expect.poll(() => firstCells(page, l)).toEqual([...before].reverse());
        return;
      }
      await header.getByRole('button').click();
      await expect(page).toHaveURL(l.sort.param);
      await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
      const one = await firstCells(page, l);
      expect(one.length).toBeGreaterThan(1);
      const dir = await header.getAttribute('aria-sort');
      await header.getByRole('button').click();
      await expect(header).not.toHaveAttribute('aria-sort', dir ?? '');
      await expect(page).toHaveURL(l.sort.param);
      await expect.poll(() => firstCells(page, l)).toEqual([...one].reverse());
    });

    test(`@page ${l.name}: past 50 rows the pager moves to page 2 and keeps ?page`, async ({ page }) => {
      await gotoHub(page, l.url, { state: 'autoMany' });
      await shown(page, l);
      const first = await rows(page, l).first().innerText();
      await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
      await expect(page).toHaveURL(/[?&]page=2/);
      await expect(rows(page, l).first()).not.toHaveText(first);
      await page.goBack();
      await expect(page).not.toHaveURL(/[?&]page=/);
    });

    test(`@reload ${l.name}: filter, sort and page survive a reload, the search does not`, async ({ page }) => {
    test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
      const r = l.reload;
      const [fKey = '', fValue = ''] = r.filter.split('=');
      // The link brings the search with the filter, sort and page 2 (all past one page in autoMany); the helper proves the
      // search is adopted and gone after the reload while every kept key keeps its value.
      await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
        text: r.q,
        path: l.url,
        goto: { state: 'autoMany' },
        keep: { [fKey]: fValue, sort: r.sort, page: '2' },
        searched: async () => {
          await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText(`of ${r.found}`);
          await expect(rows(page, l)).toHaveCount(r.found - 50);
        },
        unsearched: async () => {
          await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText(`of ${r.rest}`);
          await expect(rows(page, l)).toHaveCount(r.rest - 50);
        },
        after: async () => {
          await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
        },
      });
    });

    test(`@no-match ${l.name}: a search that finds nothing says so; Clear filters brings the rows back`, async ({ page }) => {
      await gotoHub(page, l.url);
      await shown(page, l);
      const before = await rows(page, l).count();
      await page.getByRole('searchbox').fill('zzz');
      await expect(page.getByText(l.noMatch)).toBeVisible();
      await expect(page).not.toHaveURL(/[?&]q=/);
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page).not.toHaveURL(/[?&]q=/);
      await expect.poll(() => rows(page, l).count()).toBe(before);
    });
  });
}

test('a loop names its chat and links to that conversation on its computer', async ({ page }) => {
  await gotoHub(page, links.loops);
  const row = page.getByRole('table', { name: loopStrings.title }).locator('tbody tr').filter({ hasText: 'Check CI on main' });
  const chat = row.getByRole('link', { name: 'Keep main green' });
  await expect(chat).toHaveAttribute('href', /#\/ai\/c\/sess_ci\?computer=[^&]+&realm=global/);
});

// The loops error view carries the FAQ link inside the kit ErrorState (its secondary), and it opens the answer.
test('a loops list that cannot be read keeps its FAQ link, which opens the loops, TODOs and workflows answer', async ({ page }) => {
  await gotoHub(page, links.loops, { state: 'loopsFailed' });
  // The error view is the kit ErrorState (role alert); the link must be inside it, not anywhere on the page.
  const errorView = page.getByRole('alert').filter({ hasText: loopStrings['error.title'] });
  await expect(errorView).toBeVisible({ timeout: 20_000 });
  const more = errorView.getByRole('link', { name: loopStrings.more });
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByText(aiStrings['faq.autoKinds.a'])).toBeVisible();
});
