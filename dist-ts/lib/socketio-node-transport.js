/**
 * The engine.io transports the events socket uses outside a browser.
 *
 * engine.io-client's Node WebSocket transport constructs the `ws` copy that
 * engine.io-client itself resolves. After an upgrade that keeps an old
 * lockfile, that copy can predate the fragment caps (`ws` < 8.21.1). The class
 * here constructs the SDK's own `ws` instead, with the caps stated, and
 * inherits everything else: Node `doWrite` (per-packet compression,
 * `perMessageDeflate.threshold`), lifecycle, binary type and `autoUnref`.
 *
 * Node, Bun and Deno only. The browser bundles replace this module with
 * `socketio-node-transport.browser.ts` (build.config.ts), which keeps transport
 * names, so neither `ws` nor engine.io's Node transport reaches a browser.
 */
import { NodeWebSocket, NodeXHR, WebTransport } from 'engine.io-client';
import { WebSocket as SdkWebSocket } from 'ws';
import { SDK_WS_CAPS } from './kit-ws-auth.js';
/** engine.io's Node WebSocket transport, opened with the SDK's `ws` and its receive caps. */
export class SdkNodeWebSocket extends NodeWebSocket {
    createSocket(uri, protocols, opts) {
        // The cookie-jar merge of engine.io-client's own createSocket (websocket.node.js).
        const jar = this.socket?._cookieJar;
        if (jar) {
            opts.headers = opts.headers || {};
            opts.headers.cookie = typeof opts.headers.cookie === 'string'
                ? [opts.headers.cookie]
                : opts.headers.cookie || [];
            for (const [name, cookie] of jar.cookies) {
                opts.headers.cookie.push(`${name}=${cookie.value}`);
            }
        }
        return new SdkWebSocket(uri, protocols, { ...opts, ...SDK_WS_CAPS });
    }
}
const BY_NAME = {
    websocket: SdkNodeWebSocket,
    polling: NodeXHR,
    webtransport: WebTransport,
};
/**
 * The `transports` option as engine.io must receive it here: a list of
 * transport CLASSES, in the caller's order. engine.io maps a list by name only
 * when its first entry is a string and then maps every entry, so a mixed list
 * breaks either way; the whole list is therefore normalised. `'websocket'`
 * becomes the SDK class, `'polling'` and `'webtransport'` engine.io's Node
 * classes, and a class the caller supplies is kept as given. No list means
 * websocket only.
 */
export function normalizeEventsTransports(transports) {
    if (transports === undefined || transports === null)
        return [SdkNodeWebSocket];
    if (!Array.isArray(transports)) {
        throw new TypeError('events: `transports` must be an array of transport names or classes');
    }
    return transports.map((entry) => {
        if (typeof entry === 'function')
            return entry;
        if (typeof entry === 'string' && Object.prototype.hasOwnProperty.call(BY_NAME, entry))
            return BY_NAME[entry];
        throw new TypeError(`events: unknown transport ${typeof entry === 'string' ? JSON.stringify(entry) : typeof entry}; `
            + 'use "websocket", "polling", "webtransport" or a transport class');
    });
}
