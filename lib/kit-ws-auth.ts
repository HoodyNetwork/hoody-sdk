/**
 * Kit credentials on a WebSocket upgrade — shared by the hand-written WS
 * helpers that do not go through the HttpClient middleware (curl channel,
 * tunnel).
 *
 * The HTTP path gets `kitAuth` from lib/proxy-auth-middleware.ts. A raw
 * WebSocket never passes through that middleware, so these helpers apply the
 * same credential to the upgrade request themselves, in the same form
 * lib/terminal-client.ts uses:
 *
 *   - Node / Bun: real upgrade headers (`Authorization: Basic|Bearer …`, a
 *     custom `header` if the credential names one, or the container-claim
 *     pair). Opened with the `ws` package (a dependency), which takes headers.
 *   - A `token` credential with `param` goes in that query parameter in every
 *     runtime: it is what a proxy TokenAuth rule with `param` reads, and the
 *     one form that works for a browser socket against the proxy.
 *   - Browser, otherwise: the WebSocket API cannot send headers, so a
 *     password / jwt / token credential is folded into the URL as
 *     `?token=…` — accepted by the proxy only where the operator's rule is
 *     a token rule with `param: 'token'` (the legacy TerminalClient
 *     browser form); a containerClaim credential is refused loudly rather than
 *     silently dropped.
 *
 * The account token is never involved: only an explicit kit credential is.
 */
import { base64Encode, isProxyAuthPolicy, withTokenQueryParam, type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';

/** Pick the credential for one kit namespace: `services[ns]`, then `default`. */
export function kitAuthForNamespace(
  auth: ProxyAuth | ProxyAuthPolicy | undefined,
  namespace: string,
): ProxyAuth | undefined {
  if (!auth) return undefined;
  if (isProxyAuthPolicy(auth)) {
    return (auth.services as Record<string, ProxyAuth | undefined> | undefined)?.[namespace] ?? auth.default;
  }
  return auth;
}

/** Read a client's configured kitAuth (a private field on HoodyClient). */
export function clientKitAuth(client: unknown): ProxyAuth | ProxyAuthPolicy | undefined {
  return (client as { kitAuth?: ProxyAuth | ProxyAuthPolicy } | null | undefined)?.kitAuth;
}

export function isBrowserRuntime(): boolean {
  return typeof (globalThis as { window?: unknown }).window !== 'undefined'
    && typeof (globalThis as { document?: unknown }).document !== 'undefined';
}

/** What a WebSocket upgrade carries for one kit credential. */
export interface KitWebSocketParts {
  url: string;
  headers: Record<string, string>;
  /**
   * Query parameters of `url` that carry the credential. Pass them to
   * `redactUrl(url, names)` before the URL reaches an error, a log or any
   * other origin (the same list HTTP requests record under
   * middlewareContext._credentialQueryParams).
   */
  credentialQueryParams: string[];
}

/**
 * Turn a kit credential into what a WebSocket upgrade can carry: headers
 * (Node) or a `?token=` query parameter (browser).
 */
export function kitAuthWebSocketParts(
  url: string,
  auth: ProxyAuth | undefined,
  label: string,
  browser: boolean = isBrowserRuntime(),
): KitWebSocketParts {
  const headers: Record<string, string> = {};
  if (!auth || auth.type === 'ip') return { url, headers, credentialQueryParams: [] };
  const u = new URL(url);
  const credentialQueryParams: string[] = [];
  switch (auth.type) {
    case 'password': {
      const cred = `Basic ${base64Encode(`${auth.username}:${auth.password}`)}`;
      if (browser) {
        u.searchParams.set('token', cred);
        credentialQueryParams.push('token');
      } else headers['Authorization'] = cred;
      break;
    }
    case 'jwt':
    case 'token': {
      if (auth.type === 'token' && auth.param !== undefined) {
        // The proxy rule reads this query parameter (and only it), in Node
        // and browsers alike — no header.
        return {
          url: withTokenQueryParam(url, { ...auth, param: auth.param }),
          headers,
          credentialQueryParams: [auth.param.trim()],
        };
      }
      const value = auth.type === 'jwt' ? auth.token : auth.value;
      const header = auth.header || 'Authorization';
      if (browser) {
        u.searchParams.set('token', value);
        credentialQueryParams.push('token');
      } else headers[header] = header.toLowerCase() === 'authorization' ? `Bearer ${value}` : value;
      break;
    }
    case 'containerClaim': {
      if (browser) {
        throw new Error(
          `${label}: containerClaim kitAuth is Node-only. A browser WebSocket cannot ` +
            'send custom headers; use a `token` or `jwt` kitAuth for browser deployments.',
        );
      }
      headers['X-Hoody-Container-Claim'] = auth.claim;
      headers['X-Hoody-Token'] = auth.token;
      break;
    }
  }
  return { url: u.toString(), headers, credentialQueryParams };
}

/** Minimal constructor shape shared by the global WebSocket and `ws`. */
type WsCtor<T> = new (url: string, protocols?: string | string[], options?: unknown) => T;

const refusedStatuses = new WeakMap<object, number>();

/**
 * The HTTP status a refused upgrade answered, for a socket opened with
 * `{ refusalStatus: true }` under Bun (its `ws` reports it only in an
 * `unexpected-response` event). Node's `ws` names it in its error message
 * instead, and the global WebSocket API hides it everywhere.
 */
export function refusedUpgradeStatus(socket: object): number | undefined {
  return refusedStatuses.get(socket);
}

/**
 * Open a WebSocket, carrying `headers` on the upgrade when there are any.
 * Without headers (or in a browser) this is `new WebSocket(url, protocols)`.
 * With headers outside a browser it uses the `ws` package; if that cannot be
 * loaded it throws rather than connect without the credential.
 * `refusalStatus: true` uses the `ws` package outside a browser even without
 * headers, so a refused upgrade's HTTP status can be read (see
 * `refusedUpgradeStatus`); if it cannot be loaded, the global WebSocket is used.
 */
export async function openWebSocketWithHeaders<T>(
  url: string,
  protocols: string | string[] | undefined,
  headers: Record<string, string>,
  label: string,
  options: { refusalStatus?: boolean } = {},
): Promise<T> {
  const globalCtor = (globalThis as unknown as { WebSocket?: WsCtor<T> }).WebSocket;
  const hasHeaders = Object.keys(headers).length > 0;
  if ((!hasHeaders && options.refusalStatus !== true) || isBrowserRuntime()) {
    if (typeof globalCtor === 'function') {
      return protocols === undefined ? new globalCtor(url) : new globalCtor(url, protocols);
    }
  }
  const specifier = 'ws';
  let mod: { default?: WsCtor<T>; WebSocket?: WsCtor<T> };
  try {
    mod = (await import(/* @vite-ignore */ specifier)) as { default?: WsCtor<T>; WebSocket?: WsCtor<T> };
  } catch (err) {
    if (!hasHeaders && typeof globalCtor === 'function') {
      return protocols === undefined ? new globalCtor(url) : new globalCtor(url, protocols);
    }
    throw new Error(
      `${label}: cannot send the kit credential on the WebSocket upgrade — the \`ws\` package ` +
        `could not be loaded (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  const Ctor = mod.default ?? mod.WebSocket;
  if (typeof Ctor !== 'function') {
    throw new Error(`${label}: the \`ws\` package has no WebSocket constructor`);
  }
  const socket = new Ctor(url, protocols, hasHeaders ? { headers } : undefined);
  // Under Bun only: Node's `ws` names the status in its error. With this listener neither emits
  // `error` for the refusal (Bun still emits `close`), so callers must treat `close` as a refusal too.
  const onEvent = (socket as { on?: (ev: string, fn: (req: unknown, res: { statusCode?: number }) => void) => unknown }).on;
  if (options.refusalStatus === true && typeof process !== 'undefined' && process.versions?.bun && typeof onEvent === 'function') {
    onEvent.call(socket, 'unexpected-response', (_req, res) => {
      if (typeof res?.statusCode === 'number') refusedStatuses.set(socket as object, res.statusCode);
    });
  }
  return socket;
}
