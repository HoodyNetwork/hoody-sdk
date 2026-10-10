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
import { Duplex, type DuplexOptions } from 'stream';
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
     *   - `token` with `param` → `?<param>=<value>` on the socket URL, in
     *     Node and browsers (the proxy rule reads only that parameter)
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
    /**
     * Dead-link deadline in ms (default: 60000; 0 turns the check off).
     *
     * A network path that dies without a FIN or RST (laptop sleep, Wi-Fi or
     * mobile handover, NAT expiry) leaves the socket open with nothing on it.
     * The client sends a WebSocket ping every `livenessTimeout / 2`, the
     * first one that long after the socket opens, and counts everything
     * inbound as life: frames, pongs, the kit's own pings. When nothing at
     * all has arrived for `livenessTimeout`, counted from the open, the
     * socket is torn down and 'disconnect' fires with code 1006 and reason
     * `liveness timeout`, then the normal reconnect path runs. An idle shell
     * is not a dead link: the kit answers every ping.
     *
     * The check needs a transport that exposes pings and pongs, which is the
     * `ws` package (the one in use whenever the connection carries headers, as
     * with every `kitAuth` header form). A browser WebSocket and Node's
     * built-in one expose neither, and there the check is inactive.
     */
    livenessTimeout?: number;
    /**
     * A browser WebSocket and Node's built-in one show no HTTP status: a
     * server that refuses the upgrade (401, 403, 404) looks like a network
     * drop, and the automatic reconnect would run to its attempt cap. After
     * this many automatic attempts in a row that never opened (default 3;
     * 0 turns it off), the client sends one plain GET to the same URL: the
     * same query, the attempt's headers (none in a browser, which sends its
     * cookies instead), a 5 s timeout, redirects not followed. On 401, 403
     * or 404 the reconnect stops: 'error' carries a
     * WebSocketUpgradeRefusedError with the status and the server's error
     * code, then 'reconnect-failed'. Any other answer, or none, and the
     * backoff goes on; the next probe follows after as many failures again.
     * A transport that shows the status (the `ws` package) ends the series
     * with the same error at once, without a probe. The same option, default
     * and error as the generated WebSocket clients.
     */
    refusalProbeAfter?: number;
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
    /**
     * Throwaway session (optional). Maps to the terminal kit's `?ephemeral=true`
     * query param: a connection with no terminal id gets a fresh session of its
     * own (id 40000-65535, reported by the 'terminal-id' event) instead of
     * joining the shared terminal "1", and the kit cleans the session up once
     * it is idle. Ignored by the kit together with `agent`.
     */
    ephemeral?: boolean;
    /** DISPLAY variable for X11 apps. Server defaults to terminal_id or '1' if omitted. */
    display?: string;
    /** Auto-create `cwd` when the requested working directory doesn't exist yet (optional) */
    cwd_auto_create?: boolean;
    /** Attach to an existing process PID for monitoring instead of spawning a shell (optional) */
    pid?: string | number;
    /**
     * Base64-encoded command to auto-execute on spawn (optional). Maps to the
     * terminal kit's `?cmd=` query param. NOTE the kit does NOT run this as the
     * spawned process — it spawns the interactive shell and then TYPES the
     * decoded command into it (initial_cmd), so when the command exits the
     * session drops back to that shell and stays open.
     */
    cmd?: string;
    /**
     * Agent mode (optional). Maps to the terminal kit's `?agent=true` query
     * param: the kit spawns the server-configured hoody-agent TUI binary AS the
     * PTY process (no shell underneath) and ignores client-supplied
     * shell/user/cmd/ssh/pid/desktop. When the TUI exits or crashes the PTY
     * dies and the kit closes every attached WebSocket (1000 clean / 1006
     * crash). Used by `hoody agent` so quitting the TUI returns to the LOCAL
     * terminal instead of stranding the user in a remote shell.
     */
    agent?: boolean;
    /**
     * Agent-mode first-run marker (optional). Maps to the terminal kit's
     * `?onboarding=true` query param — only meaningful together with
     * `agent: true`: at spawn the kit appends `--onboarding` to the
     * hoody-agent TUI command line. Today the TUI records it
     * (cfg.OnboardingRequested) as the first-launch marker; the guided
     * onboarding flow that consumes it ships in a later TUI release. Set by
     * the `hoody` CLI right after signup. Ignored for non-agent sessions, and
     * silently ignored by kits that predate the param.
     */
    onboarding?: boolean;
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
/** Shell types the kit commonly reports via SET_SHELL_TYPE. Open-ended on
 *  purpose: the wire value is the basename of whatever the session runs —
 *  agent-mode sessions report the agent binary (e.g. `hoody-agent`), and a
 *  server-configured shell can be anything. The literal members are kept for
 *  autocompletion; `(string & {})` admits every other server value without
 *  an unsound cast. */
export type ShellType = 'bash' | 'zsh' | 'fish' | 'sh' | 'ssh' | 'tmux' | (string & {});
/**
 * The server refused the WebSocket upgrade for good: automatic reconnect has
 * stopped. `status` is the HTTP status; `code` the server's error code when
 * its answer named one, else "HTTP_<status>"; `via` says how it was learned:
 * "upgrade" (the transport showed the status) or "probe" (a plain GET after
 * repeated failures, see refusalProbeAfter). The same shape as the error of
 * the generated WebSocket clients.
 */
export interface WebSocketUpgradeRefusedError extends Error {
    name: 'WebSocketUpgradeRefusedError';
    status: number;
    code: string;
    via: 'upgrade' | 'probe';
}
/** The generated client's refusal (via 'upgrade' on the `ws` transport), or ours. */
export declare function isWebSocketUpgradeRefusedError(error: unknown): error is WebSocketUpgradeRefusedError;
/** Terminal client connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
/**
 * TerminalClient — Duplex stream for terminal I/O
 *
 * Implements Node.js Duplex stream interface plus terminal-specific events.
 * Internally delegates wire protocol handling to the generated typed WebSocket client.
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
    private _livenessTimeout;
    /** Stops the liveness check of the current socket; null when none runs. */
    private _stopLiveness;
    /** Set when the liveness check tore the socket down, until its close is reported. */
    private _livenessTripped;
    private _lastActivityAt;
    private _handshakeSent;
    /** holdSends() was called: every connection from the next one on opens held. */
    private _holdOnConnect;
    /** The current connection is held: nothing is sent on it (see holdSends). */
    private _sendsHeld;
    /**
     * A PAUSE went out on the current connection and no RESUME after it.
     * disconnect() sends the RESUME before closing: on a kit where a pause
     * outlives its client, a viewer that left paused froze the session's
     * program until someone attached again (BT2-TERM-007).
     */
    private _remotePaused;
    /** Sends the handshake of the current, held connection; null when none is owed. */
    private _heldHandshake;
    /**
     * A write that came while no connection could take it but one is coming
     * (the socket closing before its close is reported, the reconnect
     * backoff, a retry, a held connection). Its callback waits, so the
     * stream buffers what follows in order; it goes out when a connection
     * may send, or is refused with "Not connected" when none will.
     */
    private _heldWrite;
    /** Between an unplanned close and the end of the automatic reconnect it started. */
    private _autoReconnecting;
    /** Automatic attempts in a row that never opened (see refusalProbeAfter). */
    private _unopenedFailures;
    /** URL and headers of the last attempt, for the refusal probe. */
    private _lastAttempt;
    /** The last error the typed client reported through 'error', so it is not reported twice. */
    private _lastBridgedError;
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
     * When the server was last heard on the current connection (ms since the
     * epoch; 0 before the first connect): the open, any frame, and, where the
     * transport reports them, pings and pongs.
     */
    get lastActivityAt(): number;
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
     * Point every later connect, automatic reconnects included, at another
     * URL, with `options` merged over the ones given at construction. The
     * current connection is not touched.
     *
     * For a session whose address is only known once the kit has named it: an
     * ephemeral session is opened on the "no terminal id" host, and coming
     * back to it means the host of the id the kit assigned, without
     * `ephemeral` (which would be a request for another new session).
     */
    retarget(url: string, options?: Partial<TerminalClientOptions>): void;
    /**
     * From the next connect on, open every connection HELD: the socket is up
     * and frames from the kit are received, but this client sends nothing on
     * it until releaseSends(). Not the handshake (which is what makes the kit
     * start a session's process), no input, no resize, no pause or resume.
     *
     * For a caller that must first confirm what is behind a reconnect: the
     * kit creates or joins whatever session the URL names, and until that is
     * known to be the right one, a keystroke, a resize or a flow-control frame
     * would land in someone else's shell. While held, a write waits (its
     * callback with it) and goes out after the handshake at release, or is
     * refused with "Not connected" if the connection ends first; resize()
     * only records the size (the handshake at release carries it), and
     * pause()/resume() act on the local stream only.
     *
     * What still goes out on a held connection is below the session: the
     * upgrade request itself, WebSocket pings of the liveness check, and the
     * close.
     */
    holdSends(): void;
    /**
     * Release the current held connection: send its handshake (with the
     * current size) and let everything through from here on. A no-op when the
     * connection is not held. The next connection opens held again.
     */
    releaseSends(): void;
    /** Whether the current connection is held (see holdSends). */
    get sendsHeld(): boolean;
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
    /** The upgrade is refused for good: stop the automatic reconnect and say why. */
    private stopRefused;
    /**
     * One plain GET to the URL the failing attempts used, to learn the status
     * the transport hid. Ends the series on 401, 403 or 404; otherwise the
     * backoff goes on. `gen` is the connect generation of the failed attempt:
     * a disconnect() or a new connect() meanwhile makes the answer irrelevant.
     */
    private probeRefusal;
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
    /** A connection is up, open on the wire, and allowed to send. */
    private canSendNow;
    /**
     * No connection can take a write now, but one is expected: the current
     * one is held, or still reported connected while its socket closes (with
     * automatic reconnect on), or an automatic reconnect is under way.
     */
    private connectionComing;
    /** Send the held write, if a connection may take it now. */
    private releaseHeldWrite;
    /** No connection is coming for the held write: refuse it. */
    private refuseHeldWrite;
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
    /**
     * Watch the socket of `client` for a dead link (see
     * TerminalClientOptions.livenessTimeout). A no-op when the check is off or
     * the transport exposes no ping/pong.
     */
    private startLiveness;
    private stopLiveness;
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
 * - 'disconnect' (code, reason): when disconnected from the wire; a dead
 *   link found by the liveness check is (1006, 'liveness timeout')
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
