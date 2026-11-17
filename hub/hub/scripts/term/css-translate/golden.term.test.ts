// Golden outputs for three real modules (a page part, a programs part, a shell module), built hermetically from copies
// in fixtures/srcroot (tokens.css included) so a later edit of hub/src does not move them. Regenerate after a
// deliberate translator change:  UPDATE_GOLDEN=1 NODE_ENV=test bun test --preload ./scripts/term/test-preload.ts scripts/term/css-translate/golden.term.test.ts
// and review the fixture diff. The full-tree build test below only checks invariants (no exact numbers).
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildTable, cssModuleSource, moduleExports } from '../css-translate';
import { createStyleLookup, moduleKey } from './lookup';
import type { ClassEntry, Outcome } from './types';

const FIX = path.join(import.meta.dir, 'fixtures');
const SRC = path.join(FIX, 'srcroot');
const MODULES = ['pages/logs/parts/Logs.module.css', 'pages/programs/parts/Addresses.module.css', 'shell/pageHost.module.css'];
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const goldenFile = (m: string): string => path.join(FIX, 'golden', `${m.replace(/[/.]/g, '_')}.json`);
// Drop the source locations (line numbers move with harmless edits); keep everything the runtime reads.
const stable = (e: ClassEntry): unknown =>
  JSON.parse(JSON.stringify(e, (k, v) => (k === 'line' || k === 'file' || k === 'generated' ? undefined : v)));

describe('golden modules', () => {
  const build = buildTable({ src: SRC, width: 'narrow' });
  for (const m of MODULES) {
    test(m, () => {
      const r = build.results.find((x) => x.path === m)!;
      expect(r).toBeDefined();
      const got = { exports: r.exports, classes: Object.fromEntries(r.entries.map((e) => [e.id, stable(e)])) };
      const f = goldenFile(m);
      if (UPDATE || !fs.existsSync(f)) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, `${JSON.stringify(got, null, 2)}\n`);
      }
      expect(got).toEqual(JSON.parse(fs.readFileSync(f, 'utf8')));
    });
  }

  test('hand-checked points in the goldens', () => {
    const css = createStyleLookup(build.table);
    const A = 'pages/programs/parts/Addresses.module.css';
    // `max-content max-content minmax(0, 1fr)`: a 3-track row; auto tracks are not aligned across rows → lossy.
    expect(css.styleOf(`${A}#list`)).toMatchObject({
      status: 'partial',
      style: { flexDirection: 'row', columnGap: 1 },
      grid: { pattern: 'fill-auto', tracks: 3, fallback: 'chunk', aligned: false },
    });
    expect(css.styleOf(`${A}#item`)).toMatchObject({ contents: true, status: 'full' });
    expect(css.styleOf(`${A}#note`)?.text?.fg).toBe('token:--hx-muted');
    // pageHost: sticky is translated (a run-time marker the runtime consumes, caps v2); the ::after progress bar is a
    // generated box of its own (PseudoRule), so its inset and size are no layout loss of the class: full.
    const pending = css.styleOf('shell/pageHost.module.css#pending')!;
    expect(pending.status).toBe('full');
    expect(pending.pseudo?.[0]).toMatchObject({ side: 'after', selector: '.pending::after', content: [], style: { position: 'absolute', top: 0, height: 1 } });
    expect(pending.outcomes.find((o: Outcome) => o.decl === 'position: sticky')?.kind).toBe('translated');
    expect(pending.style).toMatchObject({ sticky: { top: 0 } });
    expect(pending.outcomes.filter((o: Outcome) => o.kind === 'dropped')).toEqual([]);
  });
});

describe('library entry points', () => {
  test('moduleExports maps local names to class ids from any path spelling', () => {
    const want = moduleExports('pages/programs/parts/Addresses.module.css', SRC);
    expect(want.list).toBe('pages/programs/parts/Addresses.module.css#list');
    expect(moduleExports(path.join(SRC, 'pages/programs/parts/Addresses.module.css'), SRC)).toEqual(want);
    expect(moduleKey('/x/y/hub/src/shell/pageHost.module.css')).toBe('shell/pageHost.module.css');
    expect(moduleKey('src/shell/pageHost.module.css')).toBe('shell/pageHost.module.css');
    expect(cssModuleSource('shell/pageHost.module.css', SRC)).toMatch(/^export default \{.*"slot":"shell\/pageHost\.module\.css#slot".*\};\n$/);
  });
  test('stylesOf splits a className and skips unknown tokens', () => {
    const css = createStyleLookup(buildTable({ src: SRC, only: ['shell/pageHost.module.css'] }).table);
    const ids = css.stylesOf('shell/pageHost.module.css#slot  hx-global shell/pageHost.module.css#pending').map((e) => e.id);
    expect(ids).toEqual(['shell/pageHost.module.css#slot', 'shell/pageHost.module.css#pending']);
    expect(css.stylesOf(undefined)).toEqual([]);
  });
});

describe('full tree (live hub/src) invariants', () => {
  const { table, results } = buildTable();
  test('every exported class has an entry, and every entry accounts for its declarations', () => {
    expect(results.length).toBeGreaterThan(100);
    for (const r of results)
      for (const id of Object.values(r.exports)) {
        const e = table.classes[id];
        expect(e).toBeDefined();
        if (e!.status !== 'empty') {
          const all = [...e!.outcomes, ...(e!.variants ?? []).flatMap((v) => v.outcomes), ...(e!.childRules ?? []).flatMap((c) => c.outcomes)];
          expect(all.length).toBeGreaterThan(0);
        }
      }
  });
  test('colours are token names or literals, never raw values; sizes are integers', () => {
    const bad: string[] = [];
    const visit = (id: string, v: unknown, k = ''): void => {
      if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) visit(id, vv, kk);
      else if (/^(fg|bg|color)$/.test(k) && typeof v === 'string' && !/^(token:--|literal:|none$)/.test(v)) bad.push(`${id} ${k}=${v}`);
      else if (typeof v === 'number' && !Number.isInteger(v) && !/^flex(Grow|Shrink)$/.test(k)) bad.push(`${id} ${k}=${v}`);
    };
    for (const [id, e] of Object.entries(table.classes)) {
      const { outcomes: _o, ...rest } = e;
      visit(id, { ...rest, variants: rest.variants?.map(({ outcomes: _v, ...x }) => x), childRules: rest.childRules?.map(({ outcomes: _c, specificity: _s, ...x }) => x) });
    }
    expect(bad).toEqual([]);
  });
  test('a translated table never sets a percent flexBasis (OpenTUI takes number | auto)', () => {
    for (const e of Object.values(table.classes)) expect(typeof e.style.flexBasis === 'string' && e.style.flexBasis !== 'auto').toBe(false);
  });
});
