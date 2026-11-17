/**
 * WebSocket client for cron_streamEventsWs
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Cron Event Stream (WebSocket) v1.0.0
 */
export type { WebSocketUpgradeRefusedError } from "../../lib/websocket-errors.js";
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
    /**
     * How many automatic reconnect attempts may follow one another before
     * the client gives up and calls onReconnectFailed. Default: no limit.
     * The count starts over after a connection that lasted
     * reconnectStableMs, and on connect() and reconnect().
     *
     * Set a limit when the client may run on a browser WebSocket or on
     * Node's built-in one. Those hide the HTTP status of a refused upgrade,
     * so a route that is gone for good (401, 403, 404) looks like a network
     * drop and is retried, one attempt per reconnectDelayMax (30 s by
     * default), until this limit. With the `ws` package the status is
     * visible and such a refusal ends the series at once.
     */
    reconnectAttempts?: number;
    reconnectDelay?: number;
    reconnectDelayMax?: number;
    reconnectionDelayGrowFactor?: number;
    randomizationFactor?: number;
    auth?: Record<string, unknown>;
    headers?: Record<string, string>;
    /**
     * The header names a credential given for THIS socket would travel in (a
     * per-call kitAuth's header, whatever its name, or a credential header on
     * the call). A browser WebSocket cannot send headers, so connect() rejects
     * with a WebSocketCredentialNotSentError when one of these names is among
     * the headers, instead of opening a socket that looks unauthenticated.
     * Unset, the dropped credential header names are reported once with a
     * warning and the socket opens. It has no effect outside a browser.
     */
    requireHeaderCredentials?: string[];
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
     * Steers the client's own choice of transport. "ws" opens the socket with
     * the `ws` package (in a Bun binary, Bun's built-in `ws`), never with the
     * global WebSocket, and fails the connect when `ws` cannot be loaded. Only
     * that transport shows the status and body of a refused upgrade (see
     * WebSocketUpgradeFailedError). A webSocketFactory or a static
     * webSocketImpl the caller injected still wins: this option only steers
     * the automatic choice. Refused in a browser and on Socket.IO channels.
     * "auto" (the default) keeps the client's own choice.
     */
    socketTransport?: "auto" | "ws";
    /**
     * Reconnect after the SERVER closed the socket normally (code 1000).
     * Off by default: a normal close means the server ended the stream on
     * purpose (a deleted terminal session closes this way), and reconnecting
     * to it can silently re-create what was just deleted.
     * A close because another connection took over (reason "taken over")
     * is never reconnected, even with this on: see onTakenOver.
     */
    reconnectOnNormalClose?: boolean;
    /**
     * How long a connection must stay open before the reconnect backoff
     * starts over. Default 30000. A server that accepts and then closes
     * sooner than this keeps the delay growing instead of being retried at
     * the first step forever.
     */
    reconnectStableMs?: number;
    /**
     * Supplies the URL for every open AFTER the first one: each automatic
     * reconnect, reconnect(), and a connect() that follows a disconnect().
     * For routes whose URL holds a single-use value (a socket ticket): run
     * the operation that issues it again and return the new URL. A provider
     * that throws fails that attempt; an automatic reconnect tries again
     * after the next backoff delay.
     *
     * A fresh URL does not reopen a refused connection: when the server
     * answers the upgrade with a 4xx status (other than 408, 425 or 429)
     * the reconnect series ends, even though the provider issued that URL
     * a moment before. onError carries the status; call connect() to try again.
     */
    urlProvider?: (context: {
        previousUrl: string;
        attempt: number;
        reconnect: boolean;
    }) => string | Promise<string>;
    /**
     * Half-open detection: when nothing has arrived for this many
     * milliseconds the link is treated as dead. The client reports
     * disconnect (1006, "liveness timeout") and reconnects as after any
     * other drop. Every received message counts as activity.
     *
     * Default: 75000 when the transport can send protocol pings (the `ws`
     * package, which this client uses on Node); the client then pings on
     * its own and counts pings and pongs too, so a quiet but healthy stream
     * is never cut. A browser WebSocket (and Bun's or Deno's) hides pings:
     * there the default is 75000 only on a channel with its own ping frame,
     * which the client then sends, and off otherwise. Set it there only
     * above the longest silence the server allows itself, such as its
     * heartbeat interval. 0 turns it off.
     */
    idleTimeoutMs?: number;
    /**
     * Find out why a reconnect keeps failing. A browser WebSocket and Node's
     * built-in one hide the HTTP status of a refused upgrade: a 401, 403 or
     * 404 looks like a network drop. After this many automatic attempts in
     * a row that never opened (default 3; 0 turns it off), the client sends
     * one plain GET to the same URL: the same query, the headers this
     * transport may send (none in a browser, which sends its cookies
     * instead), a 5 s timeout, redirects not followed. On 401, 403 or 404
     * automatic reconnect stops: onError receives a
     * WebSocketUpgradeRefusedError carrying the status and the server's
     * error code, then onReconnectFailed. Any other answer, or none, and the
     * backoff goes on; the next probe follows after as many failures again.
     * With the `ws` package the status is visible at once and ends the
     * series with the same error, without a probe. Not used with a
     * webSocketFactory, which owns the network path. A server whose route
     * answers a plain GET differently from an upgrade (400 or 426 before
     * any permission check) cannot be told apart this way.
     */
    refusalProbeAfter?: number;
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
export interface EntryCreatedServerMessage {
    /** The entry's own fields, as GET /users/{user}/entries/{id} returns them without its run times and last run */
    entry: {
        command: string;
        comment?: unknown;
        created_at: string;
        enabled: boolean;
        expired: boolean;
        expires_at?: unknown;
        id: string;
        name?: unknown;
        schedule: string;
        schedule_human: string;
        updated_at: string;
        user: string;
        warnings?: string[];
    };
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** api: a request to this service. expired: the sweep removed the entry after its expires_at. external: an edit made outside this service (crontab -e, crontab -r), seen within about 2 s. */
    source: 'api' | 'external';
    /** When the service recorded the event */
    time: string;
    type: 'entry_created';
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface EntryUpdatedServerMessage {
    /** The fields that changed */
    changed: 'schedule' | 'command' | 'name' | 'comment' | 'expires_at' | 'enabled' | 'updated_at'[];
    /** The entry's own fields, as GET /users/{user}/entries/{id} returns them without its run times and last run */
    entry: {
        command: string;
        comment?: unknown;
        created_at: string;
        enabled: boolean;
        expired: boolean;
        expires_at?: unknown;
        id: string;
        name?: unknown;
        schedule: string;
        schedule_human: string;
        updated_at: string;
        user: string;
        warnings?: string[];
    };
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** api: a request to this service. expired: the sweep removed the entry after its expires_at. external: an edit made outside this service (crontab -e, crontab -r), seen within about 2 s. */
    source: 'api' | 'external';
    /** When the service recorded the event */
    time: string;
    type: 'entry_updated';
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface EntryDeletedServerMessage {
    /** Id of the deleted entry */
    entry_id: string;
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** Name the entry had */
    name: unknown;
    /** api: a request to this service. expired: the sweep removed the entry after its expires_at. external: an edit made outside this service (crontab -e, crontab -r), seen within about 2 s. */
    source: 'api' | 'expired' | 'external';
    /** When the service recorded the event */
    time: string;
    type: 'entry_deleted';
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface CrontabChangedServerMessage {
    /** Managed entries created by the change */
    added: string[];
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** Whether lines other than managed entries changed */
    raw_lines_changed: boolean;
    /** Managed entries removed by the change */
    removed: string[];
    /** api: a request to this service. expired: the sweep removed the entry after its expires_at. external: an edit made outside this service (crontab -e, crontab -r), seen within about 2 s. */
    source: 'api' | 'external';
    /** When the service recorded the event */
    time: string;
    type: 'crontab_changed';
    /** Managed entries updated by the change */
    updated: string[];
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface JobStartedServerMessage {
    /** The managed entry whose job runs */
    entry_id: string;
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** Process id of the job's shell */
    pid: number;
    /** Id of the run, the same in job_started and job_finished and in GET /api/v1/cron/runs */
    run_id: string;
    /** When the job reported its start */
    started_at: string;
    /** When the service recorded the event */
    time: string;
    type: 'job_started';
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface JobFinishedServerMessage {
    duration_ms: number;
    /** The managed entry whose job ran */
    entry_id: string;
    /** The command's exit status; null when the outcome is lost */
    exit_code: unknown;
    /** When the job reported its end, or when its shell was seen to exit */
    finished_at: string;
    /** Event id, increasing. Pass the last one received as `since_id` to resume. */
    id: number;
    /** exited: the job reported its end. lost: its shell exited without that report (the command replaced the shell with exec or set its own EXIT trap, or the shell was killed). */
    outcome: 'exited' | 'lost';
    /** Process id of the job's shell */
    pid: number;
    /** Id of the run, the same in job_started and job_finished and in GET /api/v1/cron/runs */
    run_id: string;
    /** When the job reported its start */
    started_at: string;
    /** When the service recorded the event */
    time: string;
    type: 'job_finished';
    /** The user whose crontab or job the event is about */
    user: string;
}
export interface LagServerMessage {
    newest_available_id?: unknown;
    oldest_available_id?: unknown;
    /** Always false: the retained history no longer covers the gap, and the stream ends after this frame */
    recoverable: false;
    /** Id of the last event sent before the gap */
    since_id: number;
    /** Events the client fell behind by */
    skipped: number;
    type: 'lag';
}
export interface ICronEventsConnectWebSocket {
    onEntryCreated(callback: (message: EntryCreatedServerMessage) => void): () => void;
    onEntryUpdated(callback: (message: EntryUpdatedServerMessage) => void): () => void;
    onEntryDeleted(callback: (message: EntryDeletedServerMessage) => void): () => void;
    onCrontabChanged(callback: (message: CrontabChangedServerMessage) => void): () => void;
    onJobStarted(callback: (message: JobStartedServerMessage) => void): () => void;
    onJobFinished(callback: (message: JobFinishedServerMessage) => void): () => void;
    onLag(callback: (message: LagServerMessage) => void): () => void;
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
    isAutoReconnect(): boolean;
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
    /**
     * Called when WebSocket error occurs. A frame of type "error" the server
     * sent arrives here as a WebSocketServerError (name "WebSocketServerError",
     * with its `code` and the `frame`): the server refused one request, and
     * the connection stays open unless a close follows.
     */
    onError(callback: (error: Error) => void): () => void;
    /**
     * Called when the server closed the connection because another one took
     * its place (close 1000, reason "taken over"; a Bot's voice has one
     * controller). No automatic reconnect follows, even with
     * reconnectOnNormalClose: connect again (with takeover) only when the
     * user asks for it, or two always-connected clients take it from each
     * other forever. onDisconnect still runs first.
     */
    onTakenOver(callback: (reason: string) => void): () => void;
    /** Remove event listener(s) */
    off(event: string, callback?: Function): void;
    /** Remove all listeners for event or all events */
    removeAllListeners(event?: string): void;
    /** Close the WebSocket connection */
    close(code?: number, reason?: string): void;
    /** WebSocket ready state */
    getReadyState(): number;
    /** WebSocket URL */
    getUrl(): string;
    /** Whether currently connected */
    isConnected(): boolean;
    /** Whether currently attempting to reconnect */
    isReconnecting(): boolean;
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
    getCursor(): number | undefined;
    /** The incarnation that stamped the cursor (`getCursor()`), when the gateway sends one. */
    getIncarnation(): string | undefined;
    /**
     * Seed the cursor before connecting — resume a stream this client did
     * not itself read. `undefined` clears it and replays from the ring.
     */
    setCursor(seq: number | undefined, incarnation?: string): void;
}
/**
 * A frame of type "error" the server sent: it refused one request, and the
 * connection stays open unless a close follows. onError receives it as this
 * Error, never as the bare frame, so `name` tells it from a transport failure.
 * `code` is the frame's code (or its `error.code` / `error.type`), else
 * "server_error"; `frame` is the frame as received.
 */
export interface WebSocketServerError extends Error {
    name: "WebSocketServerError";
    code: string;
    frame: Record<string, unknown>;
}
export declare class CronEventsConnectWebSocket implements ICronEventsConnectWebSocket {
    /**
     * The socket constructor every instance of this client uses, in place of
     * its own choice (the `ws` package on Node, the global WebSocket
     * elsewhere). It is called as `new ctor(url, protocols)`, like a browser
     * WebSocket, so headers are not passed. A webSocketFactory in the options
     * still wins. Unset (the default) restores the client's own choice.
     */
    static webSocketImpl: IRawWebSocketCtor | undefined;
    private ws;
    private eventHandlers;
    private options;
    private _url;
    private reconnectAttempts;
    private reconnectTimer;
    private _reconnecting;
    private shouldReconnect;
    private _urlSpent;
    private _livenessTimer;
    private _openAttempt;
    private _unopenedFailures;
    private _lastConnectUrl;
    private _lastSocketGlobal;
    private _upgradeReadAbort;
    private _retiredByDisconnect;
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
     * Establish WebSocket connection.
     *
     * A second connect() (or reconnect()) made while this one is still
     * opening replaces it: this one then rejects with "WebSocket connect
     * superseded", and the new call owns the connection.
     */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    /**
     * Open one socket. `isRetry` is true for an automatic reconnect attempt and
     * false for a connect the caller asked for.
     */
    private openSocket;
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
    isAutoReconnect(): boolean;
    /**
     * Disconnect from server
     */
    disconnect(reason?: string): void;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
    /**
     * One plain GET to the URL the failing sockets used, to learn the status the
     * transport hid. Ends the series on 401, 403 or 404; otherwise the backoff
     * goes on. `attempt` is the open attempt that failed: a disconnect() or a
     * new connect() meanwhile makes the answer irrelevant.
     */
    private probeRefusal;
    /** Stop the liveness timer of the current socket. */
    private stopLiveness;
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
    /** The per-type dispatch. */
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
    /** End frames() without an end frame: the socket is gone and none follows. */
    private endFrames;
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
     * @param callback Function to call when entry_created message received
     * @returns Unsubscribe function
     */
    onEntryCreated(callback: (message: EntryCreatedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when entry_updated message received
     * @returns Unsubscribe function
     */
    onEntryUpdated(callback: (message: EntryUpdatedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when entry_deleted message received
     * @returns Unsubscribe function
     */
    onEntryDeleted(callback: (message: EntryDeletedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when crontab_changed message received
     * @returns Unsubscribe function
     */
    onCrontabChanged(callback: (message: CrontabChangedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when job_started message received
     * @returns Unsubscribe function
     */
    onJobStarted(callback: (message: JobStartedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when job_finished message received
     * @returns Unsubscribe function
     */
    onJobFinished(callback: (message: JobFinishedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when lag message received
     * @returns Unsubscribe function
     */
    onLag(callback: (message: LagServerMessage) => void): () => void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    onReconnectFailed(callback: () => void): () => void;
    onError(callback: (error: Error) => void): () => void;
    onTakenOver(callback: (reason: string) => void): () => void;
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
    getReadyState(): number;
    getUrl(): string;
    /**
     * The socket of the current connection, or null when there is none. It is
     * replaced on every reconnect, so read it again after each `connect`
     * event instead of keeping it. For code that needs what the transport
     * offers beyond this client (the `ws` package: ping(), the ping and pong
     * events); do not assign its on* handlers, the client owns them.
     */
    getRawSocket(): IRawWebSocketLike | null;
    isConnected(): boolean;
    isReconnecting(): boolean;
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
    getCursor(): number | undefined;
    getIncarnation(): string | undefined;
    setCursor(seq: number | undefined, incarnation?: string): void;
}
