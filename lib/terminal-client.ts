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
import {
    TerminalConnectTerminalWebSocketWebSocket,
    type IWebSocketConnectionOptions,
} from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
import { type ProxyAuth, base64Encode } from './proxy-auth.js';

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

    // Terminal Session Configuration (via query parameters)
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

    // SSH Bridge Parameters (via query parameters)
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

/** Terminal client connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * `agent` and `cmd` are mutually exclusive. Agent-capable kits neutralize
 * `cmd=` on agent sessions server-side, but a pre-agent kit ignores the
 * unknown `agent=` param and TYPES the decoded `cmd` into whatever spawned —
 * on such kits the pair would inject the command as keystrokes. Throwing
 * (instead of silently dropping `cmd`) surfaces the stale caller. Checked at
 * construction AND at URL serialization so a mutated snapshot can't sneak a
 * `cmd` in between. `agent` + `shell` stays legal — `shell=` is the
 * deliberate compatibility bridge (agent-mode kits ignore it; pre-agent kits
 * exec it directly as the session process).
 */
function assertAgentCmdExclusive(options: TerminalClientOptions): void {
    if (options.agent && options.cmd) {
        throw new TypeError(
            'TerminalClient: options.agent and options.cmd are mutually exclusive — '
            + 'on kits without agent mode the cmd bytes would be typed into the spawned process.',
        );
    }
}

/**
 * TerminalClient — Duplex stream for terminal I/O
 *
 * Implements Node.js Duplex stream interface plus terminal-specific events.
 * Internally delegates wire protocol handling to the typed W3 client.
 */
export class TerminalClient extends Duplex {
    private client: TerminalConnectTerminalWebSocketWebSocket | null = null;
    private _url: string;
    private _state: ConnectionState = 'disconnected';
    private _terminalId: string = '';
    private _shellType: ShellType = 'bash';
    private _windowTitle: string = '';
    private _preferences: TerminalPreferences = {};
    private _cols: number;
    private _rows: number;
    private _token: string | undefined;
    private _debug: boolean;
    private _reconnect: boolean;
    private _maxReconnectAttempts: number;
    private _reconnectDelay: number;
    private _timeout: number;
    private _handshakeSent: boolean = false;
    private _options: TerminalClientOptions;
    private _unsubscribers: Array<() => void> = [];

    /**
     * Wrapper-owned reconnect machinery. The typed client's `reconnect` is
     * forced OFF (its built-in retry would bypass our `getKitAuth` /
     * `getToken` providers, replaying the cached URL + JSON_DATA bytes
     * verbatim — and stale credentials would persist across reconnect).
     * Instead, the wrapper schedules its own reconnect that calls
     * `_connectInner` again on every attempt, which re-runs the providers.
     */
    private _wrapperShouldReconnect: boolean = true;
    private _wrapperReconnectAttempts: number = 0;
    private _wrapperReconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Per-connect-call generation counter. Bumped synchronously inside
     * connect() and disconnect(). Bridge listeners and connect()'s catch
     * block compare a captured value against this counter — if they
     * differ, the closure belongs to a typed client we've already
     * replaced, and any state mutation/event re-emit MUST be a no-op.
     */
    private _connectGen: number = 0;

    /**
     * In-flight connect() promise. Concurrent callers (including any
     * synchronous re-entrants from the 'connecting' event listener)
     * share the same promise so they all observe the SAME outcome.
     * Allocated synchronously in connect() before any side effects.
     */
    private _pendingConnect: Promise<void> | null = null;

    /**
     * Per-cycle dedup for the 'close' event. The flag is reset at the
     * start of each connect cycle; within a cycle, manual disconnect()
     * + destroy() yields exactly one 'close'.
     */
    private _closeEmitted: boolean = false;

    constructor(url: string, options: TerminalClientOptions = {}) {
        super({
            ...options,
            objectMode: false,
            readableHighWaterMark: options.readableHighWaterMark ?? 64 * 1024,
            writableHighWaterMark: options.writableHighWaterMark ?? 64 * 1024,
        });

        // Defensive copy: the guard below (and URL serialization later) must
        // judge OUR snapshot, not a caller-retained object that could gain a
        // conflicting key between construction and (re)connect.
        this._options = { ...options };
        assertAgentCmdExclusive(this._options);
        this._url = url;
        this._cols = options.cols ?? 80;
        this._rows = options.rows ?? 24;
        this._token = options.token;
        this._debug = options.debug ?? false;
        this._reconnect = options.reconnect ?? true;
        this._maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
        this._reconnectDelay = options.reconnectDelay ?? 1000;
        this._timeout = options.timeout ?? 30000;

        if (options.autoConnect) {
            this.connect().catch((err) => {
                if (this.listenerCount('error') > 0) {
                    this.emit('error', err);
                }
            });
        }
    }

    // ===========================================================================
    // Public Properties
    // ===========================================================================

    /** Current connection state */
    get state(): ConnectionState { return this._state; }

    /** Whether connected to server */
    get connected(): boolean { return this._state === 'connected'; }

    /** Terminal ID assigned by server */
    get terminalId(): string { return this._terminalId; }

    /** Shell type (bash, zsh, etc.) */
    get shellType(): ShellType { return this._shellType; }

    /** Window title */
    get windowTitle(): string { return this._windowTitle; }

    /** Server preferences */
    get preferences(): TerminalPreferences { return { ...this._preferences }; }

    /** Terminal columns */
    get cols(): number { return this._cols; }

    /** Terminal rows */
    get rows(): number { return this._rows; }

    /** WebSocket URL */
    get url(): string { return this._url; }

    // ===========================================================================
    // Connection Management
    // ===========================================================================

    /**
     * Connect to the terminal server.
     *
     * Concurrent callers share the in-flight attempt; synchronous re-entrants
     * from inside 'connecting' / 'connect' listeners get the same shared
     * promise (no duplicate sockets opened).
     */
    connect(): Promise<void> {
        if (this._state === 'connected') return Promise.resolve();
        if (this._pendingConnect) return this._pendingConnect;

        // Public connect — reset the auto-retry attempt counter. Auto-retries
        // call _connectInner directly via scheduleWrapperReconnect, so they
        // do NOT pass through this branch.
        this._wrapperReconnectAttempts = 0;

        // Allocate the shared promise SYNCHRONOUSLY, BEFORE _connectInner
        // runs any side effect. The explicit-resolver pattern lets us assign
        // `this._pendingConnect = pending` strictly before the body, so a
        // re-entrant call from a 'connecting' listener sees the slot.
        let resolvePending!: () => void;
        let rejectPending!: (err: unknown) => void;
        const pending = new Promise<void>((res, rej) => {
            resolvePending = res;
            rejectPending = rej;
        });
        this._pendingConnect = pending;

        const attempt = this._connectInner();
        attempt.then(
            () => {
                if (this._pendingConnect === pending) this._pendingConnect = null;
                resolvePending();
            },
            (err) => {
                if (this._pendingConnect === pending) this._pendingConnect = null;
                rejectPending(err);
            },
        );

        return pending;
    }

    private async _connectInner(): Promise<void> {
        // Bump the generation BEFORE emitting 'connecting'. A 'connecting'
        // listener that calls disconnect() / destroy() bumps the counter
        // further; the supersede guards below detect the cancellation.
        this._connectGen++;
        const myGen = this._connectGen;

        // Re-arm wrapper-owned reconnect for the new lifecycle. A user-
        // initiated `connect()` (vs. an auto-retry from
        // scheduleWrapperReconnect) zeroes the attempt counter; an
        // auto-retry leaves it alone (bumped by the timer callback).
        this._wrapperShouldReconnect = this._reconnect;
        this.clearWrapperReconnectTimer();

        // Reset close-emit dedup at the start of each cycle so subsequent
        // disconnect() calls still fire 'close' (legacy parity across cycles).
        this._closeEmitted = false;

        this._state = 'connecting';
        this.emit('connecting');

        if (this._connectGen !== myGen) {
            throw new Error('Connection superseded');
        }

        // Refresh credentials BEFORE building the URL. On reconnect, values
        // captured at construction are stale by definition, so the provider
        // callbacks (if any) run on every connect attempt — including
        // wrapper-driven retries from the auto-reconnect path below.
        let freshKitAuth: ProxyAuth | undefined;
        if (this._options.getKitAuth) {
            try { freshKitAuth = await this._options.getKitAuth(); }
            catch { /* fall back to static */ }
        }
        // Re-check supersede after the first await — a stale attempt must
        // not waste cycles fetching a second token if we've already been
        // canceled by an external disconnect/destroy/replace.
        if (this._connectGen !== myGen) {
            throw new Error('Connection superseded');
        }
        const kitAuth = freshKitAuth ?? this._options.kitAuth;

        let freshToken: string | undefined;
        if (this._options.getToken) {
            try { freshToken = await this._options.getToken(); }
            catch { /* fall back to static */ }
        }
        // Re-check supersede after the second await.
        if (this._connectGen !== myGen) {
            throw new Error('Connection superseded');
        }
        // Use a LOCAL handshake-token rather than mutating `this._token`.
        // Mutating would make the provider sticky: a later attempt where
        // the provider returns undefined would inherit the previous fresh
        // value instead of falling back to the static `options.token`.
        const handshakeToken = freshToken ?? this._token;

        // Build the wire URL: scheme + path + query parameters. URL parser
        // first so scheme conversion and path injection don't corrupt an
        // existing query string.
        let wsUrl = this._url;
        if (wsUrl.startsWith('http://')) {
            wsUrl = 'ws://' + wsUrl.slice('http://'.length);
        } else if (wsUrl.startsWith('https://')) {
            wsUrl = 'wss://' + wsUrl.slice('https://'.length);
        } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
            wsUrl = `wss://${wsUrl}`;
        }
        try {
            const parsed = new URL(wsUrl);
            if (!parsed.pathname.includes('/api/v1/terminal/ws')) {
                const trimmed = parsed.pathname.endsWith('/') && parsed.pathname.length > 1
                    ? parsed.pathname.slice(0, -1) : parsed.pathname;
                parsed.pathname = (trimmed === '/' ? '' : trimmed) + '/api/v1/terminal/ws';
            }
            wsUrl = parsed.toString();
        } catch {
            if (!wsUrl.includes('/api/v1/terminal/ws')) {
                if (wsUrl.endsWith('/')) wsUrl = wsUrl.slice(0, -1);
                wsUrl += '/api/v1/terminal/ws';
            }
        }
        wsUrl = this.buildUrlWithQueryParams(wsUrl, this._options);

        // Apply Kit Proxy Authentication. In a browser the WebSocket API
        // forbids custom headers, so credentials get folded into the URL
        // via `?token=...`. In Node we set HTTP headers on the upgrade
        // request via the typed client's IWebSocketConnectionOptions.
        const isBrowser = typeof (globalThis as { window?: unknown }).window !== 'undefined'
            && typeof (globalThis as { document?: unknown }).document !== 'undefined';
        const headers: Record<string, string> = {};
        if (kitAuth) {
            const urlObj = (() => { try { return new URL(wsUrl); } catch { return null; } })();
            if (kitAuth.type === 'password') {
                const cred = base64Encode(`${kitAuth.username}:${kitAuth.password}`);
                if (isBrowser && urlObj) {
                    urlObj.searchParams.set('token', `Basic ${cred}`);
                } else {
                    headers['Authorization'] = `Basic ${cred}`;
                }
            } else if (kitAuth.type === 'jwt' || kitAuth.type === 'token') {
                const value = kitAuth.type === 'jwt' ? kitAuth.token : kitAuth.value;
                const hdr = kitAuth.header || 'Authorization';
                if (isBrowser && urlObj) {
                    urlObj.searchParams.set('token', value);
                } else {
                    headers[hdr] = hdr.toLowerCase() === 'authorization' ? `Bearer ${value}` : value;
                }
            } else if (kitAuth.type === 'containerClaim') {
                // Container claim auth uses two custom headers
                // (X-Hoody-Container-Claim, X-Hoody-Token). Browser
                // WebSockets can't send custom headers, so claim auth is
                // Node-only — we throw a loud error instead of silently
                // dropping the credentials, which would otherwise produce
                // a "why is auth failing?" mystery for anyone migrating
                // a Node integration to a browser deployment.
                if (isBrowser) {
                    throw new Error(
                        'TerminalClient: containerClaim kitAuth is Node-only. ' +
                        'Browser WebSocket cannot send custom headers; use a ' +
                        '`token` or `jwt` kitAuth type for browser deployments.',
                    );
                }
                headers['X-Hoody-Container-Claim'] = kitAuth.claim;
                headers['X-Hoody-Token'] = kitAuth.token;
            } else if (kitAuth.type === 'ip') {
                // IP auth — proxy verifies client IP, no credentials sent.
            }
            if (urlObj) wsUrl = urlObj.toString();
        }

        if (this._debug) {
            // wsUrl carries ?ssh_password=..., ?socks5_pass=..., env pairs,
            // and possibly a kitAuth bearer in browser mode. Emit
            // origin+path only; never the query string.
            let safeUrl = wsUrl;
            try {
                const u = new URL(wsUrl);
                safeUrl = `${u.origin}${u.pathname}${u.search ? '?[query redacted]' : ''}`;
            } catch { safeUrl = '[unparseable url]'; }
            console.error('[TerminalClient] Connecting to:', safeUrl, isBrowser ? '(browser)' : '(node)');
        }

        // Build typed-client options. The wrapper OWNS reconnect (so that
        // `getKitAuth` / `getToken` providers are re-invoked on every
        // attempt) — disable typed-client-internal reconnect entirely.
        const typedOptions: IWebSocketConnectionOptions = {
            timeout: this._timeout,
            reconnect: false,
            protocols: ['tty'],
        };
        if (Object.keys(headers).length > 0) typedOptions.headers = headers;

        // Tear down any previous client. Detach the bridge FIRST so the old
        // client's in-flight events (especially during a mid-fire reconnect
        // timer callback) cannot reach our event stream. Then call disconnect
        // to stop its timer and ws.
        this.detachClient();
        if (this.client) {
            try { this.client.disconnect('replaced'); } catch { /* ignore */ }
        }
        // The replay cache lives on the typed client instance — a new
        // instance starts with an empty cache, so we must send the
        // JSON_DATA handshake again on its first onConnect.
        this._handshakeSent = false;

        const client = new TerminalConnectTerminalWebSocketWebSocket(wsUrl, typedOptions);
        this.client = client;
        this.attachClient(client, handshakeToken);

        try {
            await client.connect();
            // Success-side generation guard: if the wrapper has been
            // disconnected/replaced while typed.connect() was in-flight,
            // force-close the orphan socket and reject the public connect()
            // promise so the caller doesn't observe a phantom success.
            if (this._connectGen !== myGen) {
                try { client.disconnect('superseded'); } catch { /* ignore */ }
                throw new Error('Connection superseded');
            }
        } catch (err) {
            // Only mutate state if this is still the active connect() call.
            if (this._connectGen === myGen) {
                this._state = 'disconnected';
            }
            throw err;
        }
    }

    /**
     * Disconnect from the terminal server.
     *
     * Emits 'disconnect' (code 1000) and 'close' for an active connection.
     * Idempotent: calling on a disconnected client is a no-op for the
     * disconnect event but still emits 'close' if not yet emitted this cycle.
     */
    disconnect(reason?: string): void {
        // Only emit a fresh 'disconnect' for an active connection. If we're
        // in 'reconnecting', the typed client already emitted 'disconnect'
        // for the underlying socket close — re-emitting would double up.
        const wasConnected = this._state === 'connected';
        // Stop wrapper-owned auto-reconnect immediately and cancel any
        // pending retry timer. Without this, a user-initiated disconnect
        // during the reconnect-backoff window would still fire the next
        // retry once the timer expires.
        this._wrapperShouldReconnect = false;
        this.clearWrapperReconnectTimer();
        this._wrapperReconnectAttempts = 0;
        // Bump generation so any stale callbacks queued from the old client
        // bail via their captured-gen guard.
        this._connectGen++;
        const client = this.client;
        this.client = null;

        if (client) {
            try { client.disconnect(reason ?? 'Normal closure'); } catch { /* ignore */ }
        }
        // Detach BEFORE emitting so consumers see exactly one synchronous
        // 'disconnect' event (the bridge would otherwise also re-emit when
        // the typed client's onclose fires asynchronously).
        this.detachClient();

        this._state = 'disconnected';
        this._handshakeSent = false;
        // Drop any in-flight connect promise so future connect() calls
        // start a fresh attempt.
        this._pendingConnect = null;

        if (wasConnected) {
            this.emit('disconnect', 1000, reason ?? 'Normal closure');
        }
        // Manually emit 'close'. The deduplicating emit() override below
        // prevents this from doubling with Node's automatic 'close' on
        // _destroy. _closeEmitted is reset on each connect cycle so legacy
        // parity is preserved across cycles.
        this.emit('close');
    }

    /**
     * Force reconnect.
     */
    async reconnect(): Promise<void> {
        this.disconnect('Reconnecting');
        return this.connect();
    }

    /**
     * Schedule a wrapper-owned auto-reconnect with exponential backoff.
     * Each attempt re-runs `_connectInner`, which in turn re-invokes the
     * `getKitAuth` / `getToken` providers — this is the load-bearing
     * difference vs delegating reconnect to the typed client (whose
     * cached URL + JSON_DATA replay would persist stale credentials
     * across retries).
     */
    private scheduleWrapperReconnect(): void {
        if (this._wrapperReconnectAttempts >= this._maxReconnectAttempts) {
            this._state = 'disconnected';
            this._wrapperShouldReconnect = false;
            this.emit('reconnect-failed');
            return;
        }
        this._state = 'reconnecting';
        const delay = Math.min(
            this._reconnectDelay * Math.pow(1.5, this._wrapperReconnectAttempts),
            30000,
        );
        if (this._debug) {
            console.error('[TerminalClient] Reconnecting in', delay, 'ms (attempt',
                this._wrapperReconnectAttempts + 1, 'of', this._maxReconnectAttempts, ')');
        }
        this._wrapperReconnectTimer = setTimeout(() => {
            this._wrapperReconnectTimer = null;
            this._wrapperReconnectAttempts++;
            const attemptN = this._wrapperReconnectAttempts;
            this.emit('reconnect-attempt', attemptN);

            // Call _connectInner directly (not connect()) so the attempt
            // counter is preserved across this retry loop. Wrap in a
            // shared-promise so concurrent user connect() calls observe
            // the same outcome.
            let resolvePending!: () => void;
            let rejectPending!: (err: unknown) => void;
            const pending = new Promise<void>((res, rej) => {
                resolvePending = res; rejectPending = rej;
            });
            this._pendingConnect = pending;

            this._connectInner().then(
                () => {
                    if (this._pendingConnect === pending) this._pendingConnect = null;
                    resolvePending();
                    this.emit('reconnect', attemptN);
                },
                (err) => {
                    if (this._pendingConnect === pending) this._pendingConnect = null;
                    rejectPending(err);
                    // Failure → keep trying (subject to the cap).
                    if (this._wrapperShouldReconnect) {
                        this.scheduleWrapperReconnect();
                    }
                },
            );
            // Swallow rejection on the shared pending promise to avoid
            // unhandled-rejection if no caller is awaiting it (typical for
            // auto-retry).
            pending.catch(() => undefined);
        }, delay);
    }

    private clearWrapperReconnectTimer(): void {
        if (this._wrapperReconnectTimer) {
            clearTimeout(this._wrapperReconnectTimer);
            this._wrapperReconnectTimer = null;
        }
    }

    /**
     * Per-cycle 'close' dedup. Within a single connect/disconnect cycle,
     * 'close' is delivered exactly once even when the consumer combines
     * manual disconnect() with destroy(). The flag is cleared at the top
     * of each _connectInner so subsequent cycles emit their own 'close'.
     */
    override emit(event: string | symbol, ...args: unknown[]): boolean {
        if (event === 'close') {
            if (this._closeEmitted) return false;
            this._closeEmitted = true;
        }
        return super.emit(event, ...args);
    }

    // ===========================================================================
    // Terminal Operations
    // ===========================================================================

    /**
     * Resize the terminal.
     */
    resize(cols: number, rows: number): void {
        this._cols = cols;
        this._rows = rows;

        if (this.connected && this.client) {
            try {
                this.client.sendResize({ command: '1', columns: cols, rows });
                if (this._debug) {
                    console.error('[TerminalClient] Sent resize:', cols, 'x', rows);
                }
            } catch (err) {
                if (this.listenerCount('error') > 0) {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            }
        }

        this.emit('resize', cols, rows);
    }

    /** Pause terminal output (flow control). */
    override pause(): this {
        if (this.connected && this.client) {
            try { this.client.sendPause(); } catch { /* swallow — best effort */ }
        }
        return super.pause();
    }

    /** Resume terminal output (flow control). */
    override resume(): this {
        if (this.connected && this.client) {
            try { this.client.sendResume(); } catch { /* swallow — best effort */ }
        }
        return super.resume();
    }

    // ===========================================================================
    // Duplex Stream Implementation
    // ===========================================================================

    /** Writable: send keyboard input as INPUT byte-prefix frame. */
    override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        if (!this.connected || !this.client) {
            callback(new Error('Not connected'));
            return;
        }
        try {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
            this.client.sendInput(data);
            if (this._debug) {
                console.error('[TerminalClient] Sent input:', data.length, 'bytes');
            }
            callback();
        } catch (error) {
            callback(error as Error);
        }
    }

    /** Readable: data is pushed from onOutput / onUnknownFrame handlers. */
    override _read(_size: number): void { /* noop */ }

    /** Clean up on destroy. */
    override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        this.disconnect('Stream destroyed');
        callback(error);
    }

    // ===========================================================================
    // Private — typed-client wiring
    // ===========================================================================

    /**
     * Subscribe Duplex events to typed-client callbacks. All `on*` methods
     * return an unsubscribe; we collect them so detachClient() can drop
     * every listener cleanly when the underlying socket is replaced.
     */
    private attachClient(
        client: TerminalConnectTerminalWebSocketWebSocket,
        handshakeToken: string | undefined,
    ): void {
        const subs: Array<() => void> = [];
        // Capture the wrapper-side connect generation at attach time. Every
        // listener bails if the wrapper has since replaced this client —
        // prevents stale events from a mid-reconnect orphan typed client
        // from leaking into our consumer event stream.
        const myGen = this._connectGen;
        const isStale = (): boolean => this._connectGen !== myGen;

        subs.push(client.onConnect(() => {
            if (isStale()) return;
            this._state = 'connected';
            // The wrapper owns reconnect; every successful socket open is
            // either the FIRST attempt or a wrapper-driven retry that
            // constructed a fresh typed client. Either way, _handshakeSent
            // is false at attach time, so we always send a fresh JSON_DATA
            // (with the freshly-resolved handshakeToken from this attempt's
            // getToken provider call).
            const payload: { command: '{'; columns: number; rows: number; token?: string } = {
                command: '{',
                columns: this._cols,
                rows: this._rows,
            };
            if (handshakeToken) payload.token = handshakeToken;
            try {
                client.sendJsonData(payload);
                this._handshakeSent = true;
                if (this._debug) {
                    const safe: Record<string, unknown> = { ...payload };
                    if ('token' in safe) safe.token = '[redacted]';
                    console.error('[TerminalClient] Sent handshake:', safe);
                }
            } catch (err) {
                if (this.listenerCount('error') > 0) {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            }

            this.emit('connect');
        }));

        subs.push(client.onDisconnect((code, reason) => {
            if (isStale()) return;
            this._state = 'disconnected';
            this.emit('disconnect', code, reason);

            // Wrapper-owned reconnect: if the close wasn't terminal (4xxx
            // policy / 1002 / 1003 / 1008) and the wrapper is configured to
            // reconnect, schedule a retry that calls `_connectInner` afresh
            // — re-running `getKitAuth` / `getToken` providers so rotated
            // credentials take effect.
            const isTerminal = code === 1008 || code === 1003
                || code === 1002 || (code >= 4000 && code < 5000);
            if (this._wrapperShouldReconnect && this._reconnect && !isTerminal) {
                this.scheduleWrapperReconnect();
            }
        }));

        subs.push(client.onOutput((buf) => {
            if (isStale()) return;
            // The typed client allocates a fresh Uint8Array per frame, so
            // sharing memory via Buffer.from(buf.buffer, ...) is safe and
            // zero-copy.
            const out = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
            this.push(out);
            this.emit('output', out);
        }));

        subs.push(client.onSetWindowTitle((title) => {
            if (isStale()) return;
            this._windowTitle = title;
            this.emit('title', title);
        }));

        subs.push(client.onSetPreferences((payload: unknown) => {
            if (isStale()) return;
            // The typed-client interface declares
            //   { command: '2'; preferences: {...} }
            // but the wire JSON from ttyd is the prefs object directly
            // (no wrapper). Accept either shape. Keys are passed through
            // verbatim from the server (camelCase or snake_case as sent).
            let prefs: TerminalPreferences;
            if (payload && typeof payload === 'object' && 'preferences' in (payload as Record<string, unknown>)) {
                prefs = ((payload as { preferences: TerminalPreferences }).preferences) ?? {};
            } else {
                prefs = (payload as TerminalPreferences) ?? {};
            }
            this._preferences = prefs;
            this.emit('preferences', prefs);
        }));

        subs.push(client.onSetTerminalId((id) => {
            if (isStale()) return;
            this._terminalId = id;
            this.emit('terminal-id', id);
        }));

        subs.push(client.onSetShellType((shell) => {
            if (isStale()) return;
            this._shellType = shell as ShellType;
            this.emit('shell-type', this._shellType);
        }));

        subs.push(client.onUnknownFrame((buf) => {
            if (isStale()) return;
            // Forward-compat: legacy emitted unknown frames as 'output' with
            // the command byte stripped. Match.
            const payload = buf.length > 1 ? buf.subarray(1) : new Uint8Array(0);
            const out = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
            if (this._debug) {
                console.error('[TerminalClient] Unknown command byte:', buf[0]);
            }
            this.push(out);
            this.emit('output', out);
        }));

        // NOTE: typed-client `reconnect` is forced OFF (so providers run on
        // every retry). The wrapper emits 'reconnect-attempt' / 'reconnect'
        // / 'reconnect-failed' from its own scheduleWrapperReconnect path
        // — see disconnect() bridge above.

        subs.push(client.onError((err) => {
            if (isStale()) return;
            if (this.listenerCount('error') > 0) {
                this.emit('error', err);
            }
        }));

        this._unsubscribers = subs;
    }

    /** Drop every listener registered against the previous typed client. */
    private detachClient(): void {
        for (const off of this._unsubscribers) {
            try { off(); } catch { /* ignore */ }
        }
        this._unsubscribers = [];
    }

    /**
     * Build WebSocket URL with query parameters.
     */
    private buildUrlWithQueryParams(baseUrl: string, options: TerminalClientOptions): string {
        assertAgentCmdExclusive(options); // second checkpoint — see the helper's doc
        const params = new URLSearchParams();

        if (options.readonly !== undefined) {
            params.append('readonly', options.readonly ? 'true' : 'false');
        }
        if (options.cwd) params.append('cwd', options.cwd);
        if (options.cwd_auto_create !== undefined) {
            params.append('cwd_auto_create', options.cwd_auto_create ? 'true' : 'false');
        }
        if (options.shell) params.append('shell', options.shell);
        if (options.user) params.append('user', options.user);
        if (options.terminal_id) params.append('terminal_id', options.terminal_id);
        if (options.display) params.append('display', options.display);
        if (options.pid !== undefined && options.pid !== '') {
            params.append('pid', String(options.pid));
        }
        if (options.cmd) params.append('cmd', options.cmd);
        if (options.agent) params.append('agent', 'true');
        if (options.onboarding) params.append('onboarding', 'true');
        if (options.welcome !== undefined) {
            params.append('welcome', options.welcome ? 'true' : 'false');
        }

        if (options.ssh_host) params.append('ssh_host', options.ssh_host);
        if (options.ssh_user) params.append('ssh_user', options.ssh_user);
        if (options.ssh_port) params.append('ssh_port', options.ssh_port);
        if (options.ssh_password) params.append('ssh_password', options.ssh_password);
        if (options.ssh_key) params.append('ssh_key', options.ssh_key);
        if (options.socks5_host) params.append('socks5_host', options.socks5_host);
        if (options.socks5_port) params.append('socks5_port', options.socks5_port);
        if (options.socks5_user) params.append('socks5_user', options.socks5_user);
        if (options.socks5_pass) params.append('socks5_pass', options.socks5_pass);

        if (options.env) {
            if (Array.isArray(options.env)) {
                options.env.forEach(envVar => params.append('env', envVar));
            } else {
                Object.entries(options.env).forEach(([key, value]) => {
                    params.append('env', `${key}=${value}`);
                });
            }
        }

        // The base URL may already carry query params (caller-built). The kit
        // honors the FIRST occurrence of a duplicated key, so anything already
        // in the base silently beats what gets appended here — which would
        // let a base-URL `cmd=` defeat the agent/cmd exclusivity guard, or a
        // base `agent=false` / `welcome=true` override the options. Validate
        // the EFFECTIVE merged query and refuse ambiguity instead of losing.
        // This MUST run before the empty-options early return below, so a base
        // URL carrying both `agent` and `cmd` is caught even when `options`
        // adds no params of its own.
        const qIdx = baseUrl.indexOf('?');
        const baseParams = qIdx >= 0 ? new URLSearchParams(baseUrl.slice(qIdx + 1)) : null;
        if (baseParams) {
            const truthy = (v: string | null) => v !== null && v !== 'false' && v !== '0';
            const effAgent = options.agent === true || truthy(baseParams.get('agent'));
            const effCmd = options.cmd || baseParams.get('cmd');
            if (effAgent && effCmd) {
                throw new TypeError(
                    'TerminalClient: agent and cmd are mutually exclusive across the base URL and options — '
                    + 'on kits without agent mode the cmd bytes would be typed into the spawned process.',
                );
            }
            // A caller-built base URL may itself carry a singleton key twice with
            // DIFFERING values (e.g. `?welcome=true&welcome=false`). The kit honors
            // only the FIRST occurrence, so the rest are silently dropped — refuse
            // the ambiguity instead of picking for the caller. `env` is the one key
            // that is repeatable by design.
            for (const key of new Set(baseParams.keys())) {
                if (key === 'env') continue;
                const distinct = [...new Set(baseParams.getAll(key))];
                if (distinct.length > 1) {
                    throw new TypeError(
                        `TerminalClient: the base URL carries conflicting '${key}' values `
                        + `(${distinct.join(', ')}); the kit honors the first occurrence — remove the duplicates.`,
                    );
                }
            }
            for (const [key, value] of params) {
                if (key === 'env') continue; // repeatable by design
                const existing = baseParams.get(key);
                if (existing !== null && existing !== value) {
                    throw new TypeError(
                        `TerminalClient: query param '${key}' is '${existing}' on the base URL but '${value}' in options — `
                        + 'remove one; the kit honors the first occurrence, so the base value would silently win.',
                    );
                }
            }
            // `agent` and `onboarding` are flag params appended ONLY when truthy —
            // emitting `agent=false` would read as PRESENT/agent-on to agent-capable
            // kits — so an explicit `{ agent:false }` / `{ onboarding:false }` never
            // reaches the options loop above. Catch the case where the base URL forces
            // the flag ON while the caller explicitly asked for it OFF; otherwise the
            // base value silently wins and defeats the caller's intent.
            for (const flag of ['agent', 'onboarding'] as const) {
                if (options[flag] === false && truthy(baseParams.get(flag))) {
                    throw new TypeError(
                        `TerminalClient: '${flag}' is set on the base URL but false in options — `
                        + 'remove one; the kit honors the first occurrence, so the base value would silently win.',
                    );
                }
            }
        }

        const queryString = params.toString();
        if (!queryString) return baseUrl;

        const separator = qIdx >= 0 ? '&' : '?';
        return `${baseUrl}${separator}${queryString}`;
    }
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

// Re-export the typed client + its options type for consumers that want
// raw access without the Node Duplex shim — useful in browser code or
// for unit tests that stub the WebSocket layer directly.
export {
    TerminalConnectTerminalWebSocketWebSocket as TerminalWebSocketTyped,
    type ITerminalConnectTerminalWebSocketWebSocket as ITerminalWebSocketTyped,
    type IWebSocketConnectionOptions as ITerminalWebSocketOptions,
} from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
