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
import http from 'node:http';
/**
 * `Destination` as the upstream must see it: an absolute URL becomes its path
 * and query, byte for byte (no decoding or re-encoding, dot segments kept; a
 * fragment is dropped). A value that is already a path, or anything that is
 * not an absolute URL, is left as it is.
 */
export function rewriteDestination(value) {
    const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/.exec(value);
    if (!m)
        return value;
    const rest = value.slice(m[0].length).split('#', 1)[0];
    return rest.startsWith('/') ? rest : `/${rest}`;
}
const CONNECTION_HEADERS = new Set(['connection', 'keep-alive', 'proxy-connection', 'upgrade']);
/** `raw` (as `rawHeaders` holds it) without the connection's own headers; `Destination` rewritten if asked. */
export function forwardHeaders(raw, opts) {
    const drop = new Set(CONNECTION_HEADERS);
    for (let i = 0; i + 1 < raw.length; i += 2) {
        if (raw[i].toLowerCase() !== 'connection')
            continue;
        for (const token of raw[i + 1].split(',')) {
            const t = token.trim().toLowerCase();
            if (t)
                drop.add(t);
        }
    }
    const out = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
        const name = raw[i];
        const lower = name.toLowerCase();
        if (drop.has(lower))
            continue;
        const value = raw[i + 1];
        out.push(name, opts.rewriteDestination && lower === 'destination' ? rewriteDestination(value) : value);
    }
    return out;
}
/** Start the hop in front of the WebDAV server on `127.0.0.1:<upstreamPort>`. */
export async function startShareHop(upstreamPort, opts = {}) {
    const now = opts.now ?? (() => Date.now());
    const agent = new http.Agent({ keepAlive: true });
    let inFlight = 0;
    let last = 0;
    // requestTimeout 0: an upload through the tunnel may take longer than Node's
    // default 300 s, and the hop must not cut it.
    const server = http.createServer({ requestTimeout: 0 }, (req, res) => {
        inFlight++;
        last = now();
        let ended = false;
        const end = () => {
            if (ended)
                return;
            ended = true;
            inFlight--;
            last = now();
        };
        res.once('close', end);
        const up = http.request({
            host: '127.0.0.1',
            port: upstreamPort,
            method: req.method,
            path: req.url,
            headers: forwardHeaders(req.rawHeaders, { rewriteDestination: true }),
            agent,
        }, (ures) => {
            res.writeHead(ures.statusCode ?? 502, ures.statusMessage, forwardHeaders(ures.rawHeaders, { rewriteDestination: false }));
            ures.pipe(res);
            ures.once('error', () => res.destroy());
            ures.once('close', () => {
                if (!ures.complete)
                    res.destroy();
            });
        });
        up.once('error', () => {
            if (!res.headersSent) {
                res.writeHead(502, { 'content-length': '0' });
                res.end();
            }
            else {
                res.destroy();
            }
        });
        req.once('error', () => up.destroy());
        res.once('close', () => {
            if (!res.writableFinished)
                up.destroy();
        });
        req.pipe(up);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, opts.host ?? '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const port = server.address().port;
    return {
        port,
        inFlight: () => inFlight,
        lastRequestAt: () => last,
        close: () => new Promise((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
            agent.destroy();
        }),
    };
}
