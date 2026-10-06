/**
 * WebSocket client for Subscribe to job events over WebSocket
 *
 * Generated from AsyncAPI specification
 * Protocol: ws
 * @see hoody-curl Job Events WebSocket API v0.1.0
 */
/** Minimal structural contract a WebSocket implementation must satisfy. */
export type IRawWebSocketMessageEvent = {
    data: string | ArrayBuffer | ArrayBufferView | Blob;
};
export type IRawWebSocketCloseEvent = {
    code: number;
    reason: string;
};
export interface IRawWebSocketLike {
    readyState: number;
    binaryType?: "arraybuffer" | "blob";
    onopen: (() => void) | null;
    onmessage: ((event: IRawWebSocketMessageEvent) => void) | null;
    onclose: ((event: IRawWebSocketCloseEvent) => void) | null;
    onerror: ((event: unknown) => void) | null;
    send(data: string | ArrayBuffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
}
export type IRawWebSocketCtor = new (url: string, protocols?: string | string[]) => IRawWebSocketLike;
/**
 * Injectable WebSocket transport.
 *
 * When supplied on the options bag this factory is the ONLY way the client
 * opens a socket: no `globalThis.WebSocket`, no dynamic `ws` import, no
 * silent degradation. A factory that throws (or rejects) fails the connect
 * rather than falling back to another transport, so a test double, a
 * proxy-aware socket or a header-capable implementation is guaranteed to be
 * the one in use.
 *
 * It is called once per connection attempt, including every reconnect.
 */
export type WebSocketFactory = (url: string, protocols?: string | string[], options?: {
    headers?: Record<string, string>;
}) => IRawWebSocketLike | Promise<IRawWebSocketLike>;
/**
 * One sequenced event from a gateway that stamps a cursor.
 *
 * The hoody-agent gateway publishes `{seq, event}` (plus `incarnation` and,
 * on the frame that parks a gate, `gate`) rather than a bare typed message.
 * A client that dispatched on `message.type` alone saw NOTHING on that
 * stream: the type lives one level down, on `event`.
 *
 * `seq` is the resume cursor. It is monotonic WITHIN an incarnation only —
 * a session torn down and re-attached restarts at 1 — so a cursor is only
 * meaningful together with the incarnation that stamped it.
 */
export interface IStreamEnvelope<TEvent = unknown> {
    kind: 'envelope';
    seq: number;
    incarnation?: string;
    gate?: {
        id: string;
        generation: number;
        type: string;
    };
    event: TEvent;
}
/**
 * The subscriber was dropped, or a resume cursor fell outside the replay
 * ring (or belonged to another incarnation).
 *
 * `code` distinguishes the two: `lagged` means the client was too slow and
 * events were dropped; `replay_gap` means the cursor it resumed with cannot
 * be served. Both are reconciled by reconnecting — the client does that
 * itself, from `min_seq` on a gap.
 */
export interface IStreamLaggedFrame {
    kind: 'lagged';
    code: string;
    min_seq?: number;
    max_seq?: number;
    incarnation?: string;
    resume?: string;
}
/** The ring-to-live boundary: everything before it was buffered replay. */
export interface IStreamReplayBoundaryFrame {
    kind: 'replay_boundary';
    max_seq?: number;
    incarnation?: string;
}
/** The stream is terminating; no further frame will arrive. */
export interface IStreamEndFrame {
    kind: 'end';
    reason?: string;
}
/**
 * The gateway refused a frame this client sent, on this connection only:
 * `frame` names the refused frame's type, `code` why (for example
 * `no_active_workflow` or `admission_unconfirmed` for a workflow_message).
 */
export interface IStreamRefusedFrame {
    kind: 'refused';
    code: string;
    frame?: string;
    reason?: string;
}
export type IStreamControlFrame = IStreamLaggedFrame | IStreamReplayBoundaryFrame | IStreamEndFrame | IStreamRefusedFrame;
/** Everything the stream yields, discriminated on `kind`. */
export type IStreamFrame<TEvent = unknown> = IStreamEnvelope<TEvent> | IStreamControlFrame;
/**
 * WebSocket connection configuration options
 */
export interface IWebSocketConnectionOptions {
    timeout?: number;
    reconnect?: boolean;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    reconnectDelayMax?: number;
    reconnectionDelayGrowFactor?: number;
    randomizationFactor?: number;
    auth?: Record<string, unknown>;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    transports?: Array<'websocket' | 'polling'>;
    path?: string;
    protocols?: string[];
    autoConnect?: boolean;
    /**
     * Transport used to open the socket. When set it is used exclusively —
     * see WebSocketFactory. Raw-WebSocket channels only; a Socket.IO client
     * rejects it at connect() instead of silently ignoring it.
     */
    webSocketFactory?: WebSocketFactory;
    /**
     * Cursor-preserving resume. When the client has seen a sequenced
     * envelope, every RECONNECT carries the last seq (and the incarnation
     * that stamped it) so the gateway replays from there instead of from
     * the top of its ring. Without this a reconnect silently loses every
     * event that arrived while the socket was down.
     *
     * On by default, and inert until a cursor exists — a channel that never
     * sends a seq never gets a resume parameter.
     *
     * A whole-number cursor given as `?since=` (URL or `query`) or as a
     * Last-Event-ID header only SEEDS the cursor: the first connect sends it,
     * reconnects send the live one. An incarnation given without a cursor is
     * sent on the first connect only.
     */
    streamResume?: {
        enabled?: boolean;
        /** Query parameter carrying the cursor. Default `since`. */
        param?: string;
        /** Query parameter carrying the incarnation. Default `incarnation`. */
        incarnationParam?: string;
        /**
         * Numeric field of a plain (non-envelope) frame that is the resume
         * cursor, e.g. hoody-watch's `id` for `since_id`. Unset: only
         * sequenced envelopes move the cursor.
         */
        cursorField?: string;
    };
}
export interface JobstartedServerMessage {
    job_id: string;
    name?: string;
    type: 'jobstarted';
}
export interface JobprogressServerMessage {
    job_id: string;
    progress: number;
    type: 'jobprogress';
}
export interface JobcompletedServerMessage {
    job_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    type: 'jobcompleted';
}
export interface ICurlWsJobEventsWebSocket {
    onJobstarted(callback: (message: JobstartedServerMessage) => void): () => void;
    onJobprogress(callback: (message: JobprogressServerMessage) => void): () => void;
    onJobcompleted(callback: (message: JobcompletedServerMessage) => void): () => void;
    /** Establish WebSocket connection */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    /** Reconnect to WebSocket server */
    reconnect(): Promise<void>;
    /**
     * Turn automatic reconnection on or off on a LIVE client.
     *
     * Disabling also cancels any reconnect already scheduled, so a consumer
     * shutting down does not race a pending backoff timer. Re-enabling does
     * not itself reconnect — call connect()/reconnect() for that.
     */
    setAutoReconnect(enabled: boolean): void;
    /** Whether automatic reconnection is currently enabled */
    readonly autoReconnect: boolean;
    /** Disconnect from WebSocket server */
    disconnect(reason?: string): void;
    /** Called when WebSocket connection is established */
    onConnect(callback: () => void): () => void;
    /** Called when WebSocket connection is closed */
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    /** Called when reconnection attempt starts */
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    /** Called when reconnection succeeds */
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    /** Called when all reconnection attempts fail */
    onReconnectFailed(callback: () => void): () => void;
    /** Called when WebSocket error occurs */
    onError(callback: (error: Error) => void): () => void;
    /** Remove event listener(s) */
    off(event: string, callback?: Function): void;
    /** Remove all listeners for event or all events */
    removeAllListeners(event?: string): void;
    /** Close the WebSocket connection */
    close(code?: number, reason?: string): void;
    /** WebSocket ready state */
    readonly readyState: number;
    /** WebSocket URL */
    readonly url: string;
    /** Whether currently connected */
    readonly connected: boolean;
    /** Whether currently attempting to reconnect */
    readonly reconnecting: boolean;
    /**
     * Sequenced events, as the gateway publishes them.
     *
     * Separate from the per-type handlers because an envelope carries no
     * top-level `type` — the type is on `event`, one level down.
     */
    onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void;
    /** Every control frame: lagged, replay_boundary, end, refused. */
    onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void;
    /** Dropped for slowness, or a resume cursor the ring cannot serve. */
    onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void;
    /** The replay tail ended; everything after this frame is live. */
    onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void;
    /** The stream is over. No reconnect follows — the session is gone. */
    onEnd(callback: (frame: IStreamEndFrame) => void): () => void;
    /** The gateway refused a frame this client sent (code, the frame type, reason). */
    onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void;
    /**
     * Every envelope and control frame as one async iterable, in arrival
     * order, ending after the `end` frame.
     *
     * Frames that arrive while nothing is awaiting are queued, so a consumer
     * that starts iterating after connect() still sees the replay tail.
     */
    frames(): AsyncIterableIterator<IStreamFrame>;
    /** The last seq seen. Survives reconnects; this is the resume cursor. */
    readonly cursor: number | undefined;
    /** The incarnation that stamped `cursor`, when the gateway sends one. */
    readonly incarnation: string | undefined;
    /**
     * Seed the cursor before connecting — resume a stream this client did
     * not itself read. `undefined` clears it and replays from the ring.
     */
    setCursor(seq: number | undefined, incarnation?: string): void;
}
export declare class CurlWsJobEventsWebSocket implements ICurlWsJobEventsWebSocket {
    private ws;
    private eventHandlers;
    private options;
    private _url;
    private reconnectAttempts;
    private reconnectTimer;
    private _reconnecting;
    private shouldReconnect;
    private _frameQueue;
    private _dispatchAlive;
    private _socketGen;
    private _cursor;
    private _incarnation;
    private _firstIncarnation;
    private _frameBuffer;
    private _frameWaiters;
    private _streamEnded;
    constructor(url: string, options?: IWebSocketConnectionOptions);
    /**
     * Turns a resume point the caller put on the URL, in `options.query` or in
     * a Last-Event-ID header into the live cursor, and removes it from all
     * three. Left in place it went out on EVERY reconnect: the URL value beat
     * the live cursor, and the gateway reads Last-Event-ID before ?since=, so
     * each reconnect replayed from the original point. Only a whole-number
     * cursor is taken; any other value stays where the caller put it.
     */
    private takeResumeSeed;
    /**
     * Establish WebSocket connection
     */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    private createRawSocket;
    /**
     * Manually trigger reconnection
     */
    reconnect(): Promise<void>;
    /**
     * Turn automatic reconnection on or off on a LIVE client.
     *
     * `reconnect` was construction-time only, so a consumer that wanted to
     * stop reconnecting had to tear the client down. Disabling here also
     * clears any scheduled attempt and drops the `reconnecting` flag, so no
     * backoff timer survives the switch. Enabling does not reconnect by
     * itself — it only re-arms the close handler for the NEXT drop.
     */
    setAutoReconnect(enabled: boolean): void;
    get autoReconnect(): boolean;
    /**
     * Disconnect from server
     */
    disconnect(reason?: string): void;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
    /**
     * Clear reconnection timer
     */
    private clearReconnectTimer;
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
    private handleString;
    /** The original per-type dispatch, unchanged in behaviour. */
    private dispatchTypedMessage;
    /** Normalise a gateway control frame and publish it. */
    private handleControlFrame;
    /**
     * Hand one frame to frames(): to a pending next(), or to the queue.
     *
     * Queueing matters — connect() resolves on open, and the gateway writes
     * its replay tail immediately, so a consumer that starts iterating after
     * connect() would otherwise miss everything replayed in between.
     */
    private pushStreamFrame;
    /**
     * Handle an incoming BINARY frame. Default implementation decodes
     * the bytes as UTF-8 and routes them to `handleString` — i.e. for
     * JSON-typed channels the binary path is behaviour-equivalent to the
     * string path. Byte-prefix channels override this method.
     */
    private handleBinary;
    /**
     * Backwards-compat shim for any subclass that still calls handleMessage.
     * Delegates to handleString.
     */
    private handleMessage;
    /**
     * Send message to server
     */
    private send;
    /**
     * @param callback Function to call when jobstarted message received
     * @returns Unsubscribe function
     */
    onJobstarted(callback: (message: JobstartedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when jobprogress message received
     * @returns Unsubscribe function
     */
    onJobprogress(callback: (message: JobprogressServerMessage) => void): () => void;
    /**
     * @param callback Function to call when jobcompleted message received
     * @returns Unsubscribe function
     */
    onJobcompleted(callback: (message: JobcompletedServerMessage) => void): () => void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    onReconnectFailed(callback: () => void): () => void;
    onError(callback: (error: Error) => void): () => void;
    /**
     * Add event listener
     * @returns Unsubscribe function
     */
    private addEventListener;
    /**
     * Remove event listener(s)
     */
    off(event: string, callback?: Function): void;
    /**
     * Remove all listeners
     */
    removeAllListeners(event?: string): void;
    /**
     * Emit event to all registered handlers
     */
    private emitEvent;
    close(code?: number, reason?: string): void;
    get readyState(): number;
    get url(): string;
    get connected(): boolean;
    get reconnecting(): boolean;
    onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void;
    onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void;
    onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void;
    onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void;
    onEnd(callback: (frame: IStreamEndFrame) => void): () => void;
    onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void;
    /**
     * Every frame as one async iterable. SINGLE consumer: frames are handed
     * out once, so two concurrent iterators would split the stream between
     * them. Use onEnvelope()/onControlFrame() for fan-out.
     */
    frames(): AsyncIterableIterator<IStreamFrame>;
    get cursor(): number | undefined;
    get incarnation(): string | undefined;
    setCursor(seq: number | undefined, incarnation?: string): void;
}
