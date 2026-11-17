/**
 * redact — secret pattern detection for on-disk writes.
 *
 * SECRET_PATTERNS detects common secret shapes (API keys, tokens, private
 * keys, connection strings) and redacts them before any on-disk write, so the
 * local redaction matches the Hoody chat service's own detection.
 *
 * Plus a sanitizeArgv-style pass that replaces values following sensitive
 * CLI flags (`--token`, `--password`, `--username`, …) with `<REDACTED>`.
 *
 * Applied to:
 *   - Session JSONL turn content AND meta-line title (derived from first
 *     user message).
 *   - REPL readline history file.
 *   - HOODY_CHAT_DEBUG=1 stderr output.
 *
 * Known residuals: base64-wrapped secrets, secrets split across multiple
 * turns, novel token shapes not in the pattern set, non-ASCII tokens.
 * In-memory API history keeps raw text so the LLM still sees what the
 * user typed, except Bot URL key secrets: service-client.ts removes those
 * from the question and history before they are sent, and the renderer
 * removes them from answers (redactBotKeys).
 */
export declare const SECRET_PATTERNS: readonly RegExp[];
/**
 * Sensitive flag names — value following any of these is redacted.
 * MUST match the shared argv sanitizer's sensitive set verbatim so the two
 * code paths agree on which flag values to redact. Parity is locked by
 * a dedicated unit test.
 */
export declare const SENSITIVE_FLAGS: ReadonlySet<string>;
export declare const REDACTED = "<REDACTED>";
/**
 * Whether the value of `flag` (the name only, no `=value`) is a secret: the flag is in `names` as
 * typed or in its kebab-case spelling, or it is a long flag whose last word names a credential.
 * A `--no-…` negation never takes a value.
 */
export declare function isSensitiveFlag(flag: string, names?: ReadonlySet<string>): boolean;
/**
 * The secrets a single token can carry whatever flag it follows: URL credentials, keyed values
 * (`API_KEY=x`, `{"password":"x"}`) and the SECRET_PATTERNS shapes. A token that is a JSON object
 * or array is parsed, so a value with escaped quotes goes whole; it comes back re-serialised when
 * something in it was redacted, and byte-unchanged otherwise.
 */
export declare function redactValueShapes(token: string): string;
export interface RedactArgvOptions {
    /**
     * After `set <key>` where the key names a credential (`config set token X`, `confg set kitToken X`),
     * which positionals are the value: every later one (`rest`, a command line: options may sit
     * between) or the next one only (`one`, prose).
     */
    setValue?: 'rest' | 'one';
    /**
     * Which `set` starts that rule: any (`any`, a command line, where a mistyped group still counts)
     * or only one right after `config` (`config`, prose: "how do I set key bindings" is not a command).
     */
    setAfter?: 'any' | 'config';
}
/**
 * Redact an argv-like array (one command line, no `--` payload handling): the value after a
 * sensitive flag (`--token V`, `--kitToken V`, `-vt V`), the value inside one (`--token=V`,
 * `-tV`, `-vtV`), the value of `set <credential key>` (`config set token V`), and the shapes
 * {@link redactValueShapes} knows in every other token. Short flags in `names` (`-t`, `-p`, `-u`)
 * are matched inside a cluster too: Commander reads `-vtS` as `-v -t S`.
 */
export declare function redactArgvTokens(argv: readonly string[], names?: ReadonlySet<string>, options?: RedactArgvOptions): string[];
/**
 * Apply SECRET_PATTERNS to a string. Every match of every pattern (regardless
 * of original flags) is found in the original text and the matches are
 * replaced together: applied one after another, an earlier pattern could cut a
 * later match apart (an AWS key id inside a Bot key's body left the key's last
 * characters in the clear). Overlapping matches merge into one placeholder; a
 * merged run that starts with a match's group 1 (a Bot key prefix) keeps it.
 */
export declare function redactSecrets(text: string): string;
/** Replace Bot URL key secrets only, keeping the 12-character prefix. */
export declare function redactBotKeys(text: string): string;
/**
 * Redact values that follow sensitive CLI flags. Input is an argv-like array
 * (e.g., from process.argv); returns a new array with the value immediately
 * after any sensitive flag replaced. Matches the shared argv sanitizer semantics.
 *
 * Handles both forms:
 *   - Space-separated:  `--token VALUE`   → VALUE replaced with <REDACTED>
 *   - Equals-joined:    `--token=VALUE`   → whole arg replaced with `--token=<REDACTED>`
 * plus spelling variants, short clusters and value shapes (redactArgvTokens).
 */
export declare function redactArgv(argv: readonly string[]): string[];
/**
 * Redact content that is about to be written to disk: the SECRET_PATTERNS pass over the whole text
 * first (its `Bearer <token>` pattern spans two words), then the command-line pass of
 * {@link redactArgvTokens} over the words (a flag's value, a short cluster, `config set <credential
 * key>` and the value shapes), with the text's own whitespace kept, then SECRET_PATTERNS again.
 */
export declare function redactForDisk(text: string): string;
