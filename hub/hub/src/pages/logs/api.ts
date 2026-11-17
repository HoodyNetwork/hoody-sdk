// The Logs page's seam to the network: one small interface (`LogsApi`) the controller reads
// through, with two backends. `coreApi()` sends every request through a route declared in
// routes.ts (core admits, bounds and fences it); `fixtureApi(world)` answers the same paths from a
// fixture world, through the in-memory logs kit in fake-kit.ts, so hub:dev, shots and tests run
// the page's real code. The controller never knows which one it holds.
//
// Paths are the ones rules.ts builds (`/_logs?sinceMs=...`); the core backend turns a path into a
// route and a query object, and refuses a path no route declares (nothing is sent).
import { api, download as coreDownload, save as coreSave, stream as coreStream } from '@core';
import type { Download } from './export';
import type { Call } from './explain';
import type { CoreStream } from './live';
import { routes } from './routes';

export type Kit = 'logs' | 'exec' | 'daemon';
export interface CallOpts { signal?: AbortSignal }

export interface SaveResult { ok: true; name: string; bytes: number }
export type Save = (name: string, parts: unknown[], o: { maxBytes: number }) => SaveResult | { refused: string };

export interface LogsApi {
  /** A GET through one of the computer's kits (`logs`, `exec`, `daemon`). */
  kit(kit: Kit, path: string, o?: CallOpts): Promise<unknown>;
  /** Changes (the realm host) and account activity (the base host). */
  side(scope: 'realm' | 'base', path: string, o?: CallOpts): Promise<unknown>;
  /** The computer's agent log (the AI helper source). */
  helper(path: string, o?: CallOpts): Promise<unknown>;
  /** One run's recent output. */
  execRead(body: { executionId: string; lines: number }, o?: CallOpts): Promise<unknown>;
  /** The Explain session's three calls. */
  call: Call;
  /** Live's stream (null: this build cannot stream). */
  stream: CoreStream | null;
  /** A GET as bytes, for exports the agent builds. */
  download: Download;
  save: Save;
}

// ── path → route ──────────────────────────────────────────────────────────────────────

export function split(path: string): { pathname: string; query: Record<string, string> } {
  const i = path.indexOf('?');
  return { pathname: i < 0 ? path : path.slice(0, i), query: i < 0 ? {} : Object.fromEntries(new URLSearchParams(path.slice(i + 1))) };
}

interface Resolved { route: (typeof routes)[keyof typeof routes]; params?: Record<string, string>; query: Record<string, string> }

const LOGS_PATH: Record<string, keyof typeof routes> = { '/_logs': 'list', '/_logs/stats': 'stats' };
export const PROGRAM_LOGS = /^\/api\/v1\/daemon\/programs\/([^/]+)\/logs$/;

export function resolveKit(kit: Kit, path: string): Resolved | null {
  const { pathname, query: q } = split(path);
  if (kit === 'logs') { const k = LOGS_PATH[pathname]; return k ? { route: routes[k], query: q } : null; }
  if (kit === 'exec') return pathname === '/api/v1/exec/logs/executions' ? { route: routes.runs, query: q } : null;
  if (pathname === '/api/v1/daemon/programs') return { route: routes.programs, query: q };
  const m = PROGRAM_LOGS.exec(pathname);
  return m ? { route: routes.programLogs, params: { id: decodeURIComponent(m[1] as string) }, query: q } : null;
}

const reject = (code: string) => Promise.reject({ code, notSent: true });

export function coreApi(): LogsApi {
  const send = (r: Resolved | null, o?: CallOpts): Promise<unknown> => {
    if (!r) return reject('ROUTE_NOT_DECLARED');
    return api(r.route as never, { ...(r.params ? { params: r.params } : {}), query: r.query, ...(o?.signal ? { signal: o.signal } : {}) } as never);
  };
  const side = (scope: 'realm' | 'base', path: string, o?: CallOpts) => {
    const { pathname, query: q } = split(path);
    const route = scope === 'realm' ? (pathname === '/events' ? routes.changes : null) : pathname === '/users/auth/activity' ? routes.account : null;
    return send(route ? { route, query: q } : null, o);
  };
  const call: Call = (method, path, body, extra) => {
    const input = { ...(extra.realm ? { realm: extra.realm } : {}), ...(extra.signal ? { signal: extra.signal } : {}), ...(extra.recovers ? { recovers: true } : {}) };
    if (path === '/models' && method === 'GET') return api(routes.models as never, input as never);
    if (path === '/agents' && method === 'GET') return api(routes.agents as never, input as never);
    if (path === '/completions' && method === 'POST') return api(routes.complete as never, { ...input, body } as never);
    return reject('ROUTE_NOT_DECLARED');
  };
  const stream: CoreStream = (path, h) => {
    const { pathname, query: q } = split(path);
    if (pathname !== '/_logs/stream') return { refused: 'ROUTE_NOT_DECLARED', close: () => {} };
    return coreStream(routes.tail as never, { query: q, onEvent: h.onEvent, onState: h.onState as never });
  };
  const download: Download = (path, o) => {
    const { pathname, query: q } = split(path);
    if (pathname !== '/logs/export') return reject('ROUTE_NOT_DECLARED');
    return coreDownload(routes.helperExport as never, { query: q, maxBytes: o.maxBytes, validateEnd: o.validateEnd, ...(o.signal ? { signal: o.signal } : {}) });
  };
  return {
    kit: (kit, path, o) => send(resolveKit(kit, path), o),
    side,
    helper: (path, o) => (split(path).pathname === '/logs' ? send({ route: routes.helper, query: split(path).query }, o) : reject('ROUTE_NOT_DECLARED')),
    execRead: (body, o) => api(routes.runOutput as never, { body, ...(o?.signal ? { signal: o.signal } : {}) } as never),
    call,
    stream,
    download,
    save: (name, parts, o) => coreSave(name, parts, o),
  };
}
