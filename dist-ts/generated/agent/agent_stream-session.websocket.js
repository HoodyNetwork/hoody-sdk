/**
 * WebSocket client for Attach to a session's event stream (WebSocket / SSE).
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */
/** A credential passed for this socket cannot be sent by a browser WebSocket; connect() rejects with it. */
function credentialNotSentError(headers) {
    return Object.assign(new Error(`WebSocket credential not sent: a browser WebSocket cannot send ${headers.join(", ")}. Pass a token group read from a query parameter, or use a cookie on the kit host.`), { name: "WebSocketCredentialNotSentError", code: "WS_CREDENTIAL_NOT_SENT", headers });
}
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
/** Bytes of a refused upgrade's body read for its error; the rest is dropped. */
const UPGRADE_BODY_CAP = 16384;
/** Longest wait for that body, inside the connect timeout. */
const UPGRADE_BODY_DEADLINE_MS = 2000;
/**
 * The error for an upgrade answered with `status` instead of 101. `body` is
 * the response text when it was read completely (never when cut at the cap
 * or by a deadline); only a JSON object naming a string `code` (at the top,
 * or under `error`) adds the server's code, message and details.
 */
function upgradeResponseError(status, headers, body) {
    let envelope;
    if (body !== undefined) {
        try {
            const parsed = JSON.parse(body);
            const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
            if (isObject(parsed)) {
                if (typeof parsed.code === "string")
                    envelope = parsed;
                else if (isObject(parsed.error) && typeof parsed.error.code === "string")
                    envelope = parsed.error;
            }
        }
        catch { /* not JSON: the status alone */ }
    }
    const code = envelope ? envelope.code : undefined;
    const serverMessage = envelope && typeof envelope.message === "string" && envelope.message !== "" ? envelope.message : undefined;
    const details = envelope && envelope.details !== null && typeof envelope.details === "object" && !Array.isArray(envelope.details)
        ? envelope.details
        : undefined;
    let retryAfterSecs;
    const fromDetails = details?.retry_after_secs;
    const header = headers["retry-after"];
    if (typeof fromDetails === "number" && Number.isFinite(fromDetails) && fromDetails >= 0)
        retryAfterSecs = fromDetails;
    else if (typeof header === "string" && /^\d+$/.test(header.trim()))
        retryAfterSecs = Number(header.trim());
    if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
        const refused = upgradeRefusedError(status, code, "upgrade");
        if (serverMessage !== undefined)
            refused.serverMessage = serverMessage;
        if (details !== undefined)
            refused.details = details;
        if (retryAfterSecs !== undefined)
            refused.retryAfterSecs = retryAfterSecs;
        return refused;
    }
    const failed = new Error(serverMessage ?? "WebSocket connection error");
    failed.name = "WebSocketUpgradeFailedError";
    failed.status = status;
    if (code !== undefined)
        failed.code = code;
    if (serverMessage !== undefined)
        failed.serverMessage = serverMessage;
    if (details !== undefined)
        failed.details = details;
    if (retryAfterSecs !== undefined)
        failed.retryAfterSecs = retryAfterSecs;
    failed.via = "upgrade";
    return failed;
}
function serverFrameError(frame) {
    const nested = frame.error !== null && typeof frame.error === "object" ? frame.error : {};
    const text = (...values) => values.find((v) => typeof v === "string" && v !== "");
    const code = text(frame.code, nested.code, nested.type) ?? "server_error";
    const error = new Error(text(frame.message, nested.message) ?? `server error: ${code}`);
    error.name = "WebSocketServerError";
    error.code = code;
    error.frame = frame;
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
    return a < 6; // ≥ 9: ASSUMED fixed (a later major carries the fix)
};
export class AgentSessionsConnectWebSocket {
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
    // The last socket created is the global WebSocket (no HTTP status of a
    // refused upgrade can be read from it).
    _lastSocketGlobal = false;
    // Ends the body read of a refused upgrade still in progress; disconnect()
    // calls it so the attempt settles at once.
    _upgradeReadAbort = null;
    // The open attempt disconnect() retired (0: none since the last openSocket).
    // Only that attempt still reports a refused upgrade; an attempt another
    // connect superseded settles silently even if a disconnect follows.
    _retiredByDisconnect = 0;
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
        // A new connect() starts a new stream for frames().
        this._streamEnded = false;
        return this.openSocket(false).catch((error) => {
            // Rejected to the caller and nothing retries it: frames() ends.
            if (!this._reconnecting)
                this.endFrames();
            throw error;
        });
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
            this._retiredByDisconnect = 0;
            // An older attempt still reading a refused upgrade's body is superseded
            // now: it settles at once, silently.
            const olderRead = this._upgradeReadAbort;
            this._upgradeReadAbort = null;
            olderRead?.();
            const superseded = () => attempt !== this._openAttempt;
            let timedOut = false;
            // The socket this attempt installed, once it has one.
            let installed = null;
            // Settles a refused upgrade whose body is being read (see the
            // unexpected-response handler below); set only during that read.
            let settleUpgrade = null;
            const deadlineAt = Date.now() + (this.options.timeout ?? 30000);
            const timeoutId = setTimeout(() => {
                timedOut = true;
                // The server already answered the upgrade: report that answer (from
                // what was read so far) instead of a bare timeout.
                if (settleUpgrade) {
                    settleUpgrade();
                    return;
                }
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
                    // Set once the server answered the upgrade with an HTTP status: from
                    // then on the attempt settles from that answer only, and every native
                    // error/close of this socket is dropped (`ws` emits them after
                    // terminate(), Bun's built-in `ws` a close 1002 of its own).
                    let upgradeHeld = false;
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
                            // Another connection took this one's place on purpose (a Bot's voice
                            // has one controller). Reconnecting would take it back, and two
                            // clients that both reconnect trade it forever: final, whatever
                            // reconnectOnNormalClose says. Not after the caller's own disconnect();
                            // read before onDisconnect runs, which may call disconnect() itself.
                            const takenOver = code === 1000 && reason === "taken over" && this.shouldReconnect;
                            this.emitEvent("disconnect", code, reason);
                            if (takenOver)
                                this.emitEvent("__taken_over", reason);
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
                                || takenOver || finalError !== undefined;
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
                            else {
                                if (this._reconnecting) {
                                    // A reconnect attempt that will not be followed by another.
                                    this._reconnecting = false;
                                    if (this.shouldReconnect && this.options.reconnect)
                                        this.emitEvent("reconnect_failed");
                                }
                                // No socket follows this one: frames() ends.
                                this.endFrames();
                            }
                        });
                    };
                    this.ws.onclose = (event) => {
                        if (upgradeHeld)
                            return;
                        finishClose(event.code, event.reason);
                    };
                    this.ws.onerror = (event) => {
                        // Noise from a socket the liveness check already gave up on, or
                        // from one whose refused upgrade settles the attempt itself.
                        if (closeHandled || upgradeHeld)
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
                    // A refused upgrade on the `ws` transport (the npm package or Bun's
                    // built-in one). With this listener `ws` neither aborts the request
                    // nor emits error/close, so the client reads the answer, tears the
                    // socket down and reports once: error event, rejection, disconnect
                    // 1006, exactly what the native events gave before.
                    const emitter = socket;
                    if (!this._lastSocketGlobal && typeof emitter.on === "function") {
                        emitter.on("unexpected-response", (_request, response) => {
                            const res = (response ?? {});
                            // Before anything else: no native event of this socket counts now.
                            upgradeHeld = true;
                            const tearDown = () => {
                                try {
                                    res.destroy?.();
                                }
                                catch { /* already gone */ }
                                try {
                                    emitter.terminate?.();
                                }
                                catch { /* already closed */ }
                            };
                            if (closeHandled) {
                                tearDown();
                                return;
                            }
                            const status = typeof res.statusCode === "number" ? res.statusCode : 0;
                            const chunks = [];
                            let size = 0;
                            let complete = false;
                            let truncated = false;
                            let settled = false;
                            let bodyTimer = null;
                            const settle = () => {
                                if (settled)
                                    return;
                                settled = true;
                                settleUpgrade = null;
                                if (this._upgradeReadAbort === settle)
                                    this._upgradeReadAbort = null;
                                if (bodyTimer)
                                    clearTimeout(bodyTimer);
                                tearDown();
                                // Replaced by a newer connect(): that one owns the client. This
                                // attempt ends silently, its own promise rejected without an event.
                                if (superseded() && this._retiredByDisconnect !== attempt) {
                                    closeHandled = true;
                                    abandoned();
                                    return;
                                }
                                let body;
                                if (complete && !truncated) {
                                    const all = new Uint8Array(size);
                                    let at = 0;
                                    for (const chunk of chunks) {
                                        all.set(chunk, at);
                                        at += chunk.length;
                                    }
                                    body = new TextDecoder().decode(all);
                                }
                                const error = upgradeResponseError(status, res.headers ?? {}, body);
                                if (error.name === "WebSocketUpgradeRefusedError")
                                    finalError = error;
                                clearTimeout(timeoutId);
                                this.emitEvent("error", error);
                                // A no-op when the connect timeout already answered.
                                reject(error);
                                finishClose(1006, "");
                            };
                            if (superseded() || timedOut) {
                                // Nothing will read this answer: settle without its body.
                                settle();
                                return;
                            }
                            settleUpgrade = settle;
                            this._upgradeReadAbort = settle;
                            const left = deadlineAt - Date.now();
                            // Past the connect deadline the connect timer settles the read.
                            if (left > UPGRADE_BODY_DEADLINE_MS)
                                bodyTimer = setTimeout(settle, UPGRADE_BODY_DEADLINE_MS);
                            if (typeof res.on !== "function") {
                                settle();
                                return;
                            }
                            res.on("data", (data) => {
                                if (settled)
                                    return;
                                const chunk = typeof data === "string" ? new TextEncoder().encode(data)
                                    : data instanceof Uint8Array ? data
                                        : data instanceof ArrayBuffer ? new Uint8Array(data)
                                            : new Uint8Array(0);
                                if (size + chunk.length > UPGRADE_BODY_CAP) {
                                    truncated = true;
                                    settle();
                                    return;
                                }
                                chunks.push(chunk);
                                size += chunk.length;
                            });
                            res.on("end", () => {
                                // Bun's built-in `ws` ends the response with whatever had arrived
                                // with the status line, so an end is a whole body only when it
                                // matches a declared length.
                                const declared = Number((res.headers ?? {})["content-length"]);
                                if (!settled)
                                    complete = !(Number.isInteger(declared) && declared >= 0) || declared === size;
                                settle();
                            });
                            for (const event of ["error", "aborted", "close"])
                                res.on(event, () => settle());
                        });
                    }
                }
                catch (error) {
                    clearTimeout(timeoutId);
                    if (isRetry) {
                        // No socket was created, so no close event follows: report the
                        // failure and end the series instead of leaving it silently stuck.
                        this.emitEvent("error", error instanceof Error ? error : new Error(String(error)));
                        this._reconnecting = false;
                        this.emitEvent("reconnect_failed");
                        this.endFrames();
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
        this._lastSocketGlobal = false;
        // socketTransport "ws": the `ws` package or nothing for the automatic
        // choice below. An injected factory or webSocketImpl still wins. Checked
        // before any socket exists, so an invalid value opens nothing.
        const forceWs = this.options.socketTransport === "ws";
        if (this.options.socketTransport !== undefined && this.options.socketTransport !== "auto" && !forceWs) {
            throw new Error(`socketTransport must be "auto" or "ws", got ${JSON.stringify(this.options.socketTransport)}`);
        }
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
        const impl = AgentSessionsConnectWebSocket.webSocketImpl;
        if (typeof impl === "function") {
            // The injected constructor takes only a URL and protocols: a header credential the call
            // asked for cannot reach the upgrade on any runtime, so refuse it as a browser socket does.
            if (this.options.requireHeaderCredentials && this.options.requireHeaderCredentials.length > 0 && this.options.headers) {
                const wanted = this.options.requireHeaderCredentials.map((name) => name.toLowerCase());
                const refused = Object.keys(this.options.headers).filter((name) => wanted.includes(name.toLowerCase()));
                if (refused.length > 0)
                    throw credentialNotSentError(refused);
            }
            return new impl(connectUrl, this.options.protocols);
        }
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
        if (forceWs && isBrowserRuntime) {
            throw new Error("socketTransport \"ws\" is not available in a browser, which only has the global WebSocket");
        }
        if (typeof globalCtor === "function" && !builtinUnsafe && !forceWs && (isBrowserRuntime || (!hasHeaders && !isNode))) {
            if (isBrowserRuntime && hasHeaders) {
                // A browser WebSocket cannot send headers, so kitAuth password, jwt
                // and identity headers never reach the upgrade. The proxy accepts two
                // header-free forms: a token group read from a query parameter, or a
                // cookie on the kit host. Say so once instead of failing silently.
                const dropped = Object.keys(this.options.headers).filter((name) => /^(authorization|cookie|x-hoody-[\w-]+|proxy-authorization)$/i.test(name));
                if (this.options.requireHeaderCredentials && this.options.requireHeaderCredentials.length > 0) {
                    const wanted = this.options.requireHeaderCredentials.map((name) => name.toLowerCase());
                    const refused = Object.keys(this.options.headers).filter((name) => wanted.includes(name.toLowerCase()));
                    if (refused.length > 0)
                        throw credentialNotSentError(refused);
                }
                const flags = globalThis;
                if (dropped.length > 0 && !flags.__hoodyWsHeaderWarned) {
                    flags.__hoodyWsHeaderWarned = true;
                    console.warn(`[hoody-sdk] a browser WebSocket cannot send headers; ${dropped.join(", ")} not sent on the upgrade. Use a proxy token group read from a query parameter, or a cookie on the kit host.`);
                }
            }
            this._lastSocketGlobal = true;
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
            if (forceWs)
                throw Object.assign(new Error("socketTransport \"ws\": the `ws` package could not be loaded (" + (cause instanceof Error ? cause.message : String(cause)) + ")"), { cause });
            // `ws` not installed — fall back to global WS, losing headers. This is
            // the same degraded path as when the module exists but has no default.
            if (typeof globalCtor === "function") {
                this._lastSocketGlobal = true;
                return new globalCtor(connectUrl, this.options.protocols);
            }
            throw new Error("WebSocket implementation unavailable in this runtime");
        }
        if (typeof wsModule.default !== "function") {
            if (builtinUnsafe)
                throw builtinRefused(new Error("the module has no WebSocket constructor export"));
            if (forceWs)
                throw new Error("socketTransport \"ws\": the `ws` module has no WebSocket constructor export");
            if (typeof globalCtor === "function") {
                this._lastSocketGlobal = true;
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
    isAutoReconnect() {
        return this.options.reconnect !== false;
    }
    /**
     * Disconnect from server
     */
    disconnect(reason) {
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        // Retire an open attempt still waiting for its URL or its socket. Only the
        // attempt current at the first disconnect() is the one it retired.
        if (this._retiredByDisconnect === 0)
            this._retiredByDisconnect = this._openAttempt;
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
        // A refused upgrade still being read reports now; nothing follows it.
        const read = this._upgradeReadAbort;
        this._upgradeReadAbort = null;
        read?.();
        // The caller closed it: frames() ends after what is already buffered.
        this.endFrames();
    }
    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= (this.options.reconnectAttempts ?? Infinity)) {
            this._reconnecting = false;
            this.emitEvent("reconnect_failed");
            this.endFrames();
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
            this.endFrames();
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
    /** The per-type dispatch. */
    dispatchTypedMessage(messageType, message) {
        if (messageType === "error") {
            // "error" is also the key of onError's listeners: they get the frame as an
            // Error, as their type says, and never the bare frame.
            this.emitEvent("error", serverFrameError(message));
            return;
        }
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
    /** End frames() without an end frame: the socket is gone and none follows. */
    endFrames() {
        this._streamEnded = true;
        for (const resolveWaiter of this._frameWaiters.splice(0, this._frameWaiters.length)) {
            resolveWaiter({ value: undefined, done: true });
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
     * Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_computer?, reason?, remember?, superseded?}. trust_computer (with approved) accepts the event.confirm_request exec_trust offer, as on /api/v1/agent/sessions/{id}/confirm. reason, remember and superseded are as on /api/v1/agent/sessions/{id}/confirm: reason (with approved false, at most 500 characters) reaches the agent in the refused call's result; remember false approves this call only; superseded (with approved false, no reason, no session_scope) declines because the user sent a new message instead, and the agent does not read it as a refusal. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload; the payload's own gate_id is the agent's own number, a different id), and is published as pending_gate.id on GET /api/v1/agent/sessions/{id} and /api/v1/agent/sessions/{id}/replay and as pending_gate_ref.id on GET /api/v1/agent/sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code. That covers a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward) and a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack` when it carries the same answer (another answer is a `refused` frame, gate_already_answered). | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /api/v1/agent/sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}.
     * @param fields Message parameters
     */
    unknown(fields) {
        this.send({
            ...fields,
            type: "unknown",
        });
    }
    /**
     * Provider account rotated mid-turn. | Turn complete: it ends a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}]. Notices are advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy, agent_compacts_itself when a Claude Code session's agent decides on its own when to compact its conversation, history_unsaved when a Claude Code session answered from a conversation Hoody could not save, spend_cap_warning when the session's spend file sets action warn and the turn ran over a spend cap (detail session_cap or turn_cap; one notice per cap) (open set). A turn a spend cap stopped fails with error_code spend_cap. | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed: login, token adopt, or logout (global broadcast; mirrors GET /api/v1/agent/hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | Commands sent with POST /api/v1/agent/sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. | Commands sent with POST /api/v1/agent/sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. | A waiter this session owns (POST /api/v1/agent/sessions/{id}/waiters) ended: an outcome was found, or it timed out, was cancelled, or its target closed. Carries the waiter. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?}. A client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (not fatal, not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /api/v1/agent/sessions/{id}/jev/decide; the standalone /api/v1/agent/jev routes report usage only in their reply and in GET /api/v1/agent/jev/settings. | Token usage of a turn that already ended, counted after its completion events went out (a Claude Code agent reported it after the turn closed). Add it to the session's lifetime totals only: it is not a response, and it belongs to no turn in progress, so it changes no turn's usage, timing or context use. turn_id names the ended turn. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | The agent was paused or resumed (PUT /api/v1/agent/pause, or the TUI's pause): sent to every attached session, since the pause covers every session of the agent. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | The agent is shutting down. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound computer (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal: the active turn's earlier output is elided (connection-local frame). | A model call is retried: attempt of max_retries, after wait_secs, with the cause in reason. With attempt 0 and max_retries 0 it is a one-off notice instead, its whole text in reason, to show as a status line and not as a retry: a Claude Code session reconnecting, a previous Claude Code conversation that could not be resumed (a new one was started), a fork or trim whose Claude Code conversation starts fresh with the history passed in as text, or the model an auto-reply round uses on a Claude Code session. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed. Clients re-list. | Session title set or cleared by a person, or generated by the agent (name_auto true). | Session attached. Its data is the same `started` object POST /api/v1/agent/sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /api/v1/agent/sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | The result of one trim, naming the request id the trim carried: done, refused (turn_in_flight, delegated_session or session_closed; nothing changed), failed (nothing was trimmed) or outcome_unknown (the trim may have been saved; the session sends nothing until it can save its state). Never an error event: another client's trim does not fail this client's turn. | A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Control frame: the stream is terminating because the session closed. Carries {reason}. | Control frame, connection-local: the WS command this client just sent was REJECTED and was not applied. It is the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode; the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the event payload's number instead of the envelope's string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_computer, remember?, superseded?} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet: another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: bad_request (the frame carries no answer, text or answers, an empty answer never resolves a question; or a workflow question with options gets an answer that names none of them, and stays parked), gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the answer was not acknowledged within the wait; it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, with the same answer, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload}. A retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame.
     * @param callback Function to call when unknown message received
     * @returns Unsubscribe function
     */
    onUnknown(callback) {
        return this.addEventListener("unknown", callback);
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
    onTakenOver(callback) {
        return this.addEventListener("__taken_over", callback);
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
    getReadyState() {
        return this.ws?.readyState ?? RAW_WEBSOCKET_CLOSED;
    }
    getUrl() {
        return this._url;
    }
    /**
     * The socket of the current connection, or null when there is none. It is
     * replaced on every reconnect, so read it again after each `connect`
     * event instead of keeping it. For code that needs what the transport
     * offers beyond this client (the `ws` package: ping(), the ping and pong
     * events); do not assign its on* handlers, the client owns them.
     */
    getRawSocket() {
        return this.ws;
    }
    isConnected() {
        return this.ws?.readyState === RAW_WEBSOCKET_OPEN;
    }
    isReconnecting() {
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
            // break / return(): a next() still pending ends too.
            return: () => {
                for (const resolveWaiter of this._frameWaiters.splice(0, this._frameWaiters.length)) {
                    resolveWaiter({ value: undefined, done: true });
                }
                return Promise.resolve({ value: undefined, done: true });
            },
        };
        return iterator;
    }
    getCursor() {
        return this._cursor;
    }
    getIncarnation() {
        return this._incarnation;
    }
    setCursor(seq, incarnation) {
        this._cursor = seq;
        if (incarnation !== undefined) {
            this._incarnation = incarnation;
        }
    }
}
/** A retired getter refuses, naming the method that replaced it. Not an alias. */
function retireAccessors(target, owner, renames) {
    for (const [retired, current] of Object.entries(renames)) {
        Object.defineProperty(target, retired, {
            configurable: true,
            enumerable: false,
            get() {
                throw new TypeError(owner + '.' + retired + ' was renamed to ' + current + '. Call ' + current + ' instead.');
            },
        });
    }
}
retireAccessors(AgentSessionsConnectWebSocket.prototype, 'AgentSessionsConnectWebSocket', { url: 'getUrl()', connected: 'isConnected()', cursor: 'getCursor()', readyState: 'getReadyState()', reconnecting: 'isReconnecting()', autoReconnect: 'isAutoReconnect()', rawSocket: 'getRawSocket()', incarnation: 'getIncarnation()' });
