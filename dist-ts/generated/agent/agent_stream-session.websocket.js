/**
 * WebSocket client for Attach to a session's event stream (WebSocket / SSE).
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */
const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;
export class AgentStreamSessionWebSocket {
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
     * Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}.
     */
    unknown() {
        this.send({
            type: "unknown",
        });
    }
    /**
     * Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame.
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
