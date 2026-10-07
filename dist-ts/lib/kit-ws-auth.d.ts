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
/** True in Node.js itself: not Bun, not Deno, not a browser or worker. */
export declare function isNodeRuntime(): boolean;
/**
 * True when Node's built-in WebSocket must not be constructed: the bundled
 * undici cannot be shown to carry the fix for CVE-2026-12151 (unbounded
 * message fragments). Keyed on the undici version the runtime reports; a
 * missing or non-release value counts as unsafe. The text between the
 * sentinels is shared verbatim with the generated WebSocket clients and with
 * hoody-curl's transport; a test compares the copies.
 */
export declare const nodeBuiltinWebSocketUnsafe: (v: Record<string, string | undefined> | undefined) => boolean;
/** This process is Node and its built-in WebSocket must not be used. */
export declare function builtinWebSocketProhibited(): boolean;
/** Receive caps every `ws` socket the SDK constructs carries (the `ws` >= 8.21.1 defaults, stated). */
export declare const SDK_WS_CAPS: Readonly<{
    maxFragments: number;
    maxBufferedChunks: 262144;
}>;
/**
 * The error for a Node whose built-in WebSocket is prohibited when the `ws`
 * package cannot be loaded either. Only a broken install gets here.
 */
export declare function unsafeBuiltinWebSocketMessage(cause: unknown): string;
/**
 * The local receive-cap code behind an error, or undefined. Looks at the error
 * itself, an ErrorEvent's `.error`, and the `description` / `cause` chain that
 * engine.io wraps a transport error in.
 */
export declare function localWebSocketCapCode(error: unknown): string | undefined;
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
 *
 * On a Node whose built-in WebSocket is prohibited (`builtinWebSocketProhibited`)
 * every one of those built-in choices becomes `ws`, a jsdom-style `window`
 * included, and a `ws` that cannot be loaded throws.
 */
export declare function openWebSocketWithHeaders<T>(url: string, protocols: string | string[] | undefined, headers: Record<string, string>, label: string, options?: {
    refusalStatus?: boolean;
}): Promise<T>;
