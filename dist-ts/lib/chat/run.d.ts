/**
 * runChat — top-level dispatcher for `hoody chat` invocations. Handles the
 * one-shot path; delegates to ./repl.ts when no prompt is supplied.
 *
 * Initialization order is LOAD-BEARING:
 *   1. prepareChatsDir() — idempotent, runs before any disk write.
 *   2. resolveProvider('chat') — fail fast with exit(2) on no-config.
 *      MUST happen before any network call; prevents a missing-key path
 *      from making an unintended network request.
 *   3. Build the system prompt with selective reference injection.
 *   4. Wrap --context as <user-context untrusted="true">.
 *   5. Stream the completion to stdout via the markdown renderer.
 */
import { escapeXmlLike } from './trigger-parse.js';
export { escapeXmlLike };
export interface RunChatOptions {
    promptParts: string[];
    opts: {
        model?: string;
        stream?: boolean;
        markdown?: boolean;
        persist?: boolean;
        new?: boolean;
        resume?: string | boolean;
        private?: boolean;
        tools?: boolean;
        context?: string;
        acceptEndpoint?: string;
        maxTokens?: number;
        temperature?: number;
    };
}
/**
 * One-shot entry point. With no prompt argument, falls through to the REPL.
 */
export declare function runChat(args: RunChatOptions): Promise<void>;
