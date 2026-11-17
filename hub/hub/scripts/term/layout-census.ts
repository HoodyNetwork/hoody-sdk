// Layout census: every page × every case (fixture states and replayable shots, as the page gate reads them) × several
// terminal sizes, each drawn headless and judged by the layout check (prim/layoutcheck.ts). READ-ONLY for the tree: it
// writes only under --out. One child process per page; a render that wedges is killed, recorded `died` and the page
// resumes after it. Rerun it after a large change and compare the clusters (`--report` reads an --out dir again).
//
//   NODE_ENV=test nice -n 19 bun scripts/term/layout-census.ts --out <dir> [--pages a,b] [--sizes 80x24,120x40,...]
//       [--render-ms 60000] [--states-only] [--resume] [--recheck <earlier out dir>]
//   NODE_ENV=test bun scripts/term/layout-census.ts --out <dir> --report [--over <census dir>] [--rules <json>] [--top N]
//       clusters from the rows already there; --over: <dir> is a recheck of <census dir>, report the whole set with the
//       rechecked runs replaced. Root-cause rules: layout-census.rules.ts beside this file (or --rules <json> with { rules: [...] }) (first match wins).
//   (child) ... --page <id> --out <dir>                                         one page, appends <dir>/rows/<id>.jsonl
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';

const TERM_DIR = fs.existsSync(path.join(import.meta.dir, 'render.ts')) ? import.meta.dir : (process.env.CENSUS_TERM_DIR ?? import.meta.dir);
const HUB = path.resolve(TERM_DIR, '../..');
const SRC = path.join(HUB, 'src');
// From 80x24, the smallest terminal the shell draws its frame in (src/term/shell/TooSmall.tsx).
export const CENSUS_SIZES: ReadonlyArray<readonly [number, number]> = [[80, 24], [120, 40], [200, 50], [320, 90]];

export interface CensusFault { kind: string; path: string; detail: string;
  /** Every named node from the faulted node up to the root, each with its owner components (`Toolbar<SchedulesPage`): the
   *  layout check's own path keeps six names and no owners. Absent when the node was not found again. */
  chain?: string[] }
export interface CensusRow {
  page: string; case: string; fx: string | null; path?: string; cols: number; rows: number;
  /** ok: drawn and judged. died: the child was killed or exited inside this render. threw: renderPage threw. skipped: a shot the terminal cannot replay. */
  status: 'ok' | 'died' | 'threw' | 'skipped';
  why?: string; ms?: number; /** The case replays a shot's action (click, keys) before the frame is judged. */ acted?: boolean; settled?: boolean; loading?: boolean; pending?: string;
  faults?: CensusFault[]; traps?: string[]; errors?: string[]; failures?: string[]; crash?: string | null;
}

const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = (n: string): boolean => process.argv.includes('--' + n);
const parseSizes = (s: string | undefined): [number, number][] => (s ? s.split(',').map((x) => x.split('x').map(Number) as [number, number]) : CENSUS_SIZES.map((x) => [...x] as [number, number]));
const keyOf = (r: { case: string; cols: number; rows: number }): string => `${r.case}|${r.cols}x${r.rows}`;
const readRows = (file: string): CensusRow[] => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as CensusRow); } catch { return []; } };
const fileSafe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, '_');


// A fault names its node by a short path (six names, no owners, not unique). The census finds the node again by what
// the fault's detail says about it (its box, its text, its scroll offset) and records its whole ancestry, each name
// with its owner components (`Toolbar<SchedulesPage`), innermost first.
export interface LNode { id?: string; x: number; y: number; width: number; height: number; parent?: LNode | null; constructor: { name: string }; getChildren?: () => LNode[]; plainText?: string; virtualLineCount?: number; scrollTop?: number }
const lcLabel = (n: LNode): string => (n.id && !/^(box|text|renderable|scrollbox)-\d+$/.test(n.id) ? n.id.replace(/@b?\d+$/, '') : n.constructor.name.replace(/Renderable\d*$/, ''));
const lcText = (n: LNode): string => (n.plainText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
const geo = (n: LNode): string => `${n.width}x${n.height} at ${n.x},${n.y}`;
export function chainOf(n: LNode): string[] {
  const c: string[] = [];
  for (let a: LNode | null | undefined = n; a; a = a.parent) { const l = lcLabel(a); if (!/^(Box|Text|ScrollBox|Root|__root__)$/.test(l) && c[c.length - 1] !== l) c.push(l); }
  return c;
}
/** The node a fault is about, or null when nothing in the tree fits its detail. */
export function nodeOfFault(root: LNode, f: { kind: string; path: string; detail: string }): LNode | null {
  const last = f.path.split(' ⨯ ')[0]!.split(' > ').pop()!;
  const named = (n: LNode): boolean => lcLabel(n).split('<')[0] === last;
  let best: LNode | null = null;
  const take = (n: LNode): void => { if (!best || (named(n) && !named(best))) best = n; };
  const walk = (n: LNode): void => {
    const p = n.parent;
    if (f.kind === 'cut') { if (p && f.detail.startsWith(`${geo(n)} past its box ${geo(p)}`)) take(n); }
    else if (f.kind === 'text-cut') { if (n.virtualLineCount !== undefined && f.detail.startsWith(`${n.virtualLineCount} lines in ${n.height} "${lcText(n)}"`)) take(n); }
    else if (f.kind === 'scrolled-open') { if (typeof n.scrollTop === 'number' && n.scrollTop > 0 && f.detail === `opened scrolled to ${n.scrollTop}`) take(n); }
    else if (f.kind === 'explosion') { if (f.detail.startsWith(`${n.width}x${n.height} in a `)) take(n); }
    else if (f.kind === 'overdraw') { const left = f.detail.split(' / ')[0]!; if ((lcText(n) || `${n.width}x${n.height}`) === left) take(n); }
    for (const k of typeof n.getChildren === 'function' ? n.getChildren() : []) walk(k);
  };
  walk(root);
  return best;
}

// ── Child: one page ────────────────────────────────────────────────────────────────────────────────────────────────
async function runPage(page: string, out: string, sizes: [number, number][], renderMs: number, statesOnly: boolean, only: Set<string> | null): Promise<void> {
  const rowsFile = path.join(out, 'rows', page + '.jsonl');
  const startFile = path.join(out, 'rows', page + '.start');
  fs.mkdirSync(path.join(out, 'rows'), { recursive: true });
  fs.mkdirSync(path.join(out, 'frames', page), { recursive: true });
  const done = new Set(readRows(rowsFile).map(keyOf));
  const put = (r: CensusRow): void => { fs.appendFileSync(rowsFile, JSON.stringify(r) + '\n'); done.add(keyOf(r)); };
  const { freezeClock, seedRandom } = await import(path.join(TERM_DIR, 'clock.ts')) as typeof import('./clock');
  freezeClock();
  seedRandom();
  const g = await import(path.join(TERM_DIR, 'goldens.ts')) as typeof import('./goldens');
  const { renderPage, ACT_WARNING } = await import(path.join(TERM_DIR, 'render.ts')) as typeof import('./render');
  const { replay, rendererHitAt, rendererOwns } = await import(path.join(TERM_DIR, 'shot-replay.ts')) as typeof import('./shot-replay');
  const { crashShown } = await import(path.join(TERM_DIR, 'crash-shown.ts')) as typeof import('./crash-shown');
  const skipped: Record<string, string> = {};
  let cases = await g.casesOf(page, skipped);
  if (statesOnly) cases = cases.filter((c) => !c.name.startsWith('shot-'));
  const lc = (await import(path.join(SRC, 'term/prim/layoutcheck.ts'))) as typeof import('../../src/term/prim/layoutcheck');
  const semMod = (await import(path.join(SRC, 'term/prim/semantics.ts'))) as typeof import('../../src/term/prim/semantics');
  const { safeDiagnostic: sd } = (await import(path.join(SRC, 'term/prim/safe.ts'))) as typeof import('../../src/term/prim/safe');
  if (!only) for (const [name, why] of Object.entries(skipped)) if (!done.has(`${name}|0x0`)) put({ page, case: name, fx: null, cols: 0, rows: 0, status: 'skipped', why });
  for (const c of cases) {
    for (const [cols, rows] of sizes) {
      if (done.has(keyOf({ case: c.name, cols, rows }))) continue;
      if (only && !only.has(keyOf({ case: c.name, cols, rows }))) continue;
      // The parent reads this when the child dies: the render under way.
      fs.writeFileSync(startFile, JSON.stringify({ case: c.name, fx: c.fx, path: c.path, cols, rows }));
      const base = { page, case: c.name, fx: c.fx, ...(c.path ? { path: c.path } : {}), cols, rows, ...(c.loading ? { loading: true } : {}), ...(c.steps ? { acted: true } : {}) };
      const t0 = performance.now();
      let s: Awaited<ReturnType<typeof renderPage>>;
      try {
        s = await renderPage({ page, fx: c.fx, cols, rows, ...(c.path ? { path: c.path } : {}), settleMs: c.loading ? 3000 : Math.min(20000, renderMs) });
      } catch (e) { put({ ...base, status: 'threw', why: sd(String((e as Error)?.message ?? e), 400).split('\n')[0]!, ms: Math.round(performance.now() - t0) }); continue; }
      try {
        const r0 = s.renderer as unknown as { root: never; stdin?: { emit(e: 'data', b: Buffer): unknown } };
        if (c.steps) {
          let why: string | null;
          try {
            const wheel = async (x: number, y: number, dir: 'up' | 'down') => { r0.stdin?.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`)); await s.settle(); };
            // The hit test as goldens.ts passes it: on screen = drawn at that cell, never under the key bar or a band.
            const hitAt = rendererHitAt(s.renderer);
            const owns = rendererOwns(s.renderer, (n) => semMod.renderableOf(n as never));
            why = await replay(s, c.steps, { tree: () => semMod.semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never, cols, rows, ...(hitAt ? { wheel, hitAt } : {}), ...(owns ? { owns } : {}) });
          } catch (e) { why = `replay threw: ${String((e as Error)?.message ?? e)}`; }
          if (why) { put({ ...base, status: 'skipped', why: sd(why, 300).split('\n')[0]!, traps: s.trapsAt, ms: Math.round(performance.now() - t0) }); continue; }
        }
        const faults: CensusFault[] = lc.layoutFaults(r0.root, { cols, rows }).map((f) => ({ kind: f.kind, path: f.path, detail: sd(f.detail, 300) }));
        if (!g.opensScrolledOnPurpose(c)) for (const b of lc.scrolledBoxes(r0.root)) faults.push({ kind: 'scrolled-open', path: b.path, detail: `opened scrolled to ${b.top}` });
        for (const f of faults) { const n = nodeOfFault(r0.root as unknown as LNode, f); if (n) f.chain = chainOf(n).map((x) => sd(x, 120)); }
        const lines = s.frame.replace(/\n$/, '').split('\n');
        if (lines.length !== rows || lines.some((l) => [...l].length > cols)) faults.push({ kind: 'offscreen', path: 'frame', detail: `frame ${Math.max(...lines.map((l) => [...l].length))}x${lines.length}` });
        const bar = c.path?.startsWith('/_') ? null : lc.topBarFault(r0.root, { cols, rows });
        if (bar) faults.push({ kind: 'offscreen', path: 'topbar', detail: bar });
        fs.writeFileSync(path.join(out, 'frames', page, `${fileSafe(c.name)}.${cols}x${rows}.txt`), sd(s.frame, 1_000_000).split('\n').map((l) => l.trimEnd()).join('\n'));
        put({ ...base, status: 'ok', ms: Math.round(performance.now() - t0), settled: s.settled, ...(s.settled ? {} : { pending: sd(s.pendingText, 300) }), faults,
          traps: s.trapsAt, errors: [...new Set(s.errors)].filter((e) => !ACT_WARNING.test(e)).map((e) => sd(e, 240)).slice(0, 12),
          failures: s.failures.map((f) => sd(f.message.split('\n')[0]!, 300)), crash: crashShown(s.frame) ? sd(String(crashShown(s.frame)), 200) : null });
      } finally { try { s.close(); } catch { /* a broken session still ends the row */ } }
    }
  }
  try { fs.unlinkSync(startFile); } catch { /* none */ }
}

// ── Parent: every page, one child at a time ────────────────────────────────────────────────────────────────────────
async function runAll(out: string): Promise<void> {
  const { spawnGroup, stopGroup, installGroupReaper } = await import(path.join(TERM_DIR, 'child-group.ts')) as typeof import('./child-group');
  installGroupReaper();
  const all = fs.readdirSync(path.join(SRC, 'pages')).filter((d) => fs.existsSync(path.join(SRC, 'pages', d, 'page.ts')) || fs.existsSync(path.join(SRC, 'pages', d, 'page.tsx'))).sort();
  let ids = arg('pages')?.split(',').filter((x) => all.includes(x)) ?? all;
  // --recheck <dir>: only the runs that were not clean in an earlier census (a fault, a trap, unsettled, died, threw).
  const recheck = arg('recheck');
  const onlyFile = path.join(out, 'only.json');
  if (recheck) {
    const only: Record<string, string[]> = {};
    for (const id of ids) {
      const bad = readRows(path.join(path.resolve(recheck), 'rows', id + '.jsonl')).filter((r) => r.cols > 0 && (r.status === 'died' || r.status === 'threw' || (r.status === 'ok' && (r.faults?.length || r.traps?.length || r.crash || r.failures?.length || (!r.settled && !r.loading))))).map(keyOf);
      if (bad.length) only[id] = [...new Set(bad)];
    }
    ids = ids.filter((id) => only[id]);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(onlyFile, JSON.stringify(only));
  }
  const renderMs = Number(arg('render-ms') ?? 60000);
  fs.mkdirSync(path.join(out, 'rows'), { recursive: true });
  if (!has('resume')) for (const id of ids) for (const ext of ['.jsonl', '.start']) { try { fs.unlinkSync(path.join(out, 'rows', id + ext)); } catch { /* none */ } }
  const env = { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' } as Record<string, string>;
  for (const id of ids) {
    const t0 = Date.now();
    const startFile = path.join(out, 'rows', id + '.start');
    for (let attempt = 0; attempt < 400; attempt++) {
      const cmd = ['nice', '-n', '19', 'bun', import.meta.path, '--page', id, '--out', out, '--render-ms', String(renderMs), ...(arg('sizes') ? ['--sizes', arg('sizes')!] : []), ...(has('states-only') ? ['--states-only'] : []), ...(recheck ? ['--only-file', onlyFile] : [])];
      const p = spawnGroup(cmd, { cwd: HUB, env });
      let killed = false;
      // The per-render limit: the child names the render under way in <id>.start; one older than the limit is stopped
      // (the file's mtime: the child's own clock is the frozen fixture clock).
      const watch = setInterval(() => { try { if (Date.now() - fs.statSync(startFile).mtimeMs > renderMs) { killed = true; void stopGroup(p); } } catch { /* not started */ } }, 2000);
      const [, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
      const code = await p.exited;
      clearInterval(watch);
      if (!fs.existsSync(startFile)) { if (code !== 0) process.stdout.write(`  ${id}: child exit ${code} outside a render: ${err.trim().split('\n').slice(-2).join(' | ').slice(0, 300)}\n`); break; }
      const st = JSON.parse(fs.readFileSync(startFile, 'utf8')) as { case: string; fx: string | null; path?: string; cols: number; rows: number };
      fs.appendFileSync(path.join(out, 'rows', id + '.jsonl'), JSON.stringify({ page: id, case: st.case, fx: st.fx, ...(st.path ? { path: st.path } : {}), cols: st.cols, rows: st.rows, status: 'died', why: killed ? `stopped after ${renderMs} ms` : `exit ${code}: ${err.trim().split('\n').slice(-2).join(' | ').slice(0, 300)}` } satisfies CensusRow) + '\n');
      fs.unlinkSync(startFile);
    }
    const rows = readRows(path.join(out, 'rows', id + '.jsonl'));
    const n = (f: (r: CensusRow) => boolean) => rows.filter(f).length;
    process.stdout.write(`${id.padEnd(14)} ${String(rows.length).padStart(4)} runs ${String(Math.round((Date.now() - t0) / 1000)).padStart(5)} s  faults ${rows.reduce((a, r) => a + (r.faults?.length ?? 0), 0)}  unsettled ${n((r) => r.status === 'ok' && !r.settled && !r.loading)}  traps ${n((r) => !!r.traps?.length)}  threw ${n((r) => r.status === 'threw')}  died ${n((r) => r.status === 'died')}  skipped ${n((r) => r.status === 'skipped')}\n`);
  }
}

// ── Report: clusters ───────────────────────────────────────────────────────────────────────────────────────────────
/** A fault path's segments, root first. An overdraw path is `a > b > c ⨯ d`: the pair is the last segment. */
const segs = (p: string): string[] => p.split(' ⨯ ')[0]!.split(' > ').map((x) => x.trim()).filter(Boolean);
/** The components named on a segment (`Toolbar<SchedulesPage`, `div.choices`, `Box#id`): innermost first. */
const owners = (seg: string): string[] => seg.split('<').map((x) => x.replace(/#.*$/, '').replace(/\[\d+\]$/, '').trim()).filter(Boolean);
let kitNames: Set<string> | null = null;
function kitSet(): Set<string> {
  if (kitNames) return kitNames;
  kitNames = new Set<string>();
  const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else if (/\.tsx?$/.test(e.name) && !/\.(test|scenario|spec)\./.test(e.name)) { const src = fs.readFileSync(path.join(d, e.name), 'utf8'); for (const m of src.matchAll(/export (?:function|const) ([A-Z][A-Za-z0-9]+)/g)) kitNames!.add(m[1]!); } } };
  for (const d of ['kit', 'term/prim', 'term/shell', 'shell']) { try { walk(path.join(SRC, d)); } catch { /* absent */ } }
  return kitNames;
}
/** The innermost shared (kit, prim, shell) component on the path, else the innermost named thing. */
export function clusterKey(f: CensusFault): string {
  const kit = kitSet();
  // Innermost first: the node's whole chain when the run recorded it, else the check's six-name path.
  const s = f.chain ?? segs(f.path).reverse();
  const generic = /^(Box|Text|box|text|ScrollBox|PageHost|ShellFrame|TermShell|ScreenRoot|PaneSize|PageRoot|Scroll|Pressable|hub-shell-pane|screen-root)$/;
  for (const seg of s) for (const o of owners(seg)) if (kit.has(o) && !generic.test(o)) return o;
  for (const seg of s) { const o = owners(seg)[0]; if (o && !generic.test(o)) return o; }
  return f.path === 'frame' || f.path === 'topbar' ? f.path : '(unnamed)';
}
/** A root-cause rule (layout-census.rules.ts): first match wins. */
export interface CensusRule { id: string; title: string; area: string; status: string; match: { kind?: string; page?: string; chain?: string; detail?: string; acted?: boolean } }
export function ruleOf(rules: readonly CensusRule[], r: { page: string; acted?: boolean }, f: CensusFault): CensusRule | null {
  const chain = (f.chain ?? segs(f.path).reverse()).join(' < ');
  for (const x of rules) {
    const m = x.match;
    if (m.kind !== undefined && m.kind !== f.kind) continue;
    if (m.acted !== undefined && m.acted !== (r.acted === true)) continue;
    if (m.page !== undefined && !new RegExp(m.page).test(r.page)) continue;
    if (m.chain !== undefined && !new RegExp(m.chain).test(chain)) continue;
    if (m.detail !== undefined && !new RegExp(m.detail).test(f.detail)) continue;
    return x;
  }
  return null;
}
async function report(out: string): Promise<void> {
  let rows = fs.readdirSync(path.join(out, 'rows')).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readRows(path.join(out, 'rows', f)));
  // --over <dir>: a recheck's rows replace the same runs of the census it rechecked (the current state of the whole set).
  const over = arg('over');
  if (over) {
    const newer = new Map(rows.map((r) => [`${r.page}|${keyOf(r)}`, r]));
    const base = fs.readdirSync(path.join(path.resolve(over), 'rows')).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readRows(path.join(path.resolve(over), 'rows', f)));
    rows = base.map((r) => newer.get(`${r.page}|${keyOf(r)}`) ?? r);
  }
  const rulesFile = arg('rules');
  const rules: CensusRule[] = rulesFile ? (JSON.parse(fs.readFileSync(rulesFile, 'utf8')) as { rules: CensusRule[] }).rules : ((await import(path.join(TERM_DIR, 'layout-census.rules.ts'))) as typeof import('./layout-census.rules')).CENSUS_RULES;
  interface Cl { key: string; kind: string; title?: string; area?: string; status?: string; kinds: Map<string, number>; count: number; pages: Set<string>; sizes: Map<string, number>; cases: Set<string>; ex: { page: string; case: string; size: string; path: string; detail: string }[] }
  const cl = new Map<string, Cl>();
  for (const r of rows) for (const f of r.faults ?? []) {
    const rule = ruleOf(rules, r, f);
    const key = rule ? rule.id : clusterKey(f);
    const k = rule ? `rule|${rule.id}` : `${f.kind}|${key}`;
    const c: Cl = cl.get(k) ?? { key, kind: rule ? 'rule' : f.kind, ...(rule ? { title: rule.title, area: rule.area, status: rule.status } : {}), kinds: new Map(), count: 0, pages: new Set(), sizes: new Map(), cases: new Set(), ex: [] };
    cl.set(k, c);
    c.kinds.set(f.kind, (c.kinds.get(f.kind) ?? 0) + 1);
    c.count++;
    c.pages.add(r.page);
    c.cases.add(`${r.page}/${r.case}`);
    const size = `${r.cols}x${r.rows}`;
    c.sizes.set(size, (c.sizes.get(size) ?? 0) + 1);
    if (c.ex.length < 3 && !c.ex.some((e) => e.page === r.page)) c.ex.push({ page: r.page, case: r.case, size, path: f.chain ? [...f.chain].reverse().join(' > ') : f.path, detail: f.detail });
  }
  const sorted = [...cl.values()].sort((a, b) => b.count - a.count);
  const ok = rows.filter((r) => r.status === 'ok');
  const L: string[] = [];
  L.push(`runs ${rows.length}: ok ${ok.length}, with faults ${ok.filter((r) => r.faults?.length).length}, unsettled ${ok.filter((r) => !r.settled && !r.loading).length}, traps ${rows.filter((r) => r.traps?.length).length}, threw ${rows.filter((r) => r.status === 'threw').length}, died ${rows.filter((r) => r.status === 'died').length}, skipped ${rows.filter((r) => r.status === 'skipped').length}; faults ${sorted.reduce((a, c) => a + c.count, 0)} in ${sorted.length} clusters`);
  const bySize = new Map<string, number>(); const byKind = new Map<string, number>(); const byPage = new Map<string, number>();
  for (const r of ok) for (const f of r.faults ?? []) { bySize.set(`${r.cols}x${r.rows}`, (bySize.get(`${r.cols}x${r.rows}`) ?? 0) + 1); byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1); byPage.set(r.page, (byPage.get(r.page) ?? 0) + 1); }
  const show = (m: Map<string, number>): string => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  L.push(`by size: ${show(bySize)}`, `by kind: ${show(byKind)}`, `by page: ${show(byPage)}`, '');
  const top = Number(arg('top') ?? 30);
  for (const [i, c] of sorted.slice(0, top).entries()) {
    L.push(`#${i + 1} ${c.title ? `[${c.key}] ${c.title} (area ${c.area}; ${c.status})` : `${c.kind} @ ${c.key}`}: ${c.count} faults (${show(c.kinds)}), ${c.cases.size} cases, pages ${[...c.pages].join(',')}; sizes ${show(c.sizes)}`);
    for (const e of c.ex) L.push(`     ${e.page}/${e.case} ${e.size}: ${e.path}\n        ${e.detail}`);
  }
  L.push('', 'Not ok:');
  for (const r of rows) if (r.status !== 'ok') L.push(`  ${r.status} ${r.page}/${r.case} ${r.cols}x${r.rows}: ${r.why ?? ''}`);
  for (const r of ok) if (!r.settled && !r.loading) L.push(`  unsettled ${r.page}/${r.case} ${r.cols}x${r.rows}: ${r.pending ?? ''}`);
  for (const r of ok) if (r.traps?.length) L.push(`  trap ${r.page}/${r.case} ${r.cols}x${r.rows}: ${r.traps.join(' | ')}`);
  for (const r of ok) if (r.crash || r.failures?.length) L.push(`  crash ${r.page}/${r.case} ${r.cols}x${r.rows}: ${r.crash ?? ''} ${r.failures?.join(' | ') ?? ''}`);
  const errs = new Map<string, number>();
  for (const r of ok) for (const e of r.errors ?? []) { const k = `${r.page}: ${e.replace(/\d+/g, '0').slice(0, 160)}`; errs.set(k, (errs.get(k) ?? 0) + 1); }
  L.push('', 'Console errors (page: text, runs):', ...[...errs].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `  ${n}× ${k}`));
  fs.writeFileSync(path.join(out, 'report.txt'), L.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'clusters.json'), JSON.stringify(sorted.map((c) => ({ ...c, kinds: Object.fromEntries(c.kinds), pages: [...c.pages], cases: [...c.cases], sizes: Object.fromEntries(c.sizes) })), null, 1));
  process.stdout.write(L.slice(0, 4 + top * 5).join('\n') + '\n');
}

if (import.meta.main) {
  const out = arg('out');
  if (!out) { process.stderr.write('usage: layout-census.ts --out <dir> [--pages a,b] [--sizes 80x24,...] [--render-ms N] [--states-only] [--resume] [--recheck <dir>] | --out <dir> --report [--top N]\n'); process.exit(2); }
  if (has('report')) { await report(path.resolve(out)); process.exit(0); }
  const page = arg('page');
  if (page) {
    const of = arg('only-file');
    const only = of ? new Set((JSON.parse(fs.readFileSync(of, 'utf8')) as Record<string, string[]>)[page] ?? []) : null;
    await runPage(page, path.resolve(out), parseSizes(arg('sizes')), Number(arg('render-ms') ?? 60000), has('states-only'), only);
    process.exit(0);
  }
  await runAll(path.resolve(out));
  await report(path.resolve(out));
  process.exit(0);
}
