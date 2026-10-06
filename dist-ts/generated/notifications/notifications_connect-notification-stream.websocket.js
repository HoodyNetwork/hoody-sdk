/**
 * WebSocket client for Real-time notification stream (WebSocket or SSE)
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Notification Stream v1.0.0
 */
const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;
export class NotificationsConnectNotificationStreamWebSocket {
    ws = null;
    eventHandlers = new Map();
    options;
    _url;
    reconnectAttempts = 0;
    reconnectTimer = null;
    _reconnecting = false;
    shouldReconnect = true;
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
     * Establish WebSocket connection
     */
    async connect(options) {
        if (options) {
            // MERGE, never replace. A shallow spread overwrote the whole header
            // map, so connect({ headers: { Authorization } }) silently dropped
            // every header the constructor set (claim headers, realm pin,
            // user-agent) and the socket opened unauthenticated-looking. Same
            // for query and auth: a caller adding one key keeps the rest.
            this.options = {
                ...this.options,
                ...options,
                ...(options.headers ? { headers: { ...(this.options.headers ?? {}), ...options.headers } } : {}),
                ...(options.query ? { query: { ...(this.options.query ?? {}), ...options.query } } : {}),
                ...(options.auth ? { auth: { ...(this.options.auth ?? {}), ...options.auth } } : {}),
            };
            // A resume point passed here seeds the cursor, like one given to the constructor.
            this.takeResumeSeed();
        }
        this.shouldReconnect = true;
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
                this.ws?.close();
            }, this.options.timeout);
            void (async () => {
                try {
                    this.ws = await this.createRawSocket();
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
                        this.reconnectAttempts = 0;
                        this._reconnecting = false;
                        // The one-shot incarnation reached an open socket; reconnects use the live one.
                        this._firstIncarnation = undefined;
                        this.clearReconnectTimer();
                        this.emitEvent("connect");
                        resolve();
                    };
                    this.ws.onmessage = (event) => {
                        const raw = event.data;
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
                    this.ws.onclose = (event) => {
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
                            this.emitEvent("disconnect", event.code, event.reason);
                            // Close-code filter. Do NOT reconnect on server-sent policy
                            // closes — 4xxx codes mean "stop trying" (auth failed, permission
                            // denied, bad request), and 1008/1003 are explicit policy rejections.
                            // Reconnecting against these would loop forever against a server that
                            // already told us to go away.
                            const isTerminal = event.code === 1008 || event.code === 1003 || event.code === 1002 || (event.code >= 4000 && event.code < 5000);
                            if (this.shouldReconnect && this.options.reconnect && !isTerminal) {
                                this.scheduleReconnect();
                            }
                        });
                    };
                    this.ws.onerror = () => {
                        clearTimeout(timeoutId);
                        const error = new Error("WebSocket connection error");
                        this.emitEvent("error", error);
                        reject(error);
                    };
                }
                catch (error) {
                    clearTimeout(timeoutId);
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
        // Runtime detection: on Node >=22 `globalThis.WebSocket` exists but cannot
        // accept custom headers. When the caller supplied `options.headers`, prefer
        // the `ws` module (which accepts a 3rd-arg options bag) so headers actually
        // reach the server. In a true browser environment the `ws` import is unavailable
        // and `globalThis.WebSocket` is the only option.
        const hasHeaders = this.options.headers && Object.keys(this.options.headers).length > 0;
        const isBrowserRuntime = typeof globalThis.window !== "undefined"
            && typeof globalThis.document !== "undefined";
        const globalCtor = globalThis.WebSocket;
        if (typeof globalCtor === "function" && (isBrowserRuntime || !hasHeaders)) {
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
        catch {
            // `ws` not installed — fall back to global WS, losing headers. This is
            // the same degraded path as when the module exists but has no default.
            if (typeof globalCtor === "function") {
                return new globalCtor(connectUrl, this.options.protocols);
            }
            throw new Error("WebSocket implementation unavailable in this runtime");
        }
        if (typeof wsModule.default !== "function") {
            if (typeof globalCtor === "function") {
                return new globalCtor(connectUrl, this.options.protocols);
            }
            throw new Error("WebSocket implementation unavailable in this runtime");
        }
        // Node `ws` supports `headers` via a 3rd arg; surface caller headers there.
        const wsOptions = {};
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
            this.emitEvent("reconnect_attempt", this.reconnectAttempts);
            this.connect().then(() => {
                this.emitEvent("reconnect", this.reconnectAttempts);
            }).catch(() => {
                // Error already emitted, will retry
            });
        }, randomizedDelay);
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
     * @param displays Message parameters
     */
    subscribe(displays) {
        this.send({
            type: "subscribe",
            displays,
        });
    }
    /**
     * @param displays Message parameters
     */
    unsubscribe(displays) {
        this.send({
            type: "unsubscribe",
            displays,
        });
    }
    /**
     * @param callback Function to call when notification message received
     * @returns Unsubscribe function
     */
    onNotification(callback) {
        return this.addEventListener("notification", callback);
    }
    /**
     * @param callback Function to call when heartbeat message received
     * @returns Unsubscribe function
     */
    onHeartbeat(callback) {
        return this.addEventListener("heartbeat", callback);
    }
    /**
     * @param callback Function to call when connected message received
     * @returns Unsubscribe function
     */
    onConnected(callback) {
        return this.addEventListener("connected", callback);
    }
    /**
     * @param callback Function to call when subscribed message received
     * @returns Unsubscribe function
     */
    onSubscribed(callback) {
        return this.addEventListener("subscribed", callback);
    }
    /**
     * @param callback Function to call when resync message received
     * @returns Unsubscribe function
     */
    onResync(callback) {
        return this.addEventListener("resync", callback);
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
