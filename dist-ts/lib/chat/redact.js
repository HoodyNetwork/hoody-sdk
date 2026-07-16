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
// Common secret-shape patterns, kept in sync with the Hoody chat service.
export const SECRET_PATTERNS = Object.freeze([
    // Real Hoody token shape is hdy_<24hex>_<48hex> — the `_` separator (and JWT
    // base64url `-`) are NOT in [a-zA-Z0-9], so the old class stopped at the first
    // underscore and left the high-entropy second half in the clear. Match the full value.
    /hdy_[A-Za-z0-9_-]{20,}/,
    /sk-[a-zA-Z0-9_\-]{20,}/,
    /Bearer\s+[a-zA-Z0-9._\-]{20,}/i,
    /eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{10,}/,
    /[0-9a-fA-F]{65,}/,
    /ghp_[a-zA-Z0-9]{30,}/,
    /gho_[a-zA-Z0-9]{30,}/,
    /github_pat_[a-zA-Z0-9_]{20,}/,
    /glpat-[a-zA-Z0-9\-_]{20,}/,
    /AKIA[A-Z0-9]{16}/,
    // AWS STS temporary session credentials (sts:AssumeRole, EC2 instance roles,
    // Lambda execution roles). Structurally identical suffix to AKIA; different prefix.
    /ASIA[A-Z0-9]{16}/,
    /xox[bpras]-[a-zA-Z0-9\-]{20,}/,
]);
/**
 * Sensitive flag names — value following any of these is redacted.
 * MUST match the shared argv sanitizer's sensitive set verbatim so the two
 * code paths agree on which flag values to redact. Parity is locked by
 * a dedicated unit test.
 */
export const SENSITIVE_FLAGS = new Set([
    // Authentication — user-facing CLI flags the chat surface can observe.
    '--token', '-t', '--password', '-p', '--username', '-u',
    // The generated CLI reference carries these credential flags in its
    // instruction corpus; without redaction, raw values persist in on-disk
    // session logs.
    '--api-key', '--api-secret', '--private-key', '--secret-access-key',
    '--access-key', '--access-key-id', '--session-token',
    '--bearer', '--bearer-token', '--auth-token', '--auth', '--authorization',
    '--refresh-token', '--client-secret', '--client-id',
    '--kit-token', '--kit-token-header', '--kit-password', '--kit-pass',
    '--passphrase', '--pass',
    '--webhook', '--webhook-url',
    // Terminal / tunnel flags that carry inline credentials.
    '--ssh-password', '--ssh-pass', '--ssh-key', '--ssh-keyfile',
    '--socks5-pass', '--socks5-password',
    '--proxy-password', '--proxy-pass', '--proxy-auth',
    '--auth-password', '--auth-pass',
    '--cur-password', '--cur-pass',
    '--db-password', '--db-pass',
    '--local-password',
]);
// Matches the shared argv sanitizer literal for consistency across both redaction paths.
export const REDACTED = '<REDACTED>';
/**
 * Apply SECRET_PATTERNS to a string. Each pattern is applied globally
 * (regardless of original flags) so every match in the input is replaced.
 */
export function redactSecrets(text) {
    if (!text)
        return text;
    let out = text;
    for (const p of SECRET_PATTERNS) {
        const flags = p.flags.includes('g') ? p.flags : p.flags + 'g';
        out = out.replace(new RegExp(p.source, flags), REDACTED);
    }
    return out;
}
/**
 * Redact values that follow sensitive CLI flags. Input is an argv-like array
 * (e.g., from process.argv); returns a new array with the value immediately
 * after any sensitive flag replaced. Matches the shared argv sanitizer semantics.
 *
 * Handles both forms:
 *   - Space-separated:  `--token VALUE`   → VALUE replaced with <REDACTED>
 *   - Equals-joined:    `--token=VALUE`   → whole arg replaced with `--token=<REDACTED>`
 */
export function redactArgv(argv) {
    return argv.map((arg, i) => {
        if (i > 0 && SENSITIVE_FLAGS.has(argv[i - 1]))
            return REDACTED;
        const eq = arg.indexOf('=');
        if (eq > 0 && SENSITIVE_FLAGS.has(arg.slice(0, eq))) {
            return `${arg.slice(0, eq)}=${REDACTED}`;
        }
        return arg;
    });
}
/**
 * Redact content that is about to be written to disk. Runs BOTH the
 * sanitizeArgv-style pass (matches `--flag value` pairs inside prose) and
 * the SECRET_PATTERNS pass.
 */
export function redactForDisk(text) {
    if (!text)
        return text;
    // First, tokenize on whitespace and redact any bare value that FOLLOWS
    // a sensitive flag token. This catches `--token abcdef` in quoted prose.
    // Also catches `--token=abcdef` equals-form within a single token.
    const tokens = text.split(/(\s+)/);
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const trimmed = t.trim();
        if (SENSITIVE_FLAGS.has(trimmed)) {
            // Emit the flag itself, then skip ahead until we've consumed one value.
            out.push(t);
            // Next non-whitespace token is the value — replace with <REDACTED>.
            let j = i + 1;
            while (j < tokens.length && /^\s+$/.test(tokens[j])) {
                out.push(tokens[j]);
                j++;
            }
            if (j < tokens.length) {
                out.push(REDACTED);
                i = j; // consumed
            }
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq > 0 && SENSITIVE_FLAGS.has(trimmed.slice(0, eq))) {
            // Equals-form: preserve surrounding whitespace, redact the value side only.
            const lead = t.slice(0, t.indexOf(trimmed));
            const trail = t.slice(lead.length + trimmed.length);
            out.push(`${lead}${trimmed.slice(0, eq)}=${REDACTED}${trail}`);
            continue;
        }
        out.push(t);
    }
    // Then apply SECRET_PATTERNS to the whole joined string.
    return redactSecrets(out.join(''));
}
