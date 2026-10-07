/**
 * Terminal exec/shell — high-level wrappers for remote command execution.
 *
 * Architecture:
 *   This module extends HoodyClient with two convenience methods:
 *
 *   - `terminal.run(command, options?)` — run a command and wait for the result
 *     (like child_process.exec). Uses the HTTP run+poll path of
 *     `terminal.commands`. It lives on the terminal namespace, not at the
 *     root, so it cannot be mistaken for the Hoody Exec kit (`client.exec`).
 *
 *   - `shell(options?)` — open an interactive PTY session (like opening
 *     a remote terminal). Uses WebSocket duplex stream via TerminalClient.
 *
 *   Both methods require a container-scoped client (via `withContainer()`).
 *   `shell` is attached to HoodyClient.prototype via module augmentation and
 *   runtime prototype patching, following the same pattern as exec-scripts.ts;
 *   `terminal.run` is installed on each client's terminal namespace object
 *   (`installTerminalRun`), because that object is per instance.
 */
import { Duplex } from 'stream';
export interface TerminalShellOptions {
    /** Working directory */
    cwd?: string;
    /** Shell type (bash, zsh, fish, sh) */
    shell?: string;
    /** System user */
    user?: string;
    /** Environment variables */
    env?: Record<string, string> | string[];
    /** Terminal columns (default: 80) */
    cols?: number;
    /** Terminal rows (default: 24) */
    rows?: number;
    /**
     * Join the terminal session with this id (1-65535) instead of opening a
     * fresh one. Everyone who joins the same id shares one shell: its input,
     * its output and its state. `1` is the terminal the web UI opens by default.
     * A session opened this way outlives the connection.
     *
     * Omitted (the default), every `shell()` call gets a session of its own: the
     * kit assigns it an id in 40000-65535 (`shell.terminalId`) and cleans it up
     * after the connection closes.
     */
    terminalId?: number | string;
    /**
     * Older spelling of `terminalId`: the terminal host index. `0` (the default)
     * is "no terminal id", a fresh session; any other value joins that session.
     */
    serviceIndex?: number;
    /** Connection timeout in ms (default: 30000) */
    timeout?: number;
    /**
     * Auto-reconnect on disconnect (default: false). A reconnect comes back to
     * the same session: a fresh one is pinned to the id the kit gave it. Input
     * written while the connection is down is held and sent once the session is
     * confirmed to be the same one. If it is gone (the kit removes an idle
     * fresh session about a minute after its last client leaves), the shell
     * ends with an error and the held input is dropped; it is never sent to
     * another session.
     */
    reconnect?: boolean;
}
/**
 * Interactive PTY shell session — a Node.js Duplex stream wrapping TerminalClient.
 *
 * Supports `.pipe()`, `.write()`, `.on('data')`, etc.
 *
 * Note: PTY sessions do NOT report exit codes. The shell stays alive until
 * you call `.destroy()` or the connection drops.
 */
export interface TerminalShell extends Duplex {
    /**
     * Resolves when the WebSocket connection is established and the kit has
     * named the session, so `terminalId` is set. A kit that does not name the
     * session within a few seconds does not hold `ready` back: it resolves
     * with `terminalId` still ''.
     */
    readonly ready: Promise<void>;
    /** Whether the underlying WebSocket is connected */
    readonly connected: boolean;
    /** Server-assigned terminal session ID */
    readonly terminalId: string;
    /**
     * Resize the PTY. While a reconnected fresh session is still being
     * confirmed, the size is only recorded; it is sent once the session is
     * confirmed.
     */
    resize(cols: number, rows: number): void;
    /**
     * Send a signal to the running process.
     * - SIGINT: sends Ctrl+C (\x03) to the PTY. With `reconnect`, while a
     *   reconnected fresh session is still being confirmed, the Ctrl+C is held
     *   with the queued input, in order, and sent only once the session is
     *   confirmed; if it is not, it is dropped with the rest.
     * - Any other signal: disconnects the WebSocket (server kills the process)
     */
    kill(signal?: string): void;
    /** Disconnect and clean up */
    destroy(error?: Error): this;
}
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Open an interactive PTY shell session to the container.
         *
         * Each call opens a fresh session of its own; pass `terminalId` to join a
         * shared one instead (see TerminalShellOptions.terminalId).
         *
         * Returns a Duplex stream that supports `.pipe()`.
         * Requires a container-scoped client (call `withContainer()` first).
         *
         * @example
         * ```ts
         * const scoped = await client.withContainer(container);
         * const sh = scoped.shell();
         * await sh.ready;
         * sh.write('echo hello\n');
         * sh.pipe(process.stdout);
         * ```
         */
        shell(options?: TerminalShellOptions): TerminalShell;
    }
}
/**
 * Attach `shell()` to HoodyClient.prototype.
 *
 * Idempotent — safe to call multiple times (guarded by Symbol marker).
 * Called automatically when this module is imported.
 */
export declare function patchTerminalExecPrototype(): void;
export { installTerminalRun } from './terminal-run.js';
export type { TerminalExecOptions, TerminalExecResult } from './terminal-run.js';
