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
 *  - Metrics: wraps getStats (containers/projects) to normalize/humanize
 *    raw stats (see lib/metrics.ts).
 *  - ExecScriptsService prototype: Markdown/file helpers + defaults.
 *  - ExecService prototype: `run` with method/body/query, `call`, `listCallableScripts`, `connect`.
 *  - TerminalExec / TerminalSsh / ExecDynamicClient / Files prototypes.
 *  - sqlite.sql.query / run: SqlService prototype (lib/sqlite-helpers.ts).
 *
 * The HoodyClient subclass also overrides withContainer/withRealm so scoped
 * client instances inherit the same patches via prototype swap in asWrapped.
 */
import { HoodyClient as GeneratedHoodyClient, type HoodyClientConfig, type HoodyCredentials, type ContainerLike } from '../generated/client.js';
import { ApiError } from '../generated/errors.js';
import type { TerminalConnectTerminalWebSocketWebSocket } from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
import './terminal-exec.js';
import { type TerminalExecOptions, type TerminalExecResult } from './terminal-run.js';
import { type ExecRemoteConnect } from './exec-remote.js';
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
export interface ProgramTerminalAttachOptions {
    /** Watch only: hoody-terminal drops this connection's input. Per connection, not a permission. */
    readonly?: boolean;
    /** Size sent in the JSON_DATA handshake (default 80x24). The smallest writable client sets the program's size (read-only clients only when none is writable). */
    columns?: number;
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
export interface ProgramTerminalAttachment {
    /** The program's terminal id: terminal N of the container. */
    terminalId: number;
    /** The connected socket, after its first server frame. Send keys with `ws.sendInput()`. */
    ws: TerminalConnectTerminalWebSocketWebSocket;
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
 *  4. Wrap client.api.containers.getStats with normalizeContainerStatsResponse
 *  5. Wrap client.api.projects.getStats with normalizeProjectStatsResponse
 *  6. Set METRICS_PATCH_MARKER to prevent re-patching this instance
 */
export declare function patchHoodyClientMetrics<T extends GeneratedHoodyClient>(client: T): T;
declare module '../generated/daemon/programs.service.js' {
    interface ProgramsService {
        /**
         * The terminal id of a daemon program (`terminal_id`), read from the
         * container's daemon (the one this service talks to). Its browser URL is `getKitUrl('terminal', container, id)`.
         * Rejects when the program does not exist or has no terminal.
         */
        getTerminalId(program: DaemonProgramRef): Promise<number>;
        /**
         * Attach to a daemon program's terminal: the program's screen, its input,
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
         * this client or `withContainer`); the account token never goes into the
         * socket URL. A `containerClaim` kitAuth travels in headers, which only Node
         * can put on a WebSocket upgrade. In a browser, use a `token` kitAuth with
         * `param` (the proxy reads it from the query string) or a cookie on the
         * kit host.
         */
        attachTerminal(program: DaemonProgramRef, options?: ProgramTerminalAttachOptions): Promise<ProgramTerminalAttachment>;
    }
}
/**
 * Attach `getTerminalId` and `attachTerminal` to ProgramsService.prototype (idempotent).
 * Both need a container-scoped client: its daemon kit for the lookup, its terminal kit for the socket.
 */
export declare function patchDaemonProgramsPrototype(): void;
export declare class HoodyClient extends GeneratedHoodyClient {
    /** The exec namespace, plus `exec.connect(url, { token })`: the remote channel of a live script (lib/exec-remote.ts). */
    readonly exec: GeneratedHoodyClient['exec'] & {
        connect: ExecRemoteConnect;
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
     * The base class methods withContainer/withRealm return a GeneratedHoodyClient.
     * This helper swaps its prototype to HoodyClient.prototype so that the scoped
     * instance gains all HoodyClient overrides, then applies the metrics patches.
     * The prototype swap is a standard pattern for re-typing objects returned by
     * base-class factory methods without re-instantiating them.
     */
    private static asWrapped;
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
     * Build a desktop URL for a container. `desktop-{N}` is a public reverse-proxy
     * alias: the proxy injects the desktop/redirect query params and the terminal
     * kit 302s the browser to display-{N+OFFSET} (default OFFSET=1600 server-side).
     *
     * Net browser-visible navigation: `desktop-{N}` → `display-{N+OFFSET}`.
     *
     * @param container - Container object with project_id, id, and server fields.
     * @param options.serviceIndex - Desktop instance index (default: 1). Distinct
     *   from regular terminal indices — the proxy offsets internally.
     * @param options.desktopEnv - Desktop environment string (default: server-side
     *   xfce). Only appended to the URL when explicitly provided, so the proxy's
     *   default kicks in otherwise.
     */
    getDesktopUrl(container: ContainerLike, options?: {
        serviceIndex?: number;
        desktopEnv?: string;
    }): string;
    withContainer(containerOrId: string | ContainerLike, options?: {
        kitAuth?: ProxyAuth | ProxyAuthPolicy;
        onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    }): Promise<HoodyClient>;
    withRealm(realmId?: string): HoodyClient;
    /**
     * Real-time events of this client's account (or of its realm, on a
     * `withRealm` client): live delivery, recovery from history after a
     * disconnect, and waits. Created on first use; each client instance has
     * its own stream. `api.events` stays the REST history.
     */
    get events(): EventsClient;
    logout(): Promise<void>;
    logoutAll(): Promise<void>;
    setSessionToken(token: string): void;
    login(...args: Parameters<GeneratedHoodyClient['login']>): ReturnType<GeneratedHoodyClient['login']>;
    adoptSession(...args: Parameters<GeneratedHoodyClient['adoptSession']>): string;
    setToken(token: string): void;
}
