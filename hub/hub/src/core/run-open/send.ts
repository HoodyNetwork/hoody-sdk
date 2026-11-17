// send.ts: the run-open machine's transport over core's api().
//
// Contract (the machine's, see index.ts):
//   - Each request matches one declared kit route below (one per RUN_OPEN_ROUTES row). Its guard runs route(), so
//     the band rule, the incarnation rule and the raw-only terminal-0 rule hold in core's admission as well; a
//     request no row admits rejects {notSent: true, code: 'ROUTE_REFUSED'} and is never sent.
//   - Answers: a success resolves {status: 200, body}. A rejection maps as the old adapter did:
//       pending (a change that may have applied)   → reject {ambiguous: true}, except a resolve answered 4xx/5xx,
//                                                    which is that answer {status, body: {code}} (resolve applies
//                                                    nothing; the machine branches on its codes), and any answered
//                                                    5xx, which is that answer (the machine reads a 5xx as unknown)
//       preflight_refused                          → reject {code: 'preflight_refused'}
//       notSent / stale                            → reject {notSent: true, code}
//       an answered 4xx/5xx                        → resolve {status, body: data or {code}}
//       anything else                              → reject {ambiguous: true}
//     retryAfterMs rides along when the answer had one.
//   - Never retried here, never a fresh key: the machine decides any re-send, always the identical request (C9).
//   - The resolve answer is a secret: core scrubs it through `scrub`, which blanks launch_env only when the answer
//     will be dropped (the caller's signal aborted or its view died); a live answer goes to the machine whole and
//     the machine blanks it after use. A secret rejection keeps only RESOLVE_CODES.
//   - Launch permission: with `mayLaunch`, a launch-producing row (run resolve, band
//     terminal create, band terminal execute: first sends and replays alike) leaves only while mayLaunch() answers
//     true; otherwise it rejects {code: 'preflight_refused'} unsent, which the machine reads as access refused
//     (a refused replay is not an admission: the machine keeps that launch unknown). Status reads, Stop (signal,
//     DELETE) and terminal-0's raw execute always go.
//   - execute's `env` holds the staged secret values: the route names it as a secret body key, so a refusal keeps
//     only EXECUTE_CODES (the codes the machine branches on) and its status and Retry-After.
import { api } from '../api';
import type { Ctx, Target } from '../ctx';
import { defineRoute, type GuardInput, type Route } from '../routes';
import type { RunSend } from './index';
import { EXECUTE_CODES, RESOLVE_CODES, RESOLVE_PATH, RUN_OPEN_ROUTES, inBand, inHeld, indexOk, route } from './kitRoutes';
import { isRecord } from '../shape';

const guardFor = (kit: string) => (g: GuardInput): boolean => {
  const q = g.path.indexOf('?');
  return route(kit, g.index, g.method, q === -1 ? g.path : g.path.slice(0, q), g.query, g.body) === null;
};

// The declared form of each allowlist row: a regex path becomes a :param path; the band (or a held launch terminal)
// becomes a predicate.
interface Declared {
  kit: 'run' | 'terminal' | 'display';
  method: 'GET' | 'POST' | 'DELETE';
  /** The row's index rule: one program, the band, or a held launch terminal (the band or the old band). */
  index: number | 'band' | 'held';
  match: RegExp;
  route: Route;
}

const SPEC_PATH: Record<string, string> = {
  '^\\/api\\/v1\\/terminal\\/workloads\\/([0-9]{1,5})\\/signal$': '/api/v1/terminal/workloads/:n/signal',
  '^\\/api\\/v1\\/terminal\\/([0-9]{1,5})$': '/api/v1/terminal/:n',
};
const literalPath = (re: RegExp): string => SPEC_PATH[re.source] ?? re.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');

export const RUN_OPEN_DECLARED: readonly Declared[] = RUN_OPEN_ROUTES.map(([kit, index, method, pattern, query, body]) => {
  const path = literalPath(pattern);
  const resolve = path === RESOLVE_PATH;
  const executeBand = kit === 'terminal' && index === 'band' && path === '/api/v1/terminal/execute';
  return {
    kit,
    method,
    index,
    match: pattern,
    route: defineRoute({
      method,
      path,
      scope: 'kit',
      kit,
      index: index === 'band' ? inBand : index === 'held' ? inHeld : index,
      ...(query.length ? { query } : {}),
      ...(body ? { body } : {}),
      ...(resolve ? { secret: true, codes: RESOLVE_CODES } : executeBand ? { secret: ['env'], codes: EXECUTE_CODES } : {}),
      guard: guardFor(kit),
    }),
  };
});

export interface RunSendOptions {
  /** The context the Apps view started under (a realm or computer switch kills it). */
  ctx?: Ctx;
  target?: Target | null;
  /** Aborted when the view is torn down. */
  signal?: AbortSignal;
  /** false once the view's answers are dropped. */
  alive?: () => boolean;
  /** A server's "come back later", in ms, for the view to show. */
  onRetryAfter?: (ms: number) => void;
  /** Blanks a dropped resolve answer's secret values (index.ts scrubResolveAnswer). */
  scrubDropped?: (answer: unknown) => void;
  /** Read at every launch-producing send (resolve, band create, band execute): false or a throw refuses it unsent. */
  mayLaunch?: () => boolean;
}

/** A row that starts a program: resolve, or the band's terminal create or tracked execute (terminal-0's raw execute
 *  is a status read and Stop's, never one). */
const launches = (d: Declared): boolean =>
  (d.kit === 'run' && d.method === 'POST' && literalPath(d.match) === RESOLVE_PATH)
  || (d.kit === 'terminal' && d.index === 'band' && d.method === 'POST' && /^\/api\/v1\/terminal\/(create|execute)$/.test(literalPath(d.match)));

const answered = (e: Record<string, unknown>): boolean => typeof e.status === 'number' && e.status >= 400 && e.status <= 599;

export function runOpenSend(o: RunSendOptions = {}): RunSend {
  const dropped = (): boolean => {
    if (o.signal?.aborted) return true;
    try {
      return typeof o.alive === 'function' && o.alive() !== true;
    } catch {
      return true;
    }
  };
  return (target, method, path, query, body) => {
    const m = String(method || '').toUpperCase();
    const q = query ?? {};
    if (route(target.kit, target.index, m, path, q, body) !== null) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    // The row this request is: terminal-0's raw execute and terminal-N's tracked execute share a path.
    const d = RUN_OPEN_DECLARED.find((r) => r.kit === target.kit && r.method === m && r.match.test(path) && indexOk(r.index, target.index));
    if (!d) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    if (o.mayLaunch && launches(d)) {
      let may = false;
      try {
        may = o.mayLaunch() === true;
      } catch {
        may = false;
      }
      if (!may) return Promise.reject({ code: 'preflight_refused' });
    }
    const params: Record<string, string> = {};
    const hit = d.match.exec(path);
    if (hit && hit[1] !== undefined) params.n = hit[1];
    const resolve = path === RESOLVE_PATH;
    return api(d.route, {
      ...(Object.keys(params).length ? { params } : {}),
      ...(Object.keys(q).length ? { query: q } : {}),
      ...(body === undefined ? {} : { body }),
      ...(o.ctx ? { ctx: o.ctx } : {}),
      ...(o.target !== undefined ? { target: o.target } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
      index: target.index,
      recovers: true,
      ...(resolve ? { scrub: (b: unknown) => { if (dropped()) o.scrubDropped?.(b); } } : {}),
    }).then(
      (b) => ({ status: 200, body: b }),
      (err: unknown) => {
        const e: Record<string, unknown> = isRecord(err) ? err : {};
        // Core transport errors carry Retry-After in seconds (retryAfter); retryAfterMs only when something set it.
        const wait = typeof e.retryAfterMs === 'number' && e.retryAfterMs > 0 ? e.retryAfterMs
          : typeof e.retryAfter === 'number' && e.retryAfter > 0 ? e.retryAfter * 1000 : 0;
        if (wait && o.onRetryAfter) {
          try {
            o.onRetryAfter(wait);
          } catch {
            /* the answer still goes to the machine */
          }
        }
        const withWait = <T extends object>(a: T): T => (wait ? Object.assign(a, { retryAfterMs: wait }) : a);
        if (resolve && e.pending && answered(e)) return withWait({ status: e.status as number, body: typeof e.code === 'string' && e.code ? { code: e.code } : undefined });
        // An answered 5xx stays that answer, Retry-After included: the machine reads every 5xx as "may have
        // applied" (execute replays the identical request, after the server's wait; create never reuses the id;
        // a signal is never re-sent, close reads the record before it escalates), so nothing is decided on it.
        if (e.pending && typeof e.status === 'number' && e.status >= 500 && e.status <= 599) {
          return withWait({ status: e.status, body: typeof e.code === 'string' && e.code ? { code: e.code } : undefined });
        }
        // A change whose outcome is unknown is never "not sent" or "refused", whatever else it carries (C9).
        if (e.pending) throw withWait({ ambiguous: true });
        if (e.code === 'preflight_refused' || e.kind === 'preflight_refused') throw { code: 'preflight_refused' };
        if (e.notSent || e.stale) throw { notSent: true, code: typeof e.code === 'string' ? e.code : e.stale ? 'stale' : null };
        if (answered(e)) return withWait({ status: e.status as number, body: isRecord(e.data) && Object.keys(e.data).length ? e.data : typeof e.code === 'string' && e.code ? { code: e.code } : undefined });
        throw { ambiguous: true };
      },
    );
  };
}
