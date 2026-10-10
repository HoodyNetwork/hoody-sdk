/**
 * WebSocket client for watch_streamWatcherEventsWs
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Watcher Event Stream (WebSocket) v1.0.0
 */
const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;
function upgradeRefusedError(status, code, via, cause) {
    const error = new Error(`WebSocket upgrade refused: HTTP ${status}`);
    error.name = "WebSocketUpgradeRefusedError";
    error.status = status;
    error.code = code ?? `HTTP_${status}`;
    error.via = via;
    if (cause !== undefined)
        error.cause = cause;
    return error;
}
/**
 * Close a socket nobody will use. The `ws` package reports closing a socket
 * that is still connecting as an `error` event, a tick later; with no
 * listener that event is thrown and ends a Node process. So the handlers are
 * replaced first: errors swallowed, nothing else delivered.
 */
function discardSocket(socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = () => { };
    try {
        socket.close();
    }
    catch { /* already closed */ }
}
/**
 * True when the built-in WebSocket of this Node must not be constructed:
 * its bundled undici cannot be shown to carry the CVE-2026-12151 fix. The
 * client then opens its socket with the `ws` package instead.
 */
const nodeBuiltinWebSocketUnsafe = 
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
export class WatchStreamWatcherEventsWsWebSocket {
    /**
     * The socket constructor every instance of this client uses, in place of
     * its own choice (the `ws` package on Node, the global WebSocket
     * elsewhere). It is called as `new ctor(url, protocols)`, like a browser
     * WebSocket, so headers are not passed. A webSocketFactory in the options
     * still wins. Unset (the default) restores the client's own choice.
     */
    static webSocketImpl = undefined;
    ws = null;
    eventHandlers = new Map();
    options;
    _url;
    reconnectAttempts = 0;
    reconnectTimer = null;
    _reconnecting = false;
    shouldReconnect = true;
    // The URL has been handed to a socket once; with a urlProvider the next
    // open asks it for a new one.
    _urlSpent = false;
    // Liveness timer of the CURRENT socket (see idleTimeoutMs).
    _livenessTimer = null;
    // Token of the open attempt in flight. Each openSocket() takes a new one
    // and disconnect() retires it, so an attempt still awaiting its URL or its
    // socket can tell it was abandoned and must install nothing.
    _openAttempt = 0;
    // Automatic attempts in a row that never opened (see refusalProbeAfter),
    // and the URL the last socket was opened with, for the probe.
    _unopenedFailures = 0;
    _lastConnectUrl = undefined;
    // FIFO queue for message dispatch — preserves frame ordering even when
    // a Blob frame requires async arrayBuffer() decode and a later string/
    // ArrayBuffer frame arrives synchronously.
    _frameQueue = Promise.resolve();
    // Dispatch token for the CURRENT socket. Invalidated on manual
    // disconnect() and on the onclose settle-timeout, so a late frame
    // (hung Blob decode) can never dispatch after `disconnect` was
    // announced. Deliberately separate from _socketGen: bumping the
    // generation in disconnect() would make the gen-guarded onclose
    // suppress the manual-disconnect event itself.
    _dispatchAlive = { alive: true };
    // Generation counter. Bumped synchronously in connect()/reconnect()/
    // disconnect() so queued tasks tagged with an old generation become
    // no-ops if the socket has been swapped out — prevents stale-Blob
    // microtasks from dispatching into a new socket\u2019s handlers.
    _socketGen = 0;
    // Resume cursor. Updated from every sequenced envelope and deliberately
    // NOT cleared by disconnect()/reconnect(): surviving the drop is the
    // whole point — it is what the next connect sends as ?since=.
    _cursor = undefined;
    _incarnation = undefined;
    // An incarnation the caller gave WITHOUT a cursor: sent on the next
    // connect only, never on the reconnects after it.
    _firstIncarnation = undefined;
    // Frames buffered for frames(); drained by whoever awaits next().
    _frameBuffer = [];
    _frameWaiters = [];
    _streamEnded = false;
    constructor(url, options) {
        this._url = url;
        this.options = {
            timeout: 30000,
            reconnect: true,
            reconnectAttempts: Infinity,
            reconnectDelay: 1000,
            reconnectDelayMax: 30000,
            reconnectionDelayGrowFactor: 1.5,
            randomizationFactor: 0.5,
            autoConnect: false,
            ...options
        };
        this.takeResumeSeed();
        if (this.options.autoConnect) {
            void this.connect().catch((error) => {
                const connectionError = error instanceof Error ? error : new Error(String(error));
                this.emitEvent("error", connectionError);
            });
        }
    }
    /**
     * Turns a resume point the caller put on the URL, in `options.query` or in
     * a Last-Event-ID header into the live cursor, and removes it from all
     * three. Left in place it went out on EVERY reconnect: the URL value beat
     * the live cursor, and the gateway reads Last-Event-ID before ?since=, so
     * each reconnect replayed from the original point. Only a whole-number
     * cursor is taken; any other value stays where the caller put it.
     */
    takeResumeSeed() {
        const resume = this.options.streamResume;
        if (resume?.enabled === false)
            return;
        const sinceParam = resume?.param ?? "since";
        const incarnationParam = resume?.incarnationParam ?? "incarnation";
        const isSeq = (v) => typeof v === "string" && /^\d+$/.test(v.trim());
        let since;
        let incarnation;
        let urlObj;
        try {
            urlObj = new URL(this._url);
        }
        catch {
            urlObj = undefined;
        }
        // Same precedence as the connect URL and the gateway: URL, then
        // options.query (which overwrites the URL), then Last-Event-ID.
        const urlSince = urlObj?.searchParams.get(sinceParam);
        if (isSeq(urlSince)) {
            since = urlSince;
            urlObj.searchParams.delete(sinceParam);
        }
        const query = this.options.query ? { ...this.options.query } : undefined;
        if (query && isSeq(query[sinceParam])) {
            since = query[sinceParam];
            delete query[sinceParam];
        }
        const headers = this.options.headers ? { ...this.options.headers } : undefined;
        let droppedHeader = false;
        for (const name of Object.keys(headers ?? {})) {
            if (name.toLowerCase() === "last-event-id") {
                // Never a lasting header: the gateway reads it before ?since= on every
                // reconnect. A whole number seeds the cursor; anything else is dropped.
                if (isSeq(headers[name]))
                    since = headers[name];
                delete headers[name];
                droppedHeader = true;
            }
        }
        // The incarnation goes with the resume point; it is moved even without
        // one, so it is sent once instead of on every reconnect.
        const urlIncarnation = urlObj?.searchParams.get(incarnationParam);
        if (urlIncarnation) {
            incarnation = urlIncarnation;
            urlObj.searchParams.delete(incarnationParam);
        }
        if (query && query[incarnationParam]) {
            incarnation = query[incarnationParam];
            delete query[incarnationParam];
        }
        if (since === undefined && incarnation === undefined && !droppedHeader)
            return;
        if (urlObj)
            this._url = urlObj.toString();
        this.options = {
            ...this.options,
            ...(query ? { query } : {}),
            ...(headers ? { headers } : {}),
        };
        if (since !== undefined) {
            // A fresh resume point replaces the whole cursor, incarnation included.
            this._cursor = Number(since.trim());
            this._incarnation = incarnation;
            this._firstIncarnation = undefined;
        }
        else if (incarnation !== undefined) {
            this._firstIncarnation = incarnation;
        }
    }
    /**
     * Establish WebSocket connection.
     *
     * A second connect() (or reconnect()) made while this one is still
     * opening replaces it: this one then rejects with "WebSocket connect
     * superseded", and the new call owns the connection.
     */
    async connect(options) {
        if (options) {
            // MERGE, never replace. A shallow spread overwrote the whole header
            // map, so connect({ headers: { Authorization } }) silently dropped
            // every header the constructor set (claim headers, realm pin,
            // user-agent) and the socket opened unauthenticated-looking. Same
            // for query and auth: a caller adding one key keeps the rest. And for
            // streamResume: the service method presets the cursor parameter and
            // field, and connect({ streamResume: { enabled: true } }) replaced the
            // whole preset, so the cursor never moved and every reconnect replayed
            // the stream from the top.
            this.options = {
                ...this.options,
                ...options,
                ...(options.headers ? { headers: { ...(this.options.headers ?? {}), ...options.headers } } : {}),
                ...(options.query ? { query: { ...(this.options.query ?? {}), ...options.query } } : {}),
                ...(options.auth ? { auth: { ...(this.options.auth ?? {}), ...options.auth } } : {}),
                ...(options.streamResume ? { streamResume: { ...(this.options.streamResume ?? {}), ...options.streamResume } } : {}),
            };
            // A resume point passed here seeds the cursor, like one given to the constructor.
            this.takeResumeSeed();
        }
        this.shouldReconnect = true;
        // A connect the caller asked for starts a new backoff series, and a retry
        // still pending from an earlier one must not open a second socket.
        this.reconnectAttempts = 0;
        this._reconnecting = false;
        this.clearReconnectTimer();
        return this.openSocket(false);
    }
    /**
     * Open one socket. `isRetry` is true for an automatic reconnect attempt and
     * false for a connect the caller asked for.
     */
    openSocket(isRetry) {
        return new Promise((resolve, reject) => {
            // This attempt's token. connect(), reconnect(), the next automatic
            // attempt and disconnect() all retire it; everything below re-checks it
            // after each await, because the caller may have disconnected and
            // connected again while this attempt was still waiting.
            const attempt = ++this._openAttempt;
            const superseded = () => attempt !== this._openAttempt;
            let timedOut = false;
            // The socket this attempt installed, once it has one.
            let installed = null;
            const timeoutId = setTimeout(() => {
                timedOut = true;
                reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
                if (superseded())
                    return;
                if (installed) {
                    installed.close();
                    return;
                }
                // Still waiting for the URL or for the socket itself: nothing is
                // installed, so no close event will schedule the next attempt. Whatever
                // arrives later is closed and dropped (see the checks below).
                if (isRetry && this.shouldReconnect && this.options.reconnect)
                    this.scheduleReconnect();
            }, this.options.timeout);
            // True when this attempt must stop: it timed out, or it was retired.
            const abandoned = () => {
                if (!timedOut && !superseded())
                    return false;
                clearTimeout(timeoutId);
                // A no-op after a timeout, which has already answered.
                reject(new Error("WebSocket connect abandoned: the client was disconnected or connected again"));
                return true;
            };
            void (async () => {
                try {
                    // With a urlProvider a URL is good for ONE socket: the first open uses
                    // the URL the client was built with, every later one asks the provider.
                    const urlProvider = this.options.urlProvider;
                    if (urlProvider && this._urlSpent) {
                        let nextUrl;
                        try {
                            nextUrl = await urlProvider({ previousUrl: this._url, attempt: this.reconnectAttempts, reconnect: isRetry });
                            if (typeof nextUrl !== "string" || nextUrl.length === 0) {
                                throw new Error("no URL returned");
                            }
                        }
                        catch (cause) {
                            if (abandoned())
                                return;
                            clearTimeout(timeoutId);
                            const error = Object.assign(new Error("WebSocket urlProvider failed: " + (cause instanceof Error ? cause.message : String(cause))), { cause });
                            this.emitEvent("error", error);
                            reject(error);
                            if (isRetry && this.shouldReconnect && this.options.reconnect)
                                this.scheduleReconnect();
                            return;
                        }
                        if (abandoned())
                            return;
                        this._url = nextUrl;
                    }
                    this._urlSpent = true;
                    let created;
                    try {
                        created = await this.createRawSocket();
                    }
                    catch (error) {
                        // An abandoned attempt reports nothing and ends no series.
                        if (abandoned())
                            return;
                        throw error;
                    }
                    if (abandoned()) {
                        // The socket arrived too late (a slow factory, or a slow `ws`
                        // import): the connect() was already rejected, or a replacement
                        // connection exists. Close it and install nothing.
                        discardSocket(created);
                        return;
                    }
                    this.ws = created;
                    installed = created;
                    const socket = created;
                    // Generation bump + capture happens synchronously, BEFORE
                    // onmessage is installed. Each socket\u2019s handlers close over
                    // their own installedGen — when disconnect()/reconnect() bumps
                    // the counter, queued tasks from this socket compare against
                    // their captured value and bail.
                    this._socketGen++;
                    const installedGen = this._socketGen;
                    // Socket-local dispatch: a fresh frame queue (a hung decode on
                    // the OLD socket must not head-of-line-block this one) and a
                    // fresh dispatch token.
                    this._frameQueue = Promise.resolve();
                    const dispatchAlive = { alive: true };
                    this._dispatchAlive = dispatchAlive;
                    // State of THIS socket only. A replacement socket starts clean, so a
                    // stale error can never stop the reconnects of a later one.
                    let opened = false;
                    let openedAt = 0;
                    let closeHandled = false;
                    let lastActivity = Date.now();
                    // Set when this socket ended for a reason a reconnect cannot cure: a
                    // local resource cap, or an upgrade the server refused for good.
                    let finalError;
                    this.stopLiveness();
                    // Request binary frames as ArrayBuffer rather than Blob.
                    // Browser default is "blob" which would force every binary frame
                    // through an async decode path. ArrayBuffer is synchronous.
                    if (this.ws) {
                        try {
                            this.ws.binaryType = "arraybuffer";
                        }
                        catch { /* not supported on this runtime */ }
                    }
                    this.ws.onopen = () => {
                        clearTimeout(timeoutId);
                        // A socket that was superseded before it opened (its connect() timed
                        // out and the caller connected again) must not touch the client: it
                        // would announce a connection nobody holds and take over the liveness
                        // timer of the current socket. It only closes itself.
                        if (this._socketGen !== installedGen || this.ws !== socket) {
                            closeHandled = true;
                            discardSocket(socket);
                            // Its connect() is settled here: the timeout that would have
                            // answered it was just cleared.
                            reject(new Error("WebSocket connect superseded: a newer connect() replaced this attempt"));
                            return;
                        }
                        // The backoff is NOT reset here. A server that accepts and then
                        // closes (a connection limit, a deleted resource) would otherwise be
                        // retried at the first delay forever; the close handler resets it
                        // once a connection has lasted reconnectStableMs.
                        opened = true;
                        this._unopenedFailures = 0;
                        openedAt = Date.now();
                        lastActivity = openedAt;
                        this._reconnecting = false;
                        // The one-shot incarnation reached an open socket; reconnects use the live one.
                        this._firstIncarnation = undefined;
                        this.clearReconnectTimer();
                        // Liveness. A link that dies without a FIN or RST (sleep, a network
                        // handover, a NAT entry expiring) delivers no close event, so the
                        // socket would stay "connected" with nothing arriving. When nothing
                        // has been heard for idleMs the link is declared dead.
                        const probe = socket;
                        const canProbe = typeof probe.ping === "function" && typeof probe.on === "function";
                        const appPing = false;
                        const configuredIdle = this.options.idleTimeoutMs;
                        const idleMs = typeof configuredIdle === "number"
                            ? (Number.isFinite(configuredIdle) && configuredIdle > 0 ? configuredIdle : 0)
                            : (canProbe || appPing ? 75000 : 0);
                        if (idleMs > 0) {
                            if (canProbe) {
                                // `ws` shows protocol pings and pongs; the client pings too, so
                                // a quiet but healthy stream keeps answering.
                                const touch = () => { lastActivity = Date.now(); };
                                probe.on("ping", touch);
                                probe.on("pong", touch);
                            }
                            const timer = setInterval(() => {
                                if (closeHandled || this._socketGen !== installedGen) {
                                    clearInterval(timer);
                                    return;
                                }
                                if (Date.now() - lastActivity >= idleMs) {
                                    clearInterval(timer);
                                    // A dead link never completes a close handshake: drop the
                                    // socket and report the close from here.
                                    try {
                                        if (typeof probe.terminate === "function")
                                            probe.terminate();
                                        else
                                            socket.close();
                                    }
                                    catch { /* already closed */ }
                                    finishClose(1006, "liveness timeout");
                                    return;
                                }
                                if (canProbe && socket.readyState === RAW_WEBSOCKET_OPEN) {
                                    try {
                                        probe.ping();
                                    }
                                    catch { /* closing */ }
                                }
                                else if (appPing && socket.readyState === RAW_WEBSOCKET_OPEN) {
                                    // The pong is a message, and every message counts as activity.
                                    try {
                                        socket.send('{"type":"ping"}');
                                    }
                                    catch { /* closing */ }
                                }
                            }, Math.max(50, Math.floor(idleMs / 3)));
                            timer.unref?.();
                            this._livenessTimer = timer;
                        }
                        this.emitEvent("connect");
                        resolve();
                    };
                    this.ws.onmessage = (event) => {
                        const raw = event.data;
                        lastActivity = Date.now();
                        // Every dispatch callback is exception-fenced: a throwing frame
                        // handler would otherwise leave _frameQueue REJECTED, and since the
                        // chain grows via .then(fn) every subsequent frame would be
                        // silently dropped for the life of the socket.
                        // Synchronous string fast path.
                        if (typeof raw === "string") {
                            this._frameQueue = this._frameQueue.then(() => {
                                try {
                                    if (this._socketGen === installedGen && dispatchAlive.alive)
                                        this.handleString(raw);
                                }
                                catch (err) {
                                    this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                                }
                            });
                            return;
                        }
                        // ArrayBuffer (preferred binary shape).
                        if (raw instanceof ArrayBuffer) {
                            const buf = new Uint8Array(raw);
                            this._frameQueue = this._frameQueue.then(() => {
                                try {
                                    if (this._socketGen === installedGen && dispatchAlive.alive)
                                        this.handleBinary(buf);
                                }
                                catch (err) {
                                    this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                                }
                            });
                            return;
                        }
                        // ArrayBufferView covers Node Buffer + Uint8Array w/ non-zero offset.
                        if (raw && typeof raw.byteLength === "number"
                            && typeof raw.buffer !== "undefined") {
                            const v = raw;
                            const buf = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
                            this._frameQueue = this._frameQueue.then(() => {
                                try {
                                    if (this._socketGen === installedGen && dispatchAlive.alive)
                                        this.handleBinary(buf);
                                }
                                catch (err) {
                                    this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                                }
                            });
                            return;
                        }
                        // Blob fallback (older browsers / explicit binaryType="blob").
                        // Kick off arrayBuffer() decode SYNCHRONOUSLY (so multiple Blob frames
                        // decode in parallel) and only the dispatch is serialized through the
                        // FIFO queue. This preserves frame ordering AND avoids decode head-of-
                        // line blocking.
                        if (typeof Blob !== "undefined" && raw instanceof Blob) {
                            const decode = raw.arrayBuffer();
                            this._frameQueue = this._frameQueue.then(async () => {
                                try {
                                    const ab = await decode;
                                    if (this._socketGen === installedGen && dispatchAlive.alive) {
                                        this.handleBinary(new Uint8Array(ab));
                                    }
                                }
                                catch (err) {
                                    this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                                }
                            });
                            return;
                        }
                        // Unknown shape — best-effort string coercion.
                        this._frameQueue = this._frameQueue.then(() => {
                            try {
                                if (this._socketGen === installedGen && dispatchAlive.alive)
                                    this.handleString(String(raw));
                            }
                            catch (err) {
                                this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                            }
                        });
                    };
                    const finishClose = (code, reason) => {
                        // Once per socket: the liveness check reports a dead link itself,
                        // and the transport's own close event may still follow.
                        if (closeHandled)
                            return;
                        closeHandled = true;
                        if (this._socketGen === installedGen)
                            this.stopLiveness();
                        // Frame-settle barrier. Received frames dispatch through the
                        // _frameQueue microtask chain, so a close arriving in the same tick
                        // as the final data frames (typical when the remote process exits:
                        // last output + close land in one TCP batch) would otherwise emit
                        // `disconnect` BEFORE those frames reach handlers — consumers that
                        // tear down on disconnect (the CLI terminal bridge) would drop the
                        // tail bytes. Settle the queue first (settle-proof: both branches
                        // resolve; bounded so a hung Blob decode cannot wedge the close),
                        // then announce. Generation-guarded: if a newer socket superseded
                        // this one while we waited, its lifecycle owns the events.
                        const settled = this._frameQueue.then(() => undefined, () => undefined);
                        const cap = new Promise((resolveCap) => {
                            const t = setTimeout(resolveCap, 1000);
                            t.unref?.();
                        });
                        void Promise.race([settled, cap]).then(() => {
                            // Whether the queue settled or the cap fired, no frame may
                            // dispatch after the disconnect announcement below.
                            dispatchAlive.alive = false;
                            if (this._socketGen !== installedGen)
                                return;
                            this.emitEvent("disconnect", code, reason);
                            // The backoff starts over only after a connection that lasted.
                            if (opened && Date.now() - openedAt >= (this.options.reconnectStableMs ?? 30000)) {
                                this.reconnectAttempts = 0;
                            }
                            // Close-code filter. Do NOT reconnect on server-sent policy
                            // closes — 4xxx codes mean "stop trying" (auth failed, permission
                            // denied, bad request), and 1008/1003 are explicit policy rejections.
                            // Reconnecting against these would loop forever against a server that
                            // already told us to go away.
                            //
                            // A normal close (1000) from the server is final too, unless the
                            // caller opted in: the server ended the stream on purpose, and a
                            // reconnect to a deleted terminal session re-creates it.
                            //
                            // finalError: this socket hit a local resource cap, or the server
                            // refused the upgrade for good. Both arrive as 1006, and neither
                            // is cured by trying again.
                            const isTerminal = code === 1008 || code === 1003 || code === 1002 || (code >= 4000 && code < 5000)
                                || (code === 1000 && this.options.reconnectOnNormalClose !== true)
                                || finalError !== undefined;
                            // A connect() the caller made that never opened was rejected to
                            // the caller. It must not leave a reconnect loop running behind
                            // that rejection; the caller decides whether to connect again.
                            const rejectedToCaller = !opened && !isRetry;
                            if (this.shouldReconnect && this.options.reconnect && !isTerminal && !rejectedToCaller) {
                                // Repeated failures before open, on a transport that hides the
                                // status: ask the server why before trying again.
                                if (!opened)
                                    this._unopenedFailures++;
                                const probeAfter = this.options.refusalProbeAfter ?? 3;
                                if (!opened && probeAfter > 0 && this._unopenedFailures % probeAfter === 0 && !this.options.webSocketFactory) {
                                    this._reconnecting = true;
                                    void this.probeRefusal(attempt);
                                }
                                else {
                                    this.scheduleReconnect();
                                }
                            }
                            else if (this._reconnecting) {
                                // A reconnect attempt that will not be followed by another.
                                this._reconnecting = false;
                                if (this.shouldReconnect && this.options.reconnect)
                                    this.emitEvent("reconnect_failed");
                            }
                        });
                    };
                    this.ws.onclose = (event) => {
                        finishClose(event.code, event.reason);
                    };
                    this.ws.onerror = (event) => {
                        // Noise from a socket the liveness check already gave up on.
                        if (closeHandled)
                            return;
                        clearTimeout(timeoutId);
                        // The transport's own error when it exposes one: `ws` does, a
                        // browser socket and Node's built-in one do not.
                        const cause = event instanceof Error ? event : event?.error;
                        const causeCode = cause?.code;
                        let error;
                        if (causeCode === "WS_ERR_TOO_MANY_BUFFERED_PARTS" || causeCode === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" || causeCode === "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH") {
                            // `ws` stopped reading because a local cap was hit (too many
                            // fragments or buffered chunks, or a message over a size limit).
                            error = new Error(`WebSocket closed by a local resource limit (${String(causeCode)}); automatic reconnect stopped`);
                            finalError = error;
                        }
                        else {
                            // `ws` reports a refused upgrade with the HTTP status in its message.
                            const refused = opened || !(cause instanceof Error) ? null : /^Unexpected server response: (\d{3})$/.exec(cause.message);
                            const status = refused ? Number(refused[1]) : 0;
                            if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
                                // The server answered the upgrade with a client error (the
                                // resource is gone, or the credential is refused). The same
                                // request gets the same answer.
                                error = upgradeRefusedError(status, undefined, "upgrade");
                                finalError = error;
                            }
                            else {
                                error = new Error("WebSocket connection error");
                            }
                        }
                        if (cause !== undefined)
                            error.cause = cause;
                        this.emitEvent("error", error);
                        reject(error);
                    };
                }
                catch (error) {
                    clearTimeout(timeoutId);
                    if (isRetry) {
                        // No socket was created, so no close event follows: report the
                        // failure and end the series instead of leaving it silently stuck.
                        this.emitEvent("error", error instanceof Error ? error : new Error(String(error)));
                        this._reconnecting = false;
                        this.emitEvent("reconnect_failed");
                    }
                    reject(error);
                }
            })();
        });
    }
    async createRawSocket() {
        // Assemble the connect URL: base URL + optional Socket.IO `path` + optional `query`.
        // Native WebSocket cannot take custom headers, so anything auth-like that the
        // caller supplied via `options.auth.token` is also folded into the query string.
        // This intentionally mirrors terminal-client.ts — the leakage tradeoff of URL-
        // embedded tokens is inherent to the browser WebSocket API.
        const buildConnectUrl = () => {
            try {
                const urlObj = new URL(this._url);
                if (this.options.path) {
                    if (!urlObj.pathname || urlObj.pathname === "/" || urlObj.pathname === "") {
                        urlObj.pathname = this.options.path;
                    }
                }
                if (this.options.query) {
                    for (const [k, v] of Object.entries(this.options.query)) {
                        if (v !== undefined && v !== null)
                            urlObj.searchParams.set(k, String(v));
                    }
                }
                // Cursor-preserving resume. A resume point the caller gave is already
                // the cursor (takeResumeSeed), so the live cursor goes out on every
                // connect. Only a value that is not a cursor can already be here, and
                // that one is left as the caller set it.
                const __resume = this.options.streamResume;
                if (__resume?.enabled !== false) {
                    const sinceParam = __resume?.param ?? "since";
                    const incarnationParam = __resume?.incarnationParam ?? "incarnation";
                    if (typeof this._cursor === "number") {
                        if (!urlObj.searchParams.has(sinceParam)) {
                            urlObj.searchParams.set(sinceParam, String(this._cursor));
                        }
                        if (this._incarnation !== undefined && !urlObj.searchParams.has(incarnationParam)) {
                            urlObj.searchParams.set(incarnationParam, this._incarnation);
                        }
                    }
                    // An incarnation given without a cursor rides every attempt until one
                    // socket opens (cleared in onopen), so a failed first open keeps it.
                    if (this._firstIncarnation !== undefined && !urlObj.searchParams.has(incarnationParam)) {
                        urlObj.searchParams.set(incarnationParam, this._firstIncarnation);
                    }
                }
                const auth = this.options.auth;
                if (auth && typeof auth.token === "string" && auth.token.length > 0 && !urlObj.searchParams.has("token")) {
                    urlObj.searchParams.set("token", auth.token);
                }
                return urlObj.toString();
            }
            catch {
                return this._url;
            }
        };
        const connectUrl = buildConnectUrl();
        this._lastConnectUrl = connectUrl;
        // Injected transport wins outright. No global-WebSocket probe, no `ws`
        // import, no degraded path: if the factory throws or returns something
        // unusable the connect fails loudly. A silent fallback here would send
        // traffic over a transport the caller did not choose — the exact failure
        // an injected socket exists to prevent.
        const factory = this.options.webSocketFactory;
        if (factory) {
            const wsOptions = this.options.headers && Object.keys(this.options.headers).length > 0
                ? { headers: this.options.headers }
                : undefined;
            const socket = await factory(connectUrl, this.options.protocols, wsOptions);
            if (!socket || typeof socket.send !== "function" || typeof socket.close !== "function") {
                throw new Error("webSocketFactory did not return a usable WebSocket");
            }
            return socket;
        }
        const impl = WatchStreamWatcherEventsWsWebSocket.webSocketImpl;
        if (typeof impl === "function")
            return new impl(connectUrl, this.options.protocols);
        // Runtime detection: on Node >=22 `globalThis.WebSocket` exists but cannot
        // accept custom headers. When the caller supplied `options.headers`, prefer
        // the `ws` module (which accepts a 3rd-arg options bag) so headers actually
        // reach the server. In a true browser environment the `ws` import is unavailable
        // and `globalThis.WebSocket` is the only option.
        const hasHeaders = this.options.headers && Object.keys(this.options.headers).length > 0;
        const isBrowserRuntime = typeof globalThis.window !== "undefined"
            && typeof globalThis.document !== "undefined";
        const globalCtor = globalThis.WebSocket;
        // CVE-2026-12151. On a Node whose bundled undici cannot be shown to be
        // patched, the built-in WebSocket is never constructed: every path below
        // that would have chosen it takes `ws` instead, and fails loudly when `ws`
        // cannot be loaded. This is decided BEFORE the browser test, because a Node
        // process with a jsdom-style window + document is still Node. Bun, Deno,
        // browsers and workers are not Node and keep their own socket.
        const runtime = globalThis.process;
        const runtimeVersions = runtime?.versions;
        const builtinUnsafe = nodeBuiltinWebSocketUnsafe(runtimeVersions);
        // Node itself (not Bun or Deno) opens with `ws` even without headers: its
        // built-in WebSocket hides protocol pings, so it could not tell a quiet
        // stream from a dead link (see idleTimeoutMs).
        const isNode = !!runtimeVersions?.node && !runtimeVersions.bun && !runtimeVersions.deno;
        const builtinRefused = (cause) => Object.assign(new Error(`The built-in WebSocket of Node ${runtimeVersions?.node ?? "unknown"} (${runtimeVersions?.undici ? "undici " + runtimeVersions.undici : "undici version not reported"}) `
            + "cannot be shown to be free of CVE-2026-12151 and the `ws` package could not be loaded ("
            + (cause instanceof Error ? cause.message : String(cause))
            + "). Reinstall hoody-sdk, or use an official Node 22.23.0+, 24.17.0+ or 26.3.1+."), { cause });
        if (typeof globalCtor === "function" && !builtinUnsafe && (isBrowserRuntime || (!hasHeaders && !isNode))) {
            if (isBrowserRuntime && hasHeaders) {
                // A browser WebSocket cannot send headers, so kitAuth password, jwt
                // and identity headers never reach the upgrade. The proxy accepts two
                // header-free forms: a token group read from a query parameter, or a
                // cookie on the kit host. Say so once instead of failing silently.
                const dropped = Object.keys(this.options.headers).filter((name) => /^(authorization|cookie|x-hoody-[\w-]+|proxy-authorization)$/i.test(name));
                const flags = globalThis;
                if (dropped.length > 0 && !flags.__hoodyWsHeaderWarned) {
                    flags.__hoodyWsHeaderWarned = true;
                    console.warn(`[hoody-sdk] a browser WebSocket cannot send headers; ${dropped.join(", ")} not sent on the upgrade. Use a proxy token group read from a query parameter, or a cookie on the kit host.`);
                }
            }
            return new globalCtor(connectUrl, this.options.protocols);
        }
        const specifier = "ws";
        let wsModule;
        try {
            wsModule = await import(specifier);
        }
        catch (cause) {
            if (builtinUnsafe)
                throw builtinRefused(cause);
            // `ws` not installed — fall back to global WS, losing headers. This is
            // the same degraded path as when the module exists but has no default.
            if (typeof globalCtor === "function") {
                return new globalCtor(connectUrl, this.options.protocols);
            }
            throw new Error("WebSocket implementation unavailable in this runtime");
        }
        if (typeof wsModule.default !== "function") {
            if (builtinUnsafe)
                throw builtinRefused(new Error("the module has no WebSocket constructor export"));
            if (typeof globalCtor === "function") {
                return new globalCtor(connectUrl, this.options.protocols);
            }
            throw new Error("WebSocket implementation unavailable in this runtime");
        }
        // Node `ws` supports `headers` via a 3rd arg; surface caller headers there.
        // The fragment and buffered-chunk caps are passed explicitly, so they hold
        // whatever defaults the installed `ws` has.
        const wsOptions = { maxFragments: 16384, maxBufferedChunks: 262144 };
        if (hasHeaders) {
            wsOptions.headers = this.options.headers;
        }
        return new wsModule.default(connectUrl, this.options.protocols, wsOptions);
    }
    /**
     * Manually trigger reconnection
     */
    async reconnect() {
        this.disconnect("manual reconnect");
        this.reconnectAttempts = 0;
        return this.connect();
    }
    /**
     * Turn automatic reconnection on or off on a LIVE client.
     *
     * `reconnect` was construction-time only, so a consumer that wanted to
     * stop reconnecting had to tear the client down. Disabling here also
     * clears any scheduled attempt and drops the `reconnecting` flag, so no
     * backoff timer survives the switch. Enabling does not reconnect by
     * itself — it only re-arms the close handler for the NEXT drop.
     */
    setAutoReconnect(enabled) {
        this.options.reconnect = enabled;
        if (!enabled) {
            this.clearReconnectTimer();
            this._reconnecting = false;
        }
    }
    get autoReconnect() {
        return this.options.reconnect !== false;
    }
    /**
     * Disconnect from server
     */
    disconnect(reason) {
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        // Retire an open attempt still waiting for its URL or its socket.
        this._openAttempt++;
        // A disconnect during a backoff wait ends the series: nothing is pending.
        this._reconnecting = false;
        this.stopLiveness();
        // Kill the dispatch token synchronously — any in-flight queued task
        // (especially Blob arrayBuffer() microtasks) bails via the token
        // check. Deliberately NOT a _socketGen bump: the generation guard
        // in onclose would then suppress the disconnect event for this
        // manual close, and onDisconnect consumers would never hear it.
        this._dispatchAlive.alive = false;
        if (this.ws) {
            this.ws.close(1000, reason || "Normal closure");
            this.ws = null;
        }
    }
    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= (this.options.reconnectAttempts ?? Infinity)) {
            this._reconnecting = false;
            this.emitEvent("reconnect_failed");
            return;
        }
        this._reconnecting = true;
        const delay = Math.min(this.options.reconnectDelay * Math.pow(this.options.reconnectionDelayGrowFactor, this.reconnectAttempts), this.options.reconnectDelayMax);
        // Add randomization to prevent thundering herd
        const jitter = delay * this.options.randomizationFactor * (Math.random() - 0.5) * 2;
        const randomizedDelay = Math.max(0, delay + jitter);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            const attempt = this.reconnectAttempts;
            this.emitEvent("reconnect_attempt", attempt);
            this.openSocket(true).then(() => {
                this.emitEvent("reconnect", attempt);
            }).catch(() => {
                // Reported through onError. The close handler (or openSocket, when no
                // socket was created) decides whether another attempt follows.
            });
        }, randomizedDelay);
    }
    /**
     * One plain GET to the URL the failing sockets used, to learn the status the
     * transport hid. Ends the series on 401, 403 or 404; otherwise the backoff
     * goes on. `attempt` is the open attempt that failed: a disconnect() or a
     * new connect() meanwhile makes the answer irrelevant.
     */
    async probeRefusal(attempt) {
        let status = 0;
        let code;
        const fetchFn = globalThis.fetch;
        const target = this._lastConnectUrl;
        if (typeof fetchFn === "function" && target) {
            const isBrowserRuntime = typeof globalThis.window !== "undefined"
                && typeof globalThis.document !== "undefined";
            // A browser WebSocket sends no headers, only its cookies; elsewhere the
            // socket carried these headers (kitAuth, realm pin).
            const headers = isBrowserRuntime ? {} : { ...(this.options.headers ?? {}) };
            const controller = typeof AbortController === "function" ? new AbortController() : undefined;
            const timer = setTimeout(() => controller?.abort(), 5000);
            timer.unref?.();
            try {
                const response = await fetchFn(target.replace(/^ws(s?):/i, "http$1:"), {
                    method: "GET",
                    headers,
                    // A redirect is not followed, so the headers never reach another host.
                    redirect: "manual",
                    credentials: isBrowserRuntime ? "include" : "same-origin",
                    ...(controller ? { signal: controller.signal } : {}),
                });
                status = response.status;
                if (status === 401 || status === 403 || status === 404) {
                    try {
                        const body = JSON.parse((await response.text()).slice(0, 4096));
                        const nested = body && typeof body.error === "object" && body.error !== null ? body.error.code : undefined;
                        if (typeof body?.code === "string")
                            code = body.code;
                        else if (typeof nested === "string")
                            code = nested;
                        else if (typeof body?.error === "string" && /^[A-Z][A-Z0-9_]*$/.test(body.error))
                            code = body.error;
                    }
                    catch { /* no JSON error code */ }
                }
                else {
                    try {
                        await response.body?.cancel();
                    }
                    catch { /* nothing to release */ }
                }
            }
            catch {
                // No answer (network still down, a browser refusing the request):
                // nothing learned.
                status = 0;
            }
            finally {
                clearTimeout(timer);
            }
        }
        if (attempt !== this._openAttempt || !this.shouldReconnect || !this.options.reconnect)
            return;
        if (status === 401 || status === 403 || status === 404) {
            this._reconnecting = false;
            this.emitEvent("error", upgradeRefusedError(status, code, "probe"));
            this.emitEvent("reconnect_failed");
            return;
        }
        this.scheduleReconnect();
    }
    /** Stop the liveness timer of the current socket. */
    stopLiveness() {
        if (this._livenessTimer) {
            clearInterval(this._livenessTimer);
            this._livenessTimer = null;
        }
    }
    /**
     * Clear reconnection timer
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    /**
     * Handle an incoming TEXT frame (or a binary frame decoded as UTF-8).
     *
     * Three frame shapes, checked in this order:
     *
     *  1. A sequenced envelope `{seq, event}` — what a gateway that stamps a
     *     cursor publishes. It has NO top-level `type`, so the original
     *     `message.type` dispatch read undefined and dropped every frame on
     *     such a stream. The cursor is recorded, the envelope is published,
     *     and the INNER event is still offered to the per-type handlers so
     *     existing on<Type>() consumers keep working unchanged.
     *  2. A control frame — `lagged`, `replay_boundary`, `end`, `refused`.
     *  3. Anything else — the original dispatch on `message.type`.
     */
    handleString(data) {
        let message;
        try {
            message = JSON.parse(data);
        }
        catch (error) {
            console.error("Failed to parse WebSocket message:", error);
            return;
        }
        if (!message || typeof message !== "object") {
            return;
        }
        if (typeof message.seq === "number" && "event" in message) {
            const envelope = {
                kind: "envelope",
                seq: message.seq,
                event: message.event,
            };
            if (typeof message.incarnation === "string") {
                envelope.incarnation = message.incarnation;
                this._incarnation = message.incarnation;
            }
            const gate = message.gate;
            if (gate && typeof gate === "object") {
                envelope.gate = gate;
            }
            // Advance the cursor BEFORE any handler runs: a consumer that throws
            // must not cost us the resume point for every later reconnect.
            this._cursor = message.seq;
            this.emitEvent("__envelope", envelope);
            this.pushStreamFrame(envelope);
            const inner = message.event;
            if (inner && typeof inner === "object" && typeof inner.type === "string") {
                this.dispatchTypedMessage(inner.type, inner);
            }
            return;
        }
        // A plain frame that carries the declared resume cursor advances it
        // before any handler runs, as an envelope seq does.
        const __cursorField = this.options.streamResume?.cursorField;
        if (__cursorField && typeof message[__cursorField] === "number") {
            this._cursor = message[__cursorField];
        }
        const messageType = message.type;
        if (messageType === "lagged" || messageType === "replay_boundary" || messageType === "end" || messageType === "refused") {
            this.handleControlFrame(messageType, message);
            return;
        }
        this.dispatchTypedMessage(messageType, message);
    }
    /** The original per-type dispatch, unchanged in behaviour. */
    dispatchTypedMessage(messageType, message) {
        const handlers = this.eventHandlers.get(messageType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                }
                catch (error) {
                    console.error(`Error handling message ${messageType}:`, error);
                }
            });
        }
    }
    /** Normalise a gateway control frame and publish it. */
    handleControlFrame(type, message) {
        if (typeof message.incarnation === "string") {
            this._incarnation = message.incarnation;
        }
        let frame;
        if (type === "lagged") {
            const lagged = {
                kind: "lagged",
                code: typeof message.code === "string" ? message.code : "lagged",
            };
            if (typeof message.min_seq === "number")
                lagged.min_seq = message.min_seq;
            if (typeof message.max_seq === "number")
                lagged.max_seq = message.max_seq;
            if (typeof message.incarnation === "string")
                lagged.incarnation = message.incarnation;
            if (typeof message.resume === "string")
                lagged.resume = message.resume;
            if (lagged.code === "replay_gap") {
                // The cursor we resumed with is outside the ring (or belongs to a
                // different incarnation). Re-sending it would be rejected forever,
                // so fall back to the oldest seq the ring still holds.
                this._cursor = typeof lagged.min_seq === "number" ? lagged.min_seq : undefined;
                if (typeof lagged.incarnation === "string") {
                    this._incarnation = lagged.incarnation;
                }
                else {
                    this._incarnation = undefined;
                }
            }
            frame = lagged;
            this.emitEvent("__lagged", lagged);
        }
        else if (type === "replay_boundary") {
            const boundary = { kind: "replay_boundary" };
            if (typeof message.max_seq === "number")
                boundary.max_seq = message.max_seq;
            if (typeof message.incarnation === "string")
                boundary.incarnation = message.incarnation;
            frame = boundary;
            this.emitEvent("__replay_boundary", boundary);
        }
        else if (type === "refused") {
            const refused = {
                kind: "refused",
                code: typeof message.code === "string" ? message.code : "refused",
            };
            if (typeof message.frame === "string")
                refused.frame = message.frame;
            if (typeof message.reason === "string")
                refused.reason = message.reason;
            frame = refused;
            this.emitEvent("__refused", refused);
        }
        else {
            const end = { kind: "end" };
            if (typeof message.reason === "string")
                end.reason = message.reason;
            // The stream is over on the SERVER. Reconnecting would open a socket
            // onto a session that no longer exists and close again, forever.
            this.shouldReconnect = false;
            this.clearReconnectTimer();
            this._reconnecting = false;
            frame = end;
            this.emitEvent("__end", end);
        }
        this.emitEvent("__control", frame);
        this.pushStreamFrame(frame);
    }
    /**
     * Hand one frame to frames(): to a pending next(), or to the queue.
     *
     * Queueing matters — connect() resolves on open, and the gateway writes
     * its replay tail immediately, so a consumer that starts iterating after
     * connect() would otherwise miss everything replayed in between.
     */
    pushStreamFrame(frame) {
        if (this._streamEnded)
            return;
        if (frame.kind === "end")
            this._streamEnded = true;
        const waiter = this._frameWaiters.shift();
        if (waiter) {
            waiter({ value: frame, done: false });
        }
        else {
            this._frameBuffer.push(frame);
        }
        if (this._streamEnded && this._frameWaiters.length > 0) {
            const pending = this._frameWaiters.splice(0, this._frameWaiters.length);
            for (const resolveWaiter of pending) {
                resolveWaiter({ value: undefined, done: true });
            }
        }
    }
    /**
     * Handle an incoming BINARY frame. Default implementation decodes
     * the bytes as UTF-8 and routes them to `handleString` — i.e. for
     * JSON-typed channels the binary path is behaviour-equivalent to the
     * string path. Byte-prefix channels override this method.
     */
    handleBinary(buf) {
        let text;
        try {
            text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        }
        catch (err) {
            this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
            return;
        }
        this.handleString(text);
    }
    /**
     * Backwards-compat shim for any subclass that still calls handleMessage.
     * Delegates to handleString.
     */
    handleMessage(data) {
        this.handleString(data);
    }
    /**
     * Send message to server
     */
    send(message) {
        if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
            throw new Error("WebSocket is not connected");
        }
        this.ws.send(JSON.stringify(message));
    }
    /**
     * @param callback Function to call when file_event message received
     * @returns Unsubscribe function
     */
    onFileEvent(callback) {
        return this.addEventListener("file_event", callback);
    }
    /**
     * @param callback Function to call when lag message received
     * @returns Unsubscribe function
     */
    onLag(callback) {
        return this.addEventListener("lag", callback);
    }
    // ============================================================================
    // Connection Lifecycle
    // ============================================================================
    onConnect(callback) {
        return this.addEventListener("connect", callback);
    }
    onDisconnect(callback) {
        return this.addEventListener("disconnect", callback);
    }
    onReconnectAttempt(callback) {
        return this.addEventListener("reconnect_attempt", callback);
    }
    onReconnect(callback) {
        return this.addEventListener("reconnect", callback);
    }
    onReconnectFailed(callback) {
        return this.addEventListener("reconnect_failed", callback);
    }
    onError(callback) {
        return this.addEventListener("error", callback);
    }
    /**
     * Add event listener
     * @returns Unsubscribe function
     */
    addEventListener(event, callback) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(callback);
        // Return unsubscribe function
        return () => this.off(event, callback);
    }
    /**
     * Remove event listener(s)
     */
    off(event, callback) {
        if (!callback) {
            this.eventHandlers.delete(event);
        }
        else {
            this.eventHandlers.get(event)?.delete(callback);
        }
    }
    /**
     * Remove all listeners
     */
    removeAllListeners(event) {
        if (event) {
            this.eventHandlers.delete(event);
        }
        else {
            this.eventHandlers.clear();
        }
    }
    /**
     * Emit event to all registered handlers
     */
    emitEvent(event, ...args) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(...args);
                }
                catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }
    close(code, reason) {
        this.disconnect(reason);
    }
    get readyState() {
        return this.ws?.readyState ?? RAW_WEBSOCKET_CLOSED;
    }
    get url() {
        return this._url;
    }
    /**
     * The socket of the current connection, or null when there is none. It is
     * replaced on every reconnect, so read it again after each `connect`
     * event instead of keeping it. For code that needs what the transport
     * offers beyond this client (the `ws` package: ping(), the ping and pong
     * events); do not assign its on* handlers, the client owns them.
     */
    get rawSocket() {
        return this.ws;
    }
    get connected() {
        return this.ws?.readyState === RAW_WEBSOCKET_OPEN;
    }
    get reconnecting() {
        return this._reconnecting;
    }
    // ============================================================================
    // Gateway stream (sequenced envelopes + control frames)
    // ============================================================================
    onEnvelope(callback) {
        return this.addEventListener("__envelope", callback);
    }
    onControlFrame(callback) {
        return this.addEventListener("__control", callback);
    }
    onLagged(callback) {
        return this.addEventListener("__lagged", callback);
    }
    onReplayBoundary(callback) {
        return this.addEventListener("__replay_boundary", callback);
    }
    onEnd(callback) {
        return this.addEventListener("__end", callback);
    }
    onRefused(callback) {
        return this.addEventListener("__refused", callback);
    }
    /**
     * Every frame as one async iterable. SINGLE consumer: frames are handed
     * out once, so two concurrent iterators would split the stream between
     * them. Use onEnvelope()/onControlFrame() for fan-out.
     */
    frames() {
        const iterator = {
            [Symbol.asyncIterator]: () => iterator,
            next: () => {
                const buffered = this._frameBuffer.shift();
                if (buffered !== undefined) {
                    return Promise.resolve({ value: buffered, done: false });
                }
                if (this._streamEnded) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise((resolve) => {
                    this._frameWaiters.push(resolve);
                });
            },
            return: () => Promise.resolve({ value: undefined, done: true }),
        };
        return iterator;
    }
    get cursor() {
        return this._cursor;
    }
    get incarnation() {
        return this._incarnation;
    }
    setCursor(seq, incarnation) {
        this._cursor = seq;
        if (incarnation !== undefined) {
            this._incarnation = incarnation;
        }
    }
}
