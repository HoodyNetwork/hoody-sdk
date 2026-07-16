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
 * user typed.
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
 * Apply SECRET_PATTERNS to a string. Each pattern is applied globally
 * (regardless of original flags) so every match in the input is replaced.
 */
export declare function redactSecrets(text: string): string;
/**
 * Redact values that follow sensitive CLI flags. Input is an argv-like array
 * (e.g., from process.argv); returns a new array with the value immediately
 * after any sensitive flag replaced. Matches the shared argv sanitizer semantics.
 *
 * Handles both forms:
 *   - Space-separated:  `--token VALUE`   → VALUE replaced with <REDACTED>
 *   - Equals-joined:    `--token=VALUE`   → whole arg replaced with `--token=<REDACTED>`
 */
export declare function redactArgv(argv: readonly string[]): string[];
/**
 * Redact content that is about to be written to disk. Runs BOTH the
 * sanitizeArgv-style pass (matches `--flag value` pairs inside prose) and
 * the SECRET_PATTERNS pass.
 */
export declare function redactForDisk(text: string): string;
