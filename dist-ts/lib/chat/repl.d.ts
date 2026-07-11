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
 *   - MAX_TOOL_CALLS_PER_TURN=1 still enforced via dispatchTurn.
 *   - `/private` toggles disk-write + disk-read disable for rest of REPL.
 *   - `/tool on|off` mutates tool-enabled state for subsequent turns.
 */
import type { ProviderConfig } from '../ai/provider-resolve.js';
export interface ReplOptions {
    provider: ProviderConfig;
    model: string;
    maxTokens: number;
    temperature: number;
    initialToolsEnabled: boolean;
    initialPrivate: boolean;
    persist: boolean;
    resume: string | boolean | undefined;
    acceptEndpointFlag: string | undefined;
    acceptEndpointEnv: string | undefined;
    contextPreface: string | undefined;
    /** For tests. */
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    /** For tests: feed the SIGINT signal via this controller. */
    sigintSignal?: AbortSignal;
}
export declare function runRepl(opts: ReplOptions): Promise<void>;
