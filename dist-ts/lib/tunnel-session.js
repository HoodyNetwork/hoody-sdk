/**
 * Tunnel WebSocket session client. Handles HELLO handshake, BIND,
 * stream dispatch, v2 multi-WS, v3 frame batching, and protocol flow
 * control (per-session + per-stream CreditGate).
 */
import { FrameType, HEADER_SIZE, } from "./tunnel-protocol-types.js";
import { encodeFrame, decodeFrames, MAX_MESSAGE_SIZE, MAX_FRAMES_PER_MESSAGE, } from "./tunnel-protocol-codec.js";
import { CreditGate } from "./tunnel-credit-gate.js";
import { kitAuthForNamespace, kitAuthWebSocketParts, openWebSocketWithHeaders, builtinWebSocketProhibited, } from "./kit-ws-auth.js";
/**
 * Give a socket a permanent no-op 'error' listener the moment it exists.
 *
 * The `ws` package (used when kitAuth needs upgrade headers) is an
 * EventEmitter: closing a CONNECTING socket emits "WebSocket was closed before
 * the connection was established" as 'error' on the next tick, and an 'error'
 * with no listener is an uncaught exception. Sockets abandoned by close() or a
 * superseding connect() — sometimes before any `onerror` was assigned — used
 * to crash Node that way. The session's own `onerror` handlers still run; this
 * listener only guarantees one always exists. Harmless on a DOM WebSocket.
 */
function guardSocketErrors(ws) {
    try {
        ws.addEventListener("error", () => { });
    }
    catch { /* no EventTarget API: nothing to guard */ }
    return ws;
}
/**
 * A tunnel session failure with a stable `code`:
 *  - `SESSION_LIMIT`: the kit already holds its maximum number of sessions.
 *  - `RESUME_EXPIRED`: the session to resume is no longer parked by the kit.
 *  - `REFUSED`: the kit refused the handshake for another stated reason.
 *  - `CLOSED_BEFORE_HELLO`: the socket closed with no HELLO_OK and no reason.
 */
export class TunnelSessionError extends Error {
    code;
    /** WebSocket close code, when the refusal came as (or with) a close. */
    closeCode;
    constructor(code, message, closeCode) {
        super(message);
        this.name = "TunnelSessionError";
        this.code = code;
        if (closeCode !== undefined)
            this.closeCode = closeCode;
    }
}
/** RESOURCE_EXHAUSTED: the reset code the kit's GOAWAY carries for a full session cap. */
const GOAWAY_RESOURCE_EXHAUSTED = 0x000e;
/** How long close() waits for the kit to confirm its UNBINDs before closing anyway. */
const UNBIND_ON_CLOSE_TIMEOUT_MS = 2_000;
/** The error for a kit GOAWAY (and/or close) that refuses the handshake. */
function handshakeRefusal(goaway, closeCode, closeReason, resuming) {
    const message = typeof goaway?.message === "string" && goaway.message ? goaway.message : (closeReason || "");
    const hint = "list the open sessions with tunnel.sessions.list() and close one, or wait for it to end";
    if (goaway?.code === GOAWAY_RESOURCE_EXHAUSTED || (closeCode === 1013 && /session limit/i.test(message))) {
        return new TunnelSessionError("SESSION_LIMIT", `tunnel: ${message || "tunnel session limit reached"} (${hint})`, closeCode);
    }
    if (/resume (grace )?expired/i.test(message) || (resuming && closeCode === 1008)) {
        return new TunnelSessionError("RESUME_EXPIRED", `tunnel: ${message || "resume expired"}: the kit no longer holds that session`, closeCode);
    }
    if (message)
        return new TunnelSessionError("REFUSED", `tunnel: the kit refused the session: ${message}`, closeCode);
    // No GOAWAY and no close reason. A kit that predates the named refusal closes this way
    // when its session cap is full, so say so instead of leaving a bare "closed".
    return new TunnelSessionError("CLOSED_BEFORE_HELLO", `tunnel: the WebSocket closed before HELLO_OK${closeCode !== undefined ? ` (code ${closeCode})` : ""}. `
        + `If other tunnel sessions are open on this container, its session limit may be reached: ${hint}.`, closeCode);
}
/**
 * Tunnel session client.
 * Connects to the kit via WebSocket, performs HELLO handshake,
 * and handles BIND + stream dispatch with protocol flow control.
 */
export class TunnelSession {
    options;
    /** Primary WebSocket — always index 0. Session-scoped frames travel here. */
    ws = null;
    /** All WebSockets (primary at 0, secondaries at 1..M-1). v1 sessions: len=1. */
    wsAll = [];
    /** Per-stream WS pin: stream_id → ws that delivered STREAM_OPEN. */
    streamWs = new Map();
    /** v3 per-WS batching buffers. Frames enqueued in the same microtask are
     * concatenated into one WS message on the next microtask tick. */
    wsBatch = new Map();
    sessionId = "";
    lastHello = null;
    nextBindRef = 1;
    bindPromises = new Map();
    /** Drain all pending bind() promises with an error. Used when we
     *  receive a malformed BIND_OK/BIND_ERR so callers don't hang forever. */
    rejectAllBindPromises(err) {
        for (const p of this.bindPromises.values()) {
            try {
                p.reject(err);
            }
            catch { }
        }
        this.bindPromises.clear();
    }
    streamHandlers = new Map();
    connected = false;
    /** Session-level outbound credit. Sized from `hello.sessionWindow`.
     *  Consumed before sendData enqueues; replenished when peer sends
     *  WINDOW(0, n). */
    sessionCredit = null;
    /** Per-stream outbound credit. Key = streamId. Sized from
     *  `hello.streamWindow` on first send to the stream. Replenished when
     *  peer sends WINDOW(streamId, n). Closed on EOF / RESET / session-close. */
    streamCredit = new Map();
    /** Cached initial windows from HELLO_OK, used to lazily create per-stream
     *  gates when the SDK first sends to a stream. */
    initialStreamWindow = 1_048_576;
    initialSessionWindow = 16_777_216;
    /** Tombstone set of stream IDs that have been explicitly closed via
     *  RESET (full close) or secondary-WS drop. sendData rejects sends
     *  targeting a closed stream even if the CreditGate has been
     *  garbage-collected from streamCredit. Bounded LRU to cap memory on
     *  long-lived sessions: oldest entry evicted once size > maxClosedStreams.
     *  Stale eviction is safe because peer-side stream IDs are monotonically
     *  increasing — a freshly-allocated ID is never reused, so a wrongly
     *  evicted "still-closed" tombstone can't cause us to send to a stream
     *  that's actually live. */
    closedStreams = new Set();
    static maxClosedStreams = 4096;
    /** In-flight connect: reference to the not-yet-HELLO_OK primary WS so
     *  close() can tear it down even before `this.ws` is populated. */
    connectingWs = null;
    /** In-flight connect reject callback so close() can cancel a pending connect. */
    connectReject = null;
    /** In-flight v2 secondary WSes (pre-JOIN_OK). close() must close these so
     *  `Promise.all(openSecondary)` in connect() can reject rather than hang. */
    pendingSecondaries = new Set();
    /** Monotonic generation counter bumped on every connect() supersede and
     *  on close(). Each in-flight connect captures its generation in a
     *  closure; handlers (HELLO_OK, JOIN_OK, Promise.all catch) check the
     *  live counter before touching shared state so a late message from a
     *  superseded socket cannot clobber the new session's `this.ws`,
     *  `sessionId`, or `wsAll`. Mirrors upstream's `connectEpoch`. */
    connectGeneration = 0;
    /** External close listeners — fired once from `close()` so consumers
     *  (e.g. the upgrade forwarder that owns an upstream TCP socket) can tear
     *  down resources tied to the session lifecycle rather than per-stream
     *  EOF frames, which never fire on an abrupt WS drop. */
    closeListeners = new Set();
    /** Set when the session ends (drop, kit end, close()); cleared by the next connect(). */
    endedInfo = null;
    /** Binds this session holds on the kit: BIND_OK and resumed binds, minus confirmed UNBINDs. */
    liveBinds = new Set();
    /** Resolves the UNBIND wait of an in-progress close(); null when none is waiting. */
    unbindSettled = null;
    /** The in-progress close(), so concurrent calls share one teardown. */
    closing = null;
    /** The kit's last GOAWAY message on this connection, for the close reason. */
    goawayReason = null;
    /** Set by setInboundRouter(). Configuration, not session state: connect()
     *  and close() keep it. */
    inboundRouter = null;
    constructor(options) {
        this.options = options;
    }
    /**
     * Route every frame received after HELLO_OK / JOIN_OK, on every socket of
     * this session, through `router` instead of the default dispatcher.
     *
     * Set it before connect() when the kit may open a stream as soon as HELLO_OK
     * is out, as it does for a resumed session's binds: HELLO_OK and that
     * STREAM_OPEN can arrive in one read, and both are handled before the code
     * after `await connect()` runs, so a router installed there drops the request.
     */
    setInboundRouter(router) {
        this.inboundRouter = router;
    }
    routeInbound(frame, ws) {
        if (this.inboundRouter)
            this.inboundRouter(frame, ws);
        else
            this.handleFrame(frame, ws);
    }
    /** Register a listener fired exactly once on session close. Returns an
     *  unsubscribe function. Use for resources whose lifecycle is tied to the
     *  session itself (e.g. an upgrade socket forwarded through a stream that
     *  may never receive an EOF frame if the peer aborts). The listener is
     *  told why: `info.deliberate` is false for a drop or a kit-side end. */
    /**
     * Why this session ended, or null while it has not (never connected, or
     * connected and up). `onClose` listeners registered after the end are never
     * called: read this first when attaching to a session someone else opened.
     */
    get closeInfo() {
        return this.endedInfo;
    }
    onClose(fn) {
        this.closeListeners.add(fn);
        return () => { this.closeListeners.delete(fn); };
    }
    /** Session id assigned by the kit in HELLO_OK. Available after `connect()` resolves. */
    get id() {
        return this.sessionId;
    }
    /** Full HELLO_OK result including `resumed` and `resumedBinds`. Null before connect(). */
    get hello() {
        return this.lastHello;
    }
    /** Open one tunnel WebSocket with the kit credential on its upgrade. */
    //  Synchronous when no upgrade header is needed (no kitAuth, or a browser,
    //  where the credential rides the URL) so the socket exists the moment
    //  connect() returns its promise, as it always has; async only when the
    //  `ws` package must be loaded to carry headers.
    openSocket(subprotocol) {
        const parts = kitAuthWebSocketParts(this.options.url, kitAuthForNamespace(this.options.kitAuth, "tunnel"), "tunnel");
        // The synchronous path constructs the runtime's own WebSocket, so it is
        // taken only where that is allowed: on a Node whose built-in is prohibited
        // (kit-ws-auth) the socket comes from `ws`, through the async path below.
        if (Object.keys(parts.headers).length === 0 && !builtinWebSocketProhibited()) {
            const ws = new WebSocket(parts.url, subprotocol);
            ws.binaryType = "arraybuffer";
            return guardSocketErrors(ws);
        }
        return openWebSocketWithHeaders(parts.url, subprotocol, parts.headers, "tunnel").then((ws) => {
            ws.binaryType = "arraybuffer";
            return guardSocketErrors(ws);
        });
    }
    /** Resolve an openSocket() result; a supersede during the wait closes it. */
    async settleSocket(opened, myGeneration) {
        if (!(opened instanceof Promise))
            return opened;
        const ws = await opened;
        if (this.connectGeneration !== myGeneration) {
            try {
                ws.close();
            }
            catch { }
            throw new Error("session superseded");
        }
        return ws;
    }
    async connect() {
        const useV2 = (this.options.maxConnections ?? 1) > 1;
        const subprotocol = useV2 ? "hoody-tunnel.v2" : "hoody-tunnel.v1";
        const helloVersion = useV2 ? "hoody-tunnel.v2" : "hoody-tunnel.v1";
        // Full session-scoped reset so a superseding connect() (reconnect
        // without close() between) gets a clean slate. Prior session's
        // closedStreams tombstones, bindPromises, streamCredit gates, and
        // wsBatch entries would otherwise bleed into the new session and
        // silently reject valid new stream IDs.
        this.resetSessionState(new Error("session superseded"));
        // Capture this connect's generation. Any handler on the WS created
        // below must re-check `this.connectGeneration === myGeneration`
        // before mutating shared state — a supersede bumps the counter so
        // late HELLO_OK / JOIN_OK frames from a stale socket become no-ops.
        const myGeneration = this.connectGeneration;
        const opened = this.openSocket(subprotocol);
        const ws = opened instanceof Promise ? await this.settleSocket(opened, myGeneration) : opened;
        await new Promise((resolve, reject) => {
            // Track the in-progress WS so close() can tear it down before
            // HELLO_OK populates `this.ws`.
            this.connectingWs = ws;
            // Fail HELLO_OK wait after a timeout. Without this, a peer that
            // accepted the WebSocket but never replied to HELLO hangs connect()
            // forever. 30s is enough for any real network path.
            const HELLO_TIMEOUT_MS = 30_000;
            const helloTimeoutId = setTimeout(() => {
                if (this.connectGeneration !== myGeneration)
                    return;
                try {
                    ws.close();
                }
                catch { }
                reject(new Error(`HELLO_OK: timed out after ${HELLO_TIMEOUT_MS}ms`));
            }, HELLO_TIMEOUT_MS);
            const origResolve = resolve;
            const origReject = reject;
            resolve = (v) => { clearTimeout(helloTimeoutId); origResolve(v); };
            reject = (e) => { clearTimeout(helloTimeoutId); origReject(e); };
            this.connectReject = reject;
            let helloSent = false;
            ws.onopen = () => {
                helloSent = true;
                const helloPayload = {
                    version: helloVersion,
                    // No `auth` field: the kit ignores it, and the proxy authenticates
                    // the upgrade (kitAuth above). Never send the account token here.
                    capabilities: useV2 ? ["multi-ws"] : [],
                };
                if (this.options.resumeSessionId) {
                    helloPayload.resume = { sessionId: this.options.resumeSessionId };
                }
                if (useV2) {
                    helloPayload.maxConnections = this.options.maxConnections;
                }
                const payload = new TextEncoder().encode(JSON.stringify(helloPayload));
                const frame = {
                    header: { frameType: FrameType.Hello, streamId: 0, length: payload.length },
                    payload,
                };
                ws.send(encodeFrame(frame));
            };
            ws.onmessage = (event) => {
                // Generation guard: a superseding connect() has bumped the
                // counter and already rejected this promise. Dropping the
                // message (and closing the now-zombie WS) prevents a late
                // HELLO_OK from clobbering the new session's sessionId/ws/wsAll.
                if (this.connectGeneration !== myGeneration) {
                    try {
                        ws.close();
                    }
                    catch { }
                    return;
                }
                const data = new Uint8Array(event.data);
                let result;
                try {
                    result = decodeFrames(data);
                }
                catch {
                    return;
                }
                for (const frame of result.frames) {
                    if (!this.connected) {
                        if (frame.header.frameType === FrameType.Goaway) {
                            // The kit refuses the session and says why (a full session cap, an
                            // expired resume). Its close follows; the reason is in this frame.
                            let goaway = null;
                            try {
                                goaway = JSON.parse(new TextDecoder().decode(frame.payload));
                            }
                            catch { /* reason unknown */ }
                            reject(handshakeRefusal(goaway, undefined, undefined, !!this.options.resumeSessionId));
                            try {
                                ws.close();
                            }
                            catch { }
                            return;
                        }
                        if (frame.header.frameType === FrameType.HelloOk) {
                            let payload;
                            try {
                                payload = JSON.parse(new TextDecoder().decode(frame.payload));
                            }
                            catch (e) {
                                reject(new Error(`HELLO_OK: malformed JSON payload`));
                                try {
                                    ws.close();
                                }
                                catch { }
                                return;
                            }
                            if (!payload || typeof payload.sessionId !== 'string') {
                                reject(new Error(`HELLO_OK: missing sessionId`));
                                try {
                                    ws.close();
                                }
                                catch { }
                                return;
                            }
                            // Kit-advertised windows (bytes). Fall back to defaults if the
                            // kit omits them. Validate BEFORE creating the CreditGate AND
                            // BEFORE assigning `this.sessionId`: a misbehaving kit sending
                            // `0`/`NaN`/`Infinity`/negative would permanently deadlock
                            // outbound flow control (capacity never recovers), and a rejected
                            // HELLO_OK must not leave the instance carrying a stale sessionId
                            // that getters and future resume logic would expose.
                            const isPositiveFinite = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
                            const streamWindow = isPositiveFinite(payload.streamWindow)
                                ? payload.streamWindow : 1_048_576;
                            const sessionWindow = isPositiveFinite(payload.sessionWindow)
                                ? payload.sessionWindow : 16_777_216;
                            if (payload.streamWindow !== undefined && !isPositiveFinite(payload.streamWindow)) {
                                reject(new Error(`HELLO_OK: invalid streamWindow ${String(payload.streamWindow)} — must be a finite positive number`));
                                try {
                                    ws.close();
                                }
                                catch { }
                                return;
                            }
                            if (payload.sessionWindow !== undefined && !isPositiveFinite(payload.sessionWindow)) {
                                reject(new Error(`HELLO_OK: invalid sessionWindow ${String(payload.sessionWindow)} — must be a finite positive number`));
                                try {
                                    ws.close();
                                }
                                catch { }
                                return;
                            }
                            // Only now — post-validation — commit the sessionId.
                            this.sessionId = payload.sessionId;
                            this.initialStreamWindow = streamWindow;
                            this.initialSessionWindow = sessionWindow;
                            this.sessionCredit = new CreditGate(sessionWindow);
                            this.lastHello = {
                                sessionId: payload.sessionId,
                                resumed: !!payload.resumed,
                                resumedBinds: Array.isArray(payload.resumedBinds) ? payload.resumedBinds : [],
                                connectionsGranted: payload.connectionsGranted,
                                joinTickets: Array.isArray(payload.joinTickets) ? payload.joinTickets : [],
                                streamWindow,
                                sessionWindow,
                            };
                            this.liveBinds = new Set(this.lastHello.resumedBinds.map((b) => b.bindId).filter((id) => typeof id === "number"));
                            this.goawayReason = null;
                            this.connected = true;
                            this.ws = ws;
                            this.wsAll = [ws];
                            // Clear in-flight tracking now that the connect has succeeded.
                            this.connectingWs = null;
                            this.connectReject = null;
                            resolve(this.sessionId);
                        }
                        continue;
                    }
                    this.routeInbound(frame, ws);
                }
            };
            // An error before the socket opened is a failed connection. One after it opened
            // (the HELLO is out) and before HELLO_OK is the kit dropping the handshake: the
            // same refusal as a close with no reason, whichever event the runtime fires first.
            ws.onerror = () => reject(helloSent
                ? handshakeRefusal(null, undefined, undefined, !!this.options.resumeSessionId)
                : new Error("WebSocket error"));
            ws.onclose = (event) => {
                const closeCode = typeof event?.code === "number" ? event.code : undefined;
                const closeReason = typeof event?.reason === "string" ? event.reason : "";
                if (!this.connected) {
                    // No effect once connect() has settled (a GOAWAY, an error or a timeout came first).
                    reject(handshakeRefusal(null, closeCode === 1005 || closeCode === 1006 ? undefined : closeCode, closeReason, !!this.options.resumeSessionId));
                    return;
                }
                // Post-connect: only the CURRENT primary's onclose should mutate
                // session state. If the instance was closed and reconnected, `this.ws`
                // now points at a NEW primary — the OLD primary's late onclose must
                // no-op to avoid tearing down the new session's gates/bindPromises.
                if (this.ws !== ws) {
                    // Still clean up this socket's wsBatch entry (keyed on ws itself).
                    this.wsBatch.delete(ws);
                    return;
                }
                // Primary WS closed post-connect: tear down all credit gates so
                // pending sendData() rejects rather than hanging on a dead session.
                // Idempotent — close() handles re-entry.
                this.sessionCredit?.close(new Error("primary WebSocket closed"));
                for (const [, gate] of this.streamCredit) {
                    gate.close(new Error("primary WebSocket closed"));
                }
                this.streamCredit.clear();
                // Reject any in-flight bind() whose BIND_OK/BIND_ERR never arrived.
                // Without this, high-level callers (expose/pull/serve) hang forever
                // on a dead primary WS.
                for (const [, pending] of this.bindPromises) {
                    pending.reject(new Error("bind: primary WebSocket closed before BIND_OK"));
                }
                this.bindPromises.clear();
                // Drop pending wsBatch entry for the dead primary; the microtask
                // flush would silently no-op against the closed socket.
                this.wsBatch.delete(ws);
                // Fire external close listeners on primary-WS drop too. Consumers
                // like the upgrade forwarder that hold upstream TCP sockets need
                // notification on ANY path that renders the session dead, not just
                // explicit close(). Snapshot + drain so a reconnect attaches a fresh
                // set.
                this.liveBinds.clear();
                this.unbindSettled?.();
                const info = {
                    // A drop while close() waits for its UNBINDs is still the caller's close.
                    deliberate: this.closing !== null,
                    ...(closeCode !== undefined ? { code: closeCode } : {}),
                    reason: this.goawayReason
                        ? `the kit ended the session: ${this.goawayReason}`
                        : `connection lost${closeCode !== undefined ? ` (WebSocket close ${closeCode}${closeReason ? `: ${closeReason}` : ""})` : ""}`,
                };
                this.endedInfo = info;
                const closeListeners = [...this.closeListeners];
                this.closeListeners.clear();
                for (const fn of closeListeners) {
                    try {
                        fn(info);
                    }
                    catch { /* listener errors must not block teardown */ }
                }
            };
        });
        // v2: open secondary WebSockets and JOIN them into the session.
        // If ANY secondary fails to JOIN, we close the primary + any partially
        // attached secondaries and rethrow. Without this, connect() throws but
        // leaves an open primary WS that the caller has no handle for.
        if (useV2 && this.lastHello?.joinTickets && this.lastHello.joinTickets.length > 0) {
            try {
                await Promise.all(this.lastHello.joinTickets.map((t) => this.openSecondary(t, myGeneration)));
            }
            catch (err) {
                // Generation guard: if a superseding connect() has already run
                // resetSessionState(), our Promise.all rejected because reset
                // closed our pendingSecondaries — NOT because of a real JOIN
                // failure. Calling close() here would wipe the NEW session's
                // state. Just rethrow: the superseding reset already cleaned up.
                if (this.connectGeneration === myGeneration) {
                    await this.close().catch(() => { });
                }
                throw err;
            }
        }
        return this.sessionId;
    }
    async openSecondary(ticket, myGeneration) {
        const opened = this.openSocket("hoody-tunnel.v2");
        const ws = opened instanceof Promise ? await this.settleSocket(opened, myGeneration) : opened;
        return new Promise((resolve, reject) => {
            // Track this WS so close() can cancel it if JOIN_OK never arrives.
            this.pendingSecondaries.add(ws);
            ws.onopen = () => {
                const joinPayload = {
                    sessionId: this.sessionId,
                    index: ticket.index,
                    nonce: ticket.nonce,
                };
                const payload = new TextEncoder().encode(JSON.stringify(joinPayload));
                const frame = {
                    header: { frameType: FrameType.Join, streamId: 0, length: payload.length },
                    payload,
                };
                ws.send(encodeFrame(frame));
            };
            let attached = false;
            // Close the secondary WS and reject (idempotent).
            const failPreAttach = (err) => {
                if (attached)
                    return;
                attached = true; // prevent further reject attempts from same path
                this.pendingSecondaries.delete(ws);
                try {
                    ws.close();
                }
                catch { }
                reject(err);
            };
            ws.onmessage = (event) => {
                // Generation guard: a superseding connect() bumped the counter.
                // Drop the message and close the zombie WS rather than attach it
                // into the new session's wsAll at ticket.index.
                if (this.connectGeneration !== myGeneration) {
                    failPreAttach(new Error("secondary superseded"));
                    return;
                }
                const data = new Uint8Array(event.data);
                let result;
                try {
                    result = decodeFrames(data);
                }
                catch {
                    return;
                }
                for (const frame of result.frames) {
                    if (!attached) {
                        if (frame.header.frameType === FrameType.JoinOk) {
                            attached = true;
                            this.pendingSecondaries.delete(ws);
                            this.wsAll[ticket.index] = ws;
                            resolve();
                            continue;
                        }
                        if (frame.header.frameType === FrameType.JoinErr) {
                            // Guard JSON.parse on peer-controlled payload.
                            let e = {};
                            try {
                                e = JSON.parse(new TextDecoder().decode(frame.payload));
                            }
                            catch { /* treat as empty */ }
                            failPreAttach(new Error(`JOIN failed: ${e.message ?? e.code ?? 'malformed payload'}`));
                            continue;
                        }
                    }
                    this.routeInbound(frame, ws);
                }
            };
            ws.onerror = () => failPreAttach(new Error("secondary WS error"));
            ws.onclose = () => {
                if (!attached) {
                    // Use reject directly here — the WS is already closing by the
                    // protocol runtime; avoid double-close via failPreAttach.
                    attached = true;
                    this.pendingSecondaries.delete(ws);
                    reject(new Error("secondary WS closed before JOIN_OK"));
                }
                if (this.wsAll[ticket.index] === ws)
                    this.wsAll[ticket.index] = null;
                // The frames still queued for this socket, and every stream pinned to it, are lost
                // with it. Dropping the batch entry also keeps the map from growing with churn.
                const pending = this.wsBatch.get(ws)?.pending ?? [];
                this.wsBatch.delete(ws);
                this.secondaryLost(ws, pending);
            };
        });
    }
    /** Dispatch an already-decoded frame (public for setupAutoForwarding to avoid double-decode). */
    dispatchFrame(frame, deliveredOn) {
        this.handleFrame(frame, deliveredOn);
    }
    /** Returns all WebSockets in this session (primary at 0). */
    getAllWebSockets() {
        return this.wsAll;
    }
    handleFrame(frame, deliveredOn) {
        // v2 stream pinning: when STREAM_OPEN arrives, remember which WS delivered
        // it. All outbound frames for this stream go to that same WS, preserving
        // ordering end-to-end. Cleanup on EOF/RESET.
        if (deliveredOn && frame.header.streamId !== 0) {
            const sid = frame.header.streamId;
            if (frame.header.frameType === FrameType.StreamOpen) {
                this.streamWs.set(sid, deliveredOn);
            }
            else if (frame.header.frameType === FrameType.Eof ||
                frame.header.frameType === FrameType.Reset) {
                this.streamWs.delete(sid);
            }
        }
        switch (frame.header.frameType) {
            case FrameType.BindOk: {
                // Guard JSON.parse on peer-controlled payload. Malformed/mismatched
                // frames must not leave bind() pending forever — reject all pending
                // binds on malformed JSON; reject the specific one on unknown
                // clientBindRef.
                let payload;
                try {
                    payload = JSON.parse(new TextDecoder().decode(frame.payload));
                }
                catch {
                    this.rejectAllBindPromises(new Error("BIND_OK: malformed payload"));
                    break;
                }
                const ref_ = payload.clientBindRef;
                const pending = this.bindPromises.get(ref_);
                if (pending) {
                    this.bindPromises.delete(ref_);
                    if (typeof payload.bindId === "number")
                        this.liveBinds.add(payload.bindId);
                    pending.resolve({
                        bindId: payload.bindId,
                        containerPort: payload.containerPort,
                        publicUrl: payload.publicUrl ?? undefined,
                    });
                }
                else {
                    // Unknown clientBindRef is a protocol error; reject all pending
                    // binds so callers don't hang waiting for a reply that will never match.
                    this.rejectAllBindPromises(new Error(`BIND_OK: unknown clientBindRef ${ref_}`));
                }
                break;
            }
            case FrameType.BindErr: {
                // Guard JSON.parse on peer-controlled payload.
                let payload;
                try {
                    payload = JSON.parse(new TextDecoder().decode(frame.payload));
                }
                catch {
                    this.rejectAllBindPromises(new Error("BIND_ERR: malformed payload"));
                    break;
                }
                const ref_ = payload.clientBindRef;
                const pending = this.bindPromises.get(ref_);
                if (pending) {
                    this.bindPromises.delete(ref_);
                    pending.reject(new Error(`BIND_ERR: ${payload.code} — ${payload.message}`));
                }
                else {
                    this.rejectAllBindPromises(new Error(`BIND_ERR: unknown clientBindRef ${ref_}`));
                }
                break;
            }
            case FrameType.UnbindOk:
            case FrameType.UnbindErr: {
                // The kit's answer to an UNBIND. Either way this session no longer
                // holds the bind (UNBIND_ERR is "not owned by this session").
                let payload;
                try {
                    payload = JSON.parse(new TextDecoder().decode(frame.payload));
                }
                catch {
                    break;
                }
                if (typeof payload?.bindId === "number")
                    this.liveBinds.delete(payload.bindId);
                if (this.liveBinds.size === 0)
                    this.unbindSettled?.();
                break;
            }
            case FrameType.Goaway: {
                // Kit-initiated session shutdown. Close the session so pending
                // sendData()/bind() calls reject cleanly rather than hanging on a
                // connection the kit has already disowned. The kit is already
                // teardown-in-progress, so we don't need to emit anything back
                // (no UNBIND either: the kit is releasing the binds itself).
                let reason = "GOAWAY";
                try {
                    const goaway = JSON.parse(new TextDecoder().decode(frame.payload));
                    if (typeof goaway?.message === "string" && goaway.message)
                        reason = goaway.message;
                }
                catch { /* reason unknown */ }
                this.goawayReason = reason;
                this.teardown({ deliberate: false, reason: `the kit ended the session: ${reason}` });
                break;
            }
            case FrameType.StreamOpen:
            case FrameType.Data:
            case FrameType.Eof:
            case FrameType.Reset:
            case FrameType.Window:
            case FrameType.Ping: {
                if (frame.header.frameType === FrameType.Ping) {
                    // Echo PONG
                    this.sendFrame({
                        header: { frameType: FrameType.Pong, streamId: 0, length: frame.payload.length },
                        payload: frame.payload,
                    });
                    return;
                }
                const streamId = frame.header.stream_id ?? frame.header.streamId;
                // WINDOW routing: replenish send-side credit. Zero-increment is a
                // protocol error. DO NOT forward to stream handler.
                if (frame.header.frameType === FrameType.Window) {
                    if (frame.payload.length < 4)
                        return;
                    const increment = (frame.payload[0] << 24) |
                        (frame.payload[1] << 16) |
                        (frame.payload[2] << 8) |
                        (frame.payload[3]);
                    const n = increment >>> 0; // force u32
                    if (n === 0) {
                        // Protocol violation — close session.
                        this.teardown({ deliberate: false, reason: "protocol error: WINDOW with a zero increment" });
                        return;
                    }
                    if (streamId === 0) {
                        this.sessionCredit?.release(n);
                    }
                    else {
                        this.streamCredit.get(streamId)?.release(n);
                    }
                    return;
                }
                // Stream lifecycle: RESET is a full close (both directions). EOF is
                // a half-close (peer signals end of THEIR sending; we can still
                // send response data). So only mark the stream as fully closed for
                // outbound on RESET. EOF leaves the gate open so the SDK can still
                // send response body bytes after receiving EOF for the request body.
                if (frame.header.frameType === FrameType.Reset) {
                    this.markStreamClosed(streamId);
                    const gate = this.streamCredit.get(streamId);
                    if (gate) {
                        gate.close(new Error(`stream ${streamId} reset`));
                        this.streamCredit.delete(streamId);
                    }
                }
                // Inbound flow-control: refill peer's send credit AFTER we have
                // consumed DATA. WINDOW must not be replenished before the handler
                // writes to the local socket — otherwise a slow upstream produces
                // unbounded Node write buffers while the peer keeps sending. We
                // await a handler that returns a Promise (e.g. one that waits for
                // socket.write drain) before crediting. Late DATA on closed streams
                // still refills session credit per spec.
                const isDataFrame = frame.header.frameType === FrameType.Data && frame.payload.length > 0;
                const dataLen = isDataFrame ? frame.payload.length : 0;
                // A refill deferred until the handler settles goes only on the connection the DATA
                // came on: every connection, resumed or not, starts with a full window, so credit
                // for an earlier one would raise it past that and the kit would end the new session.
                const generation = this.connectGeneration;
                const handler = this.streamHandlers.get(streamId);
                // Drop the stream-handler entry once the peer sends a terminal frame.
                // The delete runs in a `finally` so handler exceptions don't leak the
                // entry — open→reset cycles would otherwise grow the handler map
                // unbounded over the lifetime of a session.
                try {
                    if (handler) {
                        const ret = handler(frame);
                        if (isDataFrame && ret && typeof ret.then === "function") {
                            // Defer WINDOW replenishment until local sink has drained.
                            ret.then(() => {
                                if (this.connectGeneration !== generation)
                                    return;
                                this.sendWindow(streamId, dataLen);
                                this.sendWindow(0, dataLen);
                            }, () => {
                                if (this.connectGeneration !== generation)
                                    return;
                                // Handler rejected (e.g. local socket died). Still refill
                                // session window so other streams don't stall; skip the
                                // per-stream refill — the stream is dead or about to be.
                                this.sendWindow(0, dataLen);
                            });
                        }
                        else if (isDataFrame) {
                            // Sync handler OR non-Promise return — credit immediately.
                            this.sendWindow(streamId, dataLen);
                            this.sendWindow(0, dataLen);
                        }
                    }
                    else if (isDataFrame) {
                        // Late DATA on a stream with no registered handler: refill the
                        // session window only.
                        this.sendWindow(0, dataLen);
                    }
                }
                finally {
                    if (frame.header.frameType === FrameType.Reset) {
                        this.streamHandlers.delete(streamId);
                    }
                }
                break;
            }
        }
    }
    /** Emit a WINDOW(streamId, increment) frame. Used to refill peer's send
     *  credit after we consume inbound DATA. Uses tolerant sendFrame (no throw
     *  on closed WS) because WINDOW is optional replenishment — if the WS is
     *  gone the flow is already dead. */
    sendWindow(streamId, increment) {
        if (increment <= 0)
            return;
        const payload = new Uint8Array(4);
        new DataView(payload.buffer).setUint32(0, increment >>> 0, false);
        this.sendFrame({
            header: { frameType: FrameType.Window, streamId, length: 4 },
            payload,
        });
    }
    /**
     * Bind a port. If `containerPort` is omitted, `null`, or `0`, the kit picks
     * a random available port (PULL: kernel-assigned ephemeral; EXPOSE: random
     * in 20000-65534 range). The assigned port is returned in `BindResult.containerPort`.
     */
    async bind(opts) {
        // Reject fast if the primary WS is already gone. Without this check,
        // the promise is stored in bindPromises and the tolerant sendFrame()
        // silently drops the BIND — onclose cleanup already ran so nothing
        // will ever reject the new promise, and the caller hangs forever.
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("bind: primary WebSocket is not open");
        }
        const ref_ = this.nextBindRef++;
        // Normalize missing/null/0 port → 0 (ephemeral / random).
        const port = opts.containerPort ?? 0;
        const payloadObj = {
            clientBindRef: ref_,
            kind: opts.kind,
            mode: opts.mode,
            containerPort: port,
        };
        if (opts.label !== undefined)
            payloadObj.label = opts.label;
        if (opts.takeover !== undefined)
            payloadObj.takeover = opts.takeover;
        if (opts.host !== undefined)
            payloadObj.host = opts.host;
        const payload = JSON.stringify(payloadObj);
        return new Promise((resolve, reject) => {
            // Timeout the BIND wait so a silent peer doesn't hang bind() forever.
            const BIND_TIMEOUT_MS = 30_000;
            const bindTimeoutId = setTimeout(() => {
                const pending = this.bindPromises.get(ref_);
                if (pending) {
                    this.bindPromises.delete(ref_);
                    pending.reject(new Error(`bind: timed out after ${BIND_TIMEOUT_MS}ms waiting for BIND_OK/BIND_ERR`));
                }
            }, BIND_TIMEOUT_MS);
            const wrappedResolve = (r) => { clearTimeout(bindTimeoutId); resolve(r); };
            const wrappedReject = (e) => { clearTimeout(bindTimeoutId); reject(e); };
            this.bindPromises.set(ref_, { resolve: wrappedResolve, reject: wrappedReject });
            const encoded = new TextEncoder().encode(payload);
            this.sendFrame({
                header: { frameType: FrameType.Bind, streamId: 0, length: encoded.length },
                payload: encoded,
            });
        });
    }
    /** Register a handler for frames on a specific stream ID */
    onStream(streamId, handler) {
        this.streamHandlers.set(streamId, handler);
    }
    /**
     * Remove stream handler. With `handler`, only if it is still the one registered: a
     * request ending late must not remove a later request's handler for the same ID (a
     * fresh kit session after a reconnect numbers its streams from 2 again).
     */
    offStream(streamId, handler) {
        if (handler && this.streamHandlers.get(streamId) !== handler)
            return;
        this.streamHandlers.delete(streamId);
    }
    /**
     * The connection this session is on: it changes with every `connect()` and `close()`.
     * Something started on one connection does nothing to the next (see tunnel-http-pump's
     * `streamEnd`).
     */
    get generation() {
        return this.connectGeneration;
    }
    /** Send a raw frame. v3 batching: frames enqueued in the same event-loop
     * tick are coalesced into one WS message, cutting ws.send calls ~3-4×.
     * PING/PONG/GOAWAY flush pending first and ship immediately.
     *
     * Silently drops if the target WebSocket is closed — this is the
     * safe/tolerant variant used by RESET / EOF / echo-PONG paths where
     * throwing would cascade errors across unrelated code paths.
     * For credit-tracked DATA frames, use `_sendFrameStrict` which throws
     * so `sendData` can release permits. */
    sendFrame(frame) {
        const sid = frame.header.streamId;
        let target = null;
        if (sid !== 0) {
            target = this.streamWs.get(sid) ?? this.ws;
            // A RESET for a stream whose socket is closing still has to reach the peer: send it
            // on the primary, as once that socket's close has unpinned the stream.
            if (frame.header.frameType === FrameType.Reset && target !== this.ws
                && (!target || target.readyState !== WebSocket.OPEN)) {
                this.streamWs.delete(sid);
                target = this.ws;
            }
        }
        else {
            target = this.ws;
        }
        if (!target || target.readyState !== WebSocket.OPEN)
            return;
        const encoded = encodeFrame(frame);
        const immediate = frame.header.frameType === FrameType.Ping
            || frame.header.frameType === FrameType.Pong
            || frame.header.frameType === FrameType.Goaway;
        if (immediate) {
            this.flushBatch(target);
            target.send(encoded);
            return;
        }
        this.enqueue(target, encoded);
    }
    /** Add one encoded frame to `target`'s batch, flushed at the end of this tick. */
    enqueue(target, encoded) {
        let batch = this.wsBatch.get(target);
        if (!batch) {
            batch = { pending: [], bytes: 0, scheduled: false };
            this.wsBatch.set(target, batch);
        }
        // Force-flush if adding this frame would exceed v3 message limits.
        if (batch.bytes + encoded.length > MAX_MESSAGE_SIZE
            || batch.pending.length + 1 > MAX_FRAMES_PER_MESSAGE) {
            this.flushBatch(target);
        }
        batch.pending.push(encoded);
        batch.bytes += encoded.length;
        if (!batch.scheduled) {
            batch.scheduled = true;
            queueMicrotask(() => this.flushBatch(target));
        }
    }
    /** Strict variant of sendFrame — THROWS if the target WS is closed OR
     * if the frame can't be enqueued. Used by sendData() so permit release
     * on the catch path is triggered exactly when the frame didn't reach the
     * batching queue.
     *
     * Resolves target + enqueues atomically (no delegation to sendFrame's
     * second readyState check), so a race where the pin moves or the WS
     * closes between resolve-and-send can't silently drop the frame after
     * we've consumed credit. */
    _sendFrameStrict(frame) {
        const sid = frame.header.streamId;
        const target = sid !== 0
            ? (this.streamWs.get(sid) ?? this.ws)
            : this.ws;
        if (!target || target.readyState !== WebSocket.OPEN) {
            throw new Error(`sendData: target WebSocket not open (readyState=${target?.readyState ?? "null"})`);
        }
        // Inline the batching logic from sendFrame against the resolved target,
        // bypassing the second readyState lookup. This closes the race window.
        const encoded = encodeFrame(frame);
        const immediate = frame.header.frameType === FrameType.Ping
            || frame.header.frameType === FrameType.Pong
            || frame.header.frameType === FrameType.Goaway;
        if (immediate) {
            this.flushBatch(target);
            target.send(encoded);
            return;
        }
        let batch = this.wsBatch.get(target);
        if (!batch) {
            batch = { pending: [], bytes: 0, scheduled: false };
            this.wsBatch.set(target, batch);
        }
        if (batch.bytes + encoded.length > MAX_MESSAGE_SIZE
            || batch.pending.length + 1 > MAX_FRAMES_PER_MESSAGE) {
            this.flushBatch(target);
        }
        batch.pending.push(encoded);
        batch.bytes += encoded.length;
        if (!batch.scheduled) {
            batch.scheduled = true;
            queueMicrotask(() => this.flushBatch(target));
        }
    }
    flushBatch(ws) {
        const batch = this.wsBatch.get(ws);
        if (!batch || batch.pending.length === 0)
            return;
        batch.scheduled = false;
        // Take the queue BEFORE sending so a throw doesn't leave half-state
        // around for re-entry.
        const frames = batch.pending;
        const bytes = batch.bytes;
        batch.pending = [];
        batch.bytes = 0;
        // A send on a closing socket is dropped without an error: a secondary that started
        // closing after these frames were queued loses them as surely as one whose send throws.
        if (ws !== this.ws && ws.readyState !== WebSocket.OPEN) {
            this.secondaryLost(ws, frames);
            return;
        }
        let payload;
        if (frames.length === 1) {
            payload = frames[0];
        }
        else {
            payload = new Uint8Array(bytes);
            let off = 0;
            for (const f of frames) {
                payload.set(f, off);
                off += f.length;
            }
        }
        try {
            ws.send(payload);
        }
        catch (e) {
            // ws.send throws InvalidStateError if the socket transitioned to
            // CLOSING/CLOSED between the sendFrame readyState check and this
            // microtask. sendData already consumed credit for these bytes, so
            // the caller saw success for a frame the peer never received.
            //
            //   - Primary dead: entire session is dead → close all gates.
            //   - Secondary dead: only its frames and the streams pinned to it are
            //     lost (secondaryLost). Closing sessionCredit here would wrongly
            //     kill live streams on the primary.
            const err = e instanceof Error ? e : new Error("ws.send failed");
            if (ws === this.ws) {
                this.sessionCredit?.close(err);
                for (const [, gate] of this.streamCredit)
                    gate.close(err);
            }
            else {
                this.secondaryLost(ws, frames);
            }
        }
    }
    /**
     * Secondary socket `ws` is gone, or can no longer send `frames` (queued for it). Called
     * from the flush that finds it closing and from its close, so each part is idempotent.
     *   - The session credit of the lost DATA comes back: the peer will never WINDOW it.
     *   - The lost RESETs go on the primary, as at enqueue (sendFrame).
     *   - Every other stream that lost a frame, or is pinned to `ws`, is reset on the
     *     primary, and its handler hears that as a RESET: the request aborts its local
     *     side (freeing its pool slot) and sends nothing more, since neither the rest of a
     *     body nor an EOF may follow bytes the peer never got.
     *   - A stream that already ended is left alone: its terminal frame went out (the
     *     pump's RESET falls back to the primary), and a second one would answer nothing.
     *     A lost EOF is the exception: that stream has not ended for the peer.
     */
    secondaryLost(ws, frames) {
        const primary = this.ws && this.ws.readyState === WebSocket.OPEN ? this.ws : null;
        const rerouted = new Set();
        const eofLost = new Set();
        const lost = new Set();
        let dataBytes = 0;
        for (const f of frames) {
            const sid = new DataView(f.buffer, f.byteOffset, f.byteLength).getUint32(1, false);
            if (f[0] === FrameType.Reset) {
                rerouted.add(sid);
                if (primary)
                    this.enqueue(primary, f);
            }
            else if (f[0] === FrameType.Data) {
                dataBytes += f.length - HEADER_SIZE;
                lost.add(sid);
            }
            else if (f[0] === FrameType.Eof) {
                eofLost.add(sid);
                lost.add(sid);
            }
        }
        if (dataBytes > 0)
            this.sessionCredit?.release(dataBytes);
        for (const [sid, pinned] of this.streamWs) {
            if (pinned === ws)
                lost.add(sid);
        }
        const reason = "secondary connection lost";
        for (const sid of lost) {
            this.streamWs.delete(sid);
            if (rerouted.has(sid))
                continue;
            if (this.closedStreams.has(sid) && !eofLost.has(sid))
                continue;
            this.sendReset(sid, reason);
            const handler = this.streamHandlers.get(sid);
            if (!handler)
                continue;
            this.streamHandlers.delete(sid);
            const payload = new Uint8Array(2 + reason.length);
            new DataView(payload.buffer).setUint16(0, 0x0006 /* RefusedStream */, false);
            payload.set(new TextEncoder().encode(reason), 2);
            try {
                const ret = handler({ header: { frameType: FrameType.Reset, streamId: sid, length: payload.length }, payload });
                if (ret && typeof ret.then === "function")
                    ret.catch(() => { });
            }
            catch { }
        }
    }
    // ── Convenience helpers ──
    /** Bind an EXPOSE port. Omit `port` for a random available port in 20000-65534. */
    async expose(port, opts) {
        return this.bind({ kind: "http", mode: "expose", containerPort: port, ...opts });
    }
    /** Bind a PULL port. Omit `port` for an ephemeral kernel-assigned port. */
    async pull(port, opts) {
        return this.bind({ kind: "tcp", mode: "pull", containerPort: port, ...opts });
    }
    /** Send a STREAM_RESPONSE_HEAD */
    sendResponseHead(streamId, status, headers, final_ = true) {
        const payload = JSON.stringify({ status, headers, final: final_ });
        const encoded = new TextEncoder().encode(payload);
        this.sendFrame({
            header: { frameType: FrameType.StreamResponseHead, streamId, length: encoded.length },
            payload: encoded,
        });
    }
    /**
     * Send a DATA frame with protocol flow-control backpressure.
     *
     * Acquires `data.length` bytes of session + per-stream send credit
     * BEFORE enqueuing the frame. If either gate is closed mid-await the
     * opposite gate's already-acquired credit is returned (exactly-once
     * release on all failure paths).
     *
     * Rejects with an Error if the session is closed or the stream's
     * CreditGate has been torn down (EOF/RESET). Callers must handle this
     * (drop the stream, abort the upload, etc.) — hanging forever is not
     * an option.
     */
    async sendData(streamId, data) {
        // streamId 0 is reserved for session-level control frames. Reject
        // explicitly rather than emitting a protocol violation.
        if (streamId === 0) {
            throw new Error("sendData: streamId 0 is reserved for session control frames");
        }
        // Reject chunks larger than the protocol payload cap BEFORE acquiring
        // credit. Otherwise a chunk > streamWindow would wait for WINDOW credit
        // that can never arrive (kit discards frames over MAX_PAYLOAD_SIZE),
        // wedging the send permanently.
        const MAX_PAYLOAD_SIZE = 65536;
        if (data.length > MAX_PAYLOAD_SIZE) {
            throw new Error(`sendData: chunk of ${data.length} bytes exceeds protocol MAX_PAYLOAD_SIZE=${MAX_PAYLOAD_SIZE}; split into <=64KiB chunks`);
        }
        if (data.length === 0) {
            // Zero-length fast path: no permits needed (matches kit-side behavior).
            // Strict variant so a closed WS throws rather than silently dropping.
            this._sendFrameStrict({
                header: { frameType: FrameType.Data, streamId, length: 0 },
                payload: data,
            });
            return;
        }
        // Capture sessionCredit locally so a concurrent close() nulling the
        // field mid-await doesn't NPE the catch-block release. After close()
        // the local reference keeps the (closed) gate reachable for release()
        // which no-ops on closed gates — safe exactly-once accounting.
        const sessionCredit = this.sessionCredit;
        if (!sessionCredit) {
            throw new Error("sendData: session not connected");
        }
        // Reject sends on streams explicitly closed via EOF/RESET/secondary-close.
        if (this.closedStreams.has(streamId)) {
            throw new Error(`sendData: stream ${streamId} is closed`);
        }
        // Lazy-create the per-stream CreditGate on first send (safe because the
        // closed-streams set above rejected any already-closed streamId).
        let streamGate = this.streamCredit.get(streamId);
        if (!streamGate) {
            streamGate = new CreditGate(this.initialStreamWindow);
            this.streamCredit.set(streamId, streamGate);
        }
        // Acquire session first, stream second (consistent order = no deadlock).
        // Track which succeeded so we can release exactly-once on failure.
        let sessionAcquired = false;
        let streamAcquired = false;
        try {
            // Cancelled by the stream's end: a send waiting for session credit gives up its place
            // once its stream is reset or ended, instead of at the next WINDOW.
            await sessionCredit.acquire(data.length, streamGate.closedSignal);
            sessionAcquired = true;
            await streamGate.acquire(data.length);
            streamAcquired = true;
            // The stream can end while this send waits (our RESET or EOF, or the peer's
            // RESET). An acquire granted before its gate closed does not see the close,
            // so check again: no DATA follows a stream's end. The gate as well as the
            // tombstone: the tombstones are bounded, and this one may already be evicted.
            if (streamGate.isClosed || this.closedStreams.has(streamId)) {
                throw new Error(`sendData: stream ${streamId} is closed`);
            }
            this._sendFrameStrict({
                header: { frameType: FrameType.Data, streamId, length: data.length },
                payload: data,
            });
        }
        catch (e) {
            // Release anything we successfully acquired. release() is a no-op on
            // closed gates, so this is safe if close() ran mid-await.
            if (streamAcquired)
                streamGate.release(data.length);
            if (sessionAcquired)
                sessionCredit.release(data.length);
            throw e;
        }
    }
    /** Add a stream to the closed-tombstones set with bounded-LRU eviction.
     *  Set iteration order in JS is insertion order, so the first key is the
     *  oldest — delete it when we hit the cap. */
    markStreamClosed(streamId) {
        if (this.closedStreams.has(streamId))
            return;
        if (this.closedStreams.size >= TunnelSession.maxClosedStreams) {
            const oldest = this.closedStreams.values().next().value;
            if (oldest !== undefined)
                this.closedStreams.delete(oldest);
        }
        this.closedStreams.add(streamId);
    }
    /** Send EOF. Zero-length, no credit needed. Closes the stream's outbound
     * CreditGate and marks the streamId as closed so subsequent sendData calls
     * reject cleanly. */
    sendEof(streamId) {
        this.sendFrame({
            header: { frameType: FrameType.Eof, streamId, length: 0 },
            payload: new Uint8Array(0),
        });
        this.markStreamClosed(streamId);
        const gate = this.streamCredit.get(streamId);
        if (gate) {
            gate.close(new Error(`stream ${streamId} closed (EOF sent)`));
            this.streamCredit.delete(streamId);
        }
    }
    /**
     * Send RESET and release the stream's local state.
     *
     * The mirror of `sendEof`. Sending a raw RESET frame closes the stream on the
     * wire but leaves this side's CreditGate allocated, so every locally refused
     * stream (bad auth, denied destination, timeout) permanently grew
     * `streamCredit` for the life of the session, and a reused stream id would
     * inherit the stale gate.
     */
    sendReset(streamId, reason) {
        const reasonBytes = new TextEncoder().encode(reason);
        const payload = new Uint8Array(2 + reasonBytes.length);
        new DataView(payload.buffer).setUint16(0, 0x0006 /* RefusedStream */, false);
        payload.set(reasonBytes, 2);
        this.sendFrame({
            header: { frameType: FrameType.Reset, streamId, length: payload.length },
            payload,
        });
        // Unpin after the RESET is queued (it travels on the pinned socket): the
        // peer sends no EOF/RESET for a stream we refused, so nothing else would.
        this.streamWs.delete(streamId);
        this.markStreamClosed(streamId);
        const gate = this.streamCredit.get(streamId);
        if (gate) {
            gate.close(new Error(`stream ${streamId} reset locally`));
            this.streamCredit.delete(streamId);
        }
    }
    /**
     * Close the session for good. A session that holds binds first sends UNBIND
     * for each and waits (briefly) for the kit to confirm: the kit otherwise
     * parks the binds for its takeover grace, as it does for a dropped
     * connection, and the port answers PORT_IN_USE until that runs out. The
     * wait also keeps the frames from being lost when the caller exits right
     * after `await close()`.
     */
    async close() {
        if (this.closing)
            return this.closing;
        const primary = this.ws;
        if (this.connected && primary && primary.readyState === WebSocket.OPEN && this.liveBinds.size > 0) {
            const generation = this.connectGeneration;
            this.closing = this.releaseBinds().then(() => {
                this.closing = null;
                // A connect() that superseded this session during the wait already
                // tore it down; its new session is not this close()'s to end.
                if (this.connectGeneration === generation)
                    this.teardown({ deliberate: true, reason: "closed by client" });
            });
            return this.closing;
        }
        this.teardown({ deliberate: true, reason: "closed by client" });
    }
    /** Send UNBIND for every live bind; resolve when all are answered, the primary closes, or the timeout runs out. */
    releaseBinds() {
        return new Promise((resolve) => {
            let timer = null;
            const settle = () => {
                if (this.unbindSettled !== settle)
                    return;
                this.unbindSettled = null;
                if (timer)
                    clearTimeout(timer);
                resolve();
            };
            this.unbindSettled = settle;
            timer = setTimeout(settle, UNBIND_ON_CLOSE_TIMEOUT_MS);
            for (const bindId of this.liveBinds) {
                const payload = new TextEncoder().encode(JSON.stringify({ bindId }));
                this.sendFrame({ header: { frameType: FrameType.Unbind, streamId: 0, length: payload.length }, payload });
            }
        });
    }
    /** Synchronous teardown of every socket and every piece of session state. */
    teardown(info) {
        this.liveBinds.clear();
        this.unbindSettled?.();
        // Bump generation so any in-flight HELLO_OK / JOIN_OK handler from
        // a connect() that's still mid-handshake no-ops rather than writing
        // into a session that's being torn down.
        this.connectGeneration++;
        // Cancel any in-flight connect. Without this a connect-in-progress
        // (before HELLO_OK) leaks an open WS and the connect() promise hangs.
        if (this.connectReject) {
            this.connectReject(new Error("connect cancelled by close()"));
            this.connectReject = null;
        }
        if (this.connectingWs && this.connectingWs.readyState !== WebSocket.CLOSED) {
            try {
                this.connectingWs.close();
            }
            catch { }
        }
        this.connectingWs = null;
        // Close any in-flight v2 secondary WSes that never reached JOIN_OK.
        // Without this, `Promise.all(openSecondary)` in connect() would hang
        // forever — close() called externally while secondaries are dangling
        // needs to cancel them so connect() rejects.
        for (const ws of this.pendingSecondaries) {
            try {
                ws.close();
            }
            catch { }
        }
        this.pendingSecondaries.clear();
        // Flush any pending wsBatch entries synchronously BEFORE closing the
        // sockets. A sendData() that awaited credit and enqueued a frame has
        // already resolved its promise — dropping the frame here would be a
        // silent send, giving the caller a false "sent" signal.
        for (const [ws, batch] of this.wsBatch) {
            if (batch.pending.length > 0 && ws.readyState === WebSocket.OPEN) {
                try {
                    if (batch.pending.length === 1) {
                        ws.send(batch.pending[0]);
                    }
                    else {
                        const out = new Uint8Array(batch.bytes);
                        let off = 0;
                        for (const f of batch.pending) {
                            out.set(f, off);
                            off += f.length;
                        }
                        ws.send(out);
                    }
                }
                catch { }
                batch.pending = [];
                batch.bytes = 0;
            }
        }
        // Close all credit gates so pending sendData() rejects cleanly instead
        // of hanging. Session gate first so any stream-gate-blocked sender that
        // races with close() sees a consistent "all gates closed" state.
        this.sessionCredit?.close(new Error("session closed"));
        for (const [, gate] of this.streamCredit) {
            gate.close(new Error("session closed"));
        }
        this.streamCredit.clear();
        this.sessionCredit = null;
        // Reject any still-pending bind() whose BIND_OK/BIND_ERR never arrived.
        for (const [, pending] of this.bindPromises) {
            pending.reject(new Error("bind: session closed"));
        }
        this.bindPromises.clear();
        // Reset connection state so the same instance can be reconnected.
        // Without this, a second connect() would skip HELLO_OK handling because
        // `!this.connected` gate is false, and hang forever.
        this.connected = false;
        this.sessionId = "";
        this.lastHello = null;
        this.nextBindRef = 1;
        this.streamHandlers.clear();
        for (const w of this.wsAll) {
            if (w && w.readyState !== WebSocket.CLOSED)
                w.close();
        }
        this.wsAll = [];
        this.ws = null;
        this.streamWs.clear();
        // Drop the closed-streams set so memory doesn't grow unbounded across
        // long-lived sessions OR across reuse of this TunnelSession instance.
        this.closedStreams.clear();
        // Clear pending wsBatch entries; their target sockets are about to
        // close (or already closed). The Uint8Arrays inside hold encoded
        // frames that were enqueued after credit was consumed; with the WS
        // gone the bytes won't reach the peer. The sessionCredit gate is
        // already closed above, so future awaiters fail rather than block on
        // the leaked credit.
        this.wsBatch.clear();
        // Fire external close listeners last, after internal teardown, so
        // listeners observe the session in its final closed state. Snapshot
        // before iterate — a listener may remove itself.
        this.endedInfo = info;
        const listeners = [...this.closeListeners];
        this.closeListeners.clear();
        for (const fn of listeners) {
            try {
                fn(info);
            }
            catch { /* listener errors must not block teardown */ }
        }
    }
    /** Full session-scoped state wipe. Used by connect() to supersede a
     *  prior session cleanly. close() does its own richer teardown (flushes
     *  pending batches first); this path is the "throw everything away"
     *  version for a reconnect-without-close.
     *
     *  Must also cancel any prior in-flight connect() (connectingWs /
     *  connectReject / pendingSecondaries) so a superseding connect() isn't
     *  racing a zombie handshake that can still mutate `this.ws`, credit
     *  gates, or `streamWs` between HELLO_OK and the next reset tick. */
    resetSessionState(reason) {
        // Bump generation FIRST so any in-flight HELLO_OK / JOIN_OK handler
        // captured from a now-superseded connect() sees the mismatch and
        // no-ops instead of writing into the new session's state.
        this.connectGeneration++;
        // Cancel prior in-flight connect — snapshot the fields, null them,
        // then fire the reject. Snapshot-first prevents a recursive reject
        // handler from re-observing stale connectingWs state.
        const priorReject = this.connectReject;
        const priorConnectingWs = this.connectingWs;
        this.connectReject = null;
        this.connectingWs = null;
        if (priorReject) {
            try {
                priorReject(reason);
            }
            catch { }
        }
        if (priorConnectingWs && priorConnectingWs.readyState !== WebSocket.CLOSED) {
            try {
                priorConnectingWs.close();
            }
            catch { }
        }
        // Cancel any in-flight v2 secondaries that never hit JOIN_OK. Their
        // Promise.all in connect() will reject via the close() handler.
        for (const ws of this.pendingSecondaries) {
            try {
                ws.close();
            }
            catch { }
        }
        this.pendingSecondaries.clear();
        this.liveBinds.clear();
        this.goawayReason = null;
        this.unbindSettled?.();
        this.sessionCredit?.close(reason);
        this.sessionCredit = null;
        for (const [, gate] of this.streamCredit)
            gate.close(reason);
        this.streamCredit.clear();
        for (const [, pending] of this.bindPromises)
            pending.reject(reason);
        this.bindPromises.clear();
        for (const w of this.wsAll) {
            if (w && w.readyState !== WebSocket.CLOSED) {
                try {
                    w.close();
                }
                catch { }
            }
        }
        this.wsAll = [];
        this.ws = null;
        this.streamWs.clear();
        this.connected = false;
        this.sessionId = "";
        this.lastHello = null;
        this.nextBindRef = 1;
        this.streamHandlers.clear();
        this.closedStreams.clear();
        this.wsBatch.clear();
        // Fire closeListeners on supersede. Without this, resetSessionState
        // would clear stream handlers without notifying close listeners
        // registered via session.onClose(), and local sockets pinned by
        // tunnel-http-pump (expose/pull) would leak until the target's idle timeout.
        this.endedInfo = null;
        const supersedeListeners = [...this.closeListeners];
        this.closeListeners.clear();
        for (const fn of supersedeListeners) {
            try {
                fn({ deliberate: true, reason: reason.message });
            }
            catch { }
        }
    }
}
