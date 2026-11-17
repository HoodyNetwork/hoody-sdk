// Playwright: one axe pass over every page the Hub's router serves. Each page opens in its default
// fixture state at 1440 in light; once its own slot shows, settled and with no page error, axe judges the whole document
// (page and shell) with only the rules the Hub's scoped axe specs already enforce: WCAG 2.0/2.1/2.2 A and AA, plus
// label-content-name-mismatch and empty-table-header, which those specs turn on by name. Each violating node counts once
// under its rule, tag, words and place; a page's counts must equal KNOWN
// fix: one more node is unlisted, one fewer is fixed (its entry must shrink), and both fail. A second pass opens every page at
// 390 on a coarse pointer (touch, mobile), where target-size judges the touch sizes: its counts must equal KNOWN_COARSE.
// The pages: Playwright collects tests in Node, where the router's import.meta.glob cannot run, so the walk is read from
// the same sources (every pages/<id>/page.ts, plus the kit gallery), and a test checks it against the router's own list
// (discoverPages + visiblePages, imported in the browser), so a page the walk misses fails.
// Runs in the whole-Hub hub:check e2e step (playwright.config matches only pages/, kit/ and shell/ specs): this file's
// tests run one at a time, a failure skipping none. AXE_PROBE=<file> appends findings instead of asserting (to redraw KNOWN and KNOWN_COARSE;
// each row names its pass, vp '1440' or '390c').
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';

const SRC = [path.resolve('hub/src'), path.resolve('src')].find((d) => fs.existsSync(path.join(d, 'pages'))) ?? path.resolve('hub/src');
/** Router pages left out, each with why. demo is the page template's sample, whose card throws on purpose (app/pages.ts). */
const EXCLUDED: Readonly<Record<string, string>> = { demo: 'the template sample: its card throws on purpose' };
/** Routes that land on another page by design, by page id: the hash path they land on and the page that shows there. */
const REDIRECTS: Readonly<Record<string, { path: string; page: string }>> = {
  apps: { path: '/programs', page: 'programs' }, // the old launcher route (pages/apps/view.tsx)
  market: { path: '/billing', page: 'billing' }, // the old Market route: now Plans & billing's Bare metal view (pages/market/view.tsx)
};
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NAMED = ['label-content-name-mismatch', 'empty-table-header'];
/** Violations the Hub has today: per page, each key's node count and the open item that owns its fix. A key is the rule,
 *  then the node's tag and words, then after '@' its place (see violations()). A fix lowers or deletes its entry: the page's
 *  test fails while the count is too high. */
const KNOWN: Readonly<Record<string, Readonly<Record<string, { count: number; row: string }>>>> = {};

/** KNOWN for the 390 coarse pass, with the same shape and rule. */
const KNOWN_COARSE: Readonly<Record<string, Readonly<Record<string, { count: number; row: string }>>>> = {};

const pathOf = (file: string) => /\bpath:\s*['"]([^'"]+)['"]/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
const fromPages = fs
  .readdirSync(path.join(SRC, 'pages'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(SRC, 'pages', d.name, 'page.ts')))
  .map((d) => ({ id: d.name, path: pathOf(path.join(SRC, 'pages', d.name, 'page.ts')) }));
const gallery = { id: 'kit-gallery', path: pathOf(path.join(SRC, 'kit', 'gallery', 'page.ts')) };
const pages = [...fromPages, gallery].filter((p) => !(p.id in EXCLUDED)).sort((a, b) => a.id.localeCompare(b.id));

/** The page the route shows (its own, or a listed redirect's) is drawn, settled, with no page error, at the hash path
 *  expected. */
async function rendered(page: Page, p: { id: string; path: string }) {
  const lands = REDIRECTS[p.id] ?? { path: p.path, page: p.id };
  const at = () => new URL(page.url()).hash.slice(1).split('?')[0];
  await gotoHub(page, p.path);
  await expect.poll(at, { message: `${p.path} lands on ${lands.path}`, timeout: 30_000 }).toBe(lands.path);
  await expect(page.locator(`[data-hub-page="${lands.page}"]:not([data-hub-page-hidden])`), `${p.path} shows its page`).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(kit['page.loadError']), `${p.path} rendered without a page error`).toHaveCount(0);
  await expect(page.getByText(kit['page.notFound.title']), `${p.path} is a route`).toHaveCount(0);
  expect(at(), `${p.path} stays on ${lands.path}`).toBe(lands.path);
}

async function violations(page: Page) {
  // One axe run: the tags, plus the named rules switched on beside them (label-content-name-mismatch is experimental, so its
  // tag alone does not run it). options() replaces the builder's options, so it comes before withTags().
  const rules = Object.fromEntries(NAMED.map((id) => [id, { enabled: true }]));
  const found = (await new AxeBuilder({ page }).options({ rules }).withTags(TAGS).analyze()).violations;
  const counts = new Map<string, number>();
  const html = new Map<string, string[]>();
  for (const v of found)
    for (const n of v.nodes) {
      // Generated ids (react-aria's change on every load) and hashed class names make axe's selectors unstable, so a node
      // is known by its tag and words, then by its place: from the outside in, the page slot it is drawn in ('shell'
      // outside every slot), each ancestor's name (aria-label, or the text aria-labelledby points at) and each data
      // table row id. A known node fixed in one place and the same words failing in another place so count under two
      // keys, and both fail. Nodes sharing words and place are counted: a second one in the same named place still
      // shows as one more.
      const words = await page
        .locator(n.target.map(String).join(' '))
        .first()
        .evaluate((el) => {
          const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
          const place: string[] = [];
          let slot = false;
          for (let a = el.parentElement; a; a = a.parentElement) {
            const by = (a.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
            const name = flat(a.getAttribute('aria-label') ?? by.map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
            if (name) place.push(`"${name}"`);
            const row = a.getAttribute('data-row-id');
            if (row) place.push(`row ${row}`);
            const id = a.getAttribute('data-hub-page');
            if (id !== null) {
              place.push(`page ${id}`);
              slot = true;
            }
          }
          if (!slot) place.push('shell');
          return `${el.tagName.toLowerCase()} "${flat(el.getAttribute('aria-label') ?? el.textContent ?? '')}" @ ${place.reverse().join(' > ')}`;
        });
      const key = `${v.id} ${words}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      html.set(key, [...(html.get(key) ?? []), n.html.slice(0, 200)]);
    }
  return { counts, html };
}

/** One page's test: drawn, judged, and its counts equal to its known entries (or appended to AXE_PROBE, tagged by pass). */
async function judge(page: Page, p: { id: string; path: string }, vp: string, known: Readonly<Record<string, { count: number; row: string }>>) {
  await rendered(page, p);
  const { counts, html } = await violations(page);
  const dump = process.env.AXE_PROBE;
  if (dump) {
    fs.appendFileSync(dump, JSON.stringify({ id: p.id, path: p.path, vp, counts: Object.fromEntries(counts), html: Object.fromEntries(html) }) + '\n');
    return;
  }
  const unlisted = [...counts].filter(([k, n]) => n > (known[k]?.count ?? 0)).map(([k, n]) => `${k} x${n}`);
  const fixed = Object.entries(known).filter(([k, e]) => (counts.get(k) ?? 0) < e.count).map(([k, e]) => `${k} x${counts.get(k) ?? 0} (KNOWN x${e.count}, ${e.row})`);
  expect({ unlisted, fixed }).toEqual({ unlisted: [], fixed: [] });
}

test.describe('every page passes the Hub axe rules', () => {
  // One page at a time, a failure skipping none ('default' opts out of fullyParallel; 'serial' would skip the rest). A page
  // plus its axe run took 8-27 s on a quiet host and much longer on a busy machine: the bound is for a stuck page.
  test.describe.configure({ mode: 'default', timeout: 240_000 });

  test('the walk is the router page list, less EXCLUDED', async ({ page }) => {
    expect(Object.keys(EXCLUDED)).toEqual(['demo']);
    expect(pages.filter((p) => !p.path.startsWith('/')).map((p) => p.id)).toEqual([]);
    expect(Object.keys(KNOWN).filter((id) => !pages.some((p) => p.id === id))).toEqual([]);
    expect(Object.keys(KNOWN_COARSE).filter((id) => !pages.some((p) => p.id === id))).toEqual([]);
    expect(Object.keys(REDIRECTS).filter((id) => !pages.some((p) => p.id === id))).toEqual([]);
    await gotoHub(page, '/home');
    // The router's own list for the whole-Hub run (app/main.tsx with __HUB_PAGE__ '*'), from the module the dev server
    // serves. A string, so the spec's own transform never rewrites the import.
    const served = (await page.evaluate(
      `import('/src/app/pages.ts').then((m) => m.visiblePages(m.discoverPages().pages, { preview: false, only: '*', fixtures: true }).map((p) => ({ id: p.id, path: p.path })))`,
    )) as { id: string; path: string }[];
    const sort = (l: { id: string; path: string }[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    expect(sort(served.filter((p) => !(p.id in EXCLUDED)))).toEqual(pages);
    expect(served.filter((p) => p.id in EXCLUDED).map((p) => p.id)).toEqual(Object.keys(EXCLUDED));
  });

  for (const p of pages) test(`${p.id} (${p.path})`, async ({ page }) => judge(page, p, '1440', KNOWN[p.id] ?? {}));
});

test.describe('every page passes the Hub axe rules at 390 on a coarse pointer', () => {
  // The phone pass (some findings show on a coarse pointer only). No screenshots
  // here: a full-page capture drops the touch emulation for later ones. The walk check above covers this pass's pages too.
  test.use({ viewport: { width: 390, height: 845 }, hasTouch: true, isMobile: true });
  test.describe.configure({ mode: 'default', timeout: 240_000 });

  for (const p of pages) test(`${p.id} (${p.path}) coarse`, async ({ page }) => judge(page, p, '390c', KNOWN_COARSE[p.id] ?? {}));
});
