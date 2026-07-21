/**
 * WebSocket client for Stream the log tail (SSE).
 * 
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent streamLogs stream v1.0.0
 */


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
}

// ============================================================================
// Server → Client Messages
// ============================================================================

/** One redacted log row (id: <seq>). | The cursor fell behind the ring; carries {code:replay_gap, min_seq, max_seq}. Reconcile from min_seq. | Stream complete (client disconnect or server drain). */
export interface UnknownServerMessage {
}


export interface IAgentStreamLogsWebSocket {
  // ============================================================================
  // Send Messages (Client → Server)
  // ============================================================================

  // ============================================================================
  // Receive Messages (Server → Client)
  // ============================================================================

  /** One redacted log row (id: <seq>). | The cursor fell behind the ring; carries {code:replay_gap, min_seq, max_seq}. Reconcile from min_seq. | Stream complete (client disconnect or server drain). */
  onUnknown(callback: (message: UnknownServerMessage) => void): () => void;

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  /** Establish WebSocket connection */
  connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;

  /** Reconnect to WebSocket server */
  reconnect(): Promise<void>;

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
}

const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;

type IRawWebSocketMessageEvent = { data: string | ArrayBuffer | ArrayBufferView | Blob };
type IRawWebSocketCloseEvent = { code: number; reason: string };

interface IRawWebSocketLike {
  readyState: number;
  binaryType?: "arraybuffer" | "blob";
  onopen: (() => void) | null;
  onmessage: ((event: IRawWebSocketMessageEvent) => void) | null;
  onclose: ((event: IRawWebSocketCloseEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

type IRawWebSocketCtor = new (url: string, protocols?: string | string[]) => IRawWebSocketLike;

export class AgentStreamLogsWebSocket implements IAgentStreamLogsWebSocket {
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
  async connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void> {
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
            // frame-settle barrier. Received frames dispatch through the
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
   * Default behaviour: JSON.parse + dispatch on `message.type`.
   */
  private handleString(data: string): void {
    try {
      const message = JSON.parse(data);
      const messageType = message.type;

      // Call registered handlers for this message type
      const handlers = this.eventHandlers.get(messageType);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error(`Error handling message ${messageType}:`, error);
          }
        });
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
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
   * One redacted log row (id: <seq>). | The cursor fell behind the ring; carries {code:replay_gap, min_seq, max_seq}. Reconcile from min_seq. | Stream complete (client disconnect or server drain).
   * @param callback Function to call when unknown message received
   * @returns Unsubscribe function
   */
  onUnknown(callback: (message: UnknownServerMessage) => void): () => void {
    return this.addEventListener("unknown", callback);
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
}