// The clients that answer from memory and send nothing. Neither holds a credential.
//   - demoClient(): the account of `hoody hub --demo`. It replays the sample world (demo-world.gen.json: what the
//     Hub's own sample world answers each page's reads, recorded by scripts/term/demo-record.ts) and the hand-written
//     answers of demo-answers.ts, answers an item of a recorded list from that list (fromList), answers a realm's
//     host with that realm's part only (realmView), moves every recorded time so the account is as old today as it
//     was when recorded, and refuses every change unsent. Only the demo mount takes it (src/term/entry.demo.ts).
//   - fakeClient(): the gates' minimal account (measure.ts, ship-run.ts).
// Compiled into the release binary, so this file imports no boundary guard (measure.ts refuses outside the test
// boundary; a user's terminal is outside it) and nothing of hub/src.
import { DEMO_VAULT_VALUES, demoAnswer, demoKitAnswer, demoOwnRules, demoRuntimeInfo } from './demo-answers';
import { emptyAnswer } from './fake-empty';
import world from './demo-world.gen.json';

export interface FakeCall { method: string; path: string }
export type FakeMode = 'error' | 'empty';
export const FAKE_MODES: readonly FakeMode[] = ['error', 'empty'];

export function fakeClient(calls: FakeCall[], mode: FakeMode = 'error') {
  const me = { id: 'u_fake', uid: 'u_fake', email: 'nobody@example.invalid', name: 'Measure', role: 'user', is_staff: false, otp_enabled: false, created_at: '2026-01-01T00:00:00Z' };
  const realm = { id: '5f0c0ffee0c0ffee0c0ffee0', realm_id: '5f0c0ffee0c0ffee0c0ffee0', name: 'Personal', alias: 'personal', is_default: true };
  const answers: Array<[RegExp, unknown]> = [
    [/^\/users\/auth\/me\b/, { success: true, data: me }],
    [/^\/users\/me\b/, { success: true, data: me }],
    [/realms/, { success: true, data: [realm], meta: { total: 1 } }],
    [/projects/, { success: true, data: [], meta: { total: 0 } }],
    [/containers|computers/, { success: true, data: [], meta: { total: 0 } }],
    [/servers/, { success: true, data: [], meta: { total: 0 } }],
  ];
  return {
    identity: { kind: 'account' as const, uid: 'u_fake', sid: 's_fake' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realms.example.invalid',
    async request(method: string, p: string): Promise<unknown> {
      calls.push({ method, path: p });
      // Mode 'empty' first: its answers carry the declared shapes (fake-empty.ts), the boot list's may not.
      const empty = mode === 'empty' ? emptyAnswer(method, p) : null;
      if (empty) return empty;
      for (const [re, body] of answers) if (method === 'GET' && re.test(p)) return body;
      throw { status: 404, code: 'NOT_FOUND' };
    },
    async fetch(url: string): Promise<Response> {
      calls.push({ method: 'FETCH', path: url });
      return new Response('{}', { status: 404 });
    },
  };
}

/** The mark the demo mount asks for (src/term/app/boot.demo.ts DEMO_CLIENT: the same registered symbol). */
export const DEMO_CLIENT = Symbol.for('hoody.term.demoClient');

interface DemoRecord { leg: 'hoody' | 'fetch'; method: string; url: string; status: number; body: unknown; raw?: boolean; type?: string; etag?: string; at?: string }
const WORLD = world as unknown as { recordedAt: string; account: string; context: { realmId: string; projectId: string; containerId: string }; records: DemoRecord[] };
const bareOf = (u: string): string => u.replace(/[?#].*$/s, '');
/** Query keys that only size, order or dress an answer: two reads that differ in nothing else ask for the same thing. */
const DRESSING = new Set(['limit', 'order', 'sort', 'json', 'include_usage']);
/** What a read selects: every other query key with its value (first page and offset 0 are the same as none). */
export function selectorOf(u: string): string {
  const q = u.replace(/#.*$/s, '').split('?')[1] ?? '';
  return [...new URLSearchParams(q)].filter(([k, v]) => !DRESSING.has(k) && !((k === 'page' && v === '1') || (k === 'offset' && v === '0')))
    .map(([k, v]) => `${k}=${v}`).sort().join('&');
}
const EXACT = new Map<string, DemoRecord>();
const SAME = new Map<string, DemoRecord>();
for (const r of WORLD.records) {
  const k = `${r.leg} ${r.method} `;
  if (!EXACT.has(k + r.url)) EXACT.set(k + r.url, r);
  const same = `${k}${bareOf(r.url)} ${selectorOf(r.url)}`;
  if (!SAME.has(same)) SAME.set(same, r);
}
/** The recorded answer of a read: the same address and query first, else the same address selecting the same thing. */
const found = (leg: DemoRecord['leg'], url: string): DemoRecord | undefined => EXACT.get(`${leg} GET ${url}`) ?? SAME.get(`${leg} GET ${bareOf(url)} ${selectorOf(url)}`);
/** A computer's read over "all realms" (`realm=all`), as the recorded realm's: the recording was made inside that one realm, and all realms hold what it holds. */
const inRecordedRealm = (url: string): string => url.replace(/([?&]realm=)all(?=&|#|$)/, `$1${WORLD.context.realmId}`);
const recorded = (leg: DemoRecord['leg'], url: string): DemoRecord | undefined => found(leg, url) ?? (leg === 'fetch' ? found(leg, inRecordedRealm(url)) : undefined);

type Row = Record<string, unknown>;
const rowsOf = (r: DemoRecord | undefined, key?: string): Row[] => {
  const d = (r?.body as { data?: unknown } | undefined)?.data;
  const list = key ? (d as Record<string, unknown> | undefined)?.[key] : d;
  return Array.isArray(list) ? (list as Row[]) : [];
};
/** A computer row as the item routes answer it: the list's row, its `server` without the list's `id`, and whether it
 *  keeps access rules of its own (demo-answers.ts demoOwnRules). */
const itemOf = (c: Row): Row => {
  const server: Row = { ...((c.server ?? {}) as Row) };
  delete server.id;
  const own = demoOwnRules(String(c.id));
  return { ...c, server, ...(own ? { proxy_permissions_computer_state: own } : {}) };
};
const page = (rows: Row[]) => ({ total: rows.length, page: 1, limit: 100, totalPages: rows.length > 0 ? 1 : 0 });
/** A read the sample world answers from one of its recorded lists (it records the lists the pages show, not each item
 *  in them): one computer (GET /computers/<id>; with ?runtime=true also what it listens on, null unless it runs), a
 *  realm's or a project's computers, and a vault entry's value (its recorded row and DEMO_VAULT_VALUES). The answer and
 *  the list it comes from, or undefined. */
function fromList(p: string): { body: unknown; from: DemoRecord } | undefined {
  const bare = bareOf(p);
  const q = new URLSearchParams(p.replace(/#.*$/s, '').split('?')[1] ?? '');
  const keys = [...q.keys()].filter((k) => k !== 'page' && k !== 'limit');
  const computers = found('hoody', '/computers?limit=100');
  const ok = (data: unknown, from: DemoRecord) => ({ body: { statusCode: 200, message: 'OK', data }, from });
  let m: RegExpExecArray | null;
  if (computers && (m = /^\/computers\/([0-9a-f]{24})$/.exec(bare)) && keys.every((k) => k === 'runtime')) {
    const c = rowsOf(computers, 'computers').find((x) => x.id === m![1]);
    if (!c) return undefined;
    const runtime = q.get('runtime') === 'true' ? { runtime_info: c.status === 'running' ? demoRuntimeInfo(String(c.id)) : null } : {};
    return ok({ ...itemOf(c), ...runtime }, computers);
  }
  if (computers && bare === '/computers' && keys.length === 1 && keys[0] === 'realm_id') {
    const rows = rowsOf(computers, 'computers').filter((x) => Array.isArray(x.realm_ids) && x.realm_ids.includes(q.get('realm_id'))).map(itemOf);
    return ok({ computers: rows, pagination: page(rows) }, computers);
  }
  if (computers && (m = /^\/projects\/([0-9a-f]{24})\/computers$/.exec(bare)) && keys.every((k) => k === 'include_expired' || k === 'include_deleting')) {
    if (!rowsOf(found('hoody', '/projects?limit=100'), 'projects').some((x) => x.id === m![1])) return undefined;
    // The project list's rows carry no ramdisk flag (its schema has none).
    const rows = rowsOf(computers, 'computers').filter((x) => x.project_id === m![1]).map((x) => {
      const row: Row = { ...itemOf(x), server_expired: false };
      delete row.ramdisk;
      return row;
    });
    return ok({ computers: rows, pagination: page(rows) }, computers);
  }
  if ((m = /^\/vault\/keys\/([^/]+)$/.exec(bare)) && keys.length === 1 && keys[0] === 'realm_id') {
    const list = found('hoody', `/vault/keys?realm_id=${q.get('realm_id')}`);
    const key = decodeURIComponent(m[1]!);
    const row = rowsOf(list).find((x) => x.key === key);
    const value = DEMO_VAULT_VALUES[key];
    return list && row && value !== undefined ? ok({ ...row, value }, list) : undefined;
  }
  return undefined;
}

/** The realm hosts of the sample account (core/session.ts hubApiBase: https://<realm>.<this domain>/api/v1). */
const REALM_API_DOMAIN = 'realms.demo.invalid';
const REALM_BASE = /^https:\/\/([0-9a-f]{24})\.realms\.demo\.invalid\/api\/v1$/;
/** The realm a Hoody call is sent to by its host, else null: the base host, which answers for every realm. */
export const realmOfBase = (base: string | undefined): string | null => (base === undefined ? null : REALM_BASE.exec(base)?.[1] ?? null);
type Held = 'computers' | 'projects';
/** Whether `realm` holds the recorded computer or project `id`; undefined when the sample world lacks that id. */
function realmHolds(realm: string, kind: Held, id: string): boolean | undefined {
  const row = rowsOf(found('hoody', `/${kind}?limit=100`), kind).find((x) => x.id === id);
  return row === undefined ? undefined : Array.isArray(row.realm_ids) && row.realm_ids.includes(realm);
}
/** A read a realm host answers 404, as the API does: one of a computer or project of another realm, named in the
 *  path or by its computer_id / project_id selector. An id the sample world lacks is left to the answers. */
function outsideRealm(realm: string, p: string): boolean {
  const q = new URLSearchParams(p.replace(/#.*$/s, '').split('?')[1] ?? '');
  const named: Array<readonly [Held, string | null]> = [['computers', q.get('computer_id')], ['projects', q.get('project_id')]];
  const m = /^\/(computers|projects)\/([0-9a-f]{24})(?:\/|$)/.exec(bareOf(p));
  if (m) named.push([m[1] as Held, m[2]!]);
  return named.some(([kind, id]) => id !== null && realmHolds(realm, kind, id) === false);
}
/** The lists a realm host answers with that realm's rows only (each row names its realms in `realm_ids`). */
const REALM_LISTS: Readonly<Record<string, string>> = { '/computers': 'computers', '/projects': 'projects', '/events': 'events' };
/** A list as a realm host answers it: the rows tagged with that realm, the total counted again. Any other body as is. */
function realmView(realm: string, p: string, body: unknown): unknown {
  const key = REALM_LISTS[bareOf(p)];
  const data = (body as { data?: unknown } | null)?.data;
  const list = key && data && typeof data === 'object' ? (data as Row)[key] : undefined;
  if (!key || !Array.isArray(list)) return body;
  const rows = (list as Row[]).filter((x) => Array.isArray(x.realm_ids) && x.realm_ids.includes(realm));
  const out: Row = { ...(data as Row), [key]: rows };
  const pg = out.pagination as Row | undefined;
  if (pg && typeof pg === 'object') out.pagination = { ...pg, total: rows.length, ...('totalPages' in pg ? { totalPages: rows.length > 0 ? 1 : 0 } : {}), ...('has_more' in pg ? { has_more: false } : {}) };
  return { ...(body as Row), data: out };
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const TIME_KEY = /(_at|At|mtime|_time)$/;
const RECORDED_MS = Date.parse(WORLD.recordedAt);
const FIVE_YEARS = 5 * 365 * 86_400_000;
/** A number that is a time in milliseconds: under a time key and within five years of the recording. */
const isEpochMs = (key: string, v: number): boolean => TIME_KEY.test(key) && Number.isFinite(v) && Math.abs(v - RECORDED_MS) <= FIVE_YEARS;
/** A copy of a recorded body with every time moved by `ms` (the sample account never looks stale): ISO strings, and numbers in milliseconds under a time key. */
export function shiftTimes<T>(v: T, ms: number, key = ''): T {
  if (typeof v === 'string') return (ISO.test(v) ? new Date(Date.parse(v) + ms).toISOString() : v) as T;
  if (typeof v === 'number') return (isEpochMs(key, v) ? v + ms : v) as T;
  if (Array.isArray(v)) return v.map((x) => shiftTimes(x, ms, key)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftTimes(x, ms, k)])) as T;
  return v;
}

/** What a change gets: refused before anything is sent (the Hub shows "Nothing was sent"), never an error of the page. */
const unsent = (): { status: 0; notSent: true; code: 'DEMO_READ_ONLY' } => ({ status: 0, notSent: true, code: 'DEMO_READ_ONLY' });

/** What `hoody hub --demo` mounts: the sample account, and where it starts (its current computer). */
export const DEMO_CONTEXT = Object.freeze({ profile: 'demo', ...WORLD.context });

export function demoClient(now: () => number = Date.now) {
  // A record is dated from the clock its fixture used (demo-record.ts `at`), else from the recording's.
  const shift = (r: DemoRecord): number => now() - Date.parse(r.at ?? WORLD.recordedAt);
  return {
    [DEMO_CLIENT]: true as const,
    identity: { kind: 'account' as const, uid: WORLD.account, sid: 'demo' },
    realmApiDomain: REALM_API_DOMAIN,
    async request(method: string, p: string, _body?: unknown, o?: { base?: string; beforeWire?: () => boolean; onEtag?: (etag: string | null) => void }): Promise<unknown> {
      if (method !== 'GET') throw unsent();
      if (o?.beforeWire && !o.beforeWire()) throw { status: 0, notSent: true, stale: true };
      // A realm's host (the Hub's realm-scoped reads while one realm is selected) answers that realm's part only.
      const realm = realmOfBase(o?.base);
      if (realm !== null && outsideRealm(realm, p)) throw { status: 404, code: 'NOT_FOUND' };
      const inRealm = (body: unknown): unknown => (realm === null ? body : realmView(realm, p, body));
      const hand = demoAnswer(method, p, now());
      if (hand) { o?.onEtag?.(null); return inRealm(hand); }
      const r = recorded('hoody', p);
      if (!r) {
        const one = fromList(p);
        if (!one) throw { status: 404, code: 'NOT_FOUND' };
        o?.onEtag?.(null);
        return inRealm(shiftTimes(one.body, shift(one.from)));
      }
      if (r.status < 200 || r.status > 299) throw { status: r.status, code: (r.body as { error?: string } | null)?.error ?? null, data: r.body };
      o?.onEtag?.(r.etag ?? null);
      return inRealm(shiftTimes(r.body, shift(r)));
    },
    async fetch(url: string, init?: RequestInit, o?: { beforeWire?: () => boolean }): Promise<Response> {
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET') throw unsent();
      if (o?.beforeWire && !o.beforeWire()) throw { status: 0, notSent: true, stale: true };
      const hand = demoKitAnswer(url, now());
      if (hand) return new Response(hand.type ? String(hand.body) : JSON.stringify(hand.body), { status: hand.status, headers: { 'content-type': hand.type ?? 'application/json' } });
      const r = recorded('fetch', url);
      if (!r) return new Response('{"error":"NOT_FOUND"}', { status: 404, headers: { 'content-type': 'application/json' } });
      const text = r.status === 204 ? null : r.raw ? String(r.body) : JSON.stringify(shiftTimes(r.body, shift(r)));
      return new Response(text, { status: r.status, headers: { 'content-type': r.type ?? 'application/json' } });
    },
  };
}
