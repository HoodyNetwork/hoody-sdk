/**
 * `terminal.run(command, options?)`: run a command in the container and wait for the result.
 *
 * Kept apart from terminal-exec.ts on purpose: this file is plain HTTP run+poll and uses no Node
 * builtin, so the browser bundle ships it as is. terminal-exec.ts (the `shell()` PTY stream) needs
 * `stream` and the Node TerminalClient, and the browser build stubs it.
 */
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
/**
 * Validate that the client is container-scoped (has terminal urlTemplates).
 */
export declare function assertContainerScoped(client: any): void;
/**
 * Install `client.terminal.run` on this client's terminal namespace object. The object is
 * per instance (withContainer and withRealm build their own), so this runs for each client
 * from patchHoodyClientMetrics. Idempotent.
 */
export declare function installTerminalRun(client: object): void;
