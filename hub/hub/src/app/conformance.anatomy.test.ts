// Page-anatomy ratchet, static half. The detector hub/scripts/lint/anatomy.cjs
// counts the layout debt of every page, shell, ask and kit file as (rule, file, scope) -> authored sites. The rows that
// excuse today's debt are in pages/<page>/conformance.allow.ts and app/conformance/allow.shared.ts (rule ids `layout.*`,
// key `<file>` or `<file> overlay:<overlayId>`). Each row must equal the detector's count: a new offender fails here, and
// a fixed site lowers its row in the same change (a stale row fails too). This test is fast and in-tree, and it claims
// no history: the monotone guarantee across applies is the layout gate, which compares against
// its own baseline. `hub:check` runs this test first (HUB_ANATOMY_DONE=1 then skips the second run).
// Fixtures for the detector's own rules (every mutant and control) are in conformance.anatomy.detector.test.ts, and for
// its ui.* family in conformance.anatomy.ui.test.ts. ui.* rows are judged the same way;
// an exception (app/conformance/exceptions.ts) drops the ui.* hits it covers, and an entry that drops none is stale.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANATOMY_RULES, allowLayout } from './conformance/allow';
import { EXCEPTIONS } from './conformance/exceptions';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
interface Detector {
  RULES: string[];
  EXPLAIN: Record<string, string>;
  readTree(dir: string): Record<string, string>;
  loadRegistry(anatomyDir?: string, exceptionsPath?: string): unknown;
  scan(files: Record<string, string>, opts?: { registry?: unknown }): { hits: Hit[]; counts: Record<string, number>; usedExceptions: string[] };
}
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;

const SRC = join(import.meta.dirname, '..');
// `hub:check --page <id>` (HUB_CHECK_PAGE) judges only that page's rows; the whole hub judges everything.
const only = process.env.HUB_CHECK_PAGE;
const inScope = (key: string) => !only || key.split('|')[1]?.startsWith(`pages/${only}/`);
const done = process.env.HUB_ANATOMY_DONE === '1';
/**
 * Whether an exception path concerns page `page`: a path inside the page, or a folder that holds the page (an ancestor such as
 * `pages/`). The scan is always whole-tree and credits every entry with every hit it covers, so an ancestor folder judged in a page
 * run reads the same use as in the whole-hub run (never a false stale for a page it does not touch).
 */
const exceptionInPage = (entryPath: string, page: string): boolean =>
  entryPath.startsWith(`pages/${page}/`) || (entryPath.endsWith('/') && `pages/${page}/`.startsWith(entryPath));

describe.skipIf(done)('page anatomy ratchet (static)', () => {
  let hits: Hit[] = [];
  let counts: Record<string, number> = {};
  let used: string[] = [];
  beforeAll(() => {
    // the registries kept in kit/layouts/anatomy/ when they exist, the built-in ones until then (as the gate reads them)
    const r = A.scan(A.readTree(SRC), { registry: A.loadRegistry(join(SRC, 'kit/layouts/anatomy'), join(SRC, 'app/conformance/exceptions.ts')) });
    hits = r.hits;
    counts = r.counts;
    used = r.usedExceptions;
  }, 180_000);

  const where = (key: string) => {
    const [rule, file, scope] = key.split('|');
    return hits
      .filter((h) => h.rule === rule && h.file === file && h.scope === scope)
      .slice(0, 6)
      .map((h) => `    ${h.file}:${h.line} ${h.msg}`)
      .join('\n');
  };

  it('LAYOUT_RULES and UI_RULES (allow.ts) are the detector\'s rule list', () => {
    expect([...ANATOMY_RULES].sort()).toEqual([...A.RULES].sort());
  });

  it('no layout debt grew: every (rule, file, scope) is at or below its row', () => {
    const rows = allowLayout();
    const grew = Object.entries(counts)
      .filter(([k, n]) => inScope(k) && n > (rows[k] ?? 0))
      .map(([k, n]) => `${k.split('|').join('  ')}: ${n} hit(s), row allows ${rows[k] ?? 0}\n${where(k)}`);
    expect(
      grew,
      'new page-anatomy debt. Fix the site (use the kit: Section/Item/slots, no raw headings, landmarks, text or hand-built action rows), ' +
        'or ask a maintainer for a debt row. Rules: hub/scripts/lint/anatomy.cjs; row format: hub/src/app/conformance/allow.ts LAYOUT_RULES/UI_RULES',
    ).toEqual([]);
  });

  it('no row is stale: each row equals the detector\'s count (a fixed site lowers its row)', () => {
    const rows = allowLayout();
    const stale = Object.entries(rows)
      .filter(([k, n]) => inScope(k) && (counts[k] ?? 0) < n)
      .map(([k, n]) => `${k.split('|').join('  ')}: row ${n}, detector counts ${counts[k] ?? 0}: lower or delete the row`);
    expect(stale, 'these rows are higher than the debt that is left').toEqual([]);
  });

  it('every row names a rule the detector has', () => {
    const rules = new Set(A.RULES);
    const unknown = Object.keys(allowLayout()).filter((k) => !rules.has(k.split('|')[0] ?? ''));
    expect(unknown).toEqual([]);
  });

  it('every ui.* exception drops at least one hit (a stale entry or site fails)', () => {
    // an entry with sites is judged per site (`path|rule|site`), so a renamed or emptied site is stale
    const stale = EXCEPTIONS.flatMap((e) => e.rules.filter((r) => r.startsWith('ui.')).flatMap((r) => (e.sites ? e.sites.map((x) => `${e.path}|${r}|${x}`) : [`${e.path}|${r}`])))
      .filter((k) => !only || exceptionInPage(k.slice(0, k.indexOf('|')), only))
      .filter((k) => !used.includes(k));
    expect(stale, 'these exception entries (or sites) cover no ui.* hit: drop the rule or site from the entry (app/conformance/exceptions.ts)').toEqual([]);
  });
});

describe('page-scoped runs and the exception list', () => {
  it('a page run judges entries inside the page and every folder that holds it, and no other page\'s entries', () => {
    for (const p of ['pages/ai/view.tsx', 'pages/ai/', 'pages/ai/agents/', 'pages/', 'pages/ai/x.module.css']) expect(exceptionInPage(p, 'ai'), p).toBe(true);
    for (const p of ['pages/aim/', 'pages/aim/view.tsx', 'pages/bots/', 'kit/', 'pages', 'pages/ai']) expect(exceptionInPage(p, 'ai'), p).toBe(false);
  });
});
