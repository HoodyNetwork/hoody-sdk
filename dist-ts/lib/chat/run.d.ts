/**
 * runChat — top-level dispatcher for `hoody chat` invocations. Handles the
 * one-shot path; delegates to ./repl.ts when no prompt is supplied.
 *
 * `hoody chat` asks Hoody's documentation assistant. There is no local model
 * and no API key: the question goes to the service, the service answers, and
 * this module renders the answer. That is the whole data flow.
 */
export interface RunChatOptions {
    promptParts: string[];
    opts: {
        stream?: boolean;
        markdown?: boolean;
        persist?: boolean;
        new?: boolean;
        resume?: string | boolean;
        private?: boolean;
        acceptEndpoint?: string;
    };
    /**
     * The API base URL the caller resolved for this invocation. The CLI passes the one its global
     * options select (`--base-url`, `--profile`, `--config`, then the environment and the saved
     * config), so the question goes to the assistant of the platform the command addresses. Left
     * out (a program using this module directly), the environment and the saved config decide.
     */
    apiBaseUrl?: string;
}
/**
 * One-shot entry point. With no prompt argument, falls through to the REPL.
 */
export declare function runChat(args: RunChatOptions): Promise<void>;
