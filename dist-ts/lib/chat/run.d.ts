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
}
/**
 * One-shot entry point. With no prompt argument, falls through to the REPL.
 */
export declare function runChat(args: RunChatOptions): Promise<void>;
