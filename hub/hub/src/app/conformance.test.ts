// One conformance test over all manifests: discovery problems, unique ids
// and paths, the required files of every page, and links.ts hrefs that resolve to a page.
// `hub:check --page <id>` sets HUB_CHECK_PAGE: the per-page checks then judge only that page, so
// another page's work in progress cannot fail it (ids, paths and discovery stay global).
// It also checks three recurring faults: fixture names from the one
// fixture world, the functional e2e of every list page, and shots that perform their outcome.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowDataView } from './conformance/allow';
import ts from 'typescript';
import { SEARCH_PROOF_EXCLUDED, SEARCH_PROOF_TESTS, helperUseProblems, resolveModule, searchProofProblems } from './search-proofs';
import { discoverPages, installDevPages } from './pages';
import kitGallery from '@kit/gallery/page';
import demoPage from '../pages/demo/page';
import { SCROLL_PAGES } from './e2e-search';

const folders = Object.keys(import.meta.glob('../pages/*/page.ts')).map((f) => f.split('/')[2] as string);
const has = (pattern: Record<string, unknown>) => new Set(Object.keys(pattern).map((f) => f.split('/')[2]));
const shots = has(import.meta.glob('../pages/*/shots.ts'));
const fixtures = has(import.meta.glob('../pages/*/fixtures.ts'));
const strings = has(import.meta.glob('../pages/*/strings.en.json'));
const views = has(import.meta.glob('../pages/*/view.tsx'));
const links = import.meta.glob<{ links?: Record<string, unknown> }>('../pages/*/links.ts', { eager: true });
const only = process.env.HUB_CHECK_PAGE;
const scoped = (id: string): boolean => !only || id === only;

describe('page manifests', () => {
  // The dev-only pages (demo, kit gallery) are listed once the fixture side installs them (app/fixtures.ts does on
  // load); this node test does not load the fixture world, so it installs the same two manifests itself.
  installDevPages({ demo: demoPage, gallery: kitGallery });
  const { pages, problems } = discoverPages();

  it('are all discovered without problems', () => {
    expect(problems.filter((x) => !only || x.file.includes(`/${only}/`) || x.problem.includes('duplicate'))).toEqual([]);
    expect(pages.map((p) => p.id).sort()).toEqual([...folders].sort());
  });

  it.each(folders.filter(scoped))('%s has the required files', (id) => {
    expect({
      id,
      shots: shots.has(id),
      fixtures: fixtures.has(id),
      strings: strings.has(id),
      view: views.has(id),
    }).toEqual({
      id,
      shots: true,
      fixtures: true,
      strings: true,
      view: true,
    });
  });

  // p.strings is the boot projection (vite.config.mts pageBootStrings), so this also proves it keeps every key the shell reads.
  it('declare nav labels, commands, widgets, Guide topics and tile views that exist in their strings', () => {
    for (const p of pages.filter((x) => scoped(x.id))) {
      const keys = new Set(Object.keys(p.strings));
      // Read without a count: the exact key. navCount is read with one, so a plural base is enough there.
      const exact = [
        p.title,
        p.nav?.label,
        ...(p.commands ?? []).map((c) => c.label),
        ...(p.widgets ?? []).map((w) => w.title),
        ...(p.guide ?? []).flatMap((g) => [g.title, g.body]),
        ...(p.tileViews ?? []).map((v) => v.title),
      ].filter((k): k is string => typeof k === 'string');
      for (const k of exact) expect(keys.has(k), `${p.id}: string key "${k}"`).toBe(true);
      for (const k of [p.navCount?.label, p.navCount?.tip].filter((x): x is string => typeof x === 'string'))
        expect(keys.has(k) || keys.has(`${k}_other`), `${p.id}: navCount key "${k}"`).toBe(true);
    }
  });

  it('links.ts hrefs point at a known page path', () => {
    const paths = pages.map((p) => p.path);
    for (const [file, mod] of Object.entries(links).filter(([f]) => scoped(f.split('/')[2] ?? ''))) {
      for (const [name, value] of Object.entries(mod.links ?? {})) {
        const href = typeof value === 'function' ? (value as (id: string) => string)('x') : value;
        if (typeof href !== 'string') continue;
        const pathPart = href.split(/[?#]/)[0] ?? '';
        const ok = pathPart === '/' || paths.some((p) => pathPart === p || pathPart.startsWith(`${p}/`));
        expect(ok, `${file} links.${name} = ${href}`).toBe(true);
      }
    }
  });
});

// ── Repeated failures, checked here first ────────────────────────────────────────

const raw = (pattern: Record<string, unknown>) => Object.fromEntries(Object.entries(pattern).map(([f, text]) => [f, String(text)]));
const pageOf = (file: string) => file.split('/')[2] ?? '';
const manifestsRaw = raw(
  import.meta.glob('../pages/*/page.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const specsRaw = raw(
  import.meta.glob('../pages/*/page.spec.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const shotsRaw = raw(
  import.meta.glob('../pages/*/shots.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
describe('functional e2e of list pages (FUNCTIONAL RULE, URL state, search text)', () => {
  // Each tag must appear in a test title of the page's page.spec.ts (the templates write all six),
  // and that test must prove its state in the URL: the useDataView keys survive Back and reload.
  // The one key that never goes into the URL is the typed search: @search and @reload are proved by the shared
  // helpers (app/e2e-search.ts), and the inventory below (app/search-proofs.ts) checks each listed test calls them.
  const TAGS = ['@search', '@filter', '@sort', '@page', '@reload', '@no-match'];
  const URL_PROOF: Record<string, { need: RegExp[]; says: string }> = {
    '@filter': { need: [/(?<!not\.)toHaveURL\([^)]*\w=/], says: 'expect(page).toHaveURL(/[?&]<filter id>=…/)' },
    '@sort': { need: [/(?<!not\.)toHaveURL\([^)]*sort=/], says: 'expect(page).toHaveURL(/[?&]sort=…/)' },
    '@page': { need: [/(?<!not\.)toHaveURL\([^)]*page=/], says: 'expect(page).toHaveURL(/[?&]page=2/) after Next page (or Show more)' },
  };
  // Named exceptions: a tag a page does not have, and the proof that stands in
  // for one. Each carries its reason; nothing else may skip a tag.
  const CURSOR = /(?<!not\.)toHaveURL\([^)]*(before|after|cursor|at)=/;
  // An exception's stand-in proof is read from code only: comments are dropped first, so a proof cannot be a mention.
  // TypeScript's own parse decides what a comment is (a pattern would take `'x'// …` for code and cut strings at `//`):
  // every comment around every token is blanked (newlines kept); strings, regex and template literals stay whole.
  const codeOf = (src: string) => {
    const sf = ts.createSourceFile('proof.ts', src, ts.ScriptTarget.Latest, true);
    const cut = new Map<number, number>();
    const take = (rs: readonly ts.CommentRange[] | undefined) => rs?.forEach((c) => cut.set(c.pos, c.end));
    const walk = (n: ts.Node) => {
      take(ts.getLeadingCommentRanges(src, n.pos));
      take(ts.getTrailingCommentRanges(src, n.end));
      for (const c of n.getChildren(sf)) walk(c);
    };
    walk(sf);
    let out = src;
    for (const [pos, end] of [...cut].sort((a, b) => b[0] - a[0])) out = out.slice(0, pos) + src.slice(pos, end).replace(/[^\n]/g, ' ') + out.slice(end);
    return out;
  };
  // `source`: what the spec's own helpers must still compute, read from the whole spec (code only).
  const EXCEPTIONS: Record<string, { reason: string; drop: string[]; proof: Record<string, { need: RegExp[]; says: string }>; source?: { need: RegExp[]; says: string } }> = {
    logs: {
      reason: 'cursor log stream, newest first: no sort control, and paging is a cursor',
      drop: ['@sort'],
      proof: {
        '@page': {
          need: [CURSOR, /\.reload\(/],
          says: 'after Show older, toHaveURL(/[?&]<cursor key>=…/) (before=, after=, cursor= or at=), then reload restores that window',
        },
      },
    },
    // The API page only (sticky group headers in place of pagination): one scrolled list, no
    // pager, so no @page; @sticky stands in. Its reload proof is the e2e-search `scroll` kind (SCROLL_PAGES, below).
    api: {
      reason: 'one scrolled list with sticky group headers in place of paging: no page key',
      drop: ['@page'],
      proof: {
        '@sticky': {
          // Each an asserted statement, not a mention: the pager asserted absent, a scroll assigned, and the measured
          // stuck head asserted true on both counts (three loose words could be satisfied by a comment).
          need: [
            /await expect\(page\.getByRole\('navigation', \{ name: 'Pages' \}\)\)\.toHaveCount\(0\);/,
            /\.evaluate\(\(el\) => \{ el\.scrollTop = [1-9]\d{3,}; \}\);/,
            /await expect\.poll\(\(\) => table\(page\)\.evaluate\(stuckHead\)\)\.toMatchObject\(\{ underHeader: true, rowsScrolledUnder: true \}\);/,
          ],
          says: "assert no pager (toHaveCount(0)), scroll the list (el.scrollTop = 1000 or more), and assert expect.poll(() => table(page).evaluate(stuckHead)).toMatchObject({ underHeader: true, rowsScrolledUnder: true })",
        },
      },
      source: {
        need: [
          /const stuckHead = \(table: HTMLTableElement\) => \{/,
          /const below = table\.tHead!\.rows\[0\]!\.cells\[0\]!\.getBoundingClientRect\(\)\.bottom;/,
          /underHeader: Math\.abs\(top\(head\) - below\) <= 2,/,
          /rowsScrolledUnder: rows\.some\(\(tr\) => top\(tr\) < top\(head\) - 4\)/,
        ],
        says: 'keep stuckHead measuring: the header cell\'s bottom, the nearest head within 2 px of it, and a row of its own group scrolled above it',
      },
    },
    support: {
      reason: 'tickets in the API order (last update first) with a cursor Load more: no sort control, and no page key',
      drop: ['@sort', '@page'],
      proof: {
        // The exception holds only while the order is the API's and Load more is the cursor's.
        '@api-order': {
          need: [/state: 'apiOrder'/, /allTextContents\(\)/, /action\.loadMore/],
          says: "open state 'apiOrder', read the rows' order (allTextContents), Load more, and check page two follows page one in the API order",
        },
        '@cursor': {
          need: [/state: 'cursorExpired'/, /action\.loadMore/, /list\.partial/],
          says: "open state 'cursorExpired', Load more (INVALID_CURSOR on page two), check the list starts again from page one with no error band, then Load more continues",
        },
      },
    },
  };
  it('an exception proof is code, not a mention: comments and unasserted values do not satisfy @sticky', () => {
    const { need } = EXCEPTIONS.api!.proof['@sticky']!;
    const holds = (body: string) => need.every((re) => re.test(codeOf(body)));
    const real = [
      "    await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);",
      '    await scroller.evaluate((el) => { el.scrollTop = 3000; });',
      '    await expect.poll(() => table(page).evaluate(stuckHead)).toMatchObject({ underHeader: true, rowsScrolledUnder: true });',
    ];
    expect(holds(real.join('\n'))).toBe(true);
    // Each line commented out (line or block comment), one at a time, fails.
    for (let i = 0; i < real.length; i++) {
      expect(holds(real.map((l, j) => (j === i ? `    // ${l.trim()}` : l)).join('\n')), `line ${i} as a // comment`).toBe(false);
      expect(holds(real.map((l, j) => (j === i ? `    /* ${l.trim()} */` : l)).join('\n')), `line ${i} as a block comment`).toBe(false);
    }
    // Mentioned but not asserted: the values in a variable, scrollTop read not set, a tiny scroll.
    expect(holds([real[0], real[1], '    const want = { underHeader: true, rowsScrolledUnder: true };'].join('\n'))).toBe(false);
    expect(holds([real[0], '    const y = await scroller.evaluate((el) => el.scrollTop);', real[2]].join('\n'))).toBe(false);
    expect(holds([real[0], '    await scroller.evaluate((el) => { el.scrollTop = 5; });', real[2]].join('\n'))).toBe(false);
    // A comment right after a quote is still a comment: each statement behind `'x'//` fails.
    for (let i = 0; i < real.length; i++) expect(holds(real.map((l, j) => (j === i ? `    'x'// ${l.trim()}` : l)).join('\n')), `line ${i} behind 'x'//`).toBe(false);
    expect(holds(real.map((l) => `    'x'// ${l.trim()}`).join('\n'))).toBe(false);
    expect(holds(real.map((l) => `    "x"/* ${l.trim()} */`).join('\n'))).toBe(false);
    // Strings, regex and template literals holding // or /* stay whole, and code after them on the line stays.
    for (const code of ["const u = 'https://example.com/a//b'; f();", 'const r = /a\\/\\/b/; f();', 'const t = `x // ${y} /* z */`; f();', 'const q = "/* not a comment */"; f();']) expect(codeOf(code)).toBe(code);
    expect(codeOf('a(); // gone\nb(); /* gone */ c();')).toBe(`a(); ${' '.repeat(7)}\nb(); ${' '.repeat(10)} c();`);
  });
  // The `scroll` reload kind skips the page key: only a page with its named no-@page exception may use it.
  it('the scroll reload kind is only for pages with no pager: each SCROLL_PAGES page drops @page by a named exception, and no other page asks for it', () => {
    expect(SCROLL_PAGES.filter((id) => !EXCEPTIONS[id]?.drop.includes('@page'))).toEqual([]);
    const asks = Object.entries(specsRaw).filter(([, text]) => /kind:\s*['"]scroll['"]/.test(text)).map(([f]) => pageOf(f));
    expect(asks.filter((id) => !SCROLL_PAGES.includes(id)), 'a paged page proves its page key: use the list kind').toEqual([]);
  });
  // Only a positive toHaveURL proves a key (not.toHaveURL proves it is gone, which is what ?q needs).
  // A test's title and body run from its `test(` to the next one.
  const testsOf = (spec: string) =>
    [...spec.matchAll(/^\s*test(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm)].map((m, i, all) => ({
      title: m[2] ?? '',
      body: spec.slice(m.index ?? 0, all[i + 1]?.index ?? spec.length),
    }));
  const listPages = folders.filter((id) => /layout:\s*['"](list-detail|table)['"]/.test(manifestsRaw[`../pages/${id}/page.ts`] ?? ''));
  const inScope = listPages.filter(scoped);
  // A page that is not a list page (or a run scoped to one) has nothing to check here: pass, never "No test found".
  if (inScope.length === 0) it('no list page in scope', () => expect(inScope).toEqual([]));
  it.each(inScope)('%s has the functional e2e: search, chip filter, sort, paging, reload keeps state, no-match + Clear filters', (id) => {
    const tests = testsOf(specsRaw[`../pages/${id}/page.spec.ts`] ?? '');
    const drop = EXCEPTIONS[id]?.drop ?? [];
    const missing = TAGS.filter((tag) => !drop.includes(tag) && !tests.some((t) => t.title.includes(tag)));
    expect(missing, `pages/${id}/page.spec.ts: add tests tagged ${missing.join(' ')} (copy them from hub/templates/page-list-detail/page.spec.ts)`).toEqual([]);
  });
  it.each(inScope)('%s: each functional test proves its state in the URL', (id) => {
    const tests = testsOf(specsRaw[`../pages/${id}/page.spec.ts`] ?? '');
    const bad: string[] = [];
    const ex = EXCEPTIONS[id];
    for (const [tag, { need, says }] of Object.entries({ ...URL_PROOF, ...ex?.proof })) {
      if (ex?.drop.includes(tag)) continue;
      const tagged = tests.filter((t) => t.title.includes(tag));
      const read = (body: string) => (ex?.proof[tag] ? codeOf(body) : body);
      if (!tagged.length && ex?.proof[tag]) bad.push(`${tag}: ${says}`);
      else if (tagged.length && !tagged.some((t) => need.every((re) => re.test(read(t.body))))) bad.push(`${tag}: ${says}`);
    }
    if (ex?.source && !ex.source.need.every((re) => re.test(codeOf(specsRaw[`../pages/${id}/page.spec.ts`] ?? '')))) bad.push(`source: ${ex.source.says}`);
    expect(
      bad,
      `pages/${id}/page.spec.ts: the URL is the state (useDataView keys q, <filter>, sort, page, sel); copy hub/templates/page-list-detail/page.spec.ts`,
    ).toEqual([]);
  });
});

describe('search proofs: each listed test calls the shared helpers', () => {
  // The proof is the helper (app/e2e-search.ts); this checks only that each inventoried test calls it, per test (one
  // compliant test never covers another), and that no @search / @reload test is left out of both lists.
  const specSources = Object.fromEntries(
    Object.entries({
      ...raw(import.meta.glob('../pages/*/*.spec.ts', { query: '?raw', import: 'default', eager: true })),
      ...raw(import.meta.glob('../kit/**/*.spec.ts', { query: '?raw', import: 'default', eager: true })),
      ...raw(import.meta.glob('../../templates/*/page.spec.ts', { query: '?raw', import: 'default', eager: true })),
    }).map(([f, text]) => [f.startsWith('../../') ? f.slice('../../'.length) : `src/${f.slice('../'.length)}`, text]),
  );
  const inScopeFile = (f: string) => !only || f.startsWith(`src/pages/${only}/`);
  it('every listed test calls its helper(s), every parameterised case exists, nothing tagged is unlisted', () => {
    const sources = Object.fromEntries(Object.entries(specSources).filter(([f]) => inScopeFile(f)));
    expect(searchProofProblems(sources)).toEqual([]);
  });
  it('the inventory names only spec files that exist', () => {
    const files = new Set([...SEARCH_PROOF_TESTS, ...SEARCH_PROOF_EXCLUDED].map((r) => r.file));
    expect([...files].filter((f) => !(f in specSources))).toEqual([]);
  });
  it('the checker refuses a missing test, a dropped helper, a call in a comment or after the test, an unlisted tag and a missing case', () => {
    const rows = [
      { file: 'a.spec.ts', test: '@search one', helpers: ['S' as const] },
      { file: 'a.spec.ts', test: '@search @reload two', helpers: ['S' as const, 'R' as const] },
      { file: 'b.spec.ts', test: '@search ${l.name}:', helpers: ['S' as const], cases: ['Workflows', 'Loops', 'TODOs'] },
    ];
    const ok = {
      'a.spec.ts': "test('@search one', async () => { await expectSearchStaysOutOfUrl(p, v, x); });\ntest('@search @reload two', async () => { await expectSearchStaysOutOfUrl(p, v, x); await expectLinkSearchDroppedOnReload(p, v, y); });\ntest('other', () => {});",
      'b.spec.ts': "const LISTS = [{ name: 'Workflows' }, { name: 'Loops' }, { name: 'TODOs' }];\nfor (const l of LISTS) test(`@search ${l.name}: x`, async () => { await expectSearchStaysOutOfUrl(p, v, { text: `${l.name}` }); });",
    };
    expect(searchProofProblems(ok, rows, [])).toEqual([]);
    const variant = (file: 'a.spec.ts' | 'b.spec.ts', from: string, to: string) => searchProofProblems({ ...ok, [file]: ok[file].replace(from, to) }, rows, []);
    expect(variant('a.spec.ts', "test('@search one'", "test('@search uno'")).toEqual(['a.spec.ts: missing "@search one"', 'a.spec.ts: unlisted "@search uno"']);
    expect(variant('a.spec.ts', 'await expectLinkSearchDroppedOnReload(p, v, y);', '')).toEqual(['a.spec.ts: "@search @reload two" does not call expectLinkSearchDroppedOnReload']);
    expect(variant('a.spec.ts', 'await expectSearchStaysOutOfUrl(p, v, x); });\ntest(', '/* expectSearchStaysOutOfUrl( */ });\ntest(')).toEqual(['a.spec.ts: "@search one" does not call expectSearchStaysOutOfUrl']);
    expect(variant('a.spec.ts', "test('@search one', async () => { await expectSearchStaysOutOfUrl(p, v, x); });", "test('@search one', async () => {}); expectSearchStaysOutOfUrl(p, v, x);")).toEqual(['a.spec.ts: "@search one" does not call expectSearchStaysOutOfUrl']);
    expect(variant('a.spec.ts', "test('other'", "test('@reload other'")).toEqual(['a.spec.ts: unlisted "@reload other"']);
    expect(variant('b.spec.ts', ", { name: 'TODOs' }", '')).toEqual(['b.spec.ts: "@search ${l.name}:" missing case TODOs']);
  });
  it('the checker counts only a test that runs and a helper call it reaches', () => {
    const rows = [
      { file: 'a.spec.ts', test: '@search one', helpers: ['S' as const] },
      { file: 'b.spec.ts', test: '@search ${l.name}:', helpers: ['S' as const], cases: ['Workflows', 'Loops', 'TODOs'] },
    ];
    const one = "test('@search one', async ({ page }) => {\n  await expectSearchStaysOutOfUrl(p, v, x);\n});";
    const ok = {
      'a.spec.ts': one,
      'b.spec.ts': "const LISTS = [{ name: 'Workflows' }, { name: 'Loops' }, { name: 'TODOs' }];\nfor (const l of LISTS) {\n  test.describe(l.name, () => {\n    test(`@search ${l.name}: x`, async () => {\n      await expectSearchStaysOutOfUrl(p, v, { text: `${l.name}` });\n    });\n  });\n}",
    };
    expect(searchProofProblems(ok, rows, [])).toEqual([]);
    const a = (src: string) => searchProofProblems({ ...ok, 'a.spec.ts': src }, rows, []);
    const S = 'expectSearchStaysOutOfUrl';
    const nested = `a.spec.ts: "@search one" calls ${S} only where it may not run (await it as a statement of the test)`;
    expect(a(`/*\n${one}\n*/`)).toEqual(['a.spec.ts: missing "@search one"']);
    expect(a(`const x = \`${one.replace(/`/g, '')}\`;`)).toEqual(['a.spec.ts: missing "@search one"']);
    expect(a(one.replace("test('", "test.skip('"))).toEqual(['a.spec.ts: "@search one" is declared skip']);
    expect(a(one.replace("test('", "test.fixme('"))).toEqual(['a.spec.ts: "@search one" is declared fixme']);
    expect(a(one.replace('=> {\n', "=> {\n  test.skip(true, 'later');\n"))).toEqual(['a.spec.ts: "@search one" skips itself']);
    expect(a(`test.describe.skip('d', () => {\n${one}\n});`)).toEqual(['a.spec.ts: "@search one" is in a skipped describe']);
    expect(a(`function later() {\n${one}\n}`)).toEqual(['a.spec.ts: "@search one" is not declared at the top level or in a describe']);
    expect(a(`if (process.env.X) {\n${one}\n}`)).toEqual(['a.spec.ts: "@search one" is not declared at the top level or in a describe']);
    expect(a(one.replace(`await ${S}(p, v, x);`, `const unused = async () => {\n    await ${S}(p, v, x);\n  };`))).toEqual([nested]);
    expect(a(one.replace(`await ${S}(`, `if (false) await ${S}(`))).toEqual([nested]);
    expect(a(one.replace(`await ${S}(`, `void ${S}(`))).toEqual([nested]);
    expect(a(one.replace(`await ${S}(p, v, x);`, `const s = '${S}(p, v, x)';`))).toEqual([`a.spec.ts: "@search one" does not call ${S}`]);
    expect(a(one.replace(`await ${S}(p, v, x);`, `const re = /${S}\\(/;`))).toEqual([`a.spec.ts: "@search one" does not call ${S}`]);
    expect(searchProofProblems({ ...ok, 'b.spec.ts': ok['b.spec.ts'].replace(", { name: 'TODOs' }", ", // { name: 'TODOs' }\n") }, rows, [])).toEqual(['b.spec.ts: "@search ${l.name}:" missing case TODOs']);
     // A regex right after a control head's `)` is a regex, a `/` after any other `)` is a division (else the
    // lint is red on correct code).
    expect(a(`if (false) /[{'"\`]/.test('x');\n${one}`)).toEqual([]);
    expect(a(`while (0) /}/.exec('');\nfor (;;) /'/.test('');\n${one}`)).toEqual([]);
    expect(a(`const r = (1) / 2 / 3;\nconst t = f(a) / g(b) / 2;\n${one}`)).toEqual([]);
    // A property named like a control head or a keyword is a value: a `/` after its call is a division.
    expect(a(`const scale = { for: (n: number) => n };\nexpect(scale.for(2) / 2).toBe(1);\nconst k = o.if(1) / o?.while(2) / o.return / 2;\n${one}`)).toEqual([]);
  });
});

describe('search proofs: S and R are called only as `await S(…);` statements of a test body, tree-wide', () => {
  // The static half of the mark binding (app/search-proofs.ts helperUseProblems), on the AST of every module Playwright
  // can load (.ts .tsx .mts .cts .js .jsx .mjs .cjs) under hub/src and hub/templates: a hook, a fixture or a module a
  // spec imports can call a helper while some test is current.
  const hub = join(import.meta.dirname, '..', '..');
  const tree = Object.fromEntries(
    ['src', 'templates'].flatMap((root) =>
      (readdirSync(join(hub, root), { recursive: true, encoding: 'utf8' }) as string[])
        .filter((f) => /\.[mc]?[jt]sx?$/.test(f) && !f.split(sep).includes('node_modules'))
        .map((f) => [`${root}/${f.split(sep).join('/')}`, readFileSync(join(hub, root, f), 'utf8')] as const),
    ),
  );
  it('the whole tree calls the helpers only where the current test is the caller, and names the mark only where it is written', () => {
    expect(helperUseProblems(ts, tree)).toEqual([]);
  });
  it('the scan reads the inventory specs, the definitions and the re-export', () => {
    expect(SEARCH_PROOF_TESTS.map((r) => r.file).filter((f) => !(f in tree))).toEqual([]);
    expect(['src/app/e2e-search.ts', 'src/app/e2e.ts'].filter((f) => !(f in tree))).toEqual([]);
  });
  const S = 'expectSearchStaysOutOfUrl';
  const R = 'expectLinkSearchDroppedOnReload';
  const imp = `import { ${R}, ${S}, gotoHub, test } from '@app/e2e';\n`;
  const ok = `${imp}test('@search one', async ({ page }) => {\n  await gotoHub(page, '/demo');\n  await ${S}(page, v, x);\n  await ${R}(page, v, y);\n});\n`;
  const F = 'src/pages/a/page.spec.ts';
  const u = (src: string, extra: Record<string, string> = {}) => helperUseProblems(ts, { [F]: src, ...extra });
  const inBody = (code: string) => ok.replace(`  await ${S}(page, v, x);\n`, code);
  const outside = `${S} is called outside a test's own body`;
  const one = (src: string, extra?: Record<string, string>) => {
    const got = u(src, extra);
    expect(got, src).toHaveLength(1);
    return got[0] ?? '';
  };
  it('accepts `await S(…);` in a test body: in a describe, in a LISTS loop, with test details, from @playwright/test or app/e2e', () => {
    expect(u(ok)).toEqual([]);
    expect(u(`${imp}test.describe('d', () => {\n  test('@search one', { tag: '@x' }, async ({ page }) => {\n    if (!x) /re/.test('y');\n    await ${S}(page, v, x);\n  });\n});\n`)).toEqual([]);
    expect(u(`${imp}const LISTS = [{ name: 'A' }];\nfor (const l of LISTS) {\n  test(\`@search \${l.name}: x\`, async function ({ page }) {\n    await ${S}(page, v, { text: \`\${l.name}\` });\n  });\n}\n`)).toEqual([]);
    expect(u(ok.replace(imp, `import { test } from '@playwright/test';\nimport { ${R}, ${S}, gotoHub } from '@app/e2e';\n`))).toEqual([]);
    // Names in comments and strings are not references.
    expect(u(`${ok}// ${S}(page)\nconst s = '${R}(page)';\n`)).toEqual([]);
  });
  it('a beforeAll call (the per-test row lint passes it; this scan refuses the file), and a dead call after return', () => {
    const src = `${imp}test.describe('d', () => {\n  test.beforeAll(async ({ browser }) => {\n    const pg = await browser.newPage();\n    await ${S}(pg, v, x);\n  });\n  test('@search one', async () => {\n    return;\n    await ${S}(p, v, x);\n  });\n});\n`;
    expect(searchProofProblems({ [F]: src }, [{ file: F, test: '@search one', helpers: ['S'] }], [])).toEqual([]);
    expect(u(src)).toEqual([
      `${F}:5: ${S} is called outside a test's own body (a hook, a fixture, a function, a callback, a condition, a loop, a try or a block)`,
      `${F}:9: ${S} comes after a top-level return of its test, so it never runs`,
    ]);
  });
  it('refuses every hook, a fixture, a deferred call, a function, a step, a describe body, a condition, a loop, a try, a label and a block', () => {
    for (const hook of ['beforeAll', 'beforeEach', 'afterEach', 'afterAll']) expect(one(`${imp}test.${hook}(async ({ page }) => {\n  await ${S}(page, v, x);\n});\n`)).toContain(outside);
    expect(one(`${imp}export const t2 = test.extend<{}, { probe: void }>({\n  probe: [async ({ browser }, use) => {\n    await ${S}(await browser.newPage(), v, x);\n    await use();\n  }, { scope: 'worker', auto: true }],\n});\n`)).toContain(outside);
    expect(one(inBody(`  void sleep(1500).then(() => ${S}(shared, v, x));\n`))).toContain('is not a statement');
    expect(one(`${imp}async function later() {\n  await ${S}(p, v, x);\n}\n`)).toContain(outside);
    expect(one(inBody(`  await test.step('s', async () => {\n    await ${S}(page, v, x);\n  });\n`))).toContain(outside);
    expect(one(`${imp}test.describe('d', async () => {\n  await ${S}(p, v, x);\n});\n`)).toContain(outside);
    expect(one(inBody(`  if (x) {\n    await ${S}(page, v, x);\n  }\n`))).toContain(outside);
    expect(one(inBody(`  if (x) await ${S}(page, v, x);\n`))).toContain(outside);
    expect(one(inBody(`  for (const k of ks) {\n    await ${S}(page, v, k);\n  }\n`))).toContain(outside);
    expect(one(inBody(`  try {\n    await ${S}(page, v, x);\n  } catch {}\n`))).toContain(outside);
    expect(one(inBody(`  l: {\n    await ${S}(page, v, x);\n  }\n`))).toContain(outside);
    expect(one(inBody(`  {\n    await ${S}(page, v, x);\n  }\n`))).toContain(outside);
  });
  it('refuses a body that is not inline, a callee that is not our `test`, and an expression-bodied arrow', () => {
    expect(one(`${imp}const body = async ({ page }) => {\n  await ${S}(page, v, x);\n};\ntest('@search one', body);\n`)).toContain(outside);
    expect(one(`${imp.replace(', test }', ', test as it }')}it('@search one', async ({ page }) => {\n  await ${S}(page, v, x);\n});\n`)).toContain(outside);
    expect(one(`${imp.replace(', test }', ' }')}const test = (t: string, f: () => Promise<void>) => base.beforeAll(f);\ntest('@search one', async () => {\n  await ${S}(p, v, x);\n});\n`)).toContain('whose `test` is not the named import');
    expect(one(`${imp}{\n  const test = other;\n}\ntest('@search one', async ({ page }) => {\n  await ${S}(page, v, x);\n});\n`)).toContain('whose `test` is not the named import');
    expect(one(`${imp}test('@search one', async ({ page }) => await ${S}(page, v, x));\n`)).toContain('is not a statement `await');
  });
  it('refuses a call that is not exactly `await S(…);`, or follows a top-level return or throw', () => {
    const notStmt = 'is not a statement `await';
    expect(one(inBody(`  void ${S}(page, v, x);\n`))).toContain(notStmt);
    expect(one(inBody(`  const r = await ${S}(page, v, x);\n`))).toContain(notStmt);
    expect(one(inBody(`  await ${S}(page, v, x).catch(() => {});\n`))).toContain(notStmt);
    expect(one(inBody(`  await Promise.all([${S}(page, v, x)]);\n`))).toContain(notStmt);
    expect(one(inBody(`  await (0, ${S})(page, v, x);\n`))).toContain('is used as a value');
    expect(u(inBody(`  return;\n  await ${S}(page, v, x);\n`))).toEqual([
      `${F}:5: ${S} comes after a top-level return of its test, so it never runs`,
      `${F}:6: ${R} comes after a top-level return of its test, so it never runs`,
    ]);
    // A conditional return is not dead code, and this is no reachability analysis: when it is
    // taken the helper never marks the test, so the run gate is red.
    expect(u(inBody(`  if (skip) return;\n  await ${S}(page, v, x);\n`))).toEqual([]);
    expect(u(inBody(`  throw new Error('later');\n  await ${S}(page, v, x);\n`))).toHaveLength(2);
    // A return inside a nested function is not the test's own.
    expect(u(inBody(`  const f = () => { return 1; };\n  await ${S}(page, v, x);\n`))).toEqual([]);
  });
  it('refuses the helper as a value or a property, a rename, a re-export, the module as a namespace, a default, `export *`, import() or require', () => {
    expect(one(`${ok}const alias = ${S};\n`)).toContain('is used as a value');
    expect(one(inBody(`  await run(${S});\n`))).toContain('is used as a value');
    expect(u(`${ok}import * as e from '@app/e2e';\ntest('@search two', async ({ page }) => {\n  await e.${S}(page, v, x);\n});\n`)).toEqual([
      `${F}:7: imports @app/e2e as a namespace: import the helpers by name`,
      `${F}:9: ${S} is used as a value (an alias, an argument, an export or a property): call it as \`await ${S}(…);\` in a test body`,
    ]);
    // The call names the import's own name, which this file no longer imports.
    expect(u(ok.replace(`${S}, gotoHub`, `${S} as s, gotoHub`))).toEqual([
      `${F}:1: imports ${S} as s: import the helpers by their own names`,
      `${F}:4: ${S} is not the named import from app/e2e`,
    ]);
    expect(one(`${ok}export { ${S} } from '@app/e2e';\n`)).toContain(`re-exports ${S}`);
    expect(one(`${ok}export * from '@app/e2e';\n`)).toContain("`export * from '@app/e2e'`");
    expect(one(`${ok}import e2e from '@app/e2e-search';\n`)).toContain('imports @app/e2e-search as a default');
    expect(one(`${ok}const m = await import('@app/e2e');\n`)).toContain('loads @app/e2e with import(…)');
    expect(one(`${ok}const m = require('../../app/e2e-search');\n`)).toContain('loads ../../app/e2e-search with require(…)');
  });
  it('a non-spec module that calls a helper, registers a hook or a fixture with one, or passes it on', () => {
    const kit = 'src/kit/proofs/install.ts';
    expect(one(ok, { [kit]: `import { ${S}, test } from '@app/e2e';\nexport const installProofs = () => test.beforeAll(async ({ browser }) => {\n  await ${S}(await browser.newPage(), v, x);\n});\n` })).toBe(`${kit}:3: ${S} is referenced outside a spec: only a test body calls it`);
    expect(one(ok, { [kit]: `import { ${S}, test as base } from '@app/e2e';\nexport const test = base.extend<{ p: void }>({\n  p: [async ({ page }, use) => {\n    await ${S}(page, v, x);\n    await use();\n  }, { auto: true }],\n});\n` })).toBe(`${kit}:4: ${S} is referenced outside a spec: only a test body calls it`);
    expect(one(ok, { [kit]: `export { ${S} } from '@app/e2e';\n` })).toContain(`re-exports ${S}`);
  });
  it('a forged mark: the l064 literal or PROOF_ANNOTATION outside e2e-search.ts and the gate', () => {
    expect(one(inBody(`  test.info().annotations.push({ type: 'l064', description: \`S \${test.info().testId}\` });\n`))).toContain('names the search proof mark');
    expect(one(`${imp}test('@search two', { annotation: { type: 'l064', description: 'S' } }, async () => {});\n`)).toContain('names the search proof mark');
    // The import names the mark too: both lines are red.
    expect(u(ok, { 'src/kit/x.ts': `import { PROOF_ANNOTATION } from '@app/e2e-search';\nexport const t = PROOF_ANNOTATION;\n` })).toEqual([
      `src/kit/x.ts:1: imports PROOF_ANNOTATION, the search proof mark: only app/e2e-search.ts writes it`,
      `src/kit/x.ts:2: names the search proof mark: only app/e2e-search.ts writes it`,
    ]);
  });
  // The stated limits of the search proof, each test red without its fix.
  const notOurs = 'whose `test` is not the named import';
  const twoTests = `import { ${S}, test } from '@app/e2e';\nimport { test as base } from '@playwright/test';\n`;
  it('`test` bound by a destructuring, a destructured parameter, a function or class name, or a default import is not ours', () => {
    const body = `test('@search one', async ({ page }) => {\n    await ${S}(page, v, x);\n  });`;
    expect(one(`${twoTests}{\n  const { beforeEach: test } = base;\n  ${body}\n}\n`)).toContain(notOurs);
    expect(one(`${twoTests}{\n  const [test] = [base.beforeEach];\n  ${body}\n}\n`)).toContain(notOurs);
    expect(one(`${twoTests}export const run = ({ test }: { test: typeof base.beforeEach }) => {\n  ${body}\n};\n`)).toContain(notOurs);
    expect(one(`${twoTests}const named = function test() {};\n${body}\n`)).toContain(notOurs);
    expect(one(`${twoTests}const K = class test {};\n${body}\n`)).toContain(notOurs);
    expect(one(`${twoTests}import test from './hooks';\n${body}\n`)).toContain(notOurs);
  });
  it('the scan reads every module Playwright can load, not only .ts/.tsx', () => {
    // The one such module in the tree today is plain JavaScript (run-open-core.js).
    expect(Object.keys(tree)).toContain('src/core/run-open/run-open-core.js');
    expect(one(ok, { 'src/kit/probe/install.mjs': `import { ${S}, test } from '@app/e2e';\ntest.beforeEach(async ({ page }) => {\n  await ${S}(page, v, x);\n});\n` })).toBe(`src/kit/probe/install.mjs:3: ${S} is referenced outside a spec: only a test body calls it`);
  });
  it('app/e2e is the module, not its spelling; `export * as` and string-key destructures of a helper are refused', () => {
    // A module named e2e elsewhere is any other module: its `test` is not ours.
    for (const from of ['@kit/probe/e2e', './e2e']) {
      const got = u(ok.replace(imp, `import { test } from '${from}';\nimport { ${R}, ${S}, gotoHub } from '@app/e2e';\n`));
      const why = 'is called in a test whose `test` is not the named import from @playwright/test or app/e2e';
      expect(got, from).toEqual([`${F}:5: ${S} ${why}`, `${F}:6: ${R} ${why}`]);
    }
    // The real module under another spelling is still the module.
    expect(one(`${ok}const m = await import('../../app/e2e-search.ts');\n`)).toContain("loads ../../app/e2e-search.ts with import(…)");
    expect(u(ok.replace("from '@app/e2e'", "from '../../app/e2e.ts'"))).toEqual([]);
    expect(one(ok, { 'src/kit/probe/all.ts': `export * as helpers from '@app/e2e';\n` })).toContain("`export * as helpers from '@app/e2e'`");
    expect(one(ok, { 'src/kit/probe/use.ts': `import { helpers } from './all';\nconst { '${S}': run } = helpers;\nexport { run };\n` })).toBe(`src/kit/probe/use.ts:2: destructures ${S}: import the helpers by name`);
  });
  it('markProof, PROOF_ANNOTATION under another name, and a unit test module loaded by a spec are refused', () => {
    const marks = u(ok, { 'src/kit/probe/mark.ts': `import { markProof, test } from '@app/e2e-search';\ntest.beforeEach(() => markProof(test.info(), () => test.info(), 'S'));\n` });
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(m).toContain('search proof mark');
    expect(u(ok, { 'src/kit/probe/kind.ts': `import { PROOF_ANNOTATION as kind } from '@app/e2e-search';\nexport const forged = { type: kind, description: 'S' };\n` })).toEqual([
      `src/kit/probe/kind.ts:1: imports kind as PROOF_ANNOTATION, the search proof mark: only app/e2e-search.ts writes it`,
    ]);
    expect(one(`${ok}import './probe.test';\n`)).toContain('loads the unit test ./probe.test');
    expect(one(`${ok}import '../../kit/x/hooks.test.ts';\n`)).toContain('loads the unit test');
  });
  it('escaped spellings of the mark, a helper or the module still get parsed and refused', () => {
    expect(one(ok, { 'src/kit/probe/esc.ts': `export const forged = { type: '\\x6c064', description: 'S' };\n` })).toContain('names the search proof mark');
    expect(one(ok, { 'src/kit/probe/cont.ts': `export const forged = { type: 'l0\\\n64' };\n` })).toContain('names the search proof mark');
    expect(one(ok, { 'src/kit/probe/uni.ts': `import { \\u0065xpectSearchStaysOutOfUrl, test } from '@app/\\u00652e';\ntest.beforeEach(async ({ page }) => {\n  await \\u0065xpectSearchStaysOutOfUrl(page, v, x);\n});\n` })).toBe(`src/kit/probe/uni.ts:3: ${S} is referenced outside a spec: only a test body calls it`);
  });
  it('a look-alike app/e2e.mjs is another module, so its `test` is not trusted; app/e2e.ts still is', () => {
    const mjs = { 'src/app/e2e.mjs': `import { test as base } from '@playwright/test';\nexport const test = base.beforeEach;\n` };
    const why = 'is called in a test whose `test` is not the named import from @playwright/test or app/e2e';
    expect(u(ok.replace(imp, `import { test } from '../../app/e2e.mjs';\nimport { ${R}, ${S}, gotoHub } from '@app/e2e';\n`), mjs)).toEqual([`${F}:5: ${S} ${why}`, `${F}:6: ${R} ${why}`]);
    expect(u(ok.replace("from '@app/e2e'", "from '@app/e2e.ts'"))).toEqual([]);
  });
  it('search-proofs-js-specifier: a module resolves as Playwright loads it (an existing file first, then its extension lookups)', () => {
    // Playwright maps a missing .js to the .ts beside it, so these spellings are the real module.
    expect(['@app/e2e', '../../app/e2e.js', '@app/e2e.js', '@app/e2e-search.js'].map((m) => resolveModule(F, m))).toEqual(['src/app/e2e.ts', 'src/app/e2e.ts', 'src/app/e2e.ts', 'src/app/e2e-search.ts']);
    for (const m of ['../../app/e2e.js', '@app/e2e.js']) expect(u(ok.replaceAll("from '@app/e2e'", `from '${m}'`)), m).toEqual([]);
    // An e2e.js that exists is loaded instead: for `e2e.js`, and for a bare `@app/e2e` too (.js comes before .ts).
    const lookAlike = { 'src/app/e2e.js': `export { test } from '@playwright/test';\n` };
    expect([resolveModule(F, '@app/e2e', new Set(['src/app/e2e.js'])), resolveModule(F, '@app/e2e.js', new Set(['src/app/e2e.js']))]).toEqual(['src/app/e2e.js', 'src/app/e2e.js']);
    const why = 'is called in a test whose `test` is not the named import from @playwright/test or app/e2e';
    for (const m of ['../../app/e2e.js', '@app/e2e'])
      expect(u(ok.replaceAll("from '@app/e2e'", `from '${m}'`), lookAlike), m).toEqual([
        `${F}:1: imports ${R} from ${m} (which loads src/app/e2e.js), not from app/e2e`,
        `${F}:1: imports ${S} from ${m} (which loads src/app/e2e.js), not from app/e2e`,
        `${F}:4: ${S} ${why}`,
        `${F}:5: ${R} ${why}`,
      ]);
    // An unresolved spelling loads nothing, so the problem names no file.
    expect(u(ok.replaceAll("from '@app/e2e'", "from '@app/e2e.mjs'"))).toContain(`${F}:1: imports ${S} from @app/e2e.mjs, not from app/e2e`);
  });
  it('a continuation before a lone CR, U+2028 or U+2029 still decodes to the mark (no other prefilter trigger)', () => {
    for (const nl of ['\r', '\u2028', '\u2029'])
      expect(one(ok, { 'src/kit/probe/cont.ts': `export const forged = { type: 'l0\\${nl}64' };\n` }), JSON.stringify(nl)).toContain('names the search proof mark');
  });
  it('an escape past U+10FFFF in a comment or String.raw never throws and is no problem', () => {
    expect(u(ok, { 'src/kit/probe/doc.ts': `// Reject invalid Unicode escapes such as \\u{110000}.\nexport const x = 1;\n` })).toEqual([]);
    expect(u(ok, { 'src/kit/probe/raw.ts': 'export const r = String.raw`\\u{110000}`;\n' })).toEqual([]);
  });
  it('`import type` / `export type` from a unit test are erased, so they load nothing; `import { type X }` still loads', () => {
    expect(u(ok, { 'src/kit/probe/types.ts': `import type { Case } from './cases.test';\nexport const x: Case = {};\n` })).toEqual([]);
    expect(u(ok, { 'src/kit/probe/retype.ts': `export type { Case } from './cases.test';\n` })).toEqual([]);
    expect(one(ok, { 'src/kit/probe/inline.ts': `import { type Case } from './cases.test';\nexport const x: Case = {};\n` })).toContain('loads the unit test ./cases.test');
  });
});

describe('shots perform the states they name', () => {
  // A state named *pending*, *unknown* or *failed* is an action outcome: it needs an act step (or
  // click/keys) that performs the action, unless it says why not (noOutcome). Loading is *loading*.
  it.each(folders.filter(scoped))('%s: outcome-named shots act', (id) => {
    const text = shotsRaw[`../pages/${id}/shots.ts`] ?? '';
    const bad: string[] = [];
    for (const m of text.matchAll(/\{[^{}]*?name:\s*'([^']+)'[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)) {
      const [obj, name = ''] = m;
      if (!/(^|-)(pending|unknown|failed)(-|$)/.test(name)) continue;
      if (/\b(act|click|keys|noOutcome)\s*:/.test(obj)) continue;
      bad.push(name);
    }
    expect(bad, `pages/${id}/shots.ts: give these an act step ({ act: [{ click: 'Save' }] }), or rename a loading state to *loading*`).toEqual([]);
  });
});

describe('shot states exist in the fixtures', () => {
  // An unknown `state` silently renders the default state, so the shot shows the wrong case.
  // The names are checked against the states the page's fixtures module really exports (its default export's `states`),
  // never against the file's text: a key of some other object, a name in a comment or a part file nothing spreads
  // defines no state, and states spread in from other files (fixtures.<part>.ts, a sub-folder's fixtures) count.
  const fixtureModules = import.meta.glob<{ default?: { states?: Record<string, unknown> } }>('../pages/*/fixtures.ts');
  const undefinedStates = (shots: string, states: Record<string, unknown>): string[] =>
    [...new Set([...shots.matchAll(/\bstate:\s*'([^']+)'/g)].map((m) => m[1] ?? ''))].filter((s) => !Object.hasOwn(states, s));
  it('a state counts only when the exported states hold it, wherever it was written', () => {
    const shots = "[{ state: 'own' }, { state: 'part-a' }, { state: 'part-b' }, { state: 'empty' }, { state: 'nowhere' }, { state: 'toString' }]";
    const partA = { 'part-a': [] };
    // A part file nothing spreads, and another object of the fixtures file that has a key named like a state.
    const partB = { 'part-b': [] };
    const world = { empty: true };
    const states = { own: [], ...partA };
    expect(undefinedStates(shots, states)).toEqual(['part-b', 'empty', 'nowhere', 'toString']);
    expect(undefinedStates(shots, { ...states, ...partB, empty: [] })).toEqual(['nowhere', 'toString']);
    expect(Object.keys(world)).toEqual(['empty']);
  });
  it.each(folders.filter(scoped).filter((id) => shots.has(id)))('%s: every shot state is a fixture state', async (id) => {
    const load = fixtureModules[`../pages/${id}/fixtures.ts`];
    const states = load ? (await load()).default?.states : undefined;
    expect(states, `pages/${id}/fixtures.ts default-exports no states (defineFixtures)`).toBeTruthy();
    const missing = undefinedStates(shotsRaw[`../pages/${id}/shots.ts`] ?? '', states ?? {});
    expect(missing, `pages/${id}/shots.ts names states that pages/${id}/fixtures.ts does not define (they would show the default state)`).toEqual([]);
  });
});

describe('strings tables', () => {
  // Raw keys and half-filled text on screen come from three slips the type system cannot see:
  // `{word}` (single braces are printed as-is; vars are {{word}}), an empty value, and a t() key that
  // is not in the table (dynamic keys, casts). Every table in the page folder (strings.en.json at any
  // depth, e.g. board/options/, and *.strings.en.json) plus the kit's counts as known.
  const tables = import.meta.glob<Record<string, string>>(['../pages/*/**/strings.en.json', '../pages/*/**/*.strings.en.json'], { eager: true, import: 'default' });
  const kit = import.meta.glob<Record<string, string>>('../kit/strings.en.json', { eager: true, import: 'default' });
  const kitKeys = new Set(Object.values(kit).flatMap((t) => Object.keys(t)));
  const sources = raw(
    import.meta.glob(['../pages/*/**/*.{ts,tsx}', '!../pages/*/**/*.test.{ts,tsx}', '!../pages/*/**/*.spec.ts', '!../pages/*/conformance.allow.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  );
  it.each(folders.filter(scoped))('%s: strings have no {single} braces or empty values, and every t() key exists', (id) => {
    const own = Object.entries(tables).filter(([f]) => f.startsWith(`../pages/${id}/`));
    const table: Record<string, string> = Object.assign({}, ...own.map(([, t]) => t));
    const bad: string[] = [];
    for (const [k, v] of own.flatMap(([, t]) => Object.entries(t))) {
      if (typeof v !== 'string') continue;
      if (v.trim() === '') bad.push(`${k}: empty value`);
      if (/(^|[^{])\{[A-Za-z_]\w*\}(?!\})/.test(v)) bad.push(`${k}: single-brace {var} in "${v.slice(0, 50)}" (use {{var}})`);
    }
    // Plural forms (`key_one` / `key_other`) are looked up by their base key.
    const keys = new Set([...Object.keys(table), ...kitKeys].flatMap((k) => [k, k.replace(/_(zero|one|two|few|many|other)$/, '')]));
    for (const [file, text] of Object.entries(sources).filter(([f]) => pageOf(f) === id)) {
      // Skip a literal used as the left operand of `in` (t('ended' in r ? 'a' : 'b')): it is not the key.
      for (const m of text.matchAll(/\bt\(\s*(['"])([\w.-]+)\1(?!\s+in\b)/g)) {
        const key = m[2] ?? '';
        // t('verb.' + kind): a prefix the code completes; some key must start with it.
        if (key.endsWith('.') ? ![...keys].some((k) => k.startsWith(key)) : !keys.has(key))
          bad.push(`${file.replace('../pages/', 'pages/')}: t('${m[2]}') is not in strings.en.json`);
      }
      for (const m of text.matchAll(/\bt\(\s*`([\w.-]+)\$\{/g)) {
        const prefix = m[1] ?? '';
        if (![...keys].some((k) => k.startsWith(prefix))) bad.push(`${file.replace('../pages/', 'pages/')}: no strings key starts with \`${prefix}\``);
      }
    }
    expect(bad, `pages/${id}: fix the strings table or the key`).toEqual([]);
  });
});

describe('lists filter through useDataView only (FUNCTIONAL RULE)', () => {
  // The use-data-view lint rule catches a hand-rolled filter defined in the file it runs on; an
  // imported one (`import { filterRows } from './logic'`) slips past it. This ratchets: the
  // allow-list holds today's offenders and must shrink as they move onto useDataView.
  const HAND = /^(apply(Filters?|Search|Sort)|(filter|sort)[A-Z]\w*|matches(Filters?|Query|Search))$/;
  const ALLOWED = allowDataView();
  const pageSources = raw(
    import.meta.glob(['../pages/*/**/*.{ts,tsx}', '!../pages/*/**/*.test.{ts,tsx}', '!../pages/*/**/*.spec.ts', '!../pages/*/conformance.allow.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  );
  const found = Object.entries(pageSources).flatMap(([file, text]) =>
    [...text.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]*)['"]/g)].flatMap((m) =>
      (m[1] ?? '')
        .split(',')
        .map(
          (s) =>
            s
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0] ?? '',
        )
        .filter((name) => HAND.test(name))
        .map((name) => `${file.replace('../pages/', '')}: ${name}`),
    ),
  );
  it.each(folders.filter(scoped))('%s imports no hand-rolled list filter', (id) => {
    const bad = found.filter((f) => f.startsWith(`${id}/`) && !ALLOWED.has(f));
    expect(bad, `pages/${id}: filter, search and sort rows with useDataView (@kit) and pass view= to DataTable; do not import a filter function`).toEqual([]);
  });
  it('the allow-list only names offenders that still exist (shrink it when one moves to useDataView)', () => {
    const stale = [...ALLOWED].filter((a) => scoped(a.split('/')[0] ?? '') && !found.includes(a));
    expect(stale, 'remove these from dataView in hub/src/pages/<page>/conformance.allow.ts').toEqual([]);
  });
});

describe('no raw line or paragraph separators in sources', () => {
  // A raw U+2028/U+2029 ends a line for some tools and not others; it broke the build. Write the escape.
  // Read from disk: raw globs over css and json together fail to load in vitest ("String is not a function").
  const src = join(import.meta.dirname, '..');
  const all = Object.fromEntries(
    readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(tsx?|css|json|[cm]?js)$/.test(f))
      .map((f) => [`../${f.split(sep).join('/')}`, readFileSync(join(src, f), 'utf8')]),
  );
  const hits = (inPage: (file: string) => boolean) =>
    Object.entries(all)
      .filter(([file]) => inPage(file))
      .flatMap(([file, text]) => text.split('\n').flatMap((line, i) => (/[\u2028\u2029]/.test(line) ? [`src/${file.replace('../', '')}:${i + 1}`] : [])));
  const fix = 'replace the raw character with the escape \\u2028 / \\u2029 in a string, or delete it';
  it.each(folders.filter(scoped))('%s: no file contains a raw U+2028 or U+2029', (id) => {
    expect(
      hits((f) => f.startsWith(`../pages/${id}/`)),
      fix,
    ).toEqual([]);
  });
  if (!only)
    it('no file outside pages/ contains a raw U+2028 or U+2029', () =>
      expect(
        hits((f) => !f.startsWith('../pages/')),
        fix,
      ).toEqual([]));
});

describe('page status', () => {
  const STATUSES = ['hidden', 'preview', 'ready'];
  // A page's own test file, page.test.ts or page.test.tsx (the Board and Vault mount React in theirs).
  const tests = has(import.meta.glob('../pages/*/page.test.{ts,tsx}'));
  it.each(folders.filter(scoped))('%s has a known status, and a page.test.ts(x) when ready', (id) => {
    const status = /\bstatus:\s*(['"])(\w+)\1/.exec(manifestsRaw[`../pages/${id}/page.ts`] ?? '')?.[2] ?? '(none)';
    expect(STATUSES, `pages/${id}/page.ts: status '${status}' must be one of ${STATUSES.join(' | ')}`).toContain(status);
    if (status === 'ready') expect(tests.has(id), `pages/${id}: a ready page needs page.test.ts or page.test.tsx (copy it from hub/templates)`).toBe(true);
  });
});

describe('pages reuse core routes (fixture route identity)', () => {
  // Fixture rules match a call by its route object (core/transport.ts answerFor). A page that
  // defines its own route for an endpoint core already reads (same scope, method and path) gets a
  // second object: the page's state rules miss core's read, and a state shot shows core's loaded data.
  type RouteRow = { file: string; name: string; key: string };
  const scan = (files: Record<string, string>): RouteRow[] =>
    Object.entries(files).flatMap(([file, text]) =>
      [...text.matchAll(/(?:const\s+(\w+)[^=\n]*=\s*)?(?:(\w+):\s*)?defineRoute(?:<[^(]*?>)?\(\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].flatMap((m) => {
        const spec = m[3] ?? '';
        const method = /\bmethod:\s*['"](\w+)['"]/.exec(spec)?.[1];
        const path = /\bpath:\s*['"]([^'"]+)['"]/.exec(spec)?.[1];
        const scope = /\bscope:\s*['"](\w+)['"]/.exec(spec)?.[1];
        return method && path && scope ? [{ file: file.replace('../', ''), name: m[1] ?? m[2] ?? '(inline)', key: `${scope} ${method} ${path}` }] : [];
      }),
    );
  const core = scan(
    raw(import.meta.glob(['../core/**/*.ts', '!../core/**/*.test.ts', '!../core/routes.ts'], { query: '?raw', import: 'default', eager: true })),
  );
  const pageRoutes = scan(
    raw(
      import.meta.glob(['../pages/*/**/*.{ts,tsx}', '!../pages/*/**/*.test.{ts,tsx}', '!../pages/*/**/*.spec.ts', '!../pages/*/conformance.allow.ts'], {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    ),
  );
  const coreBy = new Map<string, RouteRow[]>();
  for (const r of core) coreBy.set(r.key, [...(coreBy.get(r.key) ?? []), r]);

  it.each(folders.filter(scoped))('%s defines no route that core already exports', (id) => {
    const dups = pageRoutes
      .filter((r) => r.file.startsWith(`pages/${id}/`) && coreBy.has(r.key))
      .map((r) => `${r.file} ${r.name}: ${r.key} is core's ${(coreBy.get(r.key) ?? []).map((c) => `${c.name} (${c.file})`).join(', ')}`);
    expect(dups, `pages/${id}: import core's route from @core and answer it in your fixture states, instead of defining your own`).toEqual([]);
  });
  // Endpoints core reads through two routes on purpose: the realm-list route (one realm, or `all`) and the plain listing
  // a realm-pinned agent answers instead (realm 'opt' sent with no realm; core/kit.ts realmFits lets one route carry
  // only one of the two). Both stay in core/chat-lists.ts beside each other, and the AI fixtures answer both (chat-attention).
  const REALM_PAIRS: Record<string, string> = {
    'agent GET /sessions': 'sessions + sessionsHere (core/chat-lists.ts)',
    'agent GET /gates': 'gates + gatesHere (core/chat-lists.ts)',
  };
  // The exception holds only while each pair is exactly its 2 routes in core/chat-lists.ts.
  // A third route, or a route of the pair in another file, fails here (and the rule below lists it as a duplicate).
  if (!only)
    it('the realm route pairs are exactly 2 routes each, both in core/chat-lists.ts', () => {
      const bad = Object.keys(REALM_PAIRS)
        .map((key) => [key, coreBy.get(key) ?? []] as const)
        .filter(([, rs]) => rs.length !== 2 || rs.some((r) => r.file !== 'core/chat-lists.ts'))
        .map(([key, rs]) => `${key}: ${rs.map((r) => `${r.name} (${r.file})`).join(', ') || 'none'}`);
      expect(bad, 'REALM_PAIRS: each key is the realm-list route plus the plain listing, both in core/chat-lists.ts; drop a key whose pair is gone').toEqual([]);
    });
  if (!only)
    it('core exports one route per endpoint', () => {
      const pairOk = (key: string, rs: RouteRow[]) => key in REALM_PAIRS && rs.length === 2 && rs.every((r) => r.file === 'core/chat-lists.ts');
      const dups = [...coreBy.entries()].filter(([key, rs]) => rs.length > 1 && !pairOk(key, rs)).map(([key, rs]) => `${key}: ${rs.map((r) => `${r.name} (${r.file})`).join(', ')}`);
      expect(dups, 'core: merge these into one exported route (the union of their query keys); a fixture rule for one misses reads of the other').toEqual([]);
    });
});
