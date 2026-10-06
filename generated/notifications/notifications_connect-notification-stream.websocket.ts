/**
 * WebSocket client for Real-time notification stream (WebSocket or SSE)
 * 
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Notification Stream v1.0.0
 */


/** Minimal structural contract a WebSocket implementation must satisfy. */
export type IRawWebSocketMessageEvent = { data: string | ArrayBuffer | ArrayBufferView | Blob };
export type IRawWebSocketCloseEvent = { code: number; reason: string };

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
export type WebSocketFactory = (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => IRawWebSocketLike | Promise<IRawWebSocketLike>;

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
  gate?: { id: string; generation: number; type: string };
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

export type IStreamControlFrame =
  | IStreamLaggedFrame
  | IStreamReplayBoundaryFrame
  | IStreamEndFrame
  | IStreamRefusedFrame;

/** Everything the stream yields, discriminated on `kind`. */
export type IStreamFrame<TEvent = unknown> =
  | IStreamEnvelope<TEvent>
  | IStreamControlFrame;

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

// ============================================================================
// Client → Server Messages
// ============================================================================

export interface SubscribeClientMessage {
  /** Message type discriminator */
  type: 'subscribe';
  /** Display IDs ("1" or ":1"), or ["all"] / ["*"] for every display */
  displays: string[];
}

export interface UnsubscribeClientMessage {
  /** Message type discriminator */
  type: 'unsubscribe';
  /** Display IDs ("1" or ":1"), or ["all"] / ["*"] for every display */
  displays: string[];
}

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface NotificationServerMessage {
  data: unknown;
  /** Display ID this notification pertains to */
  display: string;
  /** Message type discriminator */
  type: 'notification';
}

export interface HeartbeatServerMessage {
  /** Message type discriminator */
  type: 'heartbeat';
  /** Server time, Unix milliseconds */
  timestamp: number;
}

export interface ErrorServerMessage {
  /** Message type discriminator */
  type: 'error';
  /** What went wrong: `Connection limit exceeded` (socket then closes), `Invalid display ID: <id>` (socket stays open) or `Message rate limit exceeded` (socket then closes with 1008) */
  error: string;
}

export interface ConnectedServerMessage {
  /** Message type discriminator */
  type: 'connected';
  /** `"all"` for a wildcard subscription, otherwise the display IDs without the colon prefix */
  displays: unknown;
}

export interface SubscribedServerMessage {
  /** Message type discriminator */
  type: 'subscribed';
  /** `"all"` for a wildcard subscription, otherwise the display IDs without the colon prefix */
  displays: unknown;
}

export interface ResyncServerMessage {
  /** Message type discriminator */
  type: 'resync';
  /** Number of notifications not delivered on this connection */
  skipped: number;
  /** Server time, Unix milliseconds */
  timestamp: number;
}


export interface INotificationsConnectNotificationStreamWebSocket {
  // ============================================================================
  // Send Messages (Client → Server)
  // ============================================================================

  subscribe(displays: string[]): void;

  unsubscribe(displays: string[]): void;

  // ============================================================================
  // Receive Messages (Server → Client)
  // ============================================================================

  onNotification(callback: (message: NotificationServerMessage) => void): () => void;

  onHeartbeat(callback: (message: HeartbeatServerMessage) => void): () => void;

  onConnected(callback: (message: ConnectedServerMessage) => void): () => void;

  onSubscribed(callback: (message: SubscribedServerMessage) => void): () => void;

  onResync(callback: (message: ResyncServerMessage) => void): () => void;

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

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

  // ============================================================================
  // Gateway stream (sequenced envelopes + control frames)
  // ============================================================================

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

const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;

export class NotificationsConnectNotificationStreamWebSocket implements INotificationsConnectNotificationStreamWebSocket {
  private ws: IRawWebSocketLike | null = null;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private options: IWebSocketConnectionOptions;
  private _url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnecting = false;
  private shouldReconnect = true;
  // FIFO queue for message dispatch — preserves frame ordering even when
  // a Blob frame requires async arrayBuffer() decode and a later string/
  // ArrayBuffer frame arrives synchronously.
  private _frameQueue: Promise<void> = Promise.resolve();
  // Dispatch token for the CURRENT socket. Invalidated on manual
  // disconnect() and on the onclose settle-timeout, so a late frame
  // (hung Blob decode) can never dispatch after `disconnect` was
  // announced. Deliberately separate from _socketGen: bumping the
  // generation in disconnect() would make the gen-guarded onclose
  // suppress the manual-disconnect event itself.
  private _dispatchAlive: { alive: boolean } = { alive: true };
  // Generation counter. Bumped synchronously in connect()/reconnect()/
  // disconnect() so queued tasks tagged with an old generation become
  // no-ops if the socket has been swapped out — prevents stale-Blob
  // microtasks from dispatching into a new socket\u2019s handlers.
  private _socketGen = 0;
  // Resume cursor. Updated from every sequenced envelope and deliberately
  // NOT cleared by disconnect()/reconnect(): surviving the drop is the
  // whole point — it is what the next connect sends as ?since=.
  private _cursor: number | undefined = undefined;
  private _incarnation: string | undefined = undefined;
  // An incarnation the caller gave WITHOUT a cursor: sent on the next
  // connect only, never on the reconnects after it.
  private _firstIncarnation: string | undefined = undefined;
  // Frames buffered for frames(); drained by whoever awaits next().
  private _frameBuffer: IStreamFrame[] = [];
  private _frameWaiters: Array<(result: IteratorResult<IStreamFrame>) => void> = [];
  private _streamEnded = false;

  constructor(url: string, options?: IWebSocketConnectionOptions) {
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
  private takeResumeSeed(): void {
    const resume = this.options.streamResume;
    if (resume?.enabled === false) return;
    const sinceParam = resume?.param ?? "since";
    const incarnationParam = resume?.incarnationParam ?? "incarnation";
    const isSeq = (v: string | null | undefined): v is string => typeof v === "string" && /^\d+$/.test(v.trim());
    let since: string | undefined;
    let incarnation: string | undefined;
    let urlObj: URL | undefined;
    try {
      urlObj = new URL(this._url);
    } catch {
      urlObj = undefined;
    }
    // Same precedence as the connect URL and the gateway: URL, then
    // options.query (which overwrites the URL), then Last-Event-ID.
    const urlSince = urlObj?.searchParams.get(sinceParam);
    if (isSeq(urlSince)) {
      since = urlSince;
      urlObj!.searchParams.delete(sinceParam);
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
        if (isSeq(headers![name])) since = headers![name];
        delete headers![name];
        droppedHeader = true;
      }
    }
    // The incarnation goes with the resume point; it is moved even without
    // one, so it is sent once instead of on every reconnect.
    const urlIncarnation = urlObj?.searchParams.get(incarnationParam);
    if (urlIncarnation) {
      incarnation = urlIncarnation;
      urlObj!.searchParams.delete(incarnationParam);
    }
    if (query && query[incarnationParam]) {
      incarnation = query[incarnationParam];
      delete query[incarnationParam];
    }
    if (since === undefined && incarnation === undefined && !droppedHeader) return;
    if (urlObj) this._url = urlObj.toString();
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
    } else if (incarnation !== undefined) {
      this._firstIncarnation = incarnation;
    }
  }

  /**
   * Establish WebSocket connection
   */
  async connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void> {
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
            try { this.ws.binaryType = "arraybuffer"; } catch { /* not supported on this runtime */ }
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
            const raw: unknown = (event as { data: unknown }).data;
            // Every dispatch callback is exception-fenced: a throwing frame
            // handler would otherwise leave _frameQueue REJECTED, and since the
            // chain grows via .then(fn) every subsequent frame would be
            // silently dropped for the life of the socket.
            // Synchronous string fast path.
            if (typeof raw === "string") {
              this._frameQueue = this._frameQueue.then(() => {
                try {
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleString(raw);
                } catch (err) {
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
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleBinary(buf);
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // ArrayBufferView covers Node Buffer + Uint8Array w/ non-zero offset.
            if (raw && typeof (raw as ArrayBufferView).byteLength === "number"
                && typeof (raw as ArrayBufferView).buffer !== "undefined") {
              const v = raw as ArrayBufferView;
              const buf = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
              this._frameQueue = this._frameQueue.then(() => {
                try {
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleBinary(buf);
                } catch (err) {
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
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // Unknown shape — best-effort string coercion.
            this._frameQueue = this._frameQueue.then(() => {
              try {
                if (this._socketGen === installedGen && dispatchAlive.alive) this.handleString(String(raw));
              } catch (err) {
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
            const cap = new Promise<void>((resolveCap) => {
              const t = setTimeout(resolveCap, 1000);
              (t as unknown as { unref?: () => void }).unref?.();
            });
            void Promise.race([settled, cap]).then(() => {
              // Whether the queue settled or the cap fired, no frame may
              // dispatch after the disconnect announcement below.
              dispatchAlive.alive = false;
              if (this._socketGen !== installedGen) return;
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
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      })();
    });
  }

  private async createRawSocket(): Promise<IRawWebSocketLike> {
    // Assemble the connect URL: base URL + optional Socket.IO `path` + optional `query`.
    // Native WebSocket cannot take custom headers, so anything auth-like that the
    // caller supplied via `options.auth.token` is also folded into the query string.
    // This intentionally mirrors terminal-client.ts — the leakage tradeoff of URL-
    // embedded tokens is inherent to the browser WebSocket API.
    const buildConnectUrl = (): string => {
      try {
        const urlObj = new URL(this._url);
        if (this.options.path) {
          if (!urlObj.pathname || urlObj.pathname === "/" || urlObj.pathname === "") {
            urlObj.pathname = this.options.path;
          }
        }
        if (this.options.query) {
          for (const [k, v] of Object.entries(this.options.query)) {
            if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
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
        const auth = this.options.auth as { token?: unknown } | undefined;
        if (auth && typeof auth.token === "string" && auth.token.length > 0 && !urlObj.searchParams.has("token")) {
          urlObj.searchParams.set("token", auth.token);
        }
        return urlObj.toString();
      } catch {
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
    const isBrowserRuntime = typeof (globalThis as { window?: unknown }).window !== "undefined"
      && typeof (globalThis as { document?: unknown }).document !== "undefined";
    const globalCtor = (globalThis as { WebSocket?: IRawWebSocketCtor }).WebSocket;
    if (typeof globalCtor === "function" && (isBrowserRuntime || !hasHeaders)) {
      if (isBrowserRuntime && hasHeaders) {
        // A browser WebSocket cannot send headers, so kitAuth password, jwt
        // and identity headers never reach the upgrade. The proxy accepts two
        // header-free forms: a token group read from a query parameter, or a
        // cookie on the kit host. Say so once instead of failing silently.
        const dropped = Object.keys(this.options.headers!).filter((name) => /^(authorization|cookie|x-hoody-[\w-]+|proxy-authorization)$/i.test(name));
        const flags = globalThis as { __hoodyWsHeaderWarned?: boolean };
        if (dropped.length > 0 && !flags.__hoodyWsHeaderWarned) {
          flags.__hoodyWsHeaderWarned = true;
          console.warn(`[hoody-sdk] a browser WebSocket cannot send headers; ${dropped.join(", ")} not sent on the upgrade. Use a proxy token group read from a query parameter, or a cookie on the kit host.`);
        }
      }
      return new globalCtor(connectUrl, this.options.protocols);
    }

    const specifier = "ws";
    let wsModule: { default?: IRawWebSocketCtor };
    try {
      wsModule = await import(specifier) as { default?: IRawWebSocketCtor };
    } catch {
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
    const wsOptions: { headers?: Record<string, string> } = {};
    if (hasHeaders) {
      wsOptions.headers = this.options.headers!;
    }
    return new (wsModule.default as unknown as new (url: string, protocols?: string | string[], opts?: unknown) => IRawWebSocketLike)(connectUrl, this.options.protocols, wsOptions);
  }

  /**
   * Manually trigger reconnection
   */
  async reconnect(): Promise<void> {
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
  setAutoReconnect(enabled: boolean): void {
    this.options.reconnect = enabled;
    if (!enabled) {
      this.clearReconnectTimer();
      this._reconnecting = false;
    }
  }

  get autoReconnect(): boolean {
    return this.options.reconnect !== false;
  }

  /**
   * Disconnect from server
   */
  disconnect(reason?: string): void {
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
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.options.reconnectAttempts ?? Infinity)) {
      this._reconnecting = false;
      this.emitEvent("reconnect_failed");
      return;
    }

    this._reconnecting = true;
    const delay = Math.min(
      this.options.reconnectDelay! * Math.pow(this.options.reconnectionDelayGrowFactor!, this.reconnectAttempts),
      this.options.reconnectDelayMax!
    );

    // Add randomization to prevent thundering herd
    const jitter = delay * this.options.randomizationFactor! * (Math.random() - 0.5) * 2;
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
  private clearReconnectTimer(): void {
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
  private handleString(data: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      return;
    }
    if (!message || typeof message !== "object") {
      return;
    }

    if (typeof message.seq === "number" && "event" in message) {
      const envelope: IStreamEnvelope = {
        kind: "envelope",
        seq: message.seq,
        event: message.event,
      };
      if (typeof message.incarnation === "string") {
        envelope.incarnation = message.incarnation;
        this._incarnation = message.incarnation;
      }
      const gate = message.gate as IStreamEnvelope["gate"] | undefined;
      if (gate && typeof gate === "object") {
        envelope.gate = gate;
      }
      // Advance the cursor BEFORE any handler runs: a consumer that throws
      // must not cost us the resume point for every later reconnect.
      this._cursor = message.seq;
      this.emitEvent("__envelope", envelope);
      this.pushStreamFrame(envelope);
      const inner = message.event as { type?: unknown } | null;
      if (inner && typeof inner === "object" && typeof inner.type === "string") {
        this.dispatchTypedMessage(inner.type, inner);
      }
      return;
    }

    // A plain frame that carries the declared resume cursor advances it
    // before any handler runs, as an envelope seq does.
    const __cursorField = this.options.streamResume?.cursorField;
    if (__cursorField && typeof message[__cursorField] === "number") {
      this._cursor = message[__cursorField] as number;
    }
    const messageType = message.type;
    if (messageType === "lagged" || messageType === "replay_boundary" || messageType === "end" || messageType === "refused") {
      this.handleControlFrame(messageType, message);
      return;
    }

    this.dispatchTypedMessage(messageType, message);
  }

  /** The original per-type dispatch, unchanged in behaviour. */
  private dispatchTypedMessage(messageType: unknown, message: unknown): void {
    const handlers = this.eventHandlers.get(messageType as string);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`Error handling message ${messageType}:`, error);
        }
      });
    }
  }

  /** Normalise a gateway control frame and publish it. */
  private handleControlFrame(type: string, message: Record<string, unknown>): void {
    if (typeof message.incarnation === "string") {
      this._incarnation = message.incarnation;
    }
    let frame: IStreamControlFrame;
    if (type === "lagged") {
      const lagged: IStreamLaggedFrame = {
        kind: "lagged",
        code: typeof message.code === "string" ? message.code : "lagged",
      };
      if (typeof message.min_seq === "number") lagged.min_seq = message.min_seq;
      if (typeof message.max_seq === "number") lagged.max_seq = message.max_seq;
      if (typeof message.incarnation === "string") lagged.incarnation = message.incarnation;
      if (typeof message.resume === "string") lagged.resume = message.resume;
      if (lagged.code === "replay_gap") {
        // The cursor we resumed with is outside the ring (or belongs to a
        // different incarnation). Re-sending it would be rejected forever,
        // so fall back to the oldest seq the ring still holds.
        this._cursor = typeof lagged.min_seq === "number" ? lagged.min_seq : undefined;
        if (typeof lagged.incarnation === "string") {
          this._incarnation = lagged.incarnation;
        } else {
          this._incarnation = undefined;
        }
      }
      frame = lagged;
      this.emitEvent("__lagged", lagged);
    } else if (type === "replay_boundary") {
      const boundary: IStreamReplayBoundaryFrame = { kind: "replay_boundary" };
      if (typeof message.max_seq === "number") boundary.max_seq = message.max_seq;
      if (typeof message.incarnation === "string") boundary.incarnation = message.incarnation;
      frame = boundary;
      this.emitEvent("__replay_boundary", boundary);
    } else if (type === "refused") {
      const refused: IStreamRefusedFrame = {
        kind: "refused",
        code: typeof message.code === "string" ? message.code : "refused",
      };
      if (typeof message.frame === "string") refused.frame = message.frame;
      if (typeof message.reason === "string") refused.reason = message.reason;
      frame = refused;
      this.emitEvent("__refused", refused);
    } else {
      const end: IStreamEndFrame = { kind: "end" };
      if (typeof message.reason === "string") end.reason = message.reason;
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
  private pushStreamFrame(frame: IStreamFrame): void {
    if (this._streamEnded) return;
    if (frame.kind === "end") this._streamEnded = true;
    const waiter = this._frameWaiters.shift();
    if (waiter) {
      waiter({ value: frame, done: false });
    } else {
      this._frameBuffer.push(frame);
    }
    if (this._streamEnded && this._frameWaiters.length > 0) {
      const pending = this._frameWaiters.splice(0, this._frameWaiters.length);
      for (const resolveWaiter of pending) {
        resolveWaiter({ value: undefined as never, done: true });
      }
    }
  }

  /**
   * Handle an incoming BINARY frame. Default implementation decodes
   * the bytes as UTF-8 and routes them to `handleString` — i.e. for
   * JSON-typed channels the binary path is behaviour-equivalent to the
   * string path. Byte-prefix channels override this method.
   */
  private handleBinary(buf: Uint8Array): void {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch (err) {
      this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
      return;
    }
    this.handleString(text);
  }

  /**
   * Backwards-compat shim for any subclass that still calls handleMessage.
   * Delegates to handleString.
   */
  private handleMessage(data: string): void {
    this.handleString(data);
  }

  /**
   * Send message to server
   */
  private send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * @param displays Message parameters
   */
  subscribe(displays: string[]): void {
    this.send({
      type: "subscribe",
      displays,
    });
  }

  /**
   * @param displays Message parameters
   */
  unsubscribe(displays: string[]): void {
    this.send({
      type: "unsubscribe",
      displays,
    });
  }

  /**
   * @param callback Function to call when notification message received
   * @returns Unsubscribe function
   */
  onNotification(callback: (message: NotificationServerMessage) => void): () => void {
    return this.addEventListener("notification", callback);
  }

  /**
   * @param callback Function to call when heartbeat message received
   * @returns Unsubscribe function
   */
  onHeartbeat(callback: (message: HeartbeatServerMessage) => void): () => void {
    return this.addEventListener("heartbeat", callback);
  }

  /**
   * @param callback Function to call when connected message received
   * @returns Unsubscribe function
   */
  onConnected(callback: (message: ConnectedServerMessage) => void): () => void {
    return this.addEventListener("connected", callback);
  }

  /**
   * @param callback Function to call when subscribed message received
   * @returns Unsubscribe function
   */
  onSubscribed(callback: (message: SubscribedServerMessage) => void): () => void {
    return this.addEventListener("subscribed", callback);
  }

  /**
   * @param callback Function to call when resync message received
   * @returns Unsubscribe function
   */
  onResync(callback: (message: ResyncServerMessage) => void): () => void {
    return this.addEventListener("resync", callback);
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  onConnect(callback: () => void): () => void {
    return this.addEventListener("connect", callback);
  }

  onDisconnect(callback: (code: number, reason: string) => void): () => void {
    return this.addEventListener("disconnect", callback);
  }

  onReconnectAttempt(callback: (attemptNumber: number) => void): () => void {
    return this.addEventListener("reconnect_attempt", callback);
  }

  onReconnect(callback: (attemptNumber: number) => void): () => void {
    return this.addEventListener("reconnect", callback);
  }

  onReconnectFailed(callback: () => void): () => void {
    return this.addEventListener("reconnect_failed", callback);
  }

  onError(callback: (error: Error) => void): () => void {
    return this.addEventListener("error", callback);
  }

  /**
   * Add event listener
   * @returns Unsubscribe function
   */
  private addEventListener(event: string, callback: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener(s)
   */
  off(event: string, callback?: Function): void {
    if (!callback) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.get(event)?.delete(callback);
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  /**
   * Emit event to all registered handlers
   */
  private emitEvent(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  close(code?: number, reason?: string): void {
    this.disconnect(reason);
  }

  get readyState(): number {
    return this.ws?.readyState ?? RAW_WEBSOCKET_CLOSED;
  }

  get url(): string {
    return this._url;
  }

  get connected(): boolean {
    return this.ws?.readyState === RAW_WEBSOCKET_OPEN;
  }

  get reconnecting(): boolean {
    return this._reconnecting;
  }

  // ============================================================================
  // Gateway stream (sequenced envelopes + control frames)
  // ============================================================================

  onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void {
    return this.addEventListener("__envelope", callback);
  }

  onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void {
    return this.addEventListener("__control", callback);
  }

  onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void {
    return this.addEventListener("__lagged", callback);
  }

  onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void {
    return this.addEventListener("__replay_boundary", callback);
  }

  onEnd(callback: (frame: IStreamEndFrame) => void): () => void {
    return this.addEventListener("__end", callback);
  }

  onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void {
    return this.addEventListener("__refused", callback);
  }

  /**
   * Every frame as one async iterable. SINGLE consumer: frames are handed
   * out once, so two concurrent iterators would split the stream between
   * them. Use onEnvelope()/onControlFrame() for fan-out.
   */
  frames(): AsyncIterableIterator<IStreamFrame> {
    const iterator: AsyncIterableIterator<IStreamFrame> = {
      [Symbol.asyncIterator]: () => iterator,
      next: (): Promise<IteratorResult<IStreamFrame>> => {
        const buffered = this._frameBuffer.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (this._streamEnded) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise<IteratorResult<IStreamFrame>>((resolve) => {
          this._frameWaiters.push(resolve);
        });
      },
      return: (): Promise<IteratorResult<IStreamFrame>> =>
        Promise.resolve({ value: undefined as never, done: true }),
    };
    return iterator;
  }

  get cursor(): number | undefined {
    return this._cursor;
  }

  get incarnation(): string | undefined {
    return this._incarnation;
  }

  setCursor(seq: number | undefined, incarnation?: string): void {
    this._cursor = seq;
    if (incarnation !== undefined) {
      this._incarnation = incarnation;
    }
  }
}