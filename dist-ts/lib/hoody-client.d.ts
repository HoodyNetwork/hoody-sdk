/**
 * SDK client wrapper that patches the generated HoodyClient at runtime.
 *
 * The code-generated client returns raw API responses. This module wraps
 * selected async methods so their return values are post-processed (metrics
 * normalization) and augments several service prototypes with typed helpers.
 * Authentication, retries, and middleware (including `X-Hoody-Signature`
 * capture) remain the responsibility of the generated HttpClient surface.
 *
 * Patches applied on each client instance:
 *  - Metrics: wraps getStats (computers/projects) to normalize/humanize
 *    raw stats (see lib/metrics.ts).
 *  - ExecScriptsService prototype: Markdown/file helpers + defaults.
 *  - ExecService prototype: `run` with method/body/query, `call`, `listCallableScripts`, `connect`.
 *  - TerminalExec / TerminalSsh / ExecDynamicClient / Files prototypes.
 *  - sqlite.sql.query / run: SqlService prototype (lib/sqlite-helpers.ts).
 *
 * The HoodyClient subclass also overrides withComputer/withRealm so scoped
 * client instances inherit the same patches via prototype swap in asWrapped.
 */
import { HoodyClient as GeneratedHoodyClient, type HoodyClientConfig, type HoodyCredentials, type ComputerLike } from '../generated/client.js';
import { ApiError } from '../generated/errors.js';
import type { TerminalSessionsConnectWebSocket } from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
import { type TerminalExecOptions, type TerminalExecResult } from './terminal-run.js';
import { type ExecRemoteFactory } from './exec-remote.js';
import { type SqliteKvStore } from './kv-helpers.js';
import { type KitCatalogEntry, type KitCatalogOptions } from './kit-catalog.js';
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
import { EventsClient } from './events-client.js';
/**
 * A daemon program: its id, or `{ name }` for its exact name (which may be all
 * digits, so a name is never guessed from a number).
 */
export type DaemonProgramRef = number | {
    id: number;
} | {
    name: string;
};
export interface ProgramTerminalConnectOptions {
    /** Watch only: hoody-terminal drops this connection's input. Per connection, not a permission. (The earlier key `readonly` is refused.) */
    readOnly?: boolean;
    /** Size sent in the JSON_DATA handshake (default 80x24). The smallest writable client sets the program's size (read-only clients only when none is writable). (The earlier key `columns` is refused.) */
    cols?: number;
    rows?: number;
    /**
     * Installed before the socket opens, so it receives every output byte. A
     * handler added with `ws.onOutput()` after the promise resolves can miss
     * output that arrived with the handshake (the program's buffered screen).
     */
    onOutput?: (data: Uint8Array) => void;
    /** Called when an established attachment closes; `ws.onDisconnect()` works too. */
    onDisconnect?: (code: number, reason: string) => void;
}
export interface ProgramTerminalConnection {
    /** The program's terminal id: terminal N of the computer. */
    terminalId: number;
    /** The connected socket, after its first server frame. Send keys with `ws.sendInput()`. */
    ws: TerminalSessionsConnectWebSocket;
}
/**
 * Apply all runtime patches to a generated HoodyClient instance.
 *
 * Patch sequence:
 *  1. Patch the hand-written helpers onto the generated service prototypes (exec, terminal, files,
 *     sqlite, daemon, ...; one-time, each idempotent via its own guard)
 *  2. Stamp each service that hosts a helper with its owner (lib/service-owner.ts) and install
 *     `terminal.run` on this instance's terminal object
 *  3. Check METRICS_PATCH_MARKER on this instance; if already set, return early
 *  4. Wrap client.api.computers.getStats with normalizeComputerStatsResponse
 *  5. Wrap client.api.projects.getStats with normalizeProjectStatsResponse
 *  6. Set METRICS_PATCH_MARKER to prevent re-patching this instance
 */
export declare function patchHoodyClientMetrics<T extends GeneratedHoodyClient>(client: T): T;
declare module '../generated/daemon/programs.service.js' {
    interface ProgramsService {
        /**
         * The terminal id of a daemon program (`terminal_id`), read from the
         * computer's daemon (the one this service talks to). Its browser URL is `getKitUrl('terminal', computer, id)`.
         * Rejects when the program does not exist or has no terminal.
         */
        getTerminalId(program: DaemonProgramRef): Promise<number>;
        /**
         * Connect to a daemon program's terminal: the program's screen, its input,
         * its size. The socket is terminal N's (`terminal-N` host, N being the
         * program's `terminal_id`) and carries no spawn parameters: the terminal
         * belongs to the running program, so they would be ignored. The program
         * gets the smallest size among the writable clients attached to it
         * (read-only clients count only when none is writable).
         *
         * Resolves once the first server frame arrives. Rejects with an Error whose
         * `code` is the WebSocket close code and `reason` its reason when the attach
         * is refused: 4404 `daemon program not running`, 4409 when a local shell
         * session opened on that id before it became the program's still holds it
         * (delete that session to free the id), 1006 when the upgrade itself
         * failed (credentials, routing). After that, the program ending reaches
         * `onDisconnect` (and `ws.onDisconnect`) as 4404 `daemon program ended`,
         * and the socket does not reconnect after a 4xxx close; a dropped
         * connection (1006) reconnects and attaches again by itself. Close with `ws.disconnect()`: the program keeps
         * running.
         *
         * Authentication is the scoped client's kit authentication (`kitAuth` on
         * this client or `withComputer`); the account token never goes into the
         * socket URL. A `computerClaim` kitAuth travels in headers, which only Node
         * can put on a WebSocket upgrade. In a browser, use a `token` kitAuth with
         * `param` (the proxy reads it from the query string) or a cookie on the
         * kit host.
         */
        connectTerminal(program: DaemonProgramRef, options?: ProgramTerminalConnectOptions): Promise<ProgramTerminalConnection>;
    }
}
/**
 * Attach `getTerminalId` and `connectTerminal` to ProgramsService.prototype (idempotent).
 * Both need a computer-scoped client: its daemon kit for the lookup, its terminal kit for the socket.
 */
export declare function patchDaemonProgramsPrototype(): void;
/**
 * The SDK entry point. One client holds the account session and reaches the
 * account API (`client.api`), the live account events (`client.events`) and,
 * once scoped with `await client.withComputer(...)`, the programs of one
 * computer (`files`, `terminal`, `exec`, `sqlite` and the other namespaces).
 *
 * Construct it with a config (`token`, or `credentials` that log in on first
 * use), or use `HoodyClient.login()` to get a logged-in client. Clients
 * derived with `withComputer()` or `withRealm()` share the session of the
 * client they came from: a refresh, logout or `setSessionToken()` on one
 * applies to all of them.
 */
export declare class HoodyClient extends GeneratedHoodyClient {
    /** The exec namespace, plus `exec.remote(url, { token })`: the remote channel of a live script (lib/exec-remote.ts). */
    readonly exec: GeneratedHoodyClient['exec'] & {
        remote: ExecRemoteFactory;
    };
    /** The sqlite namespace, with the object form of the KV key calls in `kv`'s type (lib/kv-helpers.ts). */
    readonly sqlite: Omit<GeneratedHoodyClient['sqlite'], 'kv'> & {
        kv: SqliteKvStore;
    };
    /** The terminal namespace, plus `terminal.run(command)`: run a command and wait for the result (lib/terminal-exec.ts). */
    readonly terminal: GeneratedHoodyClient['terminal'] & {
        run(command: string, options?: TerminalExecOptions): Promise<TerminalExecResult>;
    };
    /**
     * Promote a GeneratedHoodyClient instance into a fully-patched HoodyClient.
     *
     * The base class methods withComputer/withRealm return a GeneratedHoodyClient.
     * This helper swaps its prototype to HoodyClient.prototype so that the scoped
     * instance gains all HoodyClient overrides, then applies the metrics patches.
     * The prototype swap is a standard pattern for re-typing objects returned by
     * base-class factory methods without re-instantiating them.
     */
    private static asWrapped;
    /**
     * Create a client from `config`. With no `baseURL` outside a web page, the
     * account API is taken from `HOODY_BASE_URL`, else `HOODY_API_URL`, else the
     * public Hoody API (a client whose `target` is `'kit'` gets no default).
     * Makes no request. Throws `RetiredOptionError` when the config carries a
     * retired option name.
     */
    constructor(config: HoodyClientConfig);
    /**
     * Identify the account with either `username` or `email` (see
     * HoodyCredentials) — the server rejects the wrong field for the value.
     *
     * Resolves only with a logged-in client. An account with two-factor
     * authentication rejects with `TwoFactorRequiredError`; `await
     * error.complete(code)` finishes the login and resolves to that client.
     */
    static login(baseURL: string, credentials: HoodyCredentials): Promise<HoodyClient>;
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    static listKits(options?: KitCatalogOptions): KitCatalogEntry[];
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    listKits(options?: KitCatalogOptions): KitCatalogEntry[];
    /**
     * Static list of known desktop environments for discoverability.
     * The `getDesktopUrl()` method accepts any string — this list is not exhaustive.
     */
    static listDesktopEnvironments(): string[];
    /**
     * Static list of known desktop environments for discoverability.
     */
    listDesktopEnvironments(): string[];
    /**
     * Build a desktop URL for a computer. `desktop-{N}` is a public reverse-proxy
     * alias: the proxy injects the desktop/redirect query params and the terminal
     * kit 302s the browser to display-{N+OFFSET} (default OFFSET=1600 server-side).
     *
     * Net browser-visible navigation: `desktop-{N}` → `display-{N+OFFSET}`.
     *
     * @param computer - Computer object with project_id, id, and server fields.
     * @param options.serviceIndex - Desktop instance index (default: 1). Distinct
     *   from regular terminal indices — the proxy offsets internally.
     * @param options.desktopEnv - Desktop environment string (default: server-side
     *   xfce). Only appended to the URL when explicitly provided, so the proxy's
     *   default kicks in otherwise.
     */
    getDesktopUrl(computer: ComputerLike, options?: {
        serviceIndex?: number;
        desktopEnv?: string;
    }): string;
    /**
     * Derive a client scoped to one computer: its namespaces (`files`,
     * `terminal`, `exec`, ...) talk to that computer's programs. Pass a computer
     * object, or an id to have it looked up through the account API; a failed
     * lookup rejects with the API's error. `options.kitAuth` sets the credential
     * sent to the computer's programs, and `options.onKitAuthExpired` is asked
     * for a new one when a program refuses it.
     *
     * Returns a Promise: `const box = await client.withComputer(id)`. Reading a
     * namespace on the un-awaited promise throws an Error that says so.
     */
    withComputer(computerOrId: string | ComputerLike, options?: {
        kitAuth?: ProxyAuth | ProxyAuthPolicy;
        onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    }): Promise<HoodyClient>;
    /**
     * Derive a client scoped to a realm: its account API requests go to that
     * realm's host. `realmId` is 24 hexadecimal characters; `'all'`, `'default'`
     * or `'*'` clears the scope, and anything else throws `ValidationError`. The
     * derived client shares this client's session, and its `events` stream
     * carries that realm's events.
     */
    withRealm(realmId?: string): HoodyClient;
    /**
     * Real-time events of this client's account (or of its realm, on a
     * `withRealm` client): live delivery, recovery from history after a
     * disconnect, and waits. Created on first use; each client instance has
     * its own stream. `api.events` stays the REST history.
     */
    get events(): EventsClient;
    /**
     * Log this client's session out locally: the access token, refresh token,
     * stored credentials and `kitAuth` are dropped for this client and every
     * client sharing its session. No session is revoked on the server; use
     * `logoutAll()` for that. The events stream's session ends with it: its
     * socket closes and the buffers and cursors of the old session are dropped.
     * Other streams and sockets the caller opened stay open.
     */
    logout(): Promise<void>;
    /**
     * Revoke every session of the account on the server (all devices and apps),
     * then clear this session as `logout()` does. The local session, and the
     * events stream's session with it, is cleared even when the request fails;
     * the failure is then rethrown.
     */
    logoutAll(): Promise<void>;
    /**
     * Set the access token of the whole session: this client and every client
     * sharing its session send it from now on. The refresh token and stored
     * credentials are kept. The events stream's old session ends, and the stream
     * reconnects with the new token when it still has handlers.
     */
    setSessionToken(token: string): void;
    /**
     * Log this client in with credentials, starting a new session, and resolve
     * with the API's login response. The answer of an account with two-factor
     * authentication is a challenge, not a session. The events stream's old
     * session ends whether or not the login succeeds.
     */
    login(...args: Parameters<GeneratedHoodyClient['login']>): ReturnType<GeneratedHoodyClient['login']>;
    /**
     * Take over a session obtained elsewhere (a login, two-factor or device-flow
     * response, or tokens saved earlier): the access token becomes the bearer of
     * this client's session and the refresh token is kept for automatic refresh.
     * Returns the access token. Throws `ValidationError` when the value holds a
     * challenge and no session. The events stream moves to the new session.
     */
    adoptSession(...args: Parameters<GeneratedHoodyClient['adoptSession']>): string;
    /**
     * Set the access token of this client only. The client leaves the session it
     * shared and starts one of its own, with no refresh token; other clients
     * keep theirs. Its events stream follows it to the new session. To change
     * the token of the whole session, use `setSessionToken()`.
     */
    setToken(token: string): void;
}
