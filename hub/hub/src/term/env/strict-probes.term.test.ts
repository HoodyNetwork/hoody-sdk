// Load-time probe answers (strict-probes.ts) against the installed libraries.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Every rule matches its real library file (after fork-deltas) with exactly its count, and afterwards the probe is gone | 'rules match the installed libraries' |
// | 2 | A changed library (one probe more or less) throws TERM_PROBE_STALE, never a partial rewrite | 'stale rule refuses' |
// | 3 | `typeof document.x` and other files are left alone; the worker answer still asks the global off the main thread | 'only the probe' |
// | 4 | The engine's Node build gets the same answer; under Node the thread is read from node:worker_threads | 'the engine\'s Node build: …' |
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { historyBlockers, TANSTACK_HISTORY } from '../../../scripts/term/fork-deltas';
import { cjsAsEsm, PROBE_FILES, PROBE_RULES, rewriteProbes } from './strict-probes';

const API = path.resolve(import.meta.dir, '../../../..');
const roots = [path.join(API, 'node_modules'), path.join(API, '..', 'node_modules')];
function* files(): Generator<string> {
  const rel = [
    '@tanstack/router-core/dist/esm/router.js', '@tanstack/router-core/dist/esm/scroll-restoration.js', '@tanstack/history/dist/esm/index.js',
    'use-sync-external-store/cjs/use-sync-external-store-shim.production.js', 'use-sync-external-store/cjs/use-sync-external-store-shim.development.js',
    'react-stately/dist/private/utils/useControlledState.mjs',
    '@tanstack/query-core/build/modern/focusManager.js', '@tanstack/query-core/build/modern/onlineManager.js',
  ];
  for (const r of rel) for (const root of roots) { const f = path.join(root, r); if (fs.existsSync(f)) { yield f; break; } }
  for (const root of roots) {
    const d = path.join(root, '@opentui/core');
    if (fs.existsSync(d)) { for (const n of fs.readdirSync(d)) if (/^chunk-(bun|node)-[a-z0-9]+\.js$/.test(n) && fs.readFileSync(path.join(d, n), 'utf8').includes('function isGlobalWorkerRuntime')) yield path.join(d, n); break; }
  }
}
const loaded = (f: string) => { const s = fs.readFileSync(f, 'utf8'); return TANSTACK_HISTORY.test(f) ? historyBlockers(s, f) : s; };

test('rules match the installed libraries', () => {
  const seen = new Set<string>();
  for (const f of files()) {
    expect(PROBE_FILES.test(f)).toBe(true);
    const { code, applied } = rewriteProbes(loaded(f), f);
    expect(applied.length).toBeGreaterThan(0);
    for (const id of applied) {
      seen.add(id);
      const r = PROBE_RULES.find((x) => x.id === id)!;
      if (!r.as.includes(r.probe.source.replace(/\\/g, '').replace(/\(\?!.*$/, ''))) expect(new RegExp(r.probe.source).test(code)).toBe(false);
    }
  }
  expect([...seen].sort()).toEqual(PROBE_RULES.map((r) => r.id).sort());
});

test('stale rule refuses', () => {
  const f = '/x/node_modules/react-stately/dist/private/utils/useControlledState.mjs';
  expect(() => rewriteProbes('a(typeof document); b(typeof document);', f)).toThrow('TERM_PROBE_STALE');
  expect(() => rewriteProbes('nothing here', f)).toThrow('TERM_PROBE_STALE');
  // A hashed chunk family: a chunk without the marker is not this rule's; one with it must hold the exact count.
  const chunk = '/x/node_modules/@opentui/core/chunk-bun-zz9.js';
  expect(rewriteProbes('other code', chunk).applied).toEqual([]);
  expect(() => rewriteProbes('function isGlobalWorkerRuntime() { return 1; }', chunk)).toThrow('TERM_PROBE_STALE');
});

test('only the probe', () => {
  const f = '/x/node_modules/react-stately/dist/private/utils/useControlledState.mjs';
  const r = rewriteProbes('if (typeof document !== "undefined" && typeof document.body) x();', f);
  expect(r.code).toBe('if ("undefined" !== "undefined" && typeof document.body) x();');
  expect(rewriteProbes('typeof document', '/x/src/mine.ts')).toEqual({ code: 'typeof document', applied: [] });
  const w = rewriteProbes('function isGlobalWorkerRuntime() { if (typeof globalWithWorker.postMessage !== "function") return false;', '/x/node_modules/@opentui/core/chunk-bun-abc123.js').code;
  const run = (isMainThread: boolean) => new Function('globalThis', 'globalWithWorker', `${w} return true; } return isGlobalWorkerRuntime();`)({ Bun: { isMainThread } }, { postMessage: () => {} });
  expect(run(true)).toBe(false);
  expect(run(false)).toBe(true);
});

test('the engine\'s Node build: its chunk gets the same answer, and the thread comes from node:worker_threads', () => {
  // The same bundle run by Node loads @opentui/core's Node build (chunk-node-*.js). Unanswered, its probe of
  // postMessage meets the strict globals and the Hub stops at load (TERM_GLOBAL).
  const chunks = [...files()].filter((f) => /\/chunk-node-[a-z0-9]+\.js$/.test(f));
  expect(chunks.length).toBe(1);
  expect(rewriteProbes(fs.readFileSync(chunks[0]!, 'utf8'), chunks[0]!).applied).toEqual(['opentui-worker-runtime']);
  const w = rewriteProbes('function isGlobalWorkerRuntime() { if (typeof globalWithWorker.postMessage !== "function") return false;', '/x/node_modules/@opentui/core/chunk-node-abc123.js').code;
  const run = (isMainThread: boolean) => new Function('globalThis', 'globalWithWorker', `${w} return true; } return isGlobalWorkerRuntime();`)(
    { process: { getBuiltinModule: (name: string) => (name === 'node:worker_threads' ? { isMainThread } : undefined) } }, { postMessage: () => {} });
  expect(run(true)).toBe(false);
  expect(run(false)).toBe(true);
});

test('a CommonJS file keeps its exports through the loader', () => {
  // Bun runs onLoad contents as an ES module: without the wrap, require() of the shim answered an empty namespace and
  // every mount crashed in the router (useSyncExternalStore is not a function).
  const f = roots.map((r) => path.join(r, 'use-sync-external-store/cjs/use-sync-external-store-shim.development.js')).find((x) => fs.existsSync(x))!;
  const { code } = rewriteProbes(fs.readFileSync(f, 'utf8'), f);
  expect(code).toContain('export default module.exports;');
  expect(code).toContain('export const useSyncExternalStore = module.exports.useSyncExternalStore;');
  // The wrapped text parses as an ES module exporting default + each CommonJS name.
  expect(new Bun.Transpiler({ loader: 'js' }).scan(cjsAsEsm('exports.a = 1; exports.b = () => 2; exports.a = 3;')).exports.sort()).toEqual(['a', 'b', 'default']);
});
