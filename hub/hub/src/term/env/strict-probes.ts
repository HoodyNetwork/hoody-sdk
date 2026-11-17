// Library probes of browser globals, answered at LOAD time: a library that asks "is there a
// document?" gets the terminal's answer written into its source by the loader and the ship bundler, before
// minification, so nothing at run time has to recognise the reader from a stack (stack text does not survive
// bundling). With every probe answered here, strict globals grant no allowance at all: any read that reaches a trap is
// a real use and fails the mount (lifecycle.ts).
//
// Each rule names one library file (path pattern, pinned version noted in `reason`), the exact probe text and how many
// times it must occur. A count that differs (the library changed) throws TERM_PROBE_STALE at load: the rule is
// re-checked by hand, never widened to "whatever matches". Replacements keep the probe's meaning for a terminal:
// `typeof document` answers "undefined" (no document), so the library takes its non-browser branch.
//
// Wiring: scripts/term/loader.ts onLoad and scripts/term/build/plugin.ts call rewriteProbes(text, path) for
// every file PROBE_FILES matches, AFTER fork-deltas (historyBlockers rewrites one history probe to `true` first).
// Pure string work: no AST, no import beyond this file, usable from both.

export interface ProbeRule {
  id: string;
  /** The library file (matched on the resolved path, `/` separators). */
  file: RegExp;
  /** The probe as a pattern (global flag added); the match is replaced whole. */
  probe: RegExp;
  /** The terminal's answer, as source text. */
  as: string;
  /** How many times the probe occurs in the file as loaded (after fork-deltas). */
  count: number;
  /** For a family of files (a bundler's hashed chunks): the rule applies only to a matched file containing this exact
   *  text; there it must find exactly `count` probes. */
  marker?: string;
  /** The file is CommonJS. A loader's onLoad `contents` is always run as an ES module (Bun 1.4: a CommonJS text handed
   *  back loses every export, `require()` of it answers an empty namespace), so the rewritten text is wrapped as one:
   *  `module`/`exports` locals, then `export default module.exports` and one named export per `exports.<name> =`. */
  cjs?: boolean;
  reason: string;
}

/** `typeof document` as a whole expression (not `typeof document.x`). */
const TYPEOF_DOCUMENT = /typeof document(?![\w$.])/;

export const PROBE_RULES: readonly ProbeRule[] = [
  {
    id: 'tanstack-router-isServer',
    file: /\/@tanstack\/router-core\/dist\/esm\/router\.js$/,
    probe: TYPEOF_DOCUMENT,
    as: '"undefined"',
    count: 3,
    reason: 'router-core: isServer default, view-transition and __TSR_ guards (the startViewTransition read sits behind the second and is never reached)',
  },
  {
    id: 'tanstack-history-window',
    file: /\/@tanstack\/history\/dist\/esm\/index\.js$/,
    probe: TYPEOF_DOCUMENT,
    as: '"undefined"',
    count: 4,
    reason: 'history: browser/hash history window default and blocker guards (the fifth, in tryNavigation, is fork-deltas historyBlockers)',
  },
  {
    id: 'tanstack-scroll-session-storage',
    file: /\/@tanstack\/router-core\/dist\/esm\/scroll-restoration\.js$/,
    probe: /return sessionStorage;/,
    as: 'return undefined;',
    count: 1,
    reason: 'router-core getSafeSessionStorage: no session storage in the terminal (the function already answers undefined when it throws)',
  },
  {
    id: 'use-sync-external-store-shim',
    file: /\/use-sync-external-store\/cjs\/use-sync-external-store-shim\.(production|development)\.js$/,
    probe: /typeof window\.document(?![\w$.])/,
    as: '"undefined"',
    count: 1,
    cjs: true,
    reason: 'useSyncExternalStore shim: server branch (the window.document.createElement read behind it is never reached)',
  },
  {
    id: 'react-stately-controlled-state',
    file: /\/react-stately\/dist\/private\/utils\/useControlledState\.mjs$/,
    probe: TYPEOF_DOCUMENT,
    as: '"undefined"',
    count: 1,
    reason: 'react-stately 3.51.0 useControlledState (kit terminal siblings)',
  },
  {
    id: 'query-core-focus-manager',
    file: /\/@tanstack\/query-core\/build\/modern\/focusManager\.js$/,
    probe: /typeof window !== "undefined" && window\.addEventListener/,
    as: 'false',
    count: 1,
    reason: 'query-core default focus listener (visibilitychange on window); the lifecycle installs the terminal one (setQueryManagers), a test without a mount gets none',
  },
  {
    id: 'query-core-focus-visible',
    file: /\/@tanstack\/query-core\/build\/modern\/focusManager\.js$/,
    probe: /globalThis\.document\?\.visibilityState !== "hidden"/,
    as: 'true',
    count: 1,
    reason: 'query-core isFocused() before any setFocused: "is the document visible". A terminal Hub on screen is visible; the terminal focus listener (setQueryManagers) sets the real state once installed',
  },
  {
    id: 'query-core-online-manager',
    file: /\/@tanstack\/query-core\/build\/modern\/onlineManager\.js$/,
    probe: /typeof window !== "undefined" && window\.addEventListener/,
    as: 'false',
    count: 1,
    reason: 'query-core default online/offline listener on window; the lifecycle installs the terminal one (always online)',
  },
  {
    id: 'opentui-worker-runtime',
    // The engine's Bun build and its Node build (the same bundle run by Node) each hold the function in a hashed chunk.
    file: /\/@opentui\/core\/chunk-(bun|node)-[a-z0-9]+\.js$/,
    marker: 'function isGlobalWorkerRuntime()',
    probe: /typeof globalWithWorker\.postMessage(?![\w$.])/,
    // Only the main thread is answered (strict globals live there); a real worker thread still asks its global. The
    // runtime says which thread this is: Bun.isMainThread, else node:worker_threads (Node).
    as: '((globalThis.Bun?.isMainThread ?? globalThis.process?.getBuiltinModule?.("node:worker_threads")?.isMainThread) === false ? typeof globalWithWorker.postMessage : "undefined")',
    count: 1,
    reason: 'opentui core isGlobalWorkerRuntime (in whichever hashed chunk holds the function; the test fails if no chunk does)',
  },
];

/** Cheap pre-filter for a loader's onLoad: every file some rule names. */
export const PROBE_FILES = /\/(@tanstack\/router-core\/dist\/esm\/(router|scroll-restoration)\.js|@tanstack\/history\/dist\/esm\/index\.js|@tanstack\/query-core\/build\/modern\/(focusManager|onlineManager)\.js|use-sync-external-store\/cjs\/use-sync-external-store-shim\.(production|development)\.js|react-stately\/dist\/private\/utils\/useControlledState\.mjs|@opentui\/core\/chunk-(bun|node)-[a-z0-9]+\.js)$/;

export interface ProbeRewrite { code: string; applied: string[] }

/** A CommonJS text as an ES module with the same default and named exports (see ProbeRule.cjs). `require` stays the
 *  runtime's (Bun gives ES modules one; the bundler rewrites it). */
export function cjsAsEsm(code: string): string {
  const names = [...new Set([...code.matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]!))].filter((n) => n !== 'default');
  return 'var module = { exports: {} }; var exports = module.exports;\n' + code + '\nexport default module.exports;\n' +
    names.map((n) => `export const ${n} = module.exports.${n};`).join('\n') + '\n';
}

/** Answers every probe the rules name for this file; a count that differs throws TERM_PROBE_STALE. */
export function rewriteProbes(code: string, path: string, rules: readonly ProbeRule[] = PROBE_RULES): ProbeRewrite {
  const p = path.replace(/\\/g, '/');
  const applied: string[] = [];
  let cjs = false;
  for (const r of rules) {
    if (!r.file.test(p)) continue;
    if (r.marker !== undefined && !code.includes(r.marker)) continue;
    const g = new RegExp(r.probe.source, r.probe.flags.includes('g') ? r.probe.flags : r.probe.flags + 'g');
    const n = code.match(g)?.length ?? 0;
    if (n !== r.count) throw new Error(`TERM_PROBE_STALE: ${r.id} expects ${r.count} probe(s) in ${p}, found ${n}; re-check the library and the rule (never widen it)`);
    code = code.replace(g, r.as);
    applied.push(r.id);
    cjs ||= r.cjs === true;
  }
  return { code: cjs ? cjsAsEsm(code) : code, applied };
}
