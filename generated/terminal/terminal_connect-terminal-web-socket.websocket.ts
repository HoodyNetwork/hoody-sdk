/**
 * WebSocket client for WebSocket terminal connection
 * 
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Terminal WebSocket Protocol v1.0.0
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
// Client → Server Messages
// ============================================================================

/** Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled. | JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows. | Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received. | Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE. | JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process. */
export interface UnknownClientMessage {
  /** Command code for JSON_DATA (ASCII character '{') */
  command: '{';
  /** Raw keyboard input data (UTF-8 encoded) */
  data: string;
  /** Terminal width in characters */
  columns: number;
  /** Terminal height in lines */
  rows: number;
  /** Authentication token (if server requires auth, optional otherwise) */
  token?: string;
}

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session. | Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)". | JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc. | Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions. | Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints. */
export interface UnknownServerMessage {
  /** Command code for SET_SHELL_TYPE (ASCII character '4') */
  command: '4';
  /** Raw terminal output with ANSI escape sequences */
  data: string;
  /** Window title text */
  title: string;
  /** Client configuration object */
  preferences: { font_size?: number; theme?: string; font_family?: string };
  /** Numeric terminal session ID (1-65535) */
  terminal_id: string;
  /** Shell type identifier */
  shell_type: 'bash' | 'zsh' | 'fish' | 'sh' | 'ssh' | 'tmux';
}


export interface ITerminalConnectTerminalWebSocketWebSocket {
  // ============================================================================
  // Send Messages (Client → Server)
  // ============================================================================

  /** Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled. */
  sendInput(data: string | Uint8Array): void;

  /** JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows. */
  sendResize(payload: { command: '1'; columns: number; rows: number }): void;

  /** Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received. */
  sendPause(): void;

  /** Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE. */
  sendResume(): void;

  /** JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process. */
  sendJsonData(payload: { command: '{'; columns: number; rows: number; token?: string }): void;

  // ============================================================================
  // Receive Messages (Server → Client)
  // ============================================================================

  /** Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session. */
  onOutput(callback: (payload: Uint8Array) => void): () => void;

  /** Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)". */
  onSetWindowTitle(callback: (payload: string) => void): () => void;

  /** JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc. */
  onSetPreferences(callback: (payload: { command: '2'; preferences: { font_size?: number; theme?: string; font_family?: string } }) => void): () => void;

  /** Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions. */
  onSetTerminalId(callback: (payload: string) => void): () => void;

  /** Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints. */
  onSetShellType(callback: (payload: string) => void): () => void;

  /** Subscribe to RAW unknown frames. Forward-compat for unknown command bytes. */
  onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;

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

export class TerminalConnectTerminalWebSocketWebSocket implements ITerminalConnectTerminalWebSocketWebSocket {
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
      protocols: ["tty"],
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
            // Init-replay — re-arm the protocol on every reconnect.
            // The server requires this handshake on every open; user code must
            // not see `connect` until the replay frames are on the wire.
            for (const wire of this._replayPayloads.values()) {
              try { this.ws?.send(wire); } catch (err) {
                this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
              }
            }
            this.emitEvent("connect");
            resolve();
          };

          this.ws.onmessage = (event) => {
            const raw: unknown = (event as { data: unknown }).data;
            // Synchronous string fast path.
            if (typeof raw === "string") {
              this._frameQueue = this._frameQueue.then(() => {
                if (this._socketGen === installedGen) this.handleString(raw);
              });
              return;
            }
            // ArrayBuffer (preferred binary shape).
            if (raw instanceof ArrayBuffer) {
              const buf = new Uint8Array(raw);
              this._frameQueue = this._frameQueue.then(() => {
                if (this._socketGen === installedGen) this.handleBinary(buf);
              });
              return;
            }
            // ArrayBufferView covers Node Buffer + Uint8Array w/ non-zero offset.
            if (raw && typeof (raw as ArrayBufferView).byteLength === "number"
                && typeof (raw as ArrayBufferView).buffer !== "undefined") {
              const v = raw as ArrayBufferView;
              const buf = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
              this._frameQueue = this._frameQueue.then(() => {
                if (this._socketGen === installedGen) this.handleBinary(buf);
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
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // Unknown shape — best-effort string coercion.
            this._frameQueue = this._frameQueue.then(() => {
              if (this._socketGen === installedGen) this.handleString(String(raw));
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
   * Handle an incoming BINARY frame for a byte-prefix-v1 channel.
   * Switches on the first byte to dispatch typed callbacks.
   */
  private handleBinary(buf: Uint8Array): void {
    if (buf.length === 0) return;
    const code = buf[0];
    switch (code) {
      case 0x30: { // '0' — output
        this.emitEvent("output", buf.subarray(1));
        return;
      }
      case 0x31: { // '1' — set_window_title
        this.emitEvent("set_window_title", new TextDecoder("utf-8").decode(buf.subarray(1)));
        return;
      }
      case 0x32: { // '2' — set_preferences
        try {
          this.emitEvent("set_preferences", JSON.parse(new TextDecoder("utf-8").decode(buf.subarray(1))));
        } catch (err) {
          this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }
      case 0x33: { // '3' — set_terminal_id
        this.emitEvent("set_terminal_id", new TextDecoder("utf-8").decode(buf.subarray(1)));
        return;
      }
      case 0x34: { // '4' — set_shell_type
        this.emitEvent("set_shell_type", new TextDecoder("utf-8").decode(buf.subarray(1)));
        return;
      }
      default:
        // Unknown command byte — emit raw frame for forward-compat. Mirrors
        // server policy: protocol.c silently ignores unknown client bytes.
        this.emitEvent("unknownFrame", buf);
    }
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

  // ── Init-replay cache ──
  // Captures the most recent successful send of each replay-marked message
  // so it can be re-sent on every reconnect\u2019s onopen BEFORE the user-visible
  // `connect` event fires.
  private _replayPayloads: Map<string, Uint8Array | string> = new Map();

  /**
   * Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled.
   */
  sendInput(data: string | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const payload = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const out = new Uint8Array(payload.length + 1);
    out[0] = 0x30;
    out.set(payload, 1);
    this.ws.send(out);
  }

  /**
   * JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows.
   */
  sendResize(payload: { command: '1'; columns: number; rows: number }): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const wire = "1" + JSON.stringify(payload);
    this.ws.send(wire);
  }

  /**
   * Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received.
   */
  sendPause(): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(new Uint8Array([0x32]));
  }

  /**
   * Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE.
   */
  sendResume(): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(new Uint8Array([0x33]));
  }

  /**
   * JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process.
   */
  sendJsonData(payload: { command: '{'; columns: number; rows: number; token?: string }): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const wire = JSON.stringify(payload);
    this.ws.send(wire);
    this._replayPayloads.set("json_data", wire);
  }

  /**
   * Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session.
   */
  onOutput(callback: (payload: Uint8Array) => void): () => void {
    return this.addEventListener("output", callback);
  }

  /**
   * Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)".
   */
  onSetWindowTitle(callback: (payload: string) => void): () => void {
    return this.addEventListener("set_window_title", callback);
  }

  /**
   * JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc.
   */
  onSetPreferences(callback: (payload: { command: '2'; preferences: { font_size?: number; theme?: string; font_family?: string } }) => void): () => void {
    return this.addEventListener("set_preferences", callback);
  }

  /**
   * Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions.
   */
  onSetTerminalId(callback: (payload: string) => void): () => void {
    return this.addEventListener("set_terminal_id", callback);
  }

  /**
   * Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints.
   */
  onSetShellType(callback: (payload: string) => void): () => void {
    return this.addEventListener("set_shell_type", callback);
  }

  /**
   * Subscribe to RAW unknown frames — frames whose first byte does not match
   * any known message-prefix in the spec. Mirrors the C server\u2019s silent-
   * ignore policy for unknown bytes (forward compatibility).
   */
  onUnknownFrame(callback: (buf: Uint8Array) => void): () => void {
    return this.addEventListener("unknownFrame", callback);
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