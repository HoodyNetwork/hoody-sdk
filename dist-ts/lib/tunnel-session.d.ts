/**
 * Tunnel WebSocket session client. Handles HELLO handshake, BIND,
 * stream dispatch, v2 multi-WS, v3 frame batching, and protocol flow
 * control (per-session + per-stream CreditGate).
 */
import { type Frame } from "./tunnel-protocol-types.js";
export interface ConnectOptions {
    url: string;
    token: string;
    /** If set, ask the kit to resume this session (HELLO.resume.sessionId). */
    resumeSessionId?: string;
    /**
     * v2 multi-WebSocket. If >1, SDK negotiates `hoody-tunnel.v2` and opens
     * additional secondary WebSockets up to `connectionsGranted` from the
     * server. Defaults to 1 (v1 single-socket).
     */
    maxConnections?: number;
}
export interface JoinTicket {
    index: number;
    nonce: string;
    expiresMs: number;
}
export interface ResumedBind {
    bindId: number;
    kind: string;
    mode: string;
    containerPort: number;
}
export interface HelloResult {
    sessionId: string;
    resumed: boolean;
    resumedBinds: ResumedBind[];
    /** v2 only: kit-granted maximum concurrent WS for this session. */
    connectionsGranted?: number;
    /** v2 only: tickets for secondary WS (one per index 1..M-1). */
    joinTickets?: JoinTicket[];
    /** Kit-advertised per-stream initial send window (bytes). Used to size
     *  the SDK's outbound CreditGate on each stream. */
    streamWindow: number;
    /** Kit-advertised per-session initial send window (bytes). */
    sessionWindow: number;
}
export interface BindOptions {
    kind: "http" | "tcp";
    mode: "expose" | "pull";
    /**
     * Container port to bind. Pass `0`, `undefined`, or `null` to let the kit
     * pick a random available port (PULL: kernel ephemeral; EXPOSE: random in 20000-65534).
     */
    containerPort?: number | null;
    label?: string;
    /** For EXPOSE: evict any existing binding on the same port. PULL: not supported in v1. */
    takeover?: boolean;
    /** For PULL: loopback host (default 127.0.0.1, also accepts ::1). Ignored for EXPOSE. */
    host?: string;
}
export interface BindResult {
    bindId: number;
    containerPort: number;
    publicUrl?: string;
}
type FrameHandler = (frame: Frame) => void | Promise<void>;
/**
 * Tunnel session client.
 * Connects to the kit via WebSocket, performs HELLO handshake,
 * and handles BIND + stream dispatch with protocol flow control.
 */
export declare class TunnelSession {
    private options;
    /** Primary WebSocket — always index 0. Session-scoped frames travel here. */
    private ws;
    /** All WebSockets (primary at 0, secondaries at 1..M-1). v1 sessions: len=1. */
    private wsAll;
    /** Per-stream WS pin: stream_id → ws that delivered STREAM_OPEN. */
    private streamWs;
    /** v3 per-WS batching buffers. Frames enqueued in the same microtask are
     * concatenated into one WS message on the next microtask tick. */
    private wsBatch;
    private sessionId;
    private lastHello;
    private nextBindRef;
    private bindPromises;
    /** Drain all pending bind() promises with an error. Used when we
     *  receive a malformed BIND_OK/BIND_ERR so callers don't hang forever. */
    private rejectAllBindPromises;
    private streamHandlers;
    private connected;
    /** Session-level outbound credit. Sized from `hello.sessionWindow`.
     *  Consumed before sendData enqueues; replenished when peer sends
     *  WINDOW(0, n). */
    private sessionCredit;
    /** Per-stream outbound credit. Key = streamId. Sized from
     *  `hello.streamWindow` on first send to the stream. Replenished when
     *  peer sends WINDOW(streamId, n). Closed on EOF / RESET / session-close. */
    private streamCredit;
    /** Cached initial windows from HELLO_OK, used to lazily create per-stream
     *  gates when the SDK first sends to a stream. */
    private initialStreamWindow;
    private initialSessionWindow;
    /** Tombstone set of stream IDs that have been explicitly closed via
     *  RESET (full close) or secondary-WS drop. sendData rejects sends
     *  targeting a closed stream even if the CreditGate has been
     *  garbage-collected from streamCredit. Bounded LRU to cap memory on
     *  long-lived sessions: oldest entry evicted once size > maxClosedStreams.
     *  Stale eviction is safe because peer-side stream IDs are monotonically
     *  increasing — a freshly-allocated ID is never reused, so a wrongly
     *  evicted "still-closed" tombstone can't cause us to send to a stream
     *  that's actually live. */
    private closedStreams;
    private static readonly maxClosedStreams;
    /** In-flight connect: reference to the not-yet-HELLO_OK primary WS so
     *  close() can tear it down even before `this.ws` is populated. */
    private connectingWs;
    /** In-flight connect reject callback so close() can cancel a pending connect. */
    private connectReject;
    /** In-flight v2 secondary WSes (pre-JOIN_OK). close() must close these so
     *  `Promise.all(openSecondary)` in connect() can reject rather than hang. */
    private pendingSecondaries;
    /** Monotonic generation counter bumped on every connect() supersede and
     *  on close(). Each in-flight connect captures its generation in a
     *  closure; handlers (HELLO_OK, JOIN_OK, Promise.all catch) check the
     *  live counter before touching shared state so a late message from a
     *  superseded socket cannot clobber the new session's `this.ws`,
     *  `sessionId`, or `wsAll`. Mirrors upstream's `connectEpoch`. */
    private connectGeneration;
    /** External close listeners — fired once from `close()` so consumers
     *  (e.g. the upgrade forwarder that owns an upstream TCP socket) can tear
     *  down resources tied to the session lifecycle rather than per-stream
     *  EOF frames, which never fire on an abrupt WS drop. */
    private closeListeners;
    constructor(options: ConnectOptions);
    /** Register a listener fired exactly once on session close. Returns an
     *  unsubscribe function. Use for resources whose lifecycle is tied to the
     *  session itself (e.g. an upgrade socket forwarded through a stream that
     *  may never receive an EOF frame if the peer aborts). */
    onClose(fn: () => void): () => void;
    /** Session id assigned by the kit in HELLO_OK. Available after `connect()` resolves. */
    get id(): string;
    /** Full HELLO_OK result including `resumed` and `resumedBinds`. Null before connect(). */
    get hello(): HelloResult | null;
    connect(): Promise<string>;
    private openSecondary;
    /** Dispatch an already-decoded frame (public for setupAutoForwarding to avoid double-decode). */
    dispatchFrame(frame: Frame, deliveredOn?: WebSocket): void;
    /** Returns all WebSockets in this session (primary at 0). */
    getAllWebSockets(): (WebSocket | null)[];
    private handleFrame;
    /** Emit a WINDOW(streamId, increment) frame. Used to refill peer's send
     *  credit after we consume inbound DATA. Uses tolerant sendFrame (no throw
     *  on closed WS) because WINDOW is optional replenishment — if the WS is
     *  gone the flow is already dead. */
    private sendWindow;
    /**
     * Bind a port. If `containerPort` is omitted, `null`, or `0`, the kit picks
     * a random available port (PULL: kernel-assigned ephemeral; EXPOSE: random
     * in 20000-65534 range). The assigned port is returned in `BindResult.containerPort`.
     */
    bind(opts: BindOptions): Promise<BindResult>;
    /** Register a handler for frames on a specific stream ID */
    onStream(streamId: number, handler: FrameHandler): void;
    /** Remove stream handler */
    offStream(streamId: number): void;
    /** Send a raw frame. v3 batching: frames enqueued in the same event-loop
     * tick are coalesced into one WS message, cutting ws.send calls ~3-4×.
     * PING/PONG/GOAWAY flush pending first and ship immediately.
     *
     * Silently drops if the target WebSocket is closed — this is the
     * safe/tolerant variant used by RESET / EOF / echo-PONG paths where
     * throwing would cascade errors across unrelated code paths.
     * For credit-tracked DATA frames, use `_sendFrameStrict` which throws
     * so `sendData` can release permits. */
    sendFrame(frame: Frame): void;
    /** Strict variant of sendFrame — THROWS if the target WS is closed OR
     * if the frame can't be enqueued. Used by sendData() so permit release
     * on the catch path is triggered exactly when the frame didn't reach the
     * batching queue.
     *
     * Resolves target + enqueues atomically (no delegation to sendFrame's
     * second readyState check), so a race where the pin moves or the WS
     * closes between resolve-and-send can't silently drop the frame after
     * we've consumed credit. */
    private _sendFrameStrict;
    private flushBatch;
    /** Bind an EXPOSE port. Omit `port` for a random available port in 20000-65534. */
    expose(port?: number | null, opts?: {
        label?: string;
        takeover?: boolean;
    }): Promise<BindResult>;
    /** Bind a PULL port. Omit `port` for an ephemeral kernel-assigned port. */
    pull(port?: number | null, opts?: {
        label?: string;
        host?: string;
    }): Promise<BindResult>;
    /** Send a STREAM_RESPONSE_HEAD */
    sendResponseHead(streamId: number, status: number, headers: [string, string][], final_?: boolean): void;
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
    sendData(streamId: number, data: Uint8Array): Promise<void>;
    /** Add a stream to the closed-tombstones set with bounded-LRU eviction.
     *  Set iteration order in JS is insertion order, so the first key is the
     *  oldest — delete it when we hit the cap. */
    private markStreamClosed;
    /** Send EOF. Zero-length, no credit needed. Closes the stream's outbound
     * CreditGate and marks the streamId as closed so subsequent sendData calls
     * reject cleanly. */
    sendEof(streamId: number): void;
    close(): Promise<void>;
    /** Full session-scoped state wipe. Used by connect() to supersede a
     *  prior session cleanly. close() does its own richer teardown (flushes
     *  pending batches first); this path is the "throw everything away"
     *  version for a reconnect-without-close.
     *
     *  Must also cancel any prior in-flight connect() (connectingWs /
     *  connectReject / pendingSecondaries) so a superseding connect() isn't
     *  racing a zombie handshake that can still mutate `this.ws`, credit
     *  gates, or `streamWs` between HELLO_OK and the next reset tick. */
    private resetSessionState;
}
export {};
