// @vitest-environment node
// hub/use-data-view, its box branch: a page-built search box (the kit SearchField under any
// local name, <input type="search">) is reported, because a list's search lives in <DataTable view={view}>. The branch
// read the JSX tag as an Identifier and never fired. The boxes it lets stand are BOX_ALLOW in scripts/lint/eslint-hub.cjs,
// a chain file: per file, how many boxes it holds today. Rows only shrink: each count must equal the file's boxes now
// (a fixed box lowers it in the same change), and the total never grows past the seed. One detector: every count here
// is the lint's own, run with `ignoreAllow`, never a second regex over the sources.
import path from 'node:path';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

type Row = { readonly boxes: number; readonly why: string };
const HUB = path.resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);
// Read as `{}` when absent (an older tree), so the checks below fail on their own assertions, not on the load.
const { BOX_ALLOW = {} } = require_(path.join(HUB, 'scripts', 'lint', 'eslint-hub.cjs')) as { BOX_ALLOW?: Readonly<Record<string, Row>> };
/** The starting count: seven files, one box each. Rows and boxes may only go down from here. */
const SEED_FILES = 7;
const SEED_BOXES = 7;

// The real config, running only the rule read here: no lint pays for the others (the anatomy rule's whole-tree scan above all).
const config = { cwd: HUB, overrideConfigFile: path.join(HUB, 'eslint.config.js'), ruleFilter: ({ ruleId }: { ruleId: string }) => ruleId === 'hub/use-data-view' };
const eslint = new ESLint(config);
/** The same config with the box branch counting every box (BOX_ALLOW ignored). */
const raw = new ESLint({ ...config, overrideConfig: { rules: { 'hub/use-data-view': ['error', { ignoreAllow: true }] } } });

/** The use-data-view message ids for a source text linted as hub/src/<file>. */
async function ids(file: string, source: string, linter = eslint): Promise<string[]> {
  const [r] = await linter.lintText(source, { filePath: path.join(HUB, 'src', file) });
  return (r?.messages ?? []).filter((m) => m.ruleId === 'hub/use-data-view').map((m) => m.messageId ?? '');
}
const boxCount = async (file: string, source: string) => (await ids(file, source, raw)).filter((m) => m === 'box').length;

const pageSources = import.meta.glob(['../pages/**/*.tsx', '!../pages/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const srcOf = (k: string) => k.replace(/^\.\.\//, '');
// The lint can only find a box in a file whose text names SearchField (its import or tag) or holds a quoted "search"
// (the input's type), so these are the only files worth linting; the lint decides which really hold one.
const CANDIDATE = /SearchField|['"`]search['"`]/;

const field = (tag: string) => `<${tag} label="x" value="" onChange={() => {}} />`;
const page = (imports: string, body: string) => `${imports}\nexport function P() { return <>${body}</>; }\n`;

// The first lint pays the Hub config load; warm both linters once.
beforeAll(async () => {
  await ids('pages/demo/boxwarm.tsx', 'export const x = 1;\n');
  await ids('pages/demo/boxwarm.tsx', 'export const x = 1;\n', raw);
}, lintMs(180_000));

describe('hub/use-data-view: page-built search boxes', () => {
  it.each([
    ['a kit SearchField', page("import { SearchField } from '@kit';", field('SearchField'))],
    ['a SearchField imported under another name', page("import { SearchField as QueryBox } from '@kit';", field('QueryBox'))],
    ['a SearchField read from a namespace import', page("import * as K from '@kit';", field('K.SearchField'))],
    ['an input of type search', page('', '<input type="search" aria-label="x" />')],
    ['an input of type {"search"}', page('', '<input type={"search"} aria-label="x" />')],
    ['an input of type {`search`}', page('', '<input type={`search`} aria-label="x" />')],
  ])('reports %s in a page file', async (_what, source) => {
    expect(await ids('pages/demo/boxprobe.tsx', source)).toEqual(['box']);
  });

  it('leaves other inputs, other namespace members and non-page files alone', async () => {
    expect(await ids('pages/demo/boxprobe.tsx', page('', '<input type="text" aria-label="x" />'))).toEqual([]);
    expect(await ids('pages/demo/boxprobe.tsx', page("import * as K from '@kit';", field('K.TextField')))).toEqual([]);
    expect(await ids('kit/forms/boxprobe.tsx', page("import { SearchField } from './fields';", field('SearchField')))).toEqual([]);
  });

  // Any row will do: the behaviour is the count, not the file. Skipped once every row has left.
  const first = Object.entries(BOX_ALLOW)[0];
  it.skipIf(!first)('a BOX_ALLOW file keeps its counted boxes, gets the next one reported, and still gets search and fn', async () => {
    const [file, row] = first!;
    const imp = "import { SearchField } from '@kit';";
    expect(await ids(file, page(imp, field('SearchField').repeat(row.boxes)))).toEqual([]);
    expect(await ids(file, page(imp, field('SearchField').repeat(row.boxes + 1)))).toEqual(['box']);
    const hand = "export const rows = (xs: { n: string }[], q: string) => xs.filter((r) => r.n.toLowerCase().includes(q));\nexport function filterRows() { return 1; }\n";
    expect((await ids(file, hand)).sort()).toEqual(['fn', 'search']);
  });
});

describe('BOX_ALLOW only shrinks', () => {
  const rows = Object.entries(BOX_ALLOW);
  it('never grows past the seed: at most seven files and seven boxes, each row with a count and a why', () => {
    expect(rows.length).toBeLessThanOrEqual(SEED_FILES);
    expect(rows.reduce((n, [, r]) => n + r.boxes, 0)).toBeLessThanOrEqual(SEED_BOXES);
    for (const [file, r] of rows) {
      expect(Number.isInteger(r.boxes) && r.boxes > 0, file).toBe(true);
      expect(r.why.trim().length, file).toBeGreaterThan(20);
    }
  });

  it("every page file's boxes equal its BOX_ALLOW count (a fixed box lowers its count; a new one is reported)", async () => {
    const found: Record<string, number> = {};
    for (const [k, text] of Object.entries(pageSources)) {
      if (!CANDIDATE.test(text)) continue;
      const n = await boxCount(srcOf(k), text);
      if (n > 0) found[srcOf(k)] = n;
    }
    const allowed = Object.fromEntries(rows.map(([file, r]) => [file, r.boxes]));
    expect(found, "a page search box is the list's own: declare useDataView({ search }) and pass <DataTable view={view}> (the kit draws the box and filters), or FilterChips for a filter row. A new hand-placed SearchField is refused; a removed one lowers its BOX_ALLOW count in hub/scripts/lint/eslint-hub.cjs").toEqual(allowed);
  }, lintMs(300_000));

  it('linting the real BOX_ALLOW files through the Hub config reports no box', async () => {
    for (const [file] of rows) expect(await ids(file, pageSources[`../${file}`] ?? ''), file).not.toContain('box');
  }, lintMs(180_000));
});
