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
import { base64Encode, isProxyAuthPolicy, withTokenQueryParam } from './proxy-auth.js';
/** Pick the credential for one kit namespace: `services[ns]`, then `default`. */
export function kitAuthForNamespace(auth, namespace) {
    if (!auth)
        return undefined;
    if (isProxyAuthPolicy(auth)) {
        return auth.services?.[namespace] ?? auth.default;
    }
    return auth;
}
/** Read a client's configured kitAuth (a private field on HoodyClient). */
export function clientKitAuth(client) {
    return client?.kitAuth;
}
export function isBrowserRuntime() {
    return typeof globalThis.window !== 'undefined'
        && typeof globalThis.document !== 'undefined';
}
/**
 * Turn a kit credential into what a WebSocket upgrade can carry: headers
 * (Node) or a `?token=` query parameter (browser).
 */
export function kitAuthWebSocketParts(url, auth, label, browser = isBrowserRuntime()) {
    const headers = {};
    if (!auth || auth.type === 'ip')
        return { url, headers, credentialQueryParams: [] };
    const u = new URL(url);
    const credentialQueryParams = [];
    switch (auth.type) {
        case 'password': {
            const cred = `Basic ${base64Encode(`${auth.username}:${auth.password}`)}`;
            if (browser) {
                u.searchParams.set('token', cred);
                credentialQueryParams.push('token');
            }
            else
                headers['Authorization'] = cred;
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
            }
            else
                headers[header] = header.toLowerCase() === 'authorization' ? `Bearer ${value}` : value;
            break;
        }
        case 'containerClaim': {
            if (browser) {
                throw new Error(`${label}: containerClaim kitAuth is Node-only. A browser WebSocket cannot ` +
                    'send custom headers; use a `token` or `jwt` kitAuth for browser deployments.');
            }
            headers['X-Hoody-Container-Claim'] = auth.claim;
            headers['X-Hoody-Token'] = auth.token;
            break;
        }
    }
    return { url: u.toString(), headers, credentialQueryParams };
}
/** True in Node.js itself: not Bun, not Deno, not a browser or worker. */
export function isNodeRuntime() {
    if (typeof process === 'undefined')
        return false;
    const v = process.versions;
    return !!v?.node && !v.bun && !v.deno;
}
/**
 * True when Node's built-in WebSocket must not be constructed: the bundled
 * undici cannot be shown to carry the fix for CVE-2026-12151 (unbounded
 * message fragments). Keyed on the undici version the runtime reports; a
 * missing or non-release value counts as unsafe. The text between the
 * sentinels is shared verbatim with the generated WebSocket clients and with
 * hoody-curl's transport; a test compares the copies.
 */
export const nodeBuiltinWebSocketUnsafe = 
// <node-builtin-ws-unsafe>
(v) => {
    if (!v?.node || v.bun || v.deno)
        return false; // not Node: browser/worker/Bun/Deno keep their own
    const m = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.exec(v.undici ?? ""); // canonical, no leading 0, finite
    if (!m)
        return true; // absent (shared/distro undici) or not a canonical release → ws
    const [a, b, c] = [+m[1], +m[2], +m[3]];
    const ge = (x, y, z) => a !== x ? a > x : b !== y ? b > y : c >= z;
    if (a === 6)
        return !ge(6, 27, 0);
    if (a === 7)
        return !ge(7, 28, 0);
    if (a === 8)
        return !ge(8, 5, 0);
    return a < 6; // ≥ 9: ASSUMED fixed (a later major carries the fix); T1 row
};
/** This process is Node and its built-in WebSocket must not be used. */
export function builtinWebSocketProhibited() {
    return isNodeRuntime()
        && nodeBuiltinWebSocketUnsafe(process.versions);
}
/** Receive caps every `ws` socket the SDK constructs carries (the `ws` >= 8.21.1 defaults, stated). */
export const SDK_WS_CAPS = Object.freeze({ maxFragments: 16 * 1024, maxBufferedChunks: 262_144 });
/**
 * The error for a Node whose built-in WebSocket is prohibited when the `ws`
 * package cannot be loaded either. Only a broken install gets here.
 */
export function unsafeBuiltinWebSocketMessage(cause) {
    const v = (typeof process !== 'undefined' ? process.versions : undefined) ?? {};
    const undici = v.undici ? `undici ${v.undici}` : 'undici version not reported';
    const why = cause instanceof Error ? cause.message : String(cause);
    return `The built-in WebSocket of Node ${v.node ?? 'unknown'} (${undici}) cannot be shown to be free of `
        + `CVE-2026-12151 and the \`ws\` package could not be loaded (${why}). Reinstall hoody-sdk, or use an `
        + 'official Node 22.23.0+, 24.17.0+ or 26.3.1+.';
}
/**
 * The codes `ws` puts on an error it raises itself because a frame or message
 * broke one of its own receive limits. The socket is torn down locally; the
 * peer will do the same thing again, so reconnecting is pointless.
 */
const LOCAL_WS_CAP_CODES = new Set([
    'WS_ERR_TOO_MANY_BUFFERED_PARTS',
    'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH',
    'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH',
]);
/**
 * The local receive-cap code behind an error, or undefined. Looks at the error
 * itself, an ErrorEvent's `.error`, and the `description` / `cause` chain that
 * engine.io wraps a transport error in.
 */
export function localWebSocketCapCode(error) {
    let cur = error;
    for (let depth = 0; depth < 6 && cur && typeof cur === 'object'; depth++) {
        const o = cur;
        if (typeof o.code === 'string' && LOCAL_WS_CAP_CODES.has(o.code))
            return o.code;
        cur = o.error ?? o.description ?? o.cause;
    }
    return undefined;
}
const refusedStatuses = new WeakMap();
/**
 * The HTTP status a refused upgrade answered, for a socket opened with
 * `{ refusalStatus: true }` under Bun (its `ws` reports it only in an
 * `unexpected-response` event). Node's `ws` names it in its error message
 * instead, and the global WebSocket API hides it everywhere.
 */
export function refusedUpgradeStatus(socket) {
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
 *
 * On a Node whose built-in WebSocket is prohibited (`builtinWebSocketProhibited`)
 * every one of those built-in choices becomes `ws`, a jsdom-style `window`
 * included, and a `ws` that cannot be loaded throws.
 */
export async function openWebSocketWithHeaders(url, protocols, headers, label, options = {}) {
    const globalCtor = globalThis.WebSocket;
    const hasHeaders = Object.keys(headers).length > 0;
    // Checked before the browser test: a Node process with DOM globals is still Node.
    const prohibited = builtinWebSocketProhibited();
    if (!prohibited && ((!hasHeaders && options.refusalStatus !== true) || isBrowserRuntime())) {
        if (typeof globalCtor === 'function') {
            return protocols === undefined ? new globalCtor(url) : new globalCtor(url, protocols);
        }
    }
    const specifier = 'ws';
    let mod;
    try {
        mod = (await import(/* @vite-ignore */ specifier));
    }
    catch (err) {
        if (prohibited)
            throw new Error(`${label}: ${unsafeBuiltinWebSocketMessage(err)}`);
        if (!hasHeaders && typeof globalCtor === 'function') {
            return protocols === undefined ? new globalCtor(url) : new globalCtor(url, protocols);
        }
        throw new Error(`${label}: cannot send the kit credential on the WebSocket upgrade — the \`ws\` package ` +
            `could not be loaded (${err instanceof Error ? err.message : String(err)}).`);
    }
    const Ctor = mod.default ?? mod.WebSocket;
    if (typeof Ctor !== 'function') {
        if (prohibited)
            throw new Error(`${label}: ${unsafeBuiltinWebSocketMessage('no WebSocket constructor exported')}`);
        throw new Error(`${label}: the \`ws\` package has no WebSocket constructor`);
    }
    const socket = new Ctor(url, protocols, hasHeaders ? { headers, ...SDK_WS_CAPS } : { ...SDK_WS_CAPS });
    // Under Bun only: Node's `ws` names the status in its error. With this listener neither emits
    // `error` for the refusal (Bun still emits `close`), so callers must treat `close` as a refusal too.
    const onEvent = socket.on;
    if (options.refusalStatus === true && typeof process !== 'undefined' && process.versions?.bun && typeof onEvent === 'function') {
        onEvent.call(socket, 'unexpected-response', (_req, res) => {
            if (typeof res?.statusCode === 'number')
                refusedStatuses.set(socket, res.statusCode);
        });
    }
    return socket;
}
