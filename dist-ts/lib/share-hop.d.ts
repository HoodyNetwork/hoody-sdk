/**
 * The local hop of `hoody share` (plans/share-local-folder.md, v3.1): a small
 * HTTP proxy on 127.0.0.1 between the tunnel and `rclone serve webdav`.
 *
 *   - It rewrites WebDAV `Destination` to its path and query. The tunnel
 *     delivers with `Host: 127.0.0.1:<port>`, while `MOVE` and `COPY` carry
 *     `Destination: https://<public host>/…`; x/net/webdav answers 502 when
 *     the two hosts differ, so every rename failed. A path resolves against
 *     the request's own Host.
 *   - Everything else is forwarded as it came: method, target, header names,
 *     case, order and values, and the bodies, streamed both ways and never
 *     buffered. Only the connection's own headers (`Connection` and what it
 *     names, `Keep-Alive`, `Proxy-Connection`, `Upgrade`) are left to each hop.
 *   - It counts requests in flight and when the last one arrived or ended;
 *     stop uses both to keep serving while the container is still sending.
 *
 * It never logs: headers carry the share's credentials, bodies carry files.
 */
export interface ShareHop {
    /** The port the tunnel forwards to. */
    readonly port: number;
    /** Requests whose response has not ended yet. */
    inFlight(): number;
    /** When the last request arrived or ended (`now()` clock); 0 before the first. */
    lastRequestAt(): number;
    close(): Promise<void>;
}
export interface ShareHopOptions {
    host?: string;
    now?: () => number;
}
/**
 * `Destination` as the upstream must see it: an absolute URL becomes its path
 * and query, byte for byte (no decoding or re-encoding, dot segments kept; a
 * fragment is dropped). A value that is already a path, or anything that is
 * not an absolute URL, is left as it is.
 */
export declare function rewriteDestination(value: string): string;
/** `raw` (as `rawHeaders` holds it) without the connection's own headers; `Destination` rewritten if asked. */
export declare function forwardHeaders(raw: readonly string[], opts: {
    rewriteDestination: boolean;
}): string[];
/** Start the hop in front of the WebDAV server on `127.0.0.1:<upstreamPort>`. */
export declare function startShareHop(upstreamPort: number, opts?: ShareHopOptions): Promise<ShareHop>;
