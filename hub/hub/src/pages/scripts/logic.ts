// Pure rules of the scripts page (no React, no I/O).
// The views draw from these and data.ts owns every request.
//
//   caps / missing          what an update unlocks; an old kit reads only.
//   paths and routes        one canonical form, root-relative (`default/<n>/a.ts`, n the Exec folder): every kit request and
//                           comparison uses it. Byte-exact, no case folding.
//   previews                route answers: a fallback or an answer outside the script's folder is
//                           "the general script", never a conflict.
//   statusOf                three chips (Failing / Working / Turned off) or none, never zero.
//   header / withKey        the leading magic-comment block exactly as the kit reads it, and the caller key
//                           placed in the bytes that are validated, approved and written.
//   extract / changesOf / diff / approval   the AI review rules; riskOf is only words.
//   settleView  outcome-unknown handling: pending is never cancelled.
import { EXEC_DEFAULT, execIndex, execRoot, stringOrEmpty as str } from '@core';
import { cleanAgentText, scrubSecrets } from '@kit';
import { logsLinkFor } from '../logs/links';
import { describeFile, fileMatcher, type RouteInfo, type Seg } from './routePattern';
import strings from './strings.en.json';
import { b64url, hex, newKey as mintKey, scrubAll, spans, CTRL } from './secrets';
import type { Alias, Caps, CompScripts, Instance, ResolveAnswer, ScriptItem, ScriptRow, Summary, Validation } from './types';

/** The default folder's tree (fixtures, tests and the folder-1 hand-offs); page logic takes the folder from the path or the page. */
export const ROOT = execRoot(EXEC_DEFAULT);
const HEADER_LINES = 30;
const MAX_PATH = 512;
export const CAPS = ['revisions', 'history', 'env', 'executions', 'tests', 'publishable'] as const;
type CapName = (typeof CAPS)[number];

/** What each kit action needs; anything absent shows "Update this computer". */
const NEEDS: Record<string, readonly CapName[]> = {
  create: ['revisions'],
  save: ['revisions'],
  publish: ['revisions'],
  settings: ['revisions'],
  protect: ['revisions'],
  del: ['revisions'],
  restore: ['revisions', 'history'],
  versions: ['history'],
  deleted: ['history'],
  secrets: ['env'],
  activity: ['executions'],
  tests: ['tests'],
};

const SEG = /^[A-Za-z0-9_.-]+$/;
const EXCLUDED = ['_hoody', '_sdk', 'node_modules', '.git', '.hoody-cache'];
/** hoody-exec's reserved middleware basenames, case-sensitive as there. */
const RESERVED_MIDDLEWARE = ['pre', 'post'];
/** Paths hoody-exec serves itself before script routing (compared to the request URL exactly). */
const INTERCEPTED = ['/favicon.ico', '/openapi.json', '/openapi.yaml'];
export const IDEM = /^hub-[A-Za-z0-9_-]{22,64}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const own = (o: unknown, k: string): boolean => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

// ── capabilities ─────────────────────────────────────────────────────────────────────────────────

function kitTime(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** health: the kit's GET health answer. features[] names what this kit can do; anything else has none of them. */
export function caps(health: unknown): Caps {
  const h = (health && typeof health === 'object' ? health : {}) as { features?: unknown; now?: unknown };
  const f = Array.isArray(h.features) ? (h.features as unknown[]) : [];
  return {
    now: kitTime(h.now),
    revisions: f.includes('revisions'),
    history: f.includes('history'),
    env: f.includes('env'),
    executions: f.includes('executions'),
    tests: f.includes('tests'),
    publishable: f.includes('publishable'),
  };
}

/** The first capability `action` needs that `c` lacks, or null when the action is open. */
export function missing(c: Caps | null, action: string): string | null {
  const n = NEEDS[action];
  if (!n) return 'unknown';
  for (const k of n) if (!c || c[k] !== true) return k;
  return null;
}

// ── paths and routes ─────────────────────────────────────────────────────────────────────────────

/** The kit's own normalisation: forward slashes, no leading `/`, no `./`, no empty, `.` or `..` segment. */
export function normRel(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.length > MAX_PATH || /[\u0000-\u001f\u007f\\]/.test(p)) return null;
  let s = p.replace(/^\/+/, '');
  while (s.startsWith('./')) s = s.slice(2).replace(/^\/+/, '');
  for (const part of s.split('/')) if (!part || part === '.' || part === '..') return null;
  return s;
}

/** The Exec folder a root-relative path is in (`default/<n>/…`, n 1..9999 without a leading zero), or null. */
export function execOf(p: unknown): number | null {
  const m = /^default\/([1-9][0-9]{0,3})\//.exec(str(p));
  const n = m ? Number(m[1]) : NaN;
  return execIndex(n) ? n : null;
}

/** A file inside one Exec folder: normalised, under `default/<n>/`, and not the folder itself. */
export function isRootRel(p: unknown): p is string {
  const n = execOf(p);
  return typeof p === 'string' && n !== null && normRel(p) === p && p.length > execRoot(n).length;
}

/** The folder a script's own calls go to: its path's. A path in no folder counts as folder 1 here, but no change sends it (data.ts `at`). */
export const folderOf = (rootRel: string): number => execOf(rootRel) ?? EXEC_DEFAULT;

/** The path inside its folder (`default/3/a/b.ts` → `a/b.ts`), or null. */
export const inFolder = (rootRel: string): string | null => {
  const n = execOf(rootRel);
  return n !== null && isRootRel(rootRel) ? rootRel.slice(execRoot(n).length) : null;
};

/** The hand-off form other pages (Logs, Schedules) use: folder 1 only, scope-relative. A file of another folder has none. */
export const toHandoff = (rootRel: string): string | null => (execOf(rootRel) === EXEC_DEFAULT ? inFolder(rootRel) : null);

/** A scope-relative path back to root-relative, in folder `exec` (default 1, the hand-off folder). */
export function fromHandoff(scopeRel: unknown, exec: number = EXEC_DEFAULT): string | null {
  const n = normRel(scopeRel);
  return n && n === scopeRel && execIndex(exec) ? execRoot(exec) + n : null;
}

export const isScript = (p: unknown): boolean => /\.(?:ts|js)$/.test(str(p));

export function excluded(rel: string): boolean {
  return str(rel)
    .split('/')
    .some((part) => EXCLUDED.includes(part));
}

/** The address a script file answers: `default/1/orders/[id].ts` → `/orders/[id]` (on its own folder's `-exec-<n>` address). */
export function routeOf(rootRel: string): string | null {
  let s = inFolder(rootRel);
  if (s === null) return null;
  s = s.replace(/\.(?:ts|js)$/, '');
  if (s === 'index') return '/';
  return `/${s.replace(/\/index$/, '')}`;
}

export const isDynamic = (rootRel: unknown): boolean => /\[/.test(str(rootRel));
export const isCatchAll = (rootRel: unknown): boolean => /\[\[?\.\.\./.test(str(rootRel));

const PROBE = 'hub-probe';
/** A concrete address the file answers, for route/resolve and expectRoute: each dynamic segment becomes one plain probe segment. */
export function probeRoute(rootRel: string): string | null {
  const r = routeOf(rootRel);
  return r === null ? null : r.replace(/\/\[\[?(?:\.\.\.)?[^/\]]+\]\]?(?=\/|$)/g, `/${PROBE}`);
}

/** An address the Hub may create (v1: static only) or point a link at. */
export function addressOk(route: unknown): route is string {
  return addressProblem(route) === null;
}

/**
 * Why addressOk refuses an address, for the words shown: 'chars' when its shape or characters are wrong, 'reserved' when it is
 * well formed but hoody-exec never runs a script there (its own paths, middleware names, excluded folders, an index, a final
 * .js/.ts, a .md). null = addressOk.
 */
export function addressProblem(route: unknown): 'chars' | 'reserved' | null {
  if (typeof route !== 'string' || route.length < 2 || route.length > 200 || !route.startsWith('/')) return 'chars';
  const parts = route.slice(1).split('/');
  for (const p of parts) if (!SEG.test(p) || p === '.' || p === '..') return 'chars';
  if (/^\/api\/v1(?:\/|$)/i.test(route) || parts.some((p) => EXCLUDED.includes(p))) return 'reserved';
  const last = parts[parts.length - 1]!;
  // hoody-exec strips a final .js/.ts before matching: /foo.js is /foo, which foo.js.ts never answers.
  // pre/post (exact case) are its middleware basenames: never a route,
  // and the file would run as middleware for the scripts beside it.
  // hoody-exec answers some paths itself before any script (exact case): /favicon.ico, /openapi.json, /openapi.yaml,
  // and every path ending .md (a doc beside a script, or 404).
  if (INTERCEPTED.includes(route) || last.endsWith('.md')) return 'reserved';
  return last !== 'index' && !RESERVED_MIDDLEWARE.includes(last) && !/\.(?:js|ts)$/i.test(last) ? null : 'reserved';
}

export function pathFor(route: string, lang: 'ts' | 'js' = 'ts', exec: number = EXEC_DEFAULT): string | null {
  return addressOk(route) && execIndex(exec) ? `${execRoot(exec)}${route.slice(1)}.${lang === 'js' ? 'js' : 'ts'}` : null;
}

const STOP_WORDS = ['a', 'an', 'the', 'that', 'which', 'and', 'to', 'of', 'for', 'my', 'me', 'it', 'when', 'every'];

/**
 * A suggested address from a description: up to three plain words. S (optional): known secrets. Their text
 * leaves the words first, and an address still holding one is /my-script: it is published.
 */
export function suggestAddress(text: string, taken: readonly (string | null)[] = [], S?: readonly string[]): string {
  let t = str(text);
  const lo = (S ?? []).map((s) => str(s).toLowerCase());
  if (S) {
    t = t.replace(CTRL, '');
    t = swapSecrets(t, spans(t, S, true), ' ').toLowerCase();
    t = swapSecrets(t, spans(t, lo, true), ' ');
  }
  const w = t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((x) => x && !STOP_WORDS.includes(x));
  let base = `/${w.slice(0, 3).join('-').slice(0, 40).replace(/-+$/, '') || 'my-script'}`;
  if (spans(base, lo, true).length) base = '/my-script';
  return freeAddress(base, taken);
}

/**
 * An address the person did not choose, made free of the ones in use: itself when free, else -2, -3... Every candidate is one the
 * form accepts (a long address is cut to make room for the number), so a free address is never one the form then rejects.
 */
export function freeAddress(route: string, taken: readonly (string | null)[] = []): string {
  if (!taken.includes(route)) return route;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const r = `${route.length + suffix.length > 200 ? route.slice(0, 200 - suffix.length).replace(/[/.]+$/, '') : route}${suffix}`;
    if (!taken.includes(r) && addressOk(r)) return r;
  }
  return route;
}

function swapSecrets(t: string, sp: ReadonlyArray<[number, number]>, rep: string): string {
  let o = '';
  let p = 0;
  for (const x of sp) {
    o += t.slice(p, x[0]) + rep;
    p = x[1];
  }
  return o + t.slice(p);
}

// ── route previews ───────────────────────────────────────────────────────────────────────────────

const REAL = ['static', 'dynamic', 'catchall', 'optional-catchall'];
const answerPath = (ans: ResolveAnswer | null | undefined): string | null => (ans && ans.matched === true ? normRel(ans.scriptPath) : null);
/** A general script answers: a fallback, or anything outside the folder asked about (`root`, `default/<n>/`). */
const general = (ans: ResolveAnswer, sp: string | null, root: string): boolean => ans.type === 'fallback' || !sp || !sp.startsWith(root);
const rootOf = (rootRel: string): string => { const n = execOf(rootRel); return n === null ? ROOT : execRoot(n); };

export type CreatePreview = { state: 'free'; answeredBy: null } | { state: 'general'; answeredBy: string | null } | { state: 'taken'; answeredBy: string | null; real: boolean };

/** The create preview, for a new script in folder `exec`. 'free' → nothing shown; 'taken' → blocked; 'general' → one-click warning. */
export function createPreview(ans: ResolveAnswer | null | undefined, exec: number = EXEC_DEFAULT): CreatePreview {
  if (!ans || ans.matched !== true) return { state: 'free', answeredBy: null };
  const sp = answerPath(ans);
  if (general(ans, sp, execIndex(exec) ? execRoot(exec) : ROOT)) return { state: 'general', answeredBy: sp };
  return { state: 'taken', answeredBy: sp, real: REAL.includes(str(ans.type)) };
}

/** The delete preview (route/resolve with omit = the script). 'self' means the kit did not omit it: no preview can be trusted. */
export function deletePreview(ans: ResolveAnswer | null | undefined, rootRel: string): { state: 'stops' | 'self' | 'general' | 'other'; answeredBy: string | null } {
  if (!ans || ans.matched !== true) return { state: 'stops', answeredBy: null };
  const sp = answerPath(ans);
  if (sp === rootRel) return { state: 'self', answeredBy: sp };
  return { state: general(ans, sp, rootOf(rootRel)) ? 'general' : 'other', answeredBy: sp };
}

export const expectRoute = (route: string | null, answeredBy: string | null): { route: string | null; answeredBy: string | null } => ({ route, answeredBy: answeredBy ?? null });

/** A link target: a concrete path the selected script answers. */
export function shareTarget(route: unknown): boolean {
  if (typeof route !== 'string' || !route.startsWith('/') || route.length > 512) return false;
  if (/^\/api\/v1(?:\/|$)/i.test(route) || /[?#%\\\s]/.test(route)) return false;
  for (const p of route.slice(1).split('/')) if (!SEG.test(p) || p === '.' || p === '..') return route === '/';
  return true;
}

export function shareCheck(route: string, ans: ResolveAnswer | null | undefined, rootRel: string): boolean {
  return shareTarget(route) && !!ans && ans.matched === true && ans.type !== 'fallback' && answerPath(ans) === rootRel;
}

/**
 * The pinned public links of this computer's Exec that open this script: target_path (query dropped, empty = /)
 * equals a static script's address, or matches a dynamic one's pattern. A path-override alias lets the caller pick
 * the path, so it belongs to no one script. answers (optional) maps a concrete target to its route/resolve answer: a link Exec
 * answers with another script of this folder (not a general fallback) is that script's, for a static file too (users.ts beside
 * users/index.ts both match /users; static beats dynamic: users/me.ts beside users/[id].ts).
 */
export function aliasesFor(rows: readonly Alias[] | null | undefined, rootRel: string, answers?: Record<string, ResolveAnswer>): Alias[] {
  const rel = inFolder(rootRel);
  if (rel === null) return [];
  const exec = execOf(rootRel);
  const match = fileMatcher(rel);
  return (Array.isArray(rows) ? rows : []).filter((a) => {
    if (!a || typeof a !== 'object' || a.allow_path_override === true || typeof a.target_path !== 'string') return false;
    // Only a link to this script's own Exec folder (the aliases of the computer cover every program and folder).
    if ((a.program !== undefined && a.program !== 'exec') || (a.index !== undefined ? a.index !== exec : exec !== EXEC_DEFAULT)) return false;
    const p = a.target_path.split('?')[0] || '/';
    const ans = answers?.[p];
    const sp = ans ? answerPath(ans) : null;
    if (ans && sp && sp !== rootRel && !general(ans, sp, rootOf(rootRel))) return false;
    return match(p);
  });
}

// ── list rows and status ─────────────────────────────────────────────────────────────────────────

const FAILED = ['failed', 'error', 'exception', 'timeout'];

/** 'off' | 'failing' | 'working' | null. No row, logging off or truncated coverage is none, never zero. */
export function statusOf(row: ScriptRow | undefined, sum: Summary | undefined, hasExecutions: boolean): 'off' | 'failing' | 'working' | null {
  const mc = row?.magicComments;
  if (mc && mc.enabled === false) return 'off';
  if (!hasExecutions || !sum || sum.truncated === true) return null;
  const calls = +sum.calls;
  const failed = +sum.failed;
  if (!(calls > 0)) return null;
  if (FAILED.includes(str(sum.lastOutcome)) || (calls >= 5 && failed / calls >= 0.2)) return 'failing';
  return 'working';
}

/** The name a list shows for a file: its @label, else the file or folder in words; a dynamic or catch-all route is said in words
 *  (routePattern.ts), never as the bracket name of the file. */
export function friendlyName(row: { path?: string; magicComments?: { label?: string } } | null | undefined): string {
  const lab = typeof row?.magicComments?.label === 'string' ? row.magicComments.label.trim() : '';
  if (lab) return lab.slice(0, 80);
  const info = describeFile(inFolder(str(row?.path)));
  const said = info ? routeWords(info) : null;
  if (said) return said;
  const rel = inFolder(str(row?.path)) ?? str(row?.path);
  const p = rel.replace(/\.(?:ts|js)$/, '').split('/').filter(Boolean);
  // A file named only by its extension at the root answers the home address.
  if (!p.length) return fmt('route.name.home', {});
  const last = p[p.length - 1];
  const b = ((last === 'index' && p.length > 1 ? p[p.length - 2] : last) ?? '').replace(/[-_]+/g, ' ').trim();
  return b ? b.charAt(0).toUpperCase() + b.slice(1) : '';
}

const fmt = (key: keyof typeof strings, vars: Record<string, string>): string => String(strings[key]).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
const words = (seg: string): string => {
  const w = seg.replace(/[-_.]+/g, ' ').trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};
const label = (s: Seg): string => s.text || 'part';

/**
 * A dynamic or catch-all file in words, from its whole address: "Every other address", "Every address under /docs", "Users by id",
 * "Address /org/:org/:id". Null for a static address (the file name says it) and for a file exec does not serve.
 */
export function routeWords(info: RouteInfo): string | null {
  if (info.kind === 'static' || info.kind === 'unserved') return null;
  const root = info.base === '/';
  if (info.kind === 'optionalCatchAll') return root ? fmt('route.name.rootOptional', {}) : fmt('route.name.optional', { base: info.base });
  if (info.kind === 'catchAll') return root ? fmt('route.name.rootRequired', {}) : fmt('route.name.required', { base: info.base });
  const [a, b] = info.segs;
  if (info.segs.length === 1 && a) return fmt('route.name.paramBare', { param: label(a) });
  if (info.segs.length === 2 && a && b && a.kind === 'static') return fmt('route.name.param', { parent: words(a.text), param: label(b) });
  return fmt('route.name.pattern', { pattern: info.pattern });
}

/** The address a deleted or removed file leaves, for a sentence: the pattern, or the file itself when exec serves no address from it. */
export function addressText(rootRel: string): string {
  const info = describeFile(inFolder(rootRel));
  return info && info.kind !== 'unserved' ? info.pattern : (inFolder(rootRel) ?? rootRel);
}

const RULE = { param: 'route.rule.param', catchAll: 'route.rule.catchAll', optionalCatchAll: 'route.rule.optional' } as const;

/** What the address column's tooltip says: the file behind the pattern, what each special part stands for, or why exec never serves it. */
export function routeTip(info: RouteInfo, path: string): string {
  const file = inFolder(str(path)) ?? str(path);
  if (info.kind === 'unserved') return fmt(info.why === 'middleware' ? 'route.tip.middleware' : 'route.tip.catchAllLast', { file });
  const rule = info.parts.map((p) => fmt(RULE[p.kind as keyof typeof RULE], { param: p.text || fmt('route.unnamed', {}) })).join(' ');
  return fmt('route.tip', { file, rule }).trim();
}

/** The scripts a computer lists in folder `exec`: files under default/<exec>/, scripts only, no reserved folder. */
export function scriptRows(rows: readonly ScriptRow[] | undefined, exec: number = EXEC_DEFAULT): ScriptRow[] {
  return (rows ?? [])
    .filter((r) => r && !r.isDirectory && isRootRel(r.path) && execOf(r.path) === exec && isScript(r.path) && !excluded(r.path))
    .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

export const hasKey = (mc: { tokens?: unknown[]; token?: string | null } | undefined): boolean =>
  !!mc && ((Array.isArray(mc.tokens) && mc.tokens.length > 0) || (mc.token != null && mc.token !== ''));

// ── handles: a computer and a script are addressed without a full id ─────────────────────────────

/** The selection value in the URL: `<computer handle>~<script path inside its folder>`; the folder is the page's (?exec=). */
export const itemId = (handle: string, rootRel: string): string => `${handle}~${inFolder(rootRel) ?? rootRel}`;

/** One script's identity across folders: its computer and full root-relative path. The URL id leaves the folder out (the
 *  page names it), so state bound to one script (a mounted detail, an editor's loaded text) is keyed by this, never by the id. */
export const itemKey = (i: { compId: string; path: string }): string => `${i.compId}\u0000${i.path}`;

export function parseItemId(id: string | undefined, exec: number = EXEC_DEFAULT): { handle: string; rootRel: string } | null {
  if (!id) return null;
  const i = id.indexOf('~');
  if (i <= 0) return null;
  const rootRel = fromHandoff(id.slice(i + 1), exec);
  return rootRel ? { handle: id.slice(0, i), rootRel } : null;
}

export type GroupKind = ScriptItem['group'];

/** Why a whole computer's scripts are read-only or missing: shown as a group row with its fix. */
export function groupOf(c: CompScripts): GroupKind {
  if (c.state === 'off') return 'off';
  if (c.state === 'starting') return 'starting';
  if (c.err) return c.err;
  if (!c.caps?.revisions) return 'old';
  return 'ok';
}

/** Every script of every ready computer in folder `exec`, as table rows. */
export function toItems(computers: readonly CompScripts[], exec: number = EXEC_DEFAULT): ScriptItem[] {
  const out: ScriptItem[] = [];
  for (const c of computers) {
    if (c.state !== 'on' || c.err) continue;
    const group = groupOf(c);
    for (const row of scriptRows(c.rows, exec)) {
      const mc = row.magicComments ?? {};
      const sum = c.summary[row.path];
      const info = describeFile(inFolder(row.path));
      const inst: Instance | undefined = c.instances ? c.instances[row.path] : undefined;
      out.push({
        id: itemId(c.handle, row.path),
        compId: c.id,
        compName: c.name,
        compHandle: c.handle,
        path: row.path,
        name: friendlyName(row),
        route: routeOf(row.path) ?? '',
        pattern: info?.pattern ?? '',
        served: !!info && info.kind !== 'unserved',
        dynamic: !!info && info.kind !== 'static' && info.kind !== 'unserved',
        routeTip: info ? routeTip(info, row.path) : fmt('route.tip.none', { file: inFolder(row.path) ?? row.path }),
        description: str(mc.description).slice(0, 160),
        status: statusOf(row, sum, !!c.caps?.executions),
        schedule: mc.schedule ? str(mc.schedule) : null,
        keyed: hasKey(mc),
        calls: sum && sum.truncated !== true && c.caps?.executions ? sum.calls : null,
        failed: sum && sum.truncated !== true && c.caps?.executions ? sum.failed : null,
        managed: inst ? { template: inst.template, elsewhere: inst.elsewhere } : null,
        ownershipUnknown: c.instances === null,
        group,
      });
    }
  }
  return out;
}

export type Writable = 'ok' | 'old' | 'unknown' | 'managed';

/** What may change this script from here, in one place. */
export function writable(item: Pick<ScriptItem, 'managed' | 'ownershipUnknown'>, c: Caps | null): Writable {
  if (!c?.revisions) return 'old';
  if (item.ownershipUnknown) return 'unknown';
  if (item.managed) return 'managed';
  return 'ok';
}

/** Why Delete is not offered, or null. */
export function deleteBlock(item: Pick<ScriptItem, 'managed' | 'ownershipUnknown'>, c: Caps | null, guarded: boolean, linksRead = true): 'old' | 'unknown' | 'links' | 'elsewhere' | 'noGuard' | null {
  if (!c?.revisions) return 'old';
  if (item.ownershipUnknown) return 'unknown';
  // Its public links turn off before it goes: with the links unread nothing says there are none, so Delete waits for that read.
  if (!linksRead) return 'links';
  if (!item.managed) return null;
  if (item.managed.elsewhere) return 'elsewhere';
  return guarded ? null : 'noGuard';
}

// ── leading magic comments and the caller key ────────────────────────────────────────────────────

interface BlockState {
  inBlock: boolean;
}

function stripBlock(line: string, st: BlockState): string {
  let t = line;
  for (;;) {
    if (st.inBlock) {
      const e = t.indexOf('*/');
      if (e === -1) return '';
      st.inBlock = false;
      t = t.slice(e + 2).trim();
    }
    if (!t.startsWith('/*')) return t;
    const e2 = t.indexOf('*/', 2);
    if (e2 === -1) {
      st.inBlock = true;
      return '';
    }
    t = t.slice(e2 + 2).trim();
  }
}

const firstWord = (t: string, prefix: string): string => t.slice(prefix.length).trim().split(/\s+/)[0] ?? '';

export interface Header {
  end: number;
  open: boolean;
  tokens: number[];
  /** The header lines that are `// @schedule …` (every one, also an empty one the kit ignores). */
  schedules: number[];
  d: { enabled?: boolean; schedule?: string; logLevel?: string; label?: string; description?: string; tokens: number };
  lines: string[];
}

/**
 * The header the kit reads: end = index of the first code line within the first 30 lines (or the line count / 30);
 * open = a block comment is still open at end.
 */
export function header(text: unknown): Header {
  const lines = str(text).split('\n');
  const st: BlockState = { inBlock: false };
  const d: Header['d'] = { tokens: 0 };
  const tok: number[] = [];
  const sch: number[] = [];
  const lim = Math.min(lines.length, HEADER_LINES);
  let i = 0;
  for (; i < lim; i++) {
    const t = stripBlock((lines[i] ?? '').trim(), st);
    if (!t) continue;
    if (!t.startsWith('//')) break;
    if (t.startsWith('// @token ') && firstWord(t, '// @token ')) {
      d.tokens++;
      tok.push(i);
    } else if (t.startsWith('// @enabled ')) d.enabled = firstWord(t, '// @enabled ') === 'true';
    else if (t.startsWith('// @schedule ') || t === '// @schedule') { sch.push(i); d.schedule = t.slice(13).trim() || undefined; }
    else if (t.startsWith('// @log-level ')) d.logLevel = firstWord(t, '// @log-level ');
    else if (t.startsWith('// @label ')) d.label = t.slice(10).trim();
    else if (t.startsWith('// @description ')) d.description = t.slice(16).trim();
  }
  return { end: i, open: st.inBlock, tokens: tok, schedules: sch, d, lines };
}

export const REDACTED = '[REDACTED]';

/** The file with `// @token K` in its header. Existing @token lines are removed and the first one's place takes the new line. */
export function withKey(text: string, key: string): { text: string; replaced: boolean } | { error: 'bad_key' | 'unplaceable' } {
  // The kit shows a stored key as the sentinel and keeps the stored value when the sentinel is written back.
  if (key !== REDACTED && !KEY.test(str(key))) return { error: 'bad_key' };
  const h = header(text);
  const line = `// @token ${key}`;
  const lines = h.lines.slice();
  if (/^#!/.test(lines[0] ?? '')) return { error: 'unplaceable' };
  const replaced = h.tokens.length > 0;
  if (replaced) {
    const first = h.tokens[0] ?? 0;
    for (let j = h.tokens.length - 1; j >= 1; j--) lines.splice(h.tokens[j] ?? 0, 1);
    lines[first] = (/^\s*/.exec(lines[first] ?? '')?.[0] ?? '') + line;
  } else {
    if (h.open || h.end >= HEADER_LINES) return { error: 'unplaceable' };
    lines.splice(h.end, 0, line);
  }
  const out = lines.join('\n');
  // Proof by the same reading: exactly one key, and it is K.
  const after = header(out);
  const at = after.tokens[0];
  return after.d.tokens === 1 && at !== undefined && (after.lines[at] ?? '').trim() === line ? { text: out, replaced } : { error: 'unplaceable' };
}

/** A schedule the Hub writes: five cron fields, plain characters only (the kit's own check is the authority; this keeps a
 *  line break or a second directive out of the header). */
const SCHEDULE = /^[0-9*,/\-]+(?: [0-9*,/\-A-Za-z]+){4}$/;

/**
 * The file with `// @schedule <expr>` in its header, as withKey places `@token`: every schedule
 * line is removed and the first one's place takes the new line; with none, the line goes at the end of the header. `null`
 * removes every schedule line. Only whole lines are edited: a schedule the kit reads after other syntax on its line (a block
 * comment's closing mark before it) is refused (unplaceable), never cut with that syntax. Proven by reading the result back: exactly the
 * schedule asked for, or none, and the header's block-comment state unchanged.
 */
export function withSchedule(text: string, expr: string | null): { text: string } | { error: 'bad_schedule' | 'unplaceable' } {
  if (expr !== null && !SCHEDULE.test(expr)) return { error: 'bad_schedule' };
  const h = header(text);
  if (h.schedules.some((j) => !/^\s*\/\/ @schedule(?:\s|$)/.test(h.lines[j] ?? ''))) return { error: 'unplaceable' };
  const lines = h.lines.slice();
  const first = h.schedules[0];
  for (let j = h.schedules.length - 1; j >= (expr === null ? 0 : 1); j--) lines.splice(h.schedules[j] ?? 0, 1);
  if (expr !== null) {
    const line = `// @schedule ${expr}`;
    if (first !== undefined) lines[first] = (/^\s*/.exec(lines[first] ?? '')?.[0] ?? '') + line;
    else {
      if (/^#!/.test(lines[0] ?? '') || h.open || h.end >= HEADER_LINES) return { error: 'unplaceable' };
      lines.splice(h.end, 0, line);
    }
  }
  const out = lines.join('\n');
  const after = header(out);
  const ok = after.open === h.open && (expr === null ? after.schedules.length === 0 : after.schedules.length === 1 && after.d.schedule === expr);
  return ok ? { text: out } : { error: 'unplaceable' };
}

/** Removes every `@token` line from the header. */
export function withoutKey(text: string): string {
  const h = header(text);
  const lines = h.lines.slice();
  for (let i = h.tokens.length - 1; i >= 0; i--) lines.splice(h.tokens[i] ?? 0, 1);
  return lines.join('\n');
}

/**
 * The caller key never reaches the editor: the file as shown has no `@token` line, and the key is put back by
 * withKey when the file is saved. key is null when the file has none.
 */
export function splitKey(text: string): { body: string; key: string | null; keys: string[] } {
  const h = header(text);
  const keys = h.tokens.map((at) => (h.lines[at] ?? '').trim().slice('// @token '.length).trim().split(/\s+/)[0] ?? '').filter(Boolean);
  return { body: withoutKey(text), key: keys[0] ?? null, keys };
}

/** withKey for every key of the file: the first takes the header place, the others follow it, in order. */
export function withKeys(text: string, keys: readonly string[]): { text: string; replaced: boolean } | { error: 'bad_key' | 'unplaceable' } {
  const [first, ...rest] = keys;
  if (first === undefined) return { error: 'unplaceable' };
  const placed = withKey(text, first);
  if ('error' in placed || rest.length === 0) return placed;
  if (rest.some((k) => k !== REDACTED && !KEY.test(str(k)))) return { error: 'bad_key' };
  const lines = placed.text.split('\n');
  const at = header(placed.text).tokens[0];
  if (at === undefined) return { error: 'unplaceable' };
  lines.splice(at + 1, 0, ...rest.map((k) => `// @token ${k}`));
  const out = lines.join('\n');
  return header(out).d.tokens === keys.length ? { text: out, replaced: true } : { error: 'unplaceable' };
}

/** The kit's redacted parse shows a key (validate/script results.magicComments). */
export function keyProven(validation: Validation | null | undefined): boolean {
  const mc = validation?.results?.magicComments ?? validation?.magicComments;
  return hasKey(mc);
}

/** A fresh caller key. */
export const newKey = mintKey;

// ── AI proposals ─────────────────────────────────────────────────────────────────────────────────

const MAX_CODE = 1048576;

interface Parsed {
  blocks: string[][];
  open: boolean;
  summary: string;
  path: string;
}

/** A reply's fenced blocks (open: one left unclosed) and the first `Summary:` / `Path:` lines outside them. */
function parse(reply: string): Parsed {
  const lines = str(reply).split(/\r\n|\n/);
  const blocks: string[][] = [];
  let cur: { ch: string; n: number; body: string[] } | null = null;
  let summary = '';
  let path = '';
  for (const l of lines) {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (cur) {
      const c = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(l);
      if (c && (c[1] ?? '').charAt(0) === cur.ch && (c[1] ?? '').length >= cur.n) {
        blocks.push(cur.body);
        cur = null;
      } else cur.body.push(l);
      continue;
    }
    if (f && !((f[1] ?? '').charAt(0) === '`' && (f[2] ?? '').includes('`'))) {
      cur = { ch: (f[1] ?? '').charAt(0), n: (f[1] ?? '').length, body: [] };
      continue;
    }
    const s = /^\s*Summary:\s*(.*)$/i.exec(l);
    const p = /^\s*Path:\s*(\S+)\s*$/i.exec(l);
    if (s && !summary) summary = (s[1] ?? '').trim();
    else if (p && !path) path = p[1] ?? '';
  }
  return { blocks, open: cur !== null, summary, path };
}

export type ExtractError = 'no_block' | 'two_blocks' | 'unclosed' | 'too_large' | 'empty';

/** reply → {summary, route, code} or {error}. Exactly one fenced block holding the whole file. */
export function extract(reply: string, create: boolean, S?: readonly string[]): { summary: string; route: string | null; code: string } | { error: ExtractError } {
  const x = parse(reply);
  const summarySrc = (S ? parse(scrubAll(reply, S)) : x).summary;
  if (x.open) return { error: 'unclosed' };
  if (!x.blocks.length) return { error: 'no_block' };
  if (x.blocks.length > 1) return { error: 'two_blocks' };
  const code = (x.blocks[0] ?? []).join('\n');
  if (!/\S/.test(code)) return { error: 'empty' };
  if (code.length > MAX_CODE) return { error: 'too_large' };
  let route: string | null = null;
  if (create && x.path) {
    const r = x.path.startsWith('/') ? x.path : `/${x.path}`;
    const rel = execOf(r.slice(1)) !== null ? routeOf(r.slice(1)) : r.replace(/\.(?:ts|js)$/, '');
    route = addressOk(rel) ? rel : null;
  }
  return { summary: shownSummary(summarySrc), route, code: `${code}\n` };
}

/** Characters of the model's summary shown at most, before the cut mark: room for a few whole sentences, so Check it shows
 *  what the script does in full; only a runaway answer is cut. */
const SUMMARY_MAX = 600;

/**
 * The model's one-line summary as the Hub shows model text: a key hidden first (scrubSecrets, before cleaning can glue
 * one to the word before it), then cleaned, `inline code` shown as its text (a backtick that opens no span stays), and past
 * SUMMARY_MAX cut at the last sentence end in its back half, else at the last space, else on a character, with the cut mark.
 */
function shownSummary(raw: string): string {
  const s = cleanAgentText(scrubSecrets(raw)).text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= SUMMARY_MAX) return s;
  const head = s.slice(0, SUMMARY_MAX + 1);
  let end = -1;
  for (const m of head.matchAll(/[.!?](?= )/g)) if (m.index + 1 <= SUMMARY_MAX && m.index + 1 >= SUMMARY_MAX / 2) end = m.index + 1;
  if (end < 0) end = head.lastIndexOf(' ');
  if (end <= 0) end = /[\ud800-\udbff]/.test(s.charAt(SUMMARY_MAX - 1)) ? SUMMARY_MAX - 1 : SUMMARY_MAX;
  return `${s.slice(0, end).trimEnd()}…`;
}

const AI_RE = /@ai\s+true|\bhoody(?:Ai|AI)\b|\/v1\/(?:chat\/)?completions|\bopenai\b|\banthropic\b|\bai\.(?:chat|ask|complete|generate|summarize)\s*\(/i;
const DATA_RE =
  /\b(?:fs|Bun)\.(?:write|writeFile|appendFile|unlink|rm|mkdir)\b|\.(?:exec|run|query)\s*\(\s*["'`]\s*(?:insert|update|delete|drop|create|alter|replace)\b|\bsharedState\.set\b|\bkv\.(?:set|put|delete)\b|method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i;

/**
 * A write to a file: fs, fs.promises and Bun calls that write, append, remove, rename or make (sync or not), the same
 * names called bare (imported from fs or fs/promises; rm, rename, truncate and write bare only as their Sync form, the
 * async names are too common), writeFile/appendFile/createWriteStream on any receiver (a file handle), and a Bun.file(...)
 * written or deleted; its argument is read for at most 300 characters, so the scan stays linear on large code.
 * A read (readFile, Bun.file().text()) is never one.
 */
const FILE_WRITE_RE =
  /\b(?:fs(?:\.promises)?|fsp|Bun)\.(?:write|writeFile|appendFile|createWriteStream|unlink|rm|rmdir|mkdir|rename|copyFile|truncate)(?:Sync)?\b|(?<![\w.$])(?:(?:writeFile|appendFile|createWriteStream|unlink|mkdir|rmdir|copyFile)(?:Sync)?|(?:rm|rename|truncate|write)Sync)\s*\(|\.(?:writeFile|appendFile|createWriteStream)(?:Sync)?\s*\(|\bBun\.file\s*\([^;\n]{0,300}?\)\s*\.(?:write|writer|delete)\s*\(/;

/** Words only: what an unprotected script could cost. Never a gate. */
export function riskOf(text: unknown): { ai: boolean; data: boolean } {
  const t = str(text);
  return { ai: AI_RE.test(t), data: DATA_RE.test(t) || FILE_WRITE_RE.test(t) };
}

const impRe = (): RegExp => /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"'./][^"']*)["']/gm;
const pkgOf = (n: string): string => (n.charAt(0) === '@' ? n.split('/').slice(0, 2).join('/') : (n.split('/')[0] ?? ''));

/**
 * The modules hoody-exec never installs: an exact copy of hoody-exec's own list;
  * builtins.drift.test.ts fails when the two differ. hoody-exec runs on Bun, so `bun` is one; every `node:`
 * and `bun:` name is too. A name or its root package in this list is never "a new package".
 */
const BUILTIN_MODULES: ReadonlySet<string> = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'dns/promises',
  'domain', 'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'readline/promises', 'repl',
  'stream', 'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder',
  'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url',
  'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // Bun-specific
  'bun',
]);

export function imports(text: unknown): string[] {
  const out: string[] = [];
  const re = impRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(str(text)))) {
    const n = (m[1] ?? '').replace(/^(?:node|bun):.*/, '');
    if (!n) continue;
    const p = pkgOf(n);
    if (BUILTIN_MODULES.has(n) || BUILTIN_MODULES.has(p)) continue;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** What a script's code uses, read statically for the review screen: a help for reading the
 *  code, never a gate or a limit. `builtins`: built-in modules by name (node:/bun: folded); `files`: fs or Bun's file
 *  calls appear; `writes`: one of them writes (the file-write reading); `calls`: fetch or a socket is used; `hosts`:
 *  each literal web address's host, once; `ai`: the AI reading. The packages to install come from the computer's
 *  check, not from here. */
export interface Uses {
  builtins: string[];
  files: boolean;
  writes: boolean;
  calls: boolean;
  hosts: string[];
  ai: boolean;
}

const CALL_RE = /\bfetch\s*\(|\bnew\s+(?:WebSocket|EventSource)\s*\(/;
const hostRe = (): RegExp => /\b(?:https?|wss?):\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)/gi;

export function usesOf(text: unknown): Uses {
  const t = str(text);
  const builtins: string[] = [];
  const re = impRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const raw = m[1] ?? '';
    const n = raw.replace(/^node:/, '');
    const own = raw.startsWith('node:') || raw.startsWith('bun:') || BUILTIN_MODULES.has(n) || BUILTIN_MODULES.has(pkgOf(n));
    if (own && !builtins.includes(n)) builtins.push(n);
  }
  const hosts: string[] = [];
  const hr = hostRe();
  while ((m = hr.exec(t))) {
    const h = (m[1] ?? '').toLowerCase();
    if (h && !hosts.includes(h)) hosts.push(h);
  }
  const files = builtins.some((n) => n === 'fs' || n.startsWith('fs/')) || /\bBun\.(?:file|write)\s*\(/.test(t);
  return { builtins, files, writes: FILE_WRITE_RE.test(t), calls: CALL_RE.test(t), hosts, ai: AI_RE.test(t) };
}

export interface Change {
  code: 'protection_removed' | 'schedule_added' | 'schedule_changed' | 'turned_off' | 'public_spends_ai' | 'public_changes_data' | 'new_package' | 'address_taken';
  detail?: string;
}

/** Meaningful changes between two versions, as codes for "Worth knowing". before is null for a create. `installs`: the
 *  packages the computer's own check says it will install (its missingModules), which wins over the code's imports. */
export function changesOf(before: string | null, after: string, o?: { taken?: boolean; S?: readonly string[]; installs?: readonly string[] }): Change[] {
  const a = header(after).d;
  const b = before == null ? null : header(before).d;
  const out: Change[] = [];
  const sd = o?.S ? header(scrubAll(after, o.S)).d.schedule || '[hidden]' : a.schedule;
  if (b && b.tokens > 0 && a.tokens === 0) out.push({ code: 'protection_removed' });
  if (a.schedule && !(b && b.schedule)) out.push({ code: 'schedule_added', detail: sd });
  else if (a.schedule && b && b.schedule && a.schedule !== b.schedule) out.push({ code: 'schedule_changed', detail: sd });
  if (a.enabled === false && !(b && b.enabled === false)) out.push({ code: 'turned_off' });
  if (a.tokens === 0) {
    const r = riskOf(after);
    if (r.ai) out.push({ code: 'public_spends_ai' });
    if (r.data) out.push({ code: 'public_changes_data' });
  }
  const old = before == null ? [] : imports(before);
  const fresh = o?.installs ? o.installs.filter((n) => n && !BUILTIN_MODULES.has(n) && !BUILTIN_MODULES.has(pkgOf(n))) : imports(after);
  const added = fresh.filter((n) => !old.includes(n));
  if (added.length) out.push({ code: 'new_package', detail: added.join(', ') });
  if (o?.taken) out.push({ code: 'address_taken' });
  return out;
}

// ── line diff (Myers, capped) ────────────────────────────────────────────────────────────────────

const DIFF_CAP = 4e6;
export interface DiffOp {
  t: ' ' | '+' | '-';
  line: string;
}
export type Diff = { ops: DiffOp[]; added: number; removed: number; tooBig?: undefined } | { tooBig: true };

export function diff(a: unknown, b: unknown, cap?: number): Diff {
  const A = str(a).split('\n');
  const B = str(b).split('\n');
  const lim = cap ?? DIFF_CAP;
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let sa = A.length;
  let sb = B.length;
  while (sa > pre && sb > pre && A[sa - 1] === B[sb - 1]) {
    sa--;
    sb--;
  }
  const x0 = A.slice(pre, sa);
  const y0 = B.slice(pre, sb);
  const N = x0.length;
  const M = y0.length;
  const MAX = N + M;
  const off = MAX + 1;
  const V = new Int32Array(2 * MAX + 3);
  const trace: Int32Array[] = [];
  let work = 0;
  let found = MAX === 0;
  const v = (k: number): number => V[off + k] ?? 0;
  for (let d = 0; d <= MAX && !found; d++) {
    trace.push(V.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v(k - 1) < v(k + 1)) ? v(k + 1) : v(k - 1) + 1;
      let y = x - k;
      while (x < N && y < M && x0[x] === y0[y]) {
        x++;
        y++;
        work++;
      }
      V[off + k] = x;
      if (++work > lim) return { tooBig: true };
      if (x >= N && y >= M) {
        found = true;
        break;
      }
    }
  }
  const mid: DiffOp[] = [];
  let cx = N;
  let cy = M;
  for (let dd = trace.length - 1; dd >= 0 && (cx > 0 || cy > 0); dd--) {
    const T = trace[dd] as Int32Array;
    const base = -dd - 1;
    const kk = cx - cy;
    const at = (q: number): number => T[q - base] ?? 0;
    const prevK = kk === -dd || (kk !== dd && at(kk - 1) < at(kk + 1)) ? kk + 1 : kk - 1;
    const px = dd === 0 ? 0 : at(prevK);
    const py = px - prevK;
    while (cx > px && cy > py) {
      mid.push({ t: ' ', line: x0[--cx] ?? '' });
      cy--;
    }
    if (dd > 0) {
      if (cx > px) mid.push({ t: '-', line: x0[--cx] ?? '' });
      else mid.push({ t: '+', line: y0[--cy] ?? '' });
    }
  }
  mid.reverse();
  const ops: DiffOp[] = [...A.slice(0, pre).map((l): DiffOp => ({ t: ' ', line: l })), ...mid, ...A.slice(sa).map((l): DiffOp => ({ t: ' ', line: l }))];
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.t === '+') added++;
    else if (o.t === '-') removed++;
  }
  return { ops, added, removed };
}

// ── approval tuple ───────────────────────────────────────────────────────────────────────────────

const A_KEYS = ['ticket', 'computer', 'path', 'baseRevision', 'digest', 'verdict', 'route', 'answeredBy'] as const;
export type Approval = Readonly<Record<(typeof A_KEYS)[number], string | null>>;

/** A = what one human "Make it live" click approves. Any field change clears it. */
export function approval(o: Record<string, unknown> | null): Approval | null {
  if (!o || !o.ticket || !o.computer || !isRootRel(o.path) || !HEX64.test(str(o.digest)) || o.verdict !== 'ready') return null;
  // A revision is opaque (the kit may sign it): only its presence and equality matter.
  if (!(o.baseRevision === null || /^[\x21-\x7e]{1,128}$/.test(str(o.baseRevision)))) return null;
  const A: Record<string, string | null> = {};
  for (const k of A_KEYS) A[k] = own(o, k) ? (o[k] as string | null) : null;
  return Object.freeze(A) as Approval;
}

export function approvalHolds(A: Approval | null, now: Record<string, unknown> | null): boolean {
  if (!A || !now) return false;
  return A_KEYS.every((k) => A[k] === (own(now, k) ? now[k] : null));
}

// ── outcome-unknown handling ───────────────────────────────────────────────────────────────

const SETTLE_MS = [2000, 5000, 10000, 30000];
export type SettleView =
  | { state: 'done'; revision: string | null }
  | { state: 'failed'; code: string }
  | { state: 'checking' }
  | { state: 'not_sent' }
  | { state: 'unknown'; forgotten: boolean };

/**
 * ops/settle answer → view. Only 'fenced' proves the change never ran. 'unknown', 'forgotten' (older than the kit's
 * journal) and a malformed answer are 'unknown': check the script before trying again, never "it didn't go through".
 */
export function settleView(ans: { outcome?: string; state?: string; revision?: string; code?: string } | null | undefined): SettleView {
  const o = ans && (ans.outcome ?? ans.state);
  if (o === 'committed') return { state: 'done', revision: ans?.revision ?? null };
  if (o === 'refused') return { state: 'failed', code: str(ans?.code) || 'REFUSED' };
  if (o === 'in_progress') return { state: 'checking' };
  if (o === 'fenced') return { state: 'not_sent' };
  return { state: 'unknown', forgotten: o === 'forgotten' };
}

export const settleDelay = (i: number): number => SETTLE_MS[Math.min(Math.max(0, i | 0), SETTLE_MS.length - 1)] ?? 30000;


export const newOpId = (rand: (n: number) => Uint8Array): string => hex(rand(16));
export const newIdemKey = (rand: (n: number) => Uint8Array): string => `hub-${b64url(rand(18))}`;

// ── ideas (kit templates) ────────────────────────────────────────────────────────────────────────

export interface Template {
  name: string;
  method: 'GET' | 'POST';
  schedulable: boolean;
  /** The variables a person fills in. */
  plain: string[];
  /** Generated values. */
  secret: string[];
  sample: { method: 'GET' | 'POST'; body: string };
}

/** The 5 kit templates of the agent's scripttpl catalogue. Every other variable keeps the catalogue default. */
export const TEMPLATES: readonly Template[] = [
  { name: 'ai-summarize', method: 'POST', schedulable: false, plain: [], secret: [], sample: { method: 'POST', body: '{"text":"Hoody gives every project its own computer in the cloud."}' } },
  { name: 'http-healthcheck-notify', method: 'GET', schedulable: true, plain: ['target_url'], secret: [], sample: { method: 'GET', body: '' } },
  { name: 'kv-note', method: 'GET', schedulable: false, plain: [], secret: [], sample: { method: 'GET', body: '' } },
  { name: 'scheduled-ai-digest', method: 'POST', schedulable: true, plain: ['topic'], secret: [], sample: { method: 'POST', body: '{}' } },
  { name: 'webhook-to-notification', method: 'POST', schedulable: false, plain: [], secret: ['webhook_secret'], sample: { method: 'POST', body: '{"title":"Hello","body":"From a webhook"}' } },
];

export const template = (name: unknown): Template | null => TEMPLATES.find((t) => t.name === name) ?? null;

export interface InstantiateBody {
  computer_id: string;
  script_path: string;
  vars: Record<string, string>;
  caller_key?: string;
}

/** POST /script-templates/{name}/instantiate body. Secret variables are generated here. */
export function instantiateBody(
  name: string,
  o: { containerId: string; path: string; values?: Record<string, string>; callerKey?: string | null },
  rand: (n: number) => Uint8Array,
): { body: InstantiateBody; secrets: Record<string, string> } | { error: 'unknown_template' | 'bad_target' | 'bad_key' } {
  const tpl = template(name);
  if (!tpl) return { error: 'unknown_template' };
  if (!str(o.containerId) || !isRootRel(o.path) || isDynamic(o.path)) return { error: 'bad_target' };
  const vars: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const p of tpl.plain) {
    const raw = o.values?.[p];
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (v) vars[p] = v;
  }
  for (const n of tpl.secret) {
    const s = b64url(rand(24));
    vars[n] = s;
    secrets[n] = s;
  }
  const body: InstantiateBody = { computer_id: o.containerId, script_path: o.path, vars };
  if (o.callerKey != null) {
    if (!KEY.test(str(o.callerKey))) return { error: 'bad_key' };
    body.caller_key = o.callerKey;
  }
  return { body, secrets };
}

// ── hand-offs ────────────────────────────────────────────────────────────────────────────────────


/** The Logs page for one script (path hand-off form), or null when anything is out of shape. */
export function logsHref(o: { computerHandle: string; rootRel: string; status?: 'failed'; executionId?: string }): string | null {
  const script = toHandoff(o.rootRel);
  if (!script || !o.computerHandle) return null;
  if (o.executionId != null && !/^[A-Za-z0-9_.:-]{1,128}$/.test(o.executionId)) return null;
  return logsLinkFor({ computer: o.computerHandle, script, window: '24h', ...(o.status === 'failed' ? { severity: 'failed' as const } : {}), ...(o.executionId != null ? { exec: o.executionId } : {}) });
}

/** Where a run is read: its runs in Logs (the last 24 h) for a folder 1 script. Logs reads folder 1 only, so a script of
 *  another folder opens itself in that folder instead: its Overview reads its last 24 hours (calls, failures) there. */
export function runsHref(computerHandle: string, rootRel: string): string {
  const logs = logsHref({ computerHandle, rootRel });
  if (logs) return logs;
  const n = execOf(rootRel);
  return `/scripts?sel=${encodeURIComponent(itemId(computerHandle, rootRel))}${n !== null && n !== EXEC_DEFAULT ? `&exec=${n}` : ''}`;
}

/** The Schedules page for one script. */
export function schedulesHref(o: { computerHandle: string; rootRel: string }): string | null {
  const script = toHandoff(o.rootRel);
  if (!script || !o.computerHandle) return null;
  return `/schedules?${new URLSearchParams({ source: 'exec', computer: o.computerHandle, script }).toString()}`;
}

// ── small rules ──────────────────────────────────────────────────────────────────────────────────

// The new-script wizard's three schedule choices only (new/StepWhere.tsx). A script's own schedule is picked on the shared
// model (kit/cron.ts, in the kit ScheduleField).
export const PRESETS = { hourly: '0 * * * *', daily: '0 8 * * *', weekly: '0 8 * * 1' } as const;
export type Preset = 'off' | 'hourly' | 'daily' | 'weekly' | 'custom';

export function presetOf(cron: unknown): Preset {
  const c = str(cron).trim().replace(/\s+/g, ' ');
  if (!c) return 'off';
  for (const k of ['hourly', 'daily', 'weekly'] as const) if (PRESETS[k] === c) return k;
  return 'custom';
}

/** The method a sample request suggests ("Get" / "Send"): template first, then the source. */
export function methodSuggest(source: unknown, tplName?: string): 'GET' | 'POST' {
  const t = template(tplName);
  if (t) return t.method;
  return /request\.method\s*===?\s*["'](?:POST|PUT|PATCH)["']|\brequest\.(?:json|formData|text)\s*\(|\bbody\b\s*[:=]/.test(str(source)) ? 'POST' : 'GET';
}

export interface ErrorLine {
  line: number | null;
  message: string;
}

function lineIn(msg: string): number | null {
  const m = /\((\d+):(\d+)\)/.exec(msg) ?? /\bline (\d+)/i.exec(msg) ?? /:(\d+):(\d+)\b/.exec(msg);
  return m ? +(m[1] ?? 0) : null;
}

/** The list labels each entry "Line n:" itself, so a message that already starts with that line loses it. */
function lineItem(line: number | null, msg: string): ErrorLine {
  const m = line ? /^\s*line\s+(\d+)\s*[:,.-]\s*/i.exec(msg) : null;
  return { line, message: (m && +(m[1] ?? 0) === line && m[0].length < msg.length ? msg.slice(m[0].length) : msg).slice(0, 300) };
}

/** Validation or write refusals → [{line, message}] for the problems list. line may be null. */
export function errorLines(x: unknown): ErrorLine[] {
  const root = x as { validation?: Validation; results?: Validation['results'] } | null;
  const v = (root && root.validation ? root.validation : root) as Validation | null;
  const r = (v && v.results ? v.results : v) as Validation['results'] | null;
  const out: ErrorLine[] = [];
  const add = (msg: unknown): void => {
    if (typeof msg === 'string' && msg) out.push(lineItem(lineIn(msg), msg));
  };
  if (r) {
    if (r.syntax && r.syntax.valid === false) add(r.syntax.error);
    if (r.typescript && r.typescript.valid === false && !(r.syntax && r.syntax.error === r.typescript.error)) add(r.typescript.error);
    if (r.typecheck && Array.isArray(r.typecheck.errors)) {
      for (const e of r.typecheck.errors.slice(0, 20)) if (e && typeof e.message === 'string') out.push(lineItem(+(e.line ?? 0) || null, e.message));
    }
  }
  return out;
}

export type Verdict = { verdict: 'unknown'; errors: ErrorLine[] } | { verdict: 'ready'; errors: ErrorLine[]; missing: string[] } | { verdict: 'needs_fix'; errors: ErrorLine[]; blocking: string[] };

/**
 * The kit's publishable decides when present: a missing package is a warning ("Will install on first call"), not a block.
 * Without it (older kit), errors, invalid modules or a syntax failure block.
 */
export function verdictOf(validation: Validation | null | undefined): Verdict {
  const v = validation;
  const r = v?.results;
  if (!v || (!r && typeof v.publishable !== 'boolean')) return { verdict: 'unknown', errors: [] };
  const errs = errorLines(v);
  const dep = r?.dependencies ?? {};
  const block = Array.isArray(v.blocking) ? v.blocking.filter((b) => b && typeof b === 'object') : [];
  const bad =
    typeof v.publishable === 'boolean'
      ? !v.publishable
      : errs.length > 0 || (Array.isArray(dep.invalidModules) && dep.invalidModules.length > 0) || !!(r?.syntax && r.syntax.valid === false);
  if (!bad) return { verdict: 'ready', errors: [], missing: Array.isArray(dep.missingModules) ? dep.missingModules.slice(0, 10) : [] };
  if (!errs.length) {
    for (const b of block) if (typeof b.message === 'string' && b.message) errs.push(lineItem(+(b.line ?? 0) > 0 ? +(b.line ?? 0) : lineIn(b.message), b.message));
  }
  return { verdict: 'needs_fix', errors: errs, blocking: block.map((b) => str(b.type)) };
}

/** A test send that may have gone through is resent only after a confirm, unless it is a GET (nothing to apply twice). */
export function resendNeedsConfirm(method: string): boolean {
  return method.toUpperCase() !== 'GET';
}

/** The realm the agent's script routes are called in: the chosen realm, else the computer's only one; null = the user must choose. */
export function agentRealmFor(selected: string, compRealms: readonly string[]): string | null {
  if (/^[0-9a-f]{24}$/.test(selected) || selected === 'global') return selected;
  return compRealms.length === 1 ? (compRealms[0] ?? null) : null;
}

/** One row of the agent's script-instances list. A row of another realm is only {path, state: managed_elsewhere}. */
export function instanceOf(x: Record<string, unknown>): Instance | null {
  const raw = typeof x.path === 'string' ? x.path : '';
  if (!raw) return null;
  // The ledger keeps the path as it was sent; rows are keyed like the list's (root-relative).
  const path = execOf(raw) !== null ? raw : ROOT + raw.replace(/^\/+/, '');
  const alias = typeof x.alias_id === 'string' ? x.alias_id : '';
  return { path, template: typeof x.template === 'string' ? x.template : '', state: typeof x.state === 'string' ? x.state : '', elsewhere: x.state === 'managed_elsewhere', hasToken: x.has_token === true, aliasId: alias || null };
}

/** The aliases answer: the Hoody API envelope {statusCode, message, data: [...]} or a bare list. */
export function aliasesOf(raw: unknown): Alias[] {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  // The Hoody API envelope is {statusCode, message, data: {aliases, count}}.
  const d = o && o.data && typeof o.data === 'object' && !Array.isArray(o.data) ? (o.data as Record<string, unknown>) : null;
  const list = Array.isArray(raw) ? raw : d && Array.isArray(d.aliases) ? d.aliases : o && Array.isArray(o.data) ? o.data : o && Array.isArray(o.aliases) ? o.aliases : o && Array.isArray(o.items) ? o.items : [];
  return list.filter((a): a is Alias => !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string');
}

/** Why Restore is not offered for a deleted script: its owner cannot be read (or no realm is chosen), or another realm manages it. */
export function restoreBlock(c: Pick<CompScripts, 'instances' | 'agentRealm'>, path: string): 'unknown' | 'elsewhere' | null {
  if (c.instances === null || c.agentRealm === null) return 'unknown';
  return c.instances[path]?.elsewhere ? 'elsewhere' : null;
}

/** Public links are not made or changed while the owner is unknown or the agent manages the script. */
export function shareBlock(item: Pick<ScriptItem, 'managed' | 'ownershipUnknown'>): boolean {
  return item.ownershipUnknown || !!item.managed;
}

/** A save or restore the kit refused because the revision moved is a conflict to resolve, not a plain failure. */
export function isConflict(r: { outcome: string; code?: string } | null | undefined): boolean {
  return r?.outcome === 'stale' || (r?.outcome === 'failed' && (r.code === 'BAD_REVISION' || r.code === 'REVISION_MISMATCH'));
}

/**
 * A refusal of a revision-checked update that is, or most likely is, a revision clash. The kit's conflict answer carries its code
 * nested in `details`; core's errorOf takes it for hoody-exec's own API, so a listed REVISION_MISMATCH
 * arrives as itself (BAD_REVISION and SCRIPT_BUSY are listed too, but hoody-exec sends neither). A 409 whose cause is not one the
 * route lists still arrives with no code of its own (a fenced op,
 * an older kit), and the bare 409 stays read as a clash for those. Only the settings panel uses this: a clash and any
 * other definite refusal are handled alike there (nothing written, read again, checked again), so the worst a mistake costs is the
 * wording of the note. The code editor keeps `isConflict`, whose wording ("Somebody saved first") claims more.
 */
export function isRevisionClash(r: { outcome: string; code?: string; status?: number } | null | undefined): boolean {
  return isConflict(r) || (r?.outcome === 'failed' && r.status === 409 && !r.code);
}

/** What an env key's `from` names: the kit answers a file path; only the three known words get a plain label. */
export function envFromKind(from: string | undefined): 'script' | 'folder' | 'computer' | null {
  return from === undefined || from === 'script' ? 'script' : from === 'folder' || from === 'computer' ? from : null;
}

/** The `n` key opens New script only where it has something to do: not on the New page itself, and only with a computer to write to. */
export const newKeyEnabled = (canCreate: boolean, sub: readonly string[]): boolean => canCreate && sub[0] !== 'new';

/**
 * How a row's "run" answer shows. A pending one may have started the script, so it stays (sticky `unknown`) with a
 * read-back. A held second press (the kit refused it with READ_BACK_FIRST or BUSY: the earlier run is not settled)
 * reads as "still checking the earlier run", never as "did not start": the earlier run may have started.
 * A definite failure (the kit refused the run) is an error with its Details and Try again; a run that was never sent
 * (not_sent, stale) is info with Try again. Neither started anything, so trying again starts at most one run.
 */
export function runToastFor(outcome: string, code?: string): { tone: 'ok' | 'info' | 'error' | 'unknown'; key: 'run.started' | 'run.pending' | 'run.checking' | 'run.failed' } {
  if (outcome === 'done') return { tone: 'ok', key: 'run.started' };
  if (outcome === 'pending') return { tone: 'unknown', key: 'run.pending' };
  if (outcome === 'not_sent' && (code === 'READ_BACK_FIRST' || code === 'BUSY')) return { tone: 'unknown', key: 'run.checking' };
  if (outcome === 'failed') return { tone: 'error', key: 'run.failed' };
  return { tone: 'info', key: 'run.failed' };
}

/** The warned Dismiss of a run the kit still holds: it names the held run it concerns (its hold, taken by the path and the computer the run was sent on), and is offered only when there is one.
 *  It answers what the release answered: true only when the hold was freed (the toast closes); a refused release keeps the toast. */
export function heldRunRelease<V>(trigger: { settle: (v: V, hold: string) => Promise<unknown> }, vars: V, hold: string | undefined): (() => Promise<boolean>) | undefined {
  return hold ? () => trigger.settle(vars, hold).then((freed) => freed === true) : undefined;
}

/** Whether a text is one JSON object or array (an answer worth colouring as JSON); anything else is plain text. */
export function looksJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}
