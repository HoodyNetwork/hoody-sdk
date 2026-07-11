/**
 * TerminalClient — Interactive Terminal with Duplex Streams
 *
 * Implements the Hoody Terminal binary WebSocket protocol. Provides both
 * stream-based and event-based APIs.
 *
 * Internally wraps the typed WebSocket client emitted from the AsyncAPI
 * spec ({@link TerminalConnectTerminalWebSocketWebSocket}). The wire
 * protocol (byte-prefix framing, `tty` subprotocol, init JSON_DATA replay
 * on reconnect, FIFO frame ordering, generation-guarded close handling)
 * is owned by the typed client. This file is the stream adapter — it
 * translates Duplex reads/writes into typed sender calls and re-emits
 * typed callbacks as the documented event names.
 *
 * Usage (Stream-based):
 * ```typescript
 * const terminal = new TerminalClient('wss://...');
 * await terminal.connect();
 * process.stdin.setRawMode(true);
 * process.stdin.pipe(terminal);
 * terminal.pipe(process.stdout);
 * ```
 *
 * Usage (Event-based):
 * ```typescript
 * const terminal = new TerminalClient('wss://...');
 * terminal.on('data', (data) => process.stdout.write(data));
 * terminal.on('title', (title) => console.log('Title:', title));
 * await terminal.connect();
 * terminal.write('ls -la\n');
 * ```
 */
import { Duplex, DuplexOptions } from 'stream';
import { type ProxyAuth } from './proxy-auth.js';
/**
 * Terminal client options
 */
export interface TerminalClientOptions extends DuplexOptions {
    /** Terminal columns (default: 80) */
    cols?: number;
    /** Terminal rows (default: 24) */
    rows?: number;
    /** Auth token for the terminal service itself (sent in handshake) */
    token?: string;
    /**
     * Proxy authentication credentials. Used to authenticate against the
     * Hoody Proxy sitting in front of the terminal service. Five variants:
     *   - `password` → Authorization: Basic base64(user:pass)
     *   - `jwt` / `token` → Authorization: Bearer <value> (or custom header)
     *   - `containerClaim` → X-Hoody-Container-Claim + X-Hoody-Token headers
     *   - `ip` → no-op (proxy verifies client IP)
     */
    kitAuth?: ProxyAuth;
    /**
     * Optional fresh-credentials provider. When set, `connect()` (including
     * the reconnect path) invokes this before building the WebSocket URL,
     * so rotated credentials are picked up on reconnect instead of re-using
     * the value captured at construction. Synchronous or async.
     *
     * If both `kitAuth` and `getKitAuth` are provided, the provider wins.
     * Returning `undefined` falls back to the static `kitAuth` option.
     *
     * Browsers put bearer/basic credentials in the `?token=...` query string
     * (because the WebSocket API forbids custom headers). Refreshing through
     * this provider is the ONLY way to avoid a reconnected browser socket
     * carrying a stale credential in its URL.
     */
    getKitAuth?: () => ProxyAuth | undefined | Promise<ProxyAuth | undefined>;
    /**
     * Optional fresh terminal-handshake-token provider. Same lifetime rules
     * as `getKitAuth` — called by `connect()` (including reconnect) so the
     * handshake carries a fresh value if the provider returns one.
     */
    getToken?: () => string | undefined | Promise<string | undefined>;
    /** Auto-connect on creation */
    autoConnect?: boolean;
    /** Reconnect on disconnect */
    reconnect?: boolean;
    /** Max reconnect attempts */
    maxReconnectAttempts?: number;
    /** Reconnect delay in ms */
    reconnectDelay?: number;
    /** Connection timeout in ms */
    timeout?: number;
    /** Debug mode */
    debug?: boolean;
    /** Read-only mode — prevents input (optional) */
    readonly?: boolean;
    /** Working directory to start in (optional) */
    cwd?: string;
    /** Shell type: bash, zsh, fish, tmux, etc. (optional) */
    shell?: 'bash' | 'zsh' | 'fish' | 'sh' | 'ssh' | 'tmux' | string;
    /** System user to spawn terminal as (optional) */
    user?: string;
    /** Environment variables as KEY=VALUE pairs (optional) */
    env?: string[] | Record<string, string>;
    /** Terminal session ID to reconnect to (optional) */
    terminal_id?: string;
    /** DISPLAY variable for X11 apps. Server defaults to terminal_id or '1' if omitted. */
    display?: string;
    /** Auto-create `cwd` when the requested working directory doesn't exist yet (optional) */
    cwd_auto_create?: boolean;
    /** Attach to an existing process PID for monitoring instead of spawning a shell (optional) */
    pid?: string | number;
    /**
     * Base64-encoded command to auto-execute on spawn (optional). Maps to the
     * terminal kit's `?cmd=` query param. The kit decodes it and runs it as the
     * spawned process instead of (or before) an interactive shell. Used by
     * `hoody agent` to launch the in-container TUI binary directly.
     */
    cmd?: string;
    /**
     * Show the kit login "welcome" banner (optional). Maps to the terminal kit's
     * `?welcome=` query param, read by the server's `extract_welcome` (absent =
     * server default; `false` suppresses the banner; `true`/bare forces it). The
     * Hoody agent's chat terminals pass `false` to suppress it.
     */
    welcome?: boolean;
    /** Remote SSH server hostname/IP */
    ssh_host?: string;
    /** SSH username */
    ssh_user?: string;
    /** SSH port (default: 22) */
    ssh_port?: string;
    /** SSH password */
    ssh_password?: string;
    /** SSH private key (base64 encoded) */
    ssh_key?: string;
    /** SOCKS5 proxy host for SSH tunneling */
    socks5_host?: string;
    /** SOCKS5 proxy port (default: 1080) */
    socks5_port?: string;
    /** SOCKS5 proxy username */
    socks5_user?: string;
    /** SOCKS5 proxy password */
    socks5_pass?: string;
}
/**
 * Server preferences from SET_PREFERENCES message
 */
export interface TerminalPreferences {
    fontSize?: number;
    theme?: string;
    fontFamily?: string;
}
/** Shell types supported by the terminal */
export type ShellType = 'bash' | 'zsh' | 'fish' | 'sh' | 'ssh' | 'tmux';
/** Terminal client connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
/**
 * TerminalClient — Duplex stream for terminal I/O
 *
 * Implements Node.js Duplex stream interface plus terminal-specific events.
 * Internally delegates wire protocol handling to the typed W3 client.
 */
export declare class TerminalClient extends Duplex {
    private client;
    private _url;
    private _state;
    private _terminalId;
    private _shellType;
    private _windowTitle;
    private _preferences;
    private _cols;
    private _rows;
    private _token;
    private _debug;
    private _reconnect;
    private _maxReconnectAttempts;
    private _reconnectDelay;
    private _timeout;
    private _handshakeSent;
    private _options;
    private _unsubscribers;
    /**
     * Wrapper-owned reconnect machinery. The typed client's `reconnect` is
     * forced OFF (its built-in retry would bypass our `getKitAuth` /
     * `getToken` providers, replaying the cached URL + JSON_DATA bytes
     * verbatim — and stale credentials would persist across reconnect).
     * Instead, the wrapper schedules its own reconnect that calls
     * `_connectInner` again on every attempt, which re-runs the providers.
     */
    private _wrapperShouldReconnect;
    private _wrapperReconnectAttempts;
    private _wrapperReconnectTimer;
    /**
     * Per-connect-call generation counter. Bumped synchronously inside
     * connect() and disconnect(). Bridge listeners and connect()'s catch
     * block compare a captured value against this counter — if they
     * differ, the closure belongs to a typed client we've already
     * replaced, and any state mutation/event re-emit MUST be a no-op.
     */
    private _connectGen;
    /**
     * In-flight connect() promise. Concurrent callers (including any
     * synchronous re-entrants from the 'connecting' event listener)
     * share the same promise so they all observe the SAME outcome.
     * Allocated synchronously in connect() before any side effects.
     */
    private _pendingConnect;
    /**
     * Per-cycle dedup for the 'close' event. The flag is reset at the
     * start of each connect cycle; within a cycle, manual disconnect()
     * + destroy() yields exactly one 'close'.
     */
    private _closeEmitted;
    constructor(url: string, options?: TerminalClientOptions);
    /** Current connection state */
    get state(): ConnectionState;
    /** Whether connected to server */
    get connected(): boolean;
    /** Terminal ID assigned by server */
    get terminalId(): string;
    /** Shell type (bash, zsh, etc.) */
    get shellType(): ShellType;
    /** Window title */
    get windowTitle(): string;
    /** Server preferences */
    get preferences(): TerminalPreferences;
    /** Terminal columns */
    get cols(): number;
    /** Terminal rows */
    get rows(): number;
    /** WebSocket URL */
    get url(): string;
    /**
     * Connect to the terminal server.
     *
     * Concurrent callers share the in-flight attempt; synchronous re-entrants
     * from inside 'connecting' / 'connect' listeners get the same shared
     * promise (no duplicate sockets opened).
     */
    connect(): Promise<void>;
    private _connectInner;
    /**
     * Disconnect from the terminal server.
     *
     * Emits 'disconnect' (code 1000) and 'close' for an active connection.
     * Idempotent: calling on a disconnected client is a no-op for the
     * disconnect event but still emits 'close' if not yet emitted this cycle.
     */
    disconnect(reason?: string): void;
    /**
     * Force reconnect.
     */
    reconnect(): Promise<void>;
    /**
     * Schedule a wrapper-owned auto-reconnect with exponential backoff.
     * Each attempt re-runs `_connectInner`, which in turn re-invokes the
     * `getKitAuth` / `getToken` providers — this is the load-bearing
     * difference vs delegating reconnect to the typed client (whose
     * cached URL + JSON_DATA replay would persist stale credentials
     * across retries).
     */
    private scheduleWrapperReconnect;
    private clearWrapperReconnectTimer;
    /**
     * Per-cycle 'close' dedup. Within a single connect/disconnect cycle,
     * 'close' is delivered exactly once even when the consumer combines
     * manual disconnect() with destroy(). The flag is cleared at the top
     * of each _connectInner so subsequent cycles emit their own 'close'.
     */
    emit(event: string | symbol, ...args: unknown[]): boolean;
    /**
     * Resize the terminal.
     */
    resize(cols: number, rows: number): void;
    /** Pause terminal output (flow control). */
    pause(): this;
    /** Resume terminal output (flow control). */
    resume(): this;
    /** Writable: send keyboard input as INPUT byte-prefix frame. */
    _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
    /** Readable: data is pushed from onOutput / onUnknownFrame handlers. */
    _read(_size: number): void;
    /** Clean up on destroy. */
    _destroy(error: Error | null, callback: (error?: Error | null) => void): void;
    /**
     * Subscribe Duplex events to typed-client callbacks. All `on*` methods
     * return an unsubscribe; we collect them so detachClient() can drop
     * every listener cleanly when the underlying socket is replaced.
     */
    private attachClient;
    /** Drop every listener registered against the previous typed client. */
    private detachClient;
    /**
     * Build WebSocket URL with query parameters.
     */
    private buildUrlWithQueryParams;
}
/**
 * Extended event types for TerminalClient.
 *
 * The custom event names below are documented here for IDE discoverability;
 * at runtime they ride on the underlying Duplex's EventEmitter.
 *
 * Custom Events:
 * - 'connect': when connected to server
 * - 'connecting': when a connection attempt starts
 * - 'disconnect' (code, reason): when disconnected from the wire
 * - 'output' (Buffer): terminal output data
 * - 'title' (string): window title changed
 * - 'preferences' (TerminalPreferences): server-pushed preferences
 * - 'terminal-id' (string): terminal session ID assigned
 * - 'shell-type' (ShellType): shell type detected
 * - 'resize' (cols, rows): terminal resized
 * - 'reconnect-attempt' (n): reconnection attempt N
 * - 'reconnect' (n): successfully reconnected
 * - 'reconnect-failed': max reconnect attempts reached
 *
 * Standard Duplex Events:
 * - 'data' (Buffer): readable data available — same payload as 'output'
 * - 'close': stream closed (deduplicated; fires once per cycle)
 * - 'error' (Error): error occurred (gated on listenerCount)
 * - 'end': no more data will be written
 * - 'finish': all data written
 * - 'drain': writable buffer drained
 * - 'pipe' / 'unpipe' (Readable): piped to / unpiped from another stream
 */
export { TerminalConnectTerminalWebSocketWebSocket as TerminalWebSocketTyped, type ITerminalConnectTerminalWebSocketWebSocket as ITerminalWebSocketTyped, type IWebSocketConnectionOptions as ITerminalWebSocketOptions, } from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
