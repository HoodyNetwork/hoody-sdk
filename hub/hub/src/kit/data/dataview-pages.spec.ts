// Playwright: one functional spec for every kit data view on every page (the "one standard data
// view" rule). Nothing is listed by hand. The spec reads, from source at collection time:
// - each page folder whose code calls useDataView, with its path from page.ts;
// - its shots.ts states that need no action and no fixture state (the places its lists show),
//   plus those named *empty* that do have a state.
// In the browser, every DataTable driven by a view carries data-dataview (its search URL key,
// e.g. "accq") plus its sort and page keys, so the spec finds each view on each of those URLs
// and runs the same checks on it:
// - search narrows the rows and never writes its key (the typed text lives in the page, not the URL: a reload clears it,
//   Back from an opened row keeps it);
// - a filter chip narrows, writes a key and survives reload;
// - a header sorts, writes its key and survives reload;
// - paging writes its key and back/forward walks it;
// - nothing matching shows the kit no-match state, and Clear filters restores every row;
// - j/k move the active row, "." opens the row menu and Esc closes it, and a row whose Enter
//   navigates comes back with back (a row action may also open a window, a dialog or nothing);
// - an *empty* state shows the kit empty state, not a blank table.
// A new list page joins by drawing a DataTable with a view and having its usual shots. A page that
// keeps a data view but draws its own list (Logs) is listed and skipped. A page whose only view sits behind an
// action the URL does not keep (New realm's picker) is listed in BEHIND_ACTION with why. Computers' own list (/computers,
// key "q") is covered by computers/list.spec.ts and left out here.
import fs from 'node:fs';
import path from 'node:path';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '../strings.en.json';
import states from '../states/strings.en.json';
import table from './DataTable.strings.en.json';

const SRC = [path.resolve('hub/src'), path.resolve('src')].find((d) => fs.existsSync(path.join(d, 'pages'))) ?? path.resolve('hub/src');
const SKIP = [{ page: 'computers', key: 'q' }];
/** Pages whose only data view sits behind an action the URL does not keep, so no shots URL can reach it, each with
 *  why and where its view is covered instead. The test still opens their URLs and fails once one shows a view. */
const BEHIND_ACTION: Readonly<Record<string, string>> = {
  realms:
    'its computer picker is step 2 of New realm, past a typed name the URL never keeps (realms/shots.ts), and a reload returns to step 1, so URL state cannot apply; realms/page.spec.ts picks a computer in it',
};
const NOTHING = 'zzqx-no-such-thing-0';

interface Target {
  id: string;
  /** False when the page keeps a data view but draws its own list: the table checks do not apply. */
  table: boolean;
  /** URLs (hash paths) where the page's lists show. */
  urls: string[];
  /** URLs of *empty* fixture states: [path, state]. */
  empty: [string, string][];
  /** Why the dev server of this run does not serve the page, else undefined. */
  unserved?: string;
}

/** Why the run's dev server leaves the page out, as app/pages.ts visiblePages does (scripts/check.ts passes the same
 *  HUB_PAGE to Vite and to Playwright): '*' (the whole-Hub check) serves every page, a page id only that page, and none
 *  (a plain dev server) only ready pages, since the spec never adds ?preview=1. */
function unserved(id: string, status: string | undefined): string | undefined {
  const only = process.env.HUB_PAGE ?? '';
  if (only === '*') return undefined;
  if (only) return only === id ? undefined : `the dev server serves only ${only} (HUB_PAGE=${only})`;
  return status === 'ready' ? undefined : `${id} is ${status ?? 'unknown'}, and a dev server without HUB_PAGE serves ready pages only`;
}

/** Where the exported shots array opens: `export default [`, or the `[` of the array a named `export default shots` is
 *  declared with. Never simply the first `[`: a shots file may declare helper arrays first (billing's SEND steps), whose
 *  objects are steps, not shots. */
function shotsArrayStart(src: string): number {
  const direct = /export\s+default\s+\[/.exec(src);
  if (direct) return direct.index + direct[0].length - 1;
  const named = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(src);
  const decl = named && new RegExp(`\\b(?:const|let)\\s+${named[1]}\\b[^=]*=\\s*\\[`).exec(src);
  return decl ? decl.index + decl[0].length - 1 : src.indexOf('[');
}

/** Top-level `{ … }` objects of a shots.ts array, as text. */
function shotObjects(src: string): string[] {
  const out: string[] = [];
  const start = shotsArrayStart(src);
  let depth = 0;
  let from = -1;
  let quote = '';
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i);
    else if (c === '{') {
      if (depth === 0) from = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) out.push(src.slice(from, i + 1));
    } else if (c === ']' && depth === 0) break;
    if (i < 0) break;
  }
  return out;
}

const field = (obj: string, name: string) => new RegExp(`\\b${name}:\\s*(['"])(.*?)\\1`).exec(obj)?.[2];

/** Some non-test source file of the page folder matches every pattern. */
function sourceHas(dir: string, ...patterns: RegExp[]): boolean {
  const walk = (d: string): boolean =>
    fs.readdirSync(d, { withFileTypes: true }).some((e) => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      if (!/\.tsx?$/.test(e.name) || /\.(test|spec)\.tsx?$/.test(e.name)) return false;
      const text = fs.readFileSync(f, 'utf8');
      return patterns.every((re) => re.test(text));
    });
  return walk(dir);
}
const usesDataView = (dir: string) => sourceHas(dir, /\buseDataView\s*[<(]/);
/** The page shows a view through the kit table (a page may keep the view's URL state and draw its own list, like Logs). */
const drawsDataTable = (dir: string) => sourceHas(dir, /<DataTable\b/, /\bview=\{/);

function targets(): Target[] {
  const pages = path.join(SRC, 'pages');
  const out: Target[] = [];
  for (const id of fs.readdirSync(pages).sort()) {
    const dir = path.join(pages, id);
    const manifest = path.join(dir, 'page.ts');
    if (!fs.existsSync(manifest) || !usesDataView(dir)) continue;
    const base = field(fs.readFileSync(manifest, 'utf8'), 'path');
    if (!base) continue;
    const urls = new Set<string>([base]);
    const empty: [string, string][] = [];
    const shotsFile = path.join(dir, 'shots.ts');
    if (fs.existsSync(shotsFile)) {
      for (const obj of shotObjects(fs.readFileSync(shotsFile, 'utf8'))) {
        const name = field(obj, 'name') ?? '';
        const state = field(obj, 'state');
        const sub = field(obj, 'path') ?? '';
        if (/\b(click|keys|act|realm|computer):/.test(obj)) continue;
        if (state) {
          if (/empty/i.test(name)) empty.push([base + sub, state]);
          continue;
        }
        urls.add(base + sub);
      }
    }
    out.push({ id, table: drawsDataTable(dir), urls: [...urls], empty, unserved: unserved(id, field(fs.readFileSync(manifest, 'utf8'), 'status')) });
  }
  return out;
}

const params = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');
const rowsOf = (v: Locator) => v.locator('tbody tr[data-row-id]');
const viewByKey = (page: Page, key: string) => page.locator(`[data-dataview="${key}"]:not([data-dataview-empty])`);

/** A real load of the URL (a hash-only goto would keep the previous step's state). */
async function fresh(page: Page, url: string, opts?: Parameters<typeof gotoHub>[2]): Promise<void> {
  // A load on a busy dev server can abort or stall; one retry tells that from a page that never loads.
  for (let attempt = 0; ; attempt++) {
    try {
      await gotoHub(page, url, opts);
      await reload(page);
      return;
    } catch (e) {
      if (attempt > 0) throw e;
    }
  }
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.locator('#hub-main').waitFor();
}

/** Back or forward; a hash navigation the app rewrites at once can report an aborted load, which is not a failure. */
async function history(page: Page, dir: 'back' | 'forward'): Promise<void> {
  await (dir === 'back' ? page.goBack() : page.goForward()).catch((e: Error) => {
    if (!/ERR_ABORTED|frame was detached/.test(e.message)) throw e;
  });
}

/** Enter on the focused row; true when it navigated (a row action may also open a window or a dialog, or do nothing). */
async function enterNavigates(page: Page): Promise<boolean> {
  const at = page.url();
  await page.keyboard.press('Enter');
  return expect
    .poll(() => page.url(), { timeout: 2000 })
    .not.toBe(at)
    .then(() => true, () => false);
}

/** Let the view settle: the rows stop changing. */
async function settle(v: Locator): Promise<number> {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const n = await rowsOf(v).count();
    if (n === last) return n;
    last = n;
    await v.page().waitForTimeout(150);
  }
  return last;
}

async function checkSearch(page: Page, key: string, url: string): Promise<void> {
  const v = viewByKey(page, key);
  const box = v.getByRole('searchbox');
  if ((await box.count()) === 0) return;
  const before = await settle(v);
  if (before === 0) return;
  // A word from the first row that the search finds (its search fields are the page's choice).
  const words = ((await rowsOf(v).first().innerText()).match(/[\p{L}\p{N}][\p{L}\p{N}._-]{2,}/gu) ?? []).slice(0, 8);
  let found = '';
  for (const w of words) {
    await box.fill(w);
    const n = await settle(v);
    expect(params(page).get(key), `search never writes ?${key}=`).toBeNull();
    if (n > 0) {
      expect(n, 'search never adds rows').toBeLessThanOrEqual(before);
      found = w;
      break;
    }
  }
  expect(found, `search finds the first row by one of its words (${words.join(', ')})`).not.toBe('');
  await reload(page);
  await expect(viewByKey(page, key).getByRole('searchbox'), 'search does not survive a reload').toHaveValue('');
  expect(params(page).get(key), `a reload leaves no ?${key}=`).toBeNull();
  // Back/forward through an opened row never brings the search back into the URL, and Back shows the same search: the
  // list's own history entry holds it (history.state, never the address), whether the list stayed mounted or not.
  await viewByKey(page, key).getByRole('searchbox').fill(found);
  await settle(viewByKey(page, key));
  const opener = rowsOf(viewByKey(page, key)).first();
  if ((await opener.getAttribute('data-row-opens')) !== null) {
    await opener.focus();
    const at = page.url();
    if (await enterNavigates(page)) {
      await history(page, 'back');
      await expect(viewByKey(page, key).getByRole('searchbox'), 'back returns to the list').toBeVisible();
      expect(params(page).get(key), `back leaves no ?${key}=`).toBeNull();
      await expect(viewByKey(page, key).getByRole('searchbox'), 'back shows the same search').toHaveValue(found);
      await history(page, 'forward');
      await expect.poll(() => page.url(), { message: 'forward reopens the row' }).not.toBe(at);
    }
  }
  await fresh(page, url);
}

async function checkNoMatch(page: Page, key: string): Promise<void> {
  const v = viewByKey(page, key);
  const box = v.getByRole('searchbox');
  if ((await box.count()) === 0) return;
  const before = await settle(v);
  await box.fill(NOTHING);
  // The title names the page's noun; the body and the Clear filters button are the kit's own.
  await expect(v.getByText(states['recipe.noMatch.body']), 'nothing matching shows the kit no-match state').toBeVisible();
  await v.getByRole('button', { name: states['recipe.noMatch.clear'], exact: true }).click();
  expect(params(page).get(key), `no-match search never writes ?${key}=`).toBeNull();
  await expect(box, 'Clear filters empties the search').toHaveValue('');
  await expect.poll(() => settle(v), { message: 'Clear filters restores every row' }).toBe(before);
}

async function checkFilter(page: Page, key: string): Promise<void> {
  const v = viewByKey(page, key);
  const group = v.getByRole('group', { name: kit['table.filters'], exact: true });
  if ((await group.count()) === 0) return;
  const chip = group.locator('[data-chip] > button').first();
  if ((await chip.count()) === 0) return;
  const before = await settle(v);
  const keysBefore = [...params(page).keys()];
  await chip.click();
  // The spec knows no page's options: any one real option proves the chip filters and writes its key.
  const option = page.getByRole('menu').getByRole('menuitemradio').filter({ hasNotText: kit['table.filterAny'] }).first(); // any one option proves the filter works
  const multi = page.getByRole('menu').getByRole('menuitemcheckbox').first(); // any one option proves the filter works
  if (await option.isVisible().catch(() => false)) await option.click();
  else if (await multi.isVisible().catch(() => false)) {
    await multi.click();
    await page.keyboard.press('Escape');
  } else {
    // A range filter (its own panel): out of scope for the generic check.
    await page.keyboard.press('Escape');
    return;
  }
  const prefix = key.slice(0, -1);
  await expect
    .poll(() => [...params(page).keys()].filter((k) => k.startsWith(prefix) && !keysBefore.includes(k)).length, { message: 'a filter writes its URL key' })
    .toBeGreaterThan(0);
  const n = await settle(v);
  expect(n, 'a filter never adds rows').toBeLessThanOrEqual(before);
  const url = page.url();
  await reload(page);
  expect(page.url(), 'a filter survives a reload').toBe(url);
  await expect.poll(() => settle(viewByKey(page, key)), { message: 'the same rows after a reload' }).toBe(n);
}

async function checkSort(page: Page, key: string): Promise<void> {
  const v = viewByKey(page, key);
  const sortKey = (await v.getAttribute('data-dataview-sort')) ?? '';
  const all = v.locator('thead th');
  const sortable = await all.evaluateAll((ths) => ths.findIndex((th) => th.getAttribute('aria-sort') === 'none'));
  if (sortable < 0) return;
  const header = all.nth(sortable);
  const was = params(page).get(sortKey);
  await header.getByRole('button').click();
  await expect.poll(() => params(page).get(sortKey), { message: `a header writes ?${sortKey}=` }).not.toBe(was);
  await expect(header, 'the header shows its direction').toHaveAttribute('aria-sort', /ascending|descending/);
  const sorted = params(page).get(sortKey);
  await reload(page);
  expect(params(page).get(sortKey), 'the sort survives a reload').toBe(sorted);
  await expect(viewByKey(page, key).locator('thead th[aria-sort="ascending"], thead th[aria-sort="descending"]').first(), 'the sorted header after a reload').toBeVisible();
}

async function checkPaging(page: Page, key: string): Promise<void> {
  const v = viewByKey(page, key);
  const pageKey = (await v.getAttribute('data-dataview-page')) ?? '';
  const next = v.getByRole('navigation', { name: table['pager.label'] }).getByRole('button', { name: table['pager.next'] });
  if ((await next.count()) === 0 || (await next.isDisabled())) return;
  await next.click();
  await expect.poll(() => params(page).get(pageKey), { message: `the pager writes ?${pageKey}=2` }).toBe('2');
  await history(page, 'back');
  await expect.poll(() => params(page).get(pageKey), { message: 'back returns to page 1' }).toBeNull();
  await history(page, 'forward');
  await expect.poll(() => params(page).get(pageKey), { message: 'forward returns to page 2' }).toBe('2');
}

async function checkKeys(page: Page, key: string): Promise<void> {
  const v = viewByKey(page, key);
  const rows = rowsOf(v);
  if ((await settle(v)) < 2) return;
  await rows.first().focus();
  await page.keyboard.press('j');
  await expect(rows.nth(1), 'j moves the active row down').toBeFocused();
  await page.keyboard.press('k');
  await expect(rows.first(), 'k moves it back up').toBeFocused();
  if ((await rows.first().locator('[data-row-menu] button').count()) > 0) {
    await page.keyboard.press('.');
    const menu = page.getByRole('menu');
    await expect(menu, '"." opens the row menu').toBeVisible();
    await expect.poll(() => menu.evaluate((m) => m.contains(document.activeElement)), { message: 'the row menu takes focus' }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu'), 'Esc closes the row menu').toBeHidden();
  }
  if ((await rows.first().getAttribute('data-row-opens')) !== null) {
    await rows.first().focus();
    const at = page.url();
    // Enter runs the row's action; when that navigates, back returns to the list.
    if (await enterNavigates(page)) {
      await history(page, 'back');
      await expect.poll(() => page.url(), { message: 'back returns to the list after Enter' }).toBe(at);
    }
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

const ALL = targets();

test('the spec finds the data-view pages from source', () => {
  expect(ALL.length, 'at least one page uses useDataView').toBeGreaterThan(0);
});

for (const t of ALL.filter((x) => !x.table)) {
  test(`@dataview ${t.id}: keeps a data view but draws its own list (the table checks do not apply)`, () => {
    test.info().annotations.push({ type: 'own list', description: `${t.id} calls useDataView without a kit DataTable view` });
  });
}

/**
 * Which URL owns each view, per page, kept for the whole run in a file (worker memory would not survive the restart a
 * failed test causes). A view is checked on the first of the page's URLs that showed it: a later URL, where it may sit
 * under a drawer (Programs' apps list on launch=1), skips it. A page's tests run in order, one at a time (mode
 * 'default'), so each page's file (per run, project and repetition) has one writer at a time. `looked` lists the URL indexes whose views were read; an
 * earlier URL missing from it (its test failed before reading them) is unknown, and its views are checked where they
 * next show.
 */
interface Claims {
  owners: Record<string, number>;
  looked: number[];
}
// Per run (the runner's pid, shared by every worker it starts, replacements included), project and repetition: copies of a
// page's tests made by --repeat-each may run at the same time, and each keeps its own file.
const claimsPath = (id: string) => {
  const info = test.info();
  return path.join(info.project.outputDir, `.dataview-claims-${process.ppid}`, `${info.project.name || 'default'}-${info.repeatEachIndex}`, `${id}.json`);
};
function readClaims(id: string): Claims {
  try {
    return JSON.parse(fs.readFileSync(claimsPath(id), 'utf8')) as Claims;
  } catch {
    return { owners: {}, looked: [] };
  }
}
function writeClaims(id: string, c: Claims): void {
  const file = claimsPath(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(c));
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
}

interface ViewNow {
  key: string;
  shown: boolean;
  /** Draws the kit empty state (data-dataview-empty). */
  empty: boolean;
  rows: number;
  /** Its first h2 or p with text is shown: a state is drawn (any one line of text proves it), read with the rest so the
   *  check never looks the view up again (a twin with its key, or a view added or moved since, cannot stand in). */
  state: boolean;
}
/** Every data view on the page, read in one go in the page. Never one Locator handle per view read later: a re-render
 *  between reads (a loading list giving way to a zero state, computers emptyExpired) leaves a handle to a removed node,
 *  and reading it waits out the test's limit. shown is Playwright's visible: a non-empty box, not visibility hidden. */
const viewsNow = (page: Page): Promise<ViewNow[]> =>
  page.locator('[data-dataview]').evaluateAll((els) =>
    els.map((el) => {
      const shown = (n: Element) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
      };
      const line = [...el.querySelectorAll('h2, p')].find((n) => /\S/.test(n.textContent ?? ''));
      return {
        key: el.getAttribute('data-dataview') ?? '',
        shown: shown(el),
        empty: el.hasAttribute('data-dataview-empty'),
        rows: el.querySelectorAll('tbody tr[data-row-id]').length,
        state: !!line && shown(line),
      };
    }),
  );
/** The page's data views once two reads 150 ms apart agree (at most 20 reads, as settle), so a list still loading or
 *  being replaced is not read mid-change. Callers wait 300 ms first, as before, so a view drawn a little after the first
 *  is still found. */
async function stableViews(page: Page): Promise<ViewNow[]> {
  let last = '';
  let views: ViewNow[] = [];
  for (let i = 0; i < 20; i++) {
    views = await viewsNow(page);
    const now = JSON.stringify(views);
    if (now === last) break;
    last = now;
    await page.waitForTimeout(150);
  }
  return views;
}

/** The page's data views shown now (keys), after the load has had its chance to draw them. */
async function shownViews(page: Page, id: string): Promise<string[]> {
  // A loaded page draws its views; a URL that shows none (a detail, a tab) waits out the bound.
  await page.locator('[data-dataview]').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  return (await stableViews(page)).filter((v) => v.shown && !v.empty && !SKIP.some((s) => s.page === id && s.key === v.key)).map((v) => v.key);
}

// One test per URL: a hung load on a busy dev server fails only its own URL, within its own limit,
// not the whole page.
for (const t of ALL.filter((x) => x.table)) {
  test.describe(`@dataview ${t.id}`, () => {
    test.describe.configure({ mode: 'default' });
    // A page this run's dev server leaves out cannot load: its tests skip with the reason, never fail.
    test.skip(!!t.unserved, `not served: ${t.unserved}`);
    for (const [n, url] of t.urls.entries()) {
      test(`${url}: search, filter, sort, paging, URL state, no-match and keys on every data view`, async ({ page }) => {
        test.setTimeout(240_000);
        page.setDefaultNavigationTimeout(45_000);
        await fresh(page, url);
        const shown = [...new Set(await shownViews(page, t.id))];
        const c = readClaims(t.id);
        // Views an earlier URL already owns are checked there; the rest are this URL's.
        const here = shown.filter((key) => !((c.owners[key] ?? Infinity) < n));
        for (const key of here) c.owners[key] = n;
        c.looked = [...new Set([...c.looked, n])];
        writeClaims(t.id, c);
        const unknown = t.urls.slice(0, n).filter((_, j) => !c.looked.includes(j));
        if (unknown.length) test.info().annotations.push({ type: 'unknown earlier URLs', description: unknown.join(' ') });
        for (const [i, key] of here.entries()) {
          const label = `${t.id} ${url} [${key}]`;
          await test.step(`${label}: search and URL state`, async () => {
            // The first view starts on the load that found it; each later one on a fresh load.
            if (i > 0) await fresh(page, url);
            await checkSearch(page, key, url);
          });
          await test.step(`${label}: no-match`, () => checkNoMatch(page, key));
          await test.step(`${label}: filter`, async () => {
            await fresh(page, url);
            await checkFilter(page, key);
          });
          await test.step(`${label}: sort`, async () => {
            await fresh(page, url);
            await checkSort(page, key);
          });
          await test.step(`${label}: paging`, async () => {
            await fresh(page, url);
            await checkPaging(page, key);
          });
          await test.step(`${label}: keys`, async () => {
            await fresh(page, url);
            await checkKeys(page, key);
          });
        }
        test.info().annotations.push({ type: 'views', description: here.join(', ') });
      });
    }

    for (const [url, state] of t.empty) {
      test(`${url} (${state}): the empty state`, async ({ page }) => {
        test.setTimeout(120_000);
        page.setDefaultNavigationTimeout(45_000);
        await fresh(page, url, { state });
        await page.waitForTimeout(300);
        // The fixture may empty only one of the page's lists: every view with no rows shows a state.
        // Polled as the old per-view toBeVisible was (a state may draw a little after the rows settle); each poll is one
        // whole read, so a blank view is judged by its own state, never by a twin's.
        // Bounded (10 s, well inside the test's 120 s); a failure lists each blank view as key@position, its place among
        // the page's [data-dataview] elements in that read.
        const blank = async () =>
          (await stableViews(page)).flatMap((v, at) => (v.shown && !v.empty && v.rows === 0 && !v.state ? [`${v.key}@${at}`] : []));
        await expect
          .poll(blank, { timeout: 10_000, message: 'every view with no rows shows a state, not a blank table (listed: key@position of each blank view)' })
          .toEqual([]);
      });
    }

    // Runs after the page's URL tests. A view they saw proves the page shows one (a key is claimed only once its view
    // showed), and fails a BEHIND_ACTION page. Otherwise (the URL tests ran in another run, or saw nothing) it opens the
    // page's URLs itself until one shows a data view; for a BEHIND_ACTION page it opens them all and expects none.
    test('a shots URL shows a data view (or, for a page in BEHIND_ACTION, none does)', async ({ page }) => {
      test.setTimeout(240_000);
      page.setDefaultNavigationTimeout(45_000);
      const known = Object.keys(readClaims(t.id).owners);
      const behind = BEHIND_ACTION[t.id];
      if (behind) expect(known, `${t.id}'s URL tests saw a data view: drop it from BEHIND_ACTION`).toEqual([]);
      else if (known.length) {
        test.info().annotations.push({ type: 'views', description: `seen by the URL tests: ${known.join(', ')}` });
        return;
      }
      const shown: string[] = [];
      for (const url of t.urls) {
        await fresh(page, url);
        for (const key of await shownViews(page, t.id)) shown.push(`${url} [${key}]`);
        if (shown.length && !BEHIND_ACTION[t.id]) break;
      }
      test.info().annotations.push({ type: 'views', description: shown.join(', ') });
      if (behind) {
        test.info().annotations.push({ type: 'behind action', description: behind });
        expect(shown, `${t.id} now shows a data view on a shots URL: drop it from BEHIND_ACTION`).toEqual([]);
        return;
      }
      expect(shown.length, `${t.id} calls useDataView, so one of its shots URLs (${t.urls.join(' ')}) shows a data view`).toBeGreaterThan(0);
    });
  });
}
