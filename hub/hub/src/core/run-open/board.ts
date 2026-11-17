// board.ts: the Board's kit requests (items 34e, 36, 42b) over core's api(): one declared kit route per
// BOARD_KIT_ROUTES row, each guarded by boardRoute(), and boardSend(), the only way the Board sends them.
//
// Contract:
//   - boardSend(target, method, path, opts) runs boardRoute() first: a request no row admits rejects
//     {notSent: true, code: 'ROUTE_REFUSED'} and is never sent. Core's admission runs the same guard again, so a
//     declared route called directly is refused unsent too (ROUTE_NOT_ALLOWED).
//   - Answers are api()'s, unmapped: a success resolves the body; a rejection is core's error (notSent, pending,
//     an answered status), so the page applies its own C9 rules. Never retried here.
//   - path carries no query string; the query goes in opts.query.
//   - boardFixtureRoute(kit, method, path) is for tests only: the declared Route a boardSend of that request goes
//     through, so a fixture rule (transport.ts reply) can answer it. It throws when no row declares the request.
import { api } from '../api';
import type { Ctx, Target } from '../ctx';
import { defineRoute, type GuardInput, type Route } from '../routes';
import { BOARD_KIT_ROUTES, BROWSER_START_CODES, BROWSE_TIMEOUT_MS, boardRoute, inBoard, inBrowser, type BoardKit } from './kitRoutes';

export { BOARD_BROWSER_IDS, BOARD_IDS, BOARD_SHELLS, BROWSE_TIMEOUT_MS, outsideUrl, type BoardKit } from './kitRoutes';

const guardFor = (kit: BoardKit) => (g: GuardInput): boolean => {
  const q = g.path.indexOf('?');
  return boardRoute(kit, g.index, g.method, q === -1 ? g.path : g.path.slice(0, q), g.query, g.body) === null;
};

const SPEC_PATH: Record<string, string> = {
  '^\\/api\\/v1\\/terminal\\/([0-9]{1,5})$': '/api/v1/terminal/:n',
  '^\\/api\\/v1\\/notes\\/notebooks\\/([0-9a-z]{24,28})\\/nodes$': '/api/v1/notes/notebooks/:n/nodes',
};
const literalPath = (re: RegExp): string => SPEC_PATH[re.source] ?? re.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');
// The browser start creates an instance and may carry a proxy password: refused in a framed page like any change, and
// secret (a refusal keeps only its code, never a message or details that could echo the password), and a change
// although a GET (routes.ts change): an unknown or late answer reads pending, never failed or stale. The DevTools
// address grants access to the browser: refused in a framed page too; it stays a read. A start waits as long as the
// kit's own request timeout (600 s, which a launch that installs Chrome can take) plus a minute, so a slow first start
// is not reported unknown at core's 30 s. A restart (execute with reset) answered 409 SHELL_REPLACED was reset first:
// the new shell ended during the terminal's display wait, so that answer proves nothing about the reset; it reads
// pending and the Board reads the sessions back. A browse opens a new tab in the person's browser: refused in a framed
// page, and a change (an unknown or late answer reads pending: the Board never sends it again); it waits for the kit's
// own deadline plus a margin.
const ROW_EXTRA: Record<string, object> = {
  '^\\/api\\/v1\\/terminal\\/execute$': { unknownCodes: ['SHELL_REPLACED'] },
  '^\\/api\\/v1\\/browser\\/start$': { framed: false, secret: true, codes: BROWSER_START_CODES, change: true, timeoutMs: 660_000 },
  '^\\/api\\/v1\\/browser\\/devtools-url$': { framed: false },
  '^\\/api\\/v1\\/browser\\/browse$': { framed: false, change: true, timeoutMs: BROWSE_TIMEOUT_MS + 15_000 },
};

interface BoardDeclared {
  kit: BoardKit;
  method: 'GET' | 'POST' | 'DELETE';
  index: 1 | 'board' | 'browser';
  match: RegExp;
  route: Route;
}

export const BOARD_DECLARED: readonly BoardDeclared[] = BOARD_KIT_ROUTES.map(([kit, index, method, pattern, query, body]) => ({
  kit,
  method,
  index,
  match: pattern,
  route: defineRoute({
    method,
    path: literalPath(pattern),
    scope: 'kit',
    kit,
    index: index === 'board' ? inBoard : index === 'browser' ? inBrowser : index,
    ...(query.length ? { query } : {}),
    ...(body ? { body } : {}),
    ...(ROW_EXTRA[pattern.source] ?? {}),
    guard: guardFor(kit),
  }),
}));

export interface BoardTarget {
  kit: BoardKit;
  /** The program's index: the Board session number (BOARD_IDS, 1-8000, below the launch band) for terminal, the browser
   *  session (BOARD_BROWSER_IDS, 1-7500) for browser, 1 for notes and code. */
  index: number;
}

export interface BoardSendOptions {
  query?: Readonly<Record<string, string | number | boolean>>;
  body?: unknown;
  /** The context the action started under: a realm switch kills it, a computer switch does not (the call keeps the
   *  target it captured). Abort `signal` to stop on a computer or tile change. */
  ctx?: Ctx;
  /** The computer (default: the context's). */
  target?: Target | null;
  signal?: AbortSignal;
  /** The caller reads a pending outcome back itself: no notice while its context lives. */
  recovers?: boolean;
}

/** Tests only: the declared Route of a Board request (see the contract); throws when no row declares it. */
export function boardFixtureRoute(kit: BoardKit, method: 'GET' | 'POST' | 'DELETE', path: string): Route {
  const d = BOARD_DECLARED.find((r) => r.kit === kit && r.method === method && r.match.test(path));
  if (!d) throw new Error('no Board route declares ' + kit + ' ' + method + ' ' + path);
  return d.route;
}

/** Sends one of the Board's allowed kit requests (see the contract); anything else rejects unsent. */
export function boardSend<R = unknown>(t: BoardTarget, method: string, path: string, o: BoardSendOptions = {}): Promise<R> {
  const m = String(method || '').toUpperCase();
  const q = o.query ?? {};
  if (boardRoute(t.kit, t.index, m, path, q, o.body) !== null) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
  const d = BOARD_DECLARED.find((r) => r.kit === t.kit && r.method === m && r.match.test(path) && (r.index === 'board' ? inBoard(t.index) : r.index === 'browser' ? inBrowser(t.index) : r.index === t.index));
  if (!d) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
  const hit = d.match.exec(path);
  return api(d.route, {
    ...(hit && hit[1] !== undefined ? { params: { n: hit[1] } } : {}),
    ...(Object.keys(q).length ? { query: q } : {}),
    ...(o.body === undefined ? {} : { body: o.body }),
    ...(o.ctx ? { ctx: o.ctx } : {}),
    ...(o.target !== undefined ? { target: o.target } : {}),
    ...(o.signal ? { signal: o.signal } : {}),
    ...(o.recovers ? { recovers: true } : {}),
    index: t.index,
  }) as Promise<R>;
}
