/**
 * Terminal exec/shell — high-level wrappers for remote command execution.
 *
 * Architecture:
 *   This module extends HoodyClient with two convenience methods:
 *
 *   - `execute(command, options?)` — run a command and wait for the result
 *     (like child_process.exec). Uses the HTTP execute+poll path via
 *     TerminalExecutionService.
 *
 *   Named `execute` (not `exec`) to avoid collision with the generated
 *   `exec` property which holds the Hoody Exec kit service namespace.
 *
 *   - `shell(options?)` — open an interactive PTY session (like opening
 *     a remote terminal). Uses WebSocket duplex stream via TerminalClient.
 *
 *   Both methods require a container-scoped client (via `withContainer()`).
 *   They are attached to HoodyClient.prototype via module augmentation
 *   and runtime prototype patching, following the same pattern as
 *   exec-scripts.ts.
 */
import { Duplex } from 'stream';
export interface TerminalExecOptions {
    /** Working directory for command execution */
    cwd?: string;
    /** Shell to use (bash, zsh, fish, sh) */
    shell?: string;
    /** System user to run as */
    user?: string;
    /** Timeout in seconds (default: 0 = no timeout) */
    timeout?: number;
    /** Environment variables */
    env?: Record<string, string>;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Polling interval in ms (default: 250, min: 100) */
    pollIntervalMs?: number;
    /** Terminal service instance index (default: 0 — ephemeral PTY uses terminal-0) */
    serviceIndex?: number;
}
export interface TerminalExecResult {
    /** Standard output */
    stdout: string;
    /** Standard error */
    stderr: string;
    /** Process exit code (null if unknown) */
    exitCode: number | null;
    /** Whether the command timed out */
    timedOut: boolean;
    /** Execution duration in milliseconds
     */
    duration: number;
    /** Server-assigned command ID */
    commandId: string;
}
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
    /** Terminal service instance index (default: 0 — ephemeral fresh PTY) */
    serviceIndex?: number;
    /** Connection timeout in ms (default: 30000) */
    timeout?: number;
    /** Auto-reconnect on disconnect (default: false) */
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
    /** Resolves when the WebSocket connection is established */
    readonly ready: Promise<void>;
    /** Whether the underlying WebSocket is connected */
    readonly connected: boolean;
    /** Server-assigned terminal session ID */
    readonly terminalId: string;
    /** Resize the PTY */
    resize(cols: number, rows: number): void;
    /**
     * Send a signal to the running process.
     * - SIGINT: sends Ctrl+C (\x03) to the PTY
     * - Any other signal: disconnects the WebSocket (server kills the process)
     */
    kill(signal?: string): void;
    /** Disconnect and clean up */
    destroy(error?: Error): this;
}
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Execute a command in the container and wait for the result.
         *
         * Requires a container-scoped client (call `withContainer()` first).
         *
         * @example
         * ```ts
         * const scoped = await client.withContainer(container);
         * const { stdout, exitCode } = await scoped.execute('ls -la');
         * ```
         */
        execute(command: string, options?: TerminalExecOptions): Promise<TerminalExecResult>;
        /**
         * Open an interactive PTY shell session to the container.
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
 * Attach `execute()` and `shell()` to HoodyClient.prototype.
 *
 * Idempotent — safe to call multiple times (guarded by Symbol marker).
 * Called automatically when this module is imported.
 */
export declare function patchTerminalExecPrototype(): void;
