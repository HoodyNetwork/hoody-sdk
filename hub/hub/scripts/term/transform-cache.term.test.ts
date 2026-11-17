// The dev loader's transform cache (transform-cache.ts, loader.ts cachedTransform): a served entry is byte for byte the
// fresh transform, and every input of a transform invalidates it: the file's text, a `.term` sibling added or removed
// beside an import, an edited web twin, the loader's code stamp, the context.
import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cachedTransform, transformCacheFor, transformContext, type LoadRecord } from './loader';
import { resolverFor, SRC, TermResolver } from './resolve';
import { codeStamp, COMPACT_MIN_LINES, entryHolds, hashText, MAX_PACK_BYTES, TransformCache, transformCacheOn, type CachedTransform } from './transform-cache';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transform-cache-'));
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });
let seq = 0;
const dir = (): string => { const d = path.join(root, 'c' + seq++); fs.mkdirSync(d, { recursive: true }); return d; };
const ctx = transformContext({ flavour: 'fixture', fixtures: true });

/** A small source tree of its own with its own resolver (the real hub/src is never written). */
function tree(files: Record<string, string>): { hub: string; file(rel: string): string; resolver(): TermResolver } {
  const hub = dir();
  fs.writeFileSync(path.join(hub, 'tsconfig.json'), '{}');
  for (const [rel, text] of Object.entries(files)) { const f = path.join(hub, 'src', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  // A new resolver each time: it remembers which files exist.
  return { hub, file: (rel) => path.join(fs.realpathSync(hub), 'src', rel), resolver: () => new TermResolver({ hub, fixtures: true }) };
}

describe('served entries equal the fresh transform', () => {
  test('real hub/src files: miss, then a hit from disk in a new cache object, all three byte-identical', () => {
    const all = [...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: SRC, absolute: true })].filter((f) => !/\.(test|spec|d)\.tsx?$/.test(f)).sort();
    const sample = all.filter((_, i) => i % 90 === 0);
    expect(sample.length).toBeGreaterThan(15);
    const d = dir();
    const first = transformCacheFor(ctx, d);
    const fresh = new Map<string, { code: string; record: LoadRecord }>();
    let stored = 0;
    for (const f of sample) {
      const source = fs.readFileSync(f, 'utf8');
      let want: { code: string; record: LoadRecord };
      try { want = ctx.transform(f, source); } catch { continue; } // a file the loader refuses is not cached either
      fresh.set(f, want);
      expect(cachedTransform(ctx, first, f, source)).toEqual(want);
      if (!source.includes('import.meta.glob')) stored++;
    }
    expect(first.hits).toBe(0);
    expect(stored).toBeGreaterThan(10);
    const second = transformCacheFor(ctx, d);
    for (const [f, want] of fresh) expect(cachedTransform(ctx, second, f, fs.readFileSync(f, 'utf8'))).toEqual(want);
    expect(second.hits).toBe(stored);
    expect(second.misses).toBe(0);
  }, 120_000);

  test('a transform asks its resolver for nothing but resolve(): the recording wrapper sees every answer', () => {
    // cachedTransform records what resolve() answered. A transform that reached the resolver any other way would go
    // unrecorded and a stale entry would be served, so any other property is a failure here.
    const real = resolverFor(true);
    const only = new Proxy(real, {
      get: (t, p) => { if (p !== 'resolve') throw new Error('transform used resolver.' + String(p)); return t.resolve.bind(t); },
    });
    const all = [...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: SRC, absolute: true })].filter((f) => !/\.(test|spec|d)\.tsx?$/.test(f)).sort();
    let compared = 0;
    for (const f of all.filter((_, i) => i % 150 === 7)) {
      const source = fs.readFileSync(f, 'utf8');
      let want: { code: string; record: LoadRecord };
      try { want = ctx.transform(f, source, real); } catch { continue; }
      expect(ctx.transform(f, source, only)).toEqual(want);
      compared++;
    }
    expect(compared).toBeGreaterThan(10);
  }, 120_000);

  test('a file that uses import.meta.glob is never stored', () => {
    const t = tree({ 'a.ts': `export const m = import.meta.glob('./pages/*.ts');\n`, 'pages/x.ts': 'export const x = 1;\n' });
    const c = transformCacheFor(ctx, dir());
    cachedTransform(ctx, c, t.file('a.ts'), fs.readFileSync(t.file('a.ts'), 'utf8'), t.resolver());
    expect(fs.existsSync(c.file)).toBe(false);
  });

  test('an error is thrown again, never stored', () => {
    const t = tree({ 'a.ts': `import { b } from './missing';\nexport const a = b;\n` });
    const c = transformCacheFor(ctx, dir());
    const run = (): unknown => cachedTransform(ctx, c, t.file('a.ts'), fs.readFileSync(t.file('a.ts'), 'utf8'), t.resolver());
    expect(run).toThrow(/TERM_UNRESOLVED/);
    expect(run).toThrow(/TERM_UNRESOLVED/);
    expect(fs.existsSync(c.file)).toBe(false);
  });
});

describe('what invalidates an entry', () => {
  const A = `import { B } from './B';\nexport const a = B;\n`;
  const B = `export const B = 'web';\n`;
  const BT = `export const B = 'term';\n`;

  test('the file edited: a fresh transform; the old text again: fresh again (one entry per file, the last one)', () => {
    const t = tree({ 'A.ts': A, 'B.ts': B });
    const c = transformCacheFor(ctx, dir());
    const f = t.file('A.ts');
    const one = cachedTransform(ctx, c, f, A, t.resolver());
    expect(cachedTransform(ctx, c, f, A, t.resolver())).toEqual(one);
    expect(c.hits).toBe(1);
    const edited = A + 'export const more = 2;\n';
    const two = cachedTransform(ctx, c, f, edited, t.resolver());
    expect(two.code).toContain('more');
    expect(two).toEqual(ctx.transform(f, edited, t.resolver()));
    expect(c.hits).toBe(1);
    expect(cachedTransform(ctx, transformCacheFor(ctx, path.dirname(c.file)), f, edited, t.resolver())).toEqual(two);
  });

  test('an imported file edited: its own entry is fresh; the importer, whose transform does not read it, is served', () => {
    const t = tree({ 'A.ts': A, 'B.ts': B });
    const c = transformCacheFor(ctx, dir());
    cachedTransform(ctx, c, t.file('A.ts'), A, t.resolver());
    cachedTransform(ctx, c, t.file('B.ts'), B, t.resolver());
    const edited = `export const B = 'edited';\n`;
    fs.writeFileSync(t.file('B.ts'), edited);
    const hits = c.hits;
    const b = cachedTransform(ctx, c, t.file('B.ts'), edited, t.resolver());
    expect(b.code).toContain('edited');
    expect(c.hits).toBe(hits);
    expect(cachedTransform(ctx, c, t.file('A.ts'), A, t.resolver())).toEqual(ctx.transform(t.file('A.ts'), A, t.resolver()));
    expect(c.hits).toBe(hits + 1);
  });

  test('a .term sibling ADDED beside an import: the importer is transformed again and loads the sibling', () => {
    const t = tree({ 'A.ts': A, 'B.ts': B });
    const c = transformCacheFor(ctx, dir());
    const f = t.file('A.ts');
    const before = cachedTransform(ctx, c, f, A, t.resolver());
    expect(before.code).toContain(JSON.stringify(t.file('B.ts')));
    fs.writeFileSync(t.file('B.term.ts'), BT);
    const after = cachedTransform(ctx, c, f, A, t.resolver());
    expect(c.hits).toBe(0);
    expect(after.code).toContain(JSON.stringify(t.file('B.term.ts')));
    expect(after).toEqual(ctx.transform(f, A, t.resolver()));
  });

  test('a .term sibling REMOVED: the importer is transformed again and loads the base file', () => {
    const t = tree({ 'A.ts': A, 'B.ts': B, 'B.term.ts': BT });
    const c = transformCacheFor(ctx, dir());
    const f = t.file('A.ts');
    expect(cachedTransform(ctx, c, f, A, t.resolver()).code).toContain(JSON.stringify(t.file('B.term.ts')));
    fs.rmSync(t.file('B.term.ts'));
    const after = cachedTransform(ctx, c, f, A, t.resolver());
    expect(c.hits).toBe(0);
    expect(after.code).toContain(JSON.stringify(t.file('B.ts')));
    expect(after.code).not.toContain('B.term');
  });

  test('a sibling whose web twin is edited (a new export to fill) is transformed again', () => {
    const t = tree({ 'B.ts': B, 'B.term.ts': BT });
    const c = transformCacheFor(ctx, dir());
    const f = t.file('B.term.ts');
    const before = cachedTransform(ctx, c, f, BT, t.resolver());
    expect(before.record.missing ?? []).toEqual([]);
    expect(cachedTransform(ctx, c, f, BT, t.resolver())).toEqual(before);
    expect(c.hits).toBe(1);
    fs.writeFileSync(t.file('B.ts'), B + `export const extra = 1;\n`);
    const after = cachedTransform(ctx, c, f, BT, t.resolver());
    expect(c.hits).toBe(1);
    expect(after.record.missing).toEqual(['extra']);
    expect(after).toEqual(ctx.transform(f, BT, t.resolver()));
  });

  test('a changed loader code stamp, another context: another pack, nothing served across', () => {
    const t = tree({ 'A.ts': A, 'B.ts': B });
    const d = dir();
    const f = t.file('A.ts');
    const c1 = transformCacheFor(ctx, d, 'code-one');
    cachedTransform(ctx, c1, f, A, t.resolver());
    const c2 = transformCacheFor(ctx, d, 'code-two');
    expect(c2.file).not.toBe(c1.file);
    cachedTransform(ctx, c2, f, A, t.resolver());
    expect(c2.hits).toBe(0);
    const other = transformContext({ flavour: 'strict', fixtures: false });
    expect(transformCacheFor(other, d, 'code-one').file).not.toBe(c1.file);
    expect(transformCacheFor(ctx, d, 'code-one').file).toBe(c1.file);
  });

  test('codeStamp follows the text of the code files', () => {
    const d = dir();
    const f = path.join(d, 'loader.ts');
    fs.writeFileSync(f, 'one');
    const a = codeStamp([f]);
    expect(codeStamp([f])).toBe(a);
    fs.writeFileSync(f, 'two');
    expect(codeStamp([f])).not.toBe(a);
    expect(codeStamp([path.join(d, 'gone.ts')])).not.toBe(a);
  });
});

describe('the pack file', () => {
  const entry = (code: string): CachedTransform<LoadRecord> => ({ source: hashText('s'), web: null, resolved: [], code, sum: hashText(code), record: { file: '/x.ts', kind: 'shared' } });
  const probe = { source: hashText('s'), web: null, answer: () => null };

  test('the last line of a file wins; a torn or foreign line is skipped', () => {
    const d = dir();
    const c = new TransformCache<LoadRecord>(d, ['p']);
    c.put('/x.ts', entry('one'));
    c.put('/x.ts', entry('two'));
    fs.appendFileSync(c.file, 'not a line\n"/y.ts"\t{broken\n"/z.ts"\t' + JSON.stringify(entry('torn')).slice(0, 20));
    const again = new TransformCache<LoadRecord>(d, ['p']);
    expect(again.get('/x.ts', probe)?.code).toBe('two');
    expect(again.get('/y.ts', probe)).toBeNull();
    expect(again.get('/z.ts', probe)).toBeNull();
  });

  test('an entry whose code is not the code it was stored with is never served', () => {
    const d = dir();
    const c = new TransformCache<LoadRecord>(d, ['p']);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(c.file, '"/w.ts"\t' + JSON.stringify({ ...entry('stored'), code: 'other' }) + '\n');
    expect(c.get('/w.ts', probe)).toBeNull();
  });

  test('a pack with as many dead lines as live ones is rewritten as the latest line of each file; below that it is left', () => {
    const d = dir();
    const c = new TransformCache<LoadRecord>(d, ['p']);
    const files = COMPACT_MIN_LINES / 2;
    for (let i = 0; i < files; i++) c.put(`/f${i}.ts`, entry('old' + i));
    for (let i = 0; i < files - 1; i++) c.put(`/f${i}.ts`, entry('new' + i));
    const lines = (): number => fs.readFileSync(c.file, 'utf8').split('\n').length - 1;
    expect(lines()).toBe(2 * files - 1);
    // One dead line short of half (and one line short of the minimum): left as it is.
    expect(new TransformCache<LoadRecord>(d, ['p']).get('/f0.ts', probe)?.code).toBe('new0');
    expect(lines()).toBe(2 * files - 1);
    c.put(`/f${files - 1}.ts`, entry('new' + (files - 1)));
    expect(lines()).toBe(2 * files);
    const again = new TransformCache<LoadRecord>(d, ['p']);
    for (let i = 0; i < files; i++) expect(again.get(`/f${i}.ts`, probe)?.code).toBe('new' + i);
    expect(lines()).toBe(files);
    expect(fs.readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    // What the rewritten pack holds is what a later process reads.
    const later = new TransformCache<LoadRecord>(d, ['p']);
    for (let i = 0; i < files; i++) expect(later.get(`/f${i}.ts`, probe)?.code).toBe('new' + i);
    expect(lines()).toBe(files);
  });

  test('entryHolds: source, web twin and each recorded answer', () => {
    const e: CachedTransform<LoadRecord> = { ...entry('c'), web: ['/w.ts', 'h1'], resolved: [['./a', 'A'], ['./b', 'B']] };
    const ok = { source: e.source, web: ['/w.ts', 'h1'] as [string, string], answer: (s: string) => (s === './a' ? 'A' : 'B') };
    expect(entryHolds(e, ok)).toBe(true);
    expect(entryHolds(e, { ...ok, source: 'other' })).toBe(false);
    expect(entryHolds(e, { ...ok, web: null })).toBe(false);
    expect(entryHolds(e, { ...ok, web: ['/w.ts', 'h2'] })).toBe(false);
    expect(entryHolds(e, { ...ok, web: ['/v.ts', 'h1'] })).toBe(false);
    expect(entryHolds(e, { ...ok, answer: (s: string) => (s === './a' ? 'A' : null) })).toBe(false);
    expect(entryHolds({ ...e, web: null }, ok)).toBe(false);
  });

  test('a pack over the size bound is started again; an old pack of another name is removed, a recent one kept', () => {
    const d = dir();
    const c = new TransformCache<LoadRecord>(d, ['p']);
    fs.writeFileSync(c.file, '');
    fs.truncateSync(c.file, MAX_PACK_BYTES + 1);
    expect(c.get('/x.ts', probe)).toBeNull();
    expect(fs.existsSync(c.file)).toBe(false);
    const old = path.join(d, 'transform.0123456789abcdef.jsonl');
    const recent = path.join(d, 'transform.fedcba9876543210.jsonl');
    const foreign = path.join(d, 'css-table.medium.0123.json');
    for (const f of [old, recent, foreign]) fs.writeFileSync(f, '');
    const longAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    fs.utimesSync(old, longAgo, longAgo);
    fs.utimesSync(foreign, longAgo, longAgo);
    c.put('/x.ts', entry('one'));
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
    expect(fs.existsSync(c.file)).toBe(true);
  });

  test('HUB_TRANSFORM_CACHE=0 turns it off; unset is on', () => {
    expect(transformCacheOn({})).toBe(true);
    expect(transformCacheOn({ HUB_TRANSFORM_CACHE: '1' })).toBe(true);
    for (const v of ['0', 'off', 'false', 'no', ' OFF ']) expect(transformCacheOn({ HUB_TRANSFORM_CACHE: v })).toBe(false);
    // Inside a compiled binary nothing is cached, whatever the environment says.
    expect(transformCacheOn({}, '/$bunfs/root/scripts/term')).toBe(false);
    expect(transformCacheOn({ HUB_TRANSFORM_CACHE: '1' }, 'B:\\~BUN\\root')).toBe(false);
  });
});
