/**
 * repl — readline-based interactive loop for `hoody chat`.
 *
 * NOT a TUI: no alt-screen, no ncurses, no cursor moves. Plain readline
 * + stdout writes through the existing markdown renderer. Ctrl-C, pipes,
 * SSH, dumb terminals all behave like any normal CLI tool.
 *
 * Invariants:
 *   - One `AbortController` per turn, disposed on done/abort.
 *   - SIGINT state machine: idle → confirm-exit; inflight → abort + return
 *     to idle. Ctrl-D exits cleanly.
 *   - Slash commands never network (dispatched synchronously).
 *   - `/private` turns disk-write + disk-read disable on for the rest of the
 *     REPL, and cannot downgrade process-scoped `--private`.
 */
export interface ReplOptions {
    initialPrivate: boolean;
    persist: boolean;
    resume: string | boolean | undefined;
    acceptEndpointFlag: string | undefined;
    acceptEndpointEnv: string | undefined;
    /** false when --no-markdown was passed. */
    markdown?: boolean;
    /** false when --no-stream was passed: buffer the answer, print it once. */
    stream?: boolean;
    /**
     * The API base URL the caller resolved for this invocation (see RunChatOptions.apiBaseUrl).
     * Left out, the environment and the saved config decide, read on every turn.
     */
    apiBaseUrl?: string;
    /** For tests. */
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    /** For tests: feed the SIGINT signal via this controller. */
    sigintSignal?: AbortSignal;
}
export declare function runRepl(opts: ReplOptions): Promise<void>;
