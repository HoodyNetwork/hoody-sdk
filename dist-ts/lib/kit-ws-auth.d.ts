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
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
/** Pick the credential for one kit namespace: `services[ns]`, then `default`. */
export declare function kitAuthForNamespace(auth: ProxyAuth | ProxyAuthPolicy | undefined, namespace: string): ProxyAuth | undefined;
/** Read a client's configured kitAuth (a private field on HoodyClient). */
export declare function clientKitAuth(client: unknown): ProxyAuth | ProxyAuthPolicy | undefined;
export declare function isBrowserRuntime(): boolean;
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
export declare function kitAuthWebSocketParts(url: string, auth: ProxyAuth | undefined, label: string, browser?: boolean): KitWebSocketParts;
/**
 * The HTTP status a refused upgrade answered, for a socket opened with
 * `{ refusalStatus: true }` under Bun (its `ws` reports it only in an
 * `unexpected-response` event). Node's `ws` names it in its error message
 * instead, and the global WebSocket API hides it everywhere.
 */
export declare function refusedUpgradeStatus(socket: object): number | undefined;
/**
 * Open a WebSocket, carrying `headers` on the upgrade when there are any.
 * Without headers (or in a browser) this is `new WebSocket(url, protocols)`.
 * With headers outside a browser it uses the `ws` package; if that cannot be
 * loaded it throws rather than connect without the credential.
 * `refusalStatus: true` uses the `ws` package outside a browser even without
 * headers, so a refused upgrade's HTTP status can be read (see
 * `refusedUpgradeStatus`); if it cannot be loaded, the global WebSocket is used.
 */
export declare function openWebSocketWithHeaders<T>(url: string, protocols: string | string[] | undefined, headers: Record<string, string>, label: string, options?: {
    refusalStatus?: boolean;
}): Promise<T>;
