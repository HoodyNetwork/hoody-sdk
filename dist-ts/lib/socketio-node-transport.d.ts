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
import { NodeWebSocket } from 'engine.io-client';
type WsOptions = Record<string, any>;
/** engine.io's Node WebSocket transport, opened with the SDK's `ws` and its receive caps. */
export declare class SdkNodeWebSocket extends NodeWebSocket {
    createSocket(uri: string, protocols: string | string[] | undefined, opts: WsOptions): any;
}
/**
 * The `transports` option as engine.io must receive it here: a list of
 * transport CLASSES, in the caller's order. engine.io maps a list by name only
 * when its first entry is a string and then maps every entry, so a mixed list
 * breaks either way; the whole list is therefore normalised. `'websocket'`
 * becomes the SDK class, `'polling'` and `'webtransport'` engine.io's Node
 * classes, and a class the caller supplies is kept as given. No list means
 * websocket only.
 */
export declare function normalizeEventsTransports(transports: unknown): unknown[];
export {};
