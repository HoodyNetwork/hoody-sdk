// Playwright: the API page at phone width (run by hub:check --page api). The functional e2e of a list page (search,
// the service chip, sort, reload keeps state, no-match; one scrolled list whose group header sticks, in place
// of paging), the services as closed categories over their resources at 1350 and 390, every method tag whole
// (CHECKAUTH, PROPPATCH), then: a row opens its example, Copy puts the whole
// snippet on the clipboard, and the catalog is its own chunk, fetched only when the page opens (the Hub's first load
// never carries it).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings['list.label'] });
const dataRows = (page: Page) => table(page).locator('tbody tr');
// The endpoint rows only: the list is grouped by service over tag, and a group's head row is a disclosure button.
const endpointRows = (page: Page) => dataRows(page).filter({ hasNot: page.locator('button[aria-expanded]') });
/** In the page: the group head row drawn nearest the column header's bottom sits right under it (2 px), and a row of
 *  its own group (after it in the DOM, before the next head) is scrolled under it: only a stuck head has its own rows
 *  above it on screen. The heads are the services; a service's resources (their headers and rows) are its own. */
const stuckHead = (table: HTMLTableElement) => {
  // The header cells stick, not the thead (which scrolls away with the table): measure a cell.
  const below = table.tHead!.rows[0]!.cells[0]!.getBoundingClientRect().bottom;
  const trs = [...table.tBodies[0]!.rows].filter((tr) => tr.getAttribute('aria-hidden') !== 'true');
  const heads = trs.filter((tr) => tr.querySelector('[aria-expanded]') && tr.dataset.groupDepth !== '1');
  const top = (tr: HTMLTableRowElement) => tr.cells[0]!.getBoundingClientRect().top;
  const head = heads.reduce((a, b) => (Math.abs(top(b) - below) < Math.abs(top(a) - below) ? b : a));
  const own = trs.slice(trs.indexOf(head) + 1);
  const next = own.findIndex((tr) => heads.includes(tr));
  const rows = next < 0 ? own : own.slice(0, next);
  return { underHeader: Math.abs(top(head) - below) <= 2, rowsScrolledUnder: rows.some((tr) => top(tr) < top(head) - 4) };
};
/** In the page: the service header stuck right under the column header (2 px), the resource header stuck right under
 *  it, and whether a row of that resource is scrolled under them (only stuck headers have their own rows above them on
 *  screen). Self-contained: Playwright sends only its source. */
const stuckPair = (table: HTMLTableElement) => {
  // The header cells stick, not the thead (which scrolls away with the table): measure a cell.
  const below = table.tHead!.rows[0]!.cells[0]!.getBoundingClientRect().bottom;
  const trs = [...table.tBodies[0]!.rows].filter((tr) => tr.getAttribute('aria-hidden') !== 'true');
  const box = (tr: HTMLTableRowElement) => tr.cells[0]!.getBoundingClientRect();
  const heads = trs.filter((tr) => tr.querySelector('[aria-expanded]'));
  const label = (tr: HTMLTableRowElement | undefined) => tr?.querySelector('[aria-expanded]')?.textContent ?? '';
  const parent = heads.filter((tr) => tr.dataset.groupDepth !== '1' && Math.abs(box(tr).top - below) <= 2).at(-1);
  const child = parent ? heads.filter((tr) => tr.dataset.groupDepth === '1' && Math.abs(box(tr).top - box(parent).bottom) <= 2).at(-1) : undefined;
  const own = child ? trs.slice(trs.indexOf(child) + 1) : [];
  const next = own.findIndex((tr) => heads.includes(tr));
  const rows = next < 0 ? own : own.slice(0, next);
  return { parent: label(parent), child: label(child), rowsScrolledUnder: !!child && rows.some((tr) => box(tr).top < box(child).top - 4) };
};
/** In the page: each endpoint row's method tag (the Tag whose words are the method, in the table's Method cell or the
 *  list row's line 1) that is cut: its words past the tag's own box (scrolled), or the tag's border box past the side
 *  clip of any box above it up to the document (the cell's padding edge, then every box whose overflow-x is not visible:
 *  the row, the table and its scroller), as `METHOD side tag>clip`. Sideways only: the virtual list draws overscan rows
 *  past the scroller's bottom on purpose; a row that must be on screen is asserted with toBeInViewport. Self-contained:
 *  Playwright sends only its source. */
const methodsCut = (trs: Element[]) =>
  trs.flatMap((tr) => {
    // A virtual list's spacer rows hold no endpoint.
    if (!(tr as HTMLElement).dataset.rowId) return [];
    const tag = [...tr.querySelectorAll<HTMLElement>('span')].find((el) => /^[A-Z]{3,}$/.test(el.textContent ?? '') && el.children.length === 0 && getComputedStyle(el).borderTopStyle !== 'none');
    if (!tag) return ['no method tag'];
    const word = tag.textContent;
    const box = tag.getBoundingClientRect();
    const cut: string[] = [];
    if (tag.scrollWidth > tag.clientWidth + 1) cut.push(`${word} scroll ${tag.scrollWidth}>${tag.clientWidth}`);
    for (let el: HTMLElement | null = tag.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const isCell = el.tagName === 'TD';
      if (cs.overflowX === 'visible' && !isCell) continue;
      const r = el.getBoundingClientRect();
      // The clip: a cell's padding edge; any other box's padding box (inside its border, beside its scrollbar).
      const left = isCell ? r.left + parseFloat(cs.paddingLeft) : r.left + el.clientLeft;
      const right = isCell ? r.right - parseFloat(cs.paddingRight) : r.left + el.clientLeft + el.clientWidth;
      if (box.left < left - 0.5) cut.push(`${word} left ${box.left}<${left}`);
      if (box.right > right + 0.5) cut.push(`${word} right ${box.right}>${right}`);
    }
    return cut;
  });
const catalogChunk = (url: string) => /catalog\.gen/.test(url);
// The first row waits for the catalog, its own lazy chunk (about 330 KB of JSON), so it gets longer than an ordinary wait.
const endpointsLoaded = (page: Page) => expect(dataRows(page).first()).toBeVisible({ timeout: 30_000 });

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });

test('@search the search box narrows the endpoints and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/api');
  await endpointsLoaded(page);
  // The search stays out of the URL, proved by the shared helper. 'waitlist' is only the two public waitlist endpoints of the account API.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'waitlist',
    searched: async () => {
      await expect(endpointRows(page)).toHaveCount(2);
      for (const row of await endpointRows(page).all()) await expect(row).toContainText(/waitlist/i);
    },
  });
});

// The chip bar and the column headers are the desktop table's (at phone width the list is rows, filters in a sheet),
// and an open endpoint covers the list on a phone.
test.describe('at desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

  test('@filter the service chip keeps one service and ?service', async ({ page }) => {
    await gotoHub(page, '/api');
    await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['filter.service'] }).click();
    await page.getByRole('menuitemradio', { name: strings['svc.notes'] }).or(page.getByRole('menuitem', { name: strings['svc.notes'] })).click();
    await expect(page).toHaveURL(/[?&]service=notes/);
    await expect.poll(() => endpointRows(page).count()).toBeGreaterThan(0);
    for (const row of await endpointRows(page).all()) await expect(row).toContainText(/notes/i);
  });

  test('@sort the path header sorts the endpoints and keeps ?sort', async ({ page }) => {
    await gotoHub(page, '/api?service=api');
    const header = table(page).getByRole('columnheader', { name: strings['col.path'] });
    await header.getByRole('button').click();
    await expect(page).toHaveURL(/[?&]sort=-?path/);
    await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  });

  test('@reload service, sort and the open endpoint survive a reload, the search does not', async ({ page }) => {
    // The link brings the search with the service chip, the sort and an open endpoint; the helper proves the search is
    // adopted and gone after the reload while every kept key keeps its value. 'waitlist' is not in the open endpoint,
    // and only the two waitlist endpoints match it.
    await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox'), kind: 'scroll' }, {
      text: 'waitlist',
      path: '/api',
      keep: { service: 'api', sort: 'path', op: 'api_listAuthTokens' },
      searched: async () => {
        await endpointsLoaded(page);
        await expect(endpointRows(page)).toHaveCount(2);
        for (const row of await endpointRows(page).all()) await expect(row).toContainText(/waitlist/i);
      },
      unsearched: async () => {
        await endpointsLoaded(page);
        await expect.poll(() => endpointRows(page).count()).toBeGreaterThan(2);
      },
      after: async () => {
        await expect(page.getByRole('figure', { name: / example$/ })).toContainText('/api/v1/auth/tokens');
      },
    });
  });
});

// No pager. One list; scrolled into a group, its header sticks under the column header.
test.describe('one scrolled list, at desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

  test('@sticky no pager; scrolled far into a service its header and the resource\'s stay drawn under the column header', async ({ page }) => {
    // The service filter opens the Agent service (with no search or filter every service starts closed).
    await gotoHub(page, '/api?service=agent');
    await endpointsLoaded(page);
    await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);
    const scroller = table(page).locator('xpath=..');
    await scroller.evaluate((el) => { el.scrollTop = 3000; });
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(2000);
    await expect.poll(() => table(page).evaluate(stuckHead)).toMatchObject({ underHeader: true, rowsScrolledUnder: true });
    // And the resource in force sticks right under its service.
    await expect.poll(() => table(page).evaluate(stuckPair)).toMatchObject({ parent: expect.stringMatching(new RegExp(`^${strings['svc.agent']}`)), child: expect.stringMatching(/\S/), rowsScrolledUnder: true });
  });

  test('@export the operation list downloads as JSON with only the public index fields', async ({ page }) => {
    await gotoHub(page, '/api');
    await endpointsLoaded(page);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: strings['export.label'] }).click()]);
    expect(file.suggestedFilename()).toBe('hoody-api-operations.json');
    const body = await (await file.createReadStream()).toArray();
    const text = Buffer.concat(body).toString('utf8');
    const list = JSON.parse(text) as { count: number; operations: { id: string; method: string }[] };
    expect(list.count).toBe(list.operations.length);
    expect(list.operations.some((o) => o.id === 'api_listAuthTokens')).toBe(true);
    expect(text).not.toMatch(/:\/\/|"hosts"|"accountBase"/);
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the endpoints', async ({ page }) => {
  await gotoHub(page, '/api');
  await endpointsLoaded(page);
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(page.getByText(strings['list.noMatch'])).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

// With no search or filter, every service is a closed category with its resource and endpoint counts; a press
// opens it on its resources, and a second closes it again. At 1350 and 390.
for (const width of [1350, 390]) {
  test.describe(`at ${width}`, () => {
  test.use(width > 600 ? { viewport: { width, height: 900 }, hasTouch: false, isMobile: false } : { viewport: { width, height: 900 } });
  test(`@categories the services start closed with their counts, and a press opens one (${width})`, async ({ page }) => {
    await gotoHub(page, '/api');
    await endpointsLoaded(page);
    const heads = table(page).locator('tbody button[aria-expanded]');
    await expect(heads).toHaveCount(21);
    await expect(table(page).locator('tbody button[aria-expanded="true"]')).toHaveCount(0);
    await expect(endpointRows(page)).toHaveCount(0);
    const agent = heads.filter({ hasText: new RegExp(`^${strings['svc.agent']}\\s*\\d+ resources · \\d+ endpoints$`) });
    await expect(agent).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath(`categories-${width}.png`) });
    await agent.click();
    await expect(agent).toHaveAttribute('aria-expanded', 'true');
    await expect(table(page).locator('tr[data-group-depth="1"]').first()).toBeVisible(); // reason: the service's first resource header
    await expect(endpointRows(page).filter({ hasText: '/api/v1/agent/logs/export' })).toBeVisible();
    // Under two indents each method tag still shows whole.
    await expect.poll(() => endpointRows(page).evaluateAll(methodsCut)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`categories-open-${width}.png`) });
    await agent.click();
    await expect(endpointRows(page)).toHaveCount(0);
  });
  });
}

// The Method column fits the longest verb shown, so the WebDAV and kit verbs (CHECKAUTH,
// PROPPATCH: the longest in the catalog) show whole under the two indents, in the table at 1350 and the list at 390.
for (const width of [1350, 390]) {
  test.describe(`at ${width} `, () => {
  test.use(width > 600 ? { viewport: { width, height: 900 }, hasTouch: false, isMobile: false } : { viewport: { width, height: 900 } });
  test(`@method-fit the longest verbs show whole (${width})`, async ({ page }) => {
    await gotoHub(page, '/api');
    await endpointsLoaded(page);
    for (const [id, verb] of [['files_checkAuth', 'CHECKAUTH'], ['files_proppatchResource', 'PROPPATCH']] as const) {
      await page.getByRole('searchbox').fill(id);
      await expect(endpointRows(page)).toHaveCount(1);
      await expect(endpointRows(page)).toContainText(verb);
      await expect.poll(() => endpointRows(page).evaluateAll(methodsCut)).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`method-${verb}-${width}.png`) });
    }
    // With every endpoint in the list (no search), the column holds the longest verb too: the Files service opened.
    await page.getByRole('searchbox').fill('');
    await table(page).locator('tbody button[aria-expanded]').filter({ hasText: new RegExp(`^${strings['svc.files']}\\s*\\d`) }).click();
    // Its CHECKAUTH row is far down the virtual list: scroll the list's scroller (at 390 the page's main) to it.
    const checkAuth = endpointRows(page).filter({ hasText: 'CHECKAUTH' });
    for (let i = 0; i < 60 && (await checkAuth.count()) === 0; i++) {
      await table(page).evaluate((t) => {
        let el: HTMLElement | null = t.parentElement;
        while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) el = el.parentElement;
        (el ?? document.scrollingElement as HTMLElement).scrollBy(0, 500);
      });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the virtual rows redraw
    }
    await expect(checkAuth).toHaveCount(1);
    // Drawn on screen, not an overscan row below the fold.
    await checkAuth.scrollIntoViewIfNeeded();
    await expect(checkAuth.getByText('CHECKAUTH', { exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => checkAuth.evaluateAll(methodsCut)).toEqual([]);
  });
  });
}

// Between those widths the table keeps its columns at their floors, so the Method floor holds the longest verb
// (nested lead included) and, too narrow for it, the page shows the list. Every width across the table-or-list switch
// shows CHECKAUTH whole, and the sweep sees both presentations.
test.describe('across the table-or-list switch', () => {
  test.use({ viewport: { width: 1200, height: 900 }, hasTouch: false, isMobile: false });
  test('@method-fit CHECKAUTH shows whole at every width across the switch', async ({ page }) => {
    await gotoHub(page, '/api');
    await endpointsLoaded(page);
    await page.getByRole('searchbox').fill('files_checkAuth');
    await expect(endpointRows(page)).toHaveCount(1);
    const seen = new Set<string>();
    for (let width = 1200; width >= 380; width -= 16) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const shown = (await table(page).getByRole('columnheader', { name: strings['col.method'] }).count()) > 0 ? 'table' : 'list';
      seen.add(shown);
      await expect(endpointRows(page)).toContainText('CHECKAUTH');
      await expect.poll(() => endpointRows(page).evaluateAll(methodsCut), { message: `${shown} at ${width}` }).toEqual([]);
    }
    expect([...seen].sort()).toEqual(['list', 'table']);
  });
});

test('@expand a row opens its example, and Copy puts the whole snippet on the clipboard', async ({ page }) => {
  await gotoHub(page, '/api');
  await page.getByRole('searchbox').fill('api_listAuthTokens');
  await dataRows(page).filter({ hasText: '/api/v1/auth/tokens' }).first().click();
  await expect(page).toHaveURL(/[?&]op=api_listAuthTokens/);
  const code = page.getByRole('figure', { name: / example$/ });
  await expect(code).toContainText('Bearer $HOODY_TOKEN');
  await code.getByRole('button', { name: 'Copy all' }).click();
  const copied = await page.evaluate(() => Promise.race([navigator.clipboard.readText(), new Promise<string>((_, no) => setTimeout(() => no(new Error('clipboard read timed out')), 3000))]));
  expect(copied).toContain('https://api.hoody.com/api/v1/auth/tokens');
  expect(copied).toContain('Bearer $HOODY_TOKEN');
});

test('@lazy the catalog chunk loads only when the API page opens', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', (r) => { if (catalogChunk(r.url())) fetched.push(r.url()); });
  await gotoHub(page, '/guide');
  await page.locator('#hub-main').waitFor();
  expect(fetched).toEqual([]);
  await gotoHub(page, '/api');
  await endpointsLoaded(page);
  expect(fetched.length).toBeGreaterThan(0);
});
