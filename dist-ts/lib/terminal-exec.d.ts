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
 *   Both methods require a computer-scoped client (via `withComputer()`).
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
     * Join the terminal session with this id instead of opening a
     * fresh one. New sessions take 1-9999; pin your own in 1-1600 (1601-5000
     * back desktops and agents, 5001-7999 is the ephemeral pool, 8001-9999 is
     * Hoody Run and the Hub). Everyone who joins the same id shares one shell: its input,
     * its output and its state. `1` is the terminal the web UI opens by default.
     * A session opened this way outlives the connection.
     *
     * Omitted (the default), every `shell()` call gets a session of its own: the
     * kit assigns it an id in 5001-7999 (`shell.getTerminalId()`) and cleans it up
     * after the connection closes.
     *
     * `serviceIndex` and `terminal_id` are retired spellings and are refused.
     * A caller that passed `serviceIndex: 0` omits `terminalId` for a fresh
     * session; any other `serviceIndex: N` is `terminalId: N`.
     */
    terminalId?: number | string;
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
     * named the session, so `getTerminalId()` is set. A kit that does not name the
     * session within a few seconds does not hold `ready` back: it resolves
     * with `getTerminalId()` still ''.
     */
    readonly ready: Promise<void>;
    /** Whether the underlying WebSocket is connected */
    isConnected(): boolean;
    /** Server-assigned terminal session ID ('' until the kit names the session) */
    getTerminalId(): string;
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
/**
 * Attach `shell()` to HoodyClient.prototype.
 *
 * Idempotent — safe to call multiple times (guarded by Symbol marker).
 * Called automatically when this module is imported.
 */
export declare function patchTerminalExecPrototype(): void;
export { installTerminalRun } from './terminal-run.js';
export type { TerminalExecOptions, TerminalExecResult } from './terminal-run.js';
