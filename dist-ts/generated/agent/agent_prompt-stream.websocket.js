/**
 * WebSocket client for Dispatch a turn and stream the response.
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */
const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;
export class AgentPromptStreamWebSocket {
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
    // Generation counter. Bumped synchronously in connect()/reconnect()/
    // disconnect() so queued tasks tagged with an old generation become
    // no-ops if the socket has been swapped out — prevents stale-Blob
    // microtasks from dispatching into a new socket\u2019s handlers.
    _socketGen = 0;
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
        if (this.options.autoConnect) {
            void this.connect().catch((error) => {
                const connectionError = error instanceof Error ? error : new Error(String(error));
                this.emitEvent("error", connectionError);
            });
        }
    }
    /**
     * Establish WebSocket connection
     */
    async connect(options) {
        if (options) {
            this.options = { ...this.options, ...options };
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
                        this.clearReconnectTimer();
                        this.emitEvent("connect");
                        resolve();
                    };
                    this.ws.onmessage = (event) => {
                        const raw = event.data;
                        // Synchronous string fast path.
                        if (typeof raw === "string") {
                            this._frameQueue = this._frameQueue.then(() => {
                                if (this._socketGen === installedGen)
                                    this.handleString(raw);
                            });
                            return;
                        }
                        // ArrayBuffer (preferred binary shape).
                        if (raw instanceof ArrayBuffer) {
                            const buf = new Uint8Array(raw);
                            this._frameQueue = this._frameQueue.then(() => {
                                if (this._socketGen === installedGen)
                                    this.handleBinary(buf);
                            });
                            return;
                        }
                        // ArrayBufferView covers Node Buffer + Uint8Array w/ non-zero offset.
                        if (raw && typeof raw.byteLength === "number"
                            && typeof raw.buffer !== "undefined") {
                            const v = raw;
                            const buf = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
                            this._frameQueue = this._frameQueue.then(() => {
                                if (this._socketGen === installedGen)
                                    this.handleBinary(buf);
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
                                    if (this._socketGen === installedGen) {
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
                            if (this._socketGen === installedGen)
                                this.handleString(String(raw));
                        });
                    };
                    this.ws.onclose = (event) => {
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
     * Disconnect from server
     */
    disconnect(reason) {
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        // Bump generation synchronously. Any in-flight queued task
        // (especially Blob arrayBuffer() microtasks) will see the bump
        // and bail via the installedGen check.
        this._socketGen++;
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
     * Default behaviour: JSON.parse + dispatch on `message.type`.
     */
    handleString(data) {
        try {
            const message = JSON.parse(data);
            const messageType = message.type;
            // Call registered handlers for this message type
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
        catch (error) {
            console.error("Failed to parse WebSocket message:", error);
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
     * Provider account rotated mid-turn. | Turn complete — terminates a session.input turn. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors hoody.auth_status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | Context window compacted. | Context compaction started. | Tool/plan confirmation requested (parks a gate). | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | Fusion member trajectory progress (emitIfVisible). | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | Daemon-global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client (session.close_all). | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached (server-constructed SessionEvent). | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | Echo of the user's input. | Question posed to the user (parks a gate). | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done (emitIfVisible). | Workflow step output (emitIfVisible). | Workflow step start (emitIfVisible). | Workflow-authoring tool availability changed mid-session (setTools flip). | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring. Carries {code: lagged|replay_gap[, min_seq, max_seq, resume]}; reconcile by reconnecting with ?since=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq}. | Gateway control frame: the stream is terminating because the session closed. Carries {reason}.
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
}
