/**
 * `terminal.run(command, options?)`: run a command in the computer and wait for the result.
 *
 * Kept apart from terminal-exec.ts on purpose: this file is plain HTTP run+poll and uses no Node
 * builtin, so the browser bundle ships it as is. terminal-exec.ts (the `shell()` PTY stream) needs
 * `stream` and the Node TerminalClient, and the browser build stubs it.
 */
export interface TerminalExecOptions {
    /** Working directory for command execution */
    cwd?: string;
    /** Shell to use (bash, zsh, fish, sh). 'tmux' is refused: run tmux itself as the command. */
    shell?: string;
    /** System user to run as */
    user?: string;
    /**
     * Timeout in seconds. 0 or omitted: the kit's default, 600 seconds for the default run (and
     * on an ephemeral terminal), none in a named terminal (terminalId N).
     */
    timeout?: number;
    /** Environment variables */
    env?: Record<string, string>;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Polling interval in ms (default: 250, min: 100). Only a named terminal (terminalId N) is polled. */
    pollIntervalMs?: number;
    /**
     * The terminal to run in. 0 (the default) runs the command as a process of its own on the
     * terminal-0 host, with no terminal: stdout and stderr come back apart and byte for byte.
     * N >= 1 runs it in terminal N itself (created when it does not exist yet), as a plain
     * execute: its display and environment stay, and the output is terminal text (stderr merged
     * into stdout, CRLF line endings, escape sequences removed, leading and trailing whitespace
     * trimmed).
     *
     * `serviceIndex` and `terminal_id` are retired spellings and are refused: pass the same
     * number as `terminalId` (a caller that passed `serviceIndex: 0` omits it).
     */
    terminalId?: number;
}
export interface TerminalExecResult {
    /** Standard output, as UTF-8 text (the exact bytes are in stdoutBytes) */
    stdout: string;
    /** Standard error, as UTF-8 text (always empty in a named terminal, which merges it into stdout) */
    stderr: string;
    /**
     * The exact bytes the command wrote to stdout and stderr (binary data, bare LF, escape
     * sequences). Present for the default run; absent for a named terminal (terminalId N),
     * whose output is terminal text.
     */
    stdoutBytes?: Uint8Array;
    stderrBytes?: Uint8Array;
    /**
     * The output was cut at the kit's capture limit. run() then rejects (code OUTPUT_TRUNCATED)
     * and this result, incomplete, is the error's `result`; a resolved run is never cut.
     */
    stdoutTruncated?: boolean;
    stderrTruncated?: boolean;
    /** The signal that ended the command (SIGKILL, ...); null when it exited by itself. Default run only. */
    signal?: string | null;
    /** Process exit code (null if unknown, or when a signal ended the command) */
    exitCode: number | null;
    /** Whether the command timed out */
    timedOut: boolean;
    /** Execution duration in milliseconds
     */
    duration: number;
    /** Server-assigned command ID */
    commandId: string;
}
/**
 * Validate that the client is computer-scoped (has terminal urlTemplates).
 */
export declare function assertComputerScoped(client: any): void;
/** POSIX single-quote an argument for `sh -c` (every character literal but `'`); a plain word stays as it is. */
export declare function shellQuote(arg: string): string;
/**
 * Install `client.terminal.run` on this client's terminal namespace object. The object is
 * per instance (withComputer and withRealm build their own), so this runs for each client
 * from patchHoodyClientMetrics. Idempotent.
 */
export declare function installTerminalRun(client: object): void;
