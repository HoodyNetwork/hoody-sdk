/**
 * paste-safety — severity-tiered destructive-command detection for rendered
 * shell fences.
 *
 * Scope: fenced code blocks whose language tag is shell-like (bash, sh, zsh,
 * fish, shell, console, terminal). Plain prose and non-shell fences are NOT
 * scanned.
 *
 * Contract:
 *   - Best-effort WARNING layer, not a safety boundary.
 *   - Every shell fence always gets the "Review before pasting" gutter/footer
 *     regardless of pattern match — the severity tiers only add extra headers.
 *
 * The renderer consumes classifyShellBlock() to pick gutter color and header
 * text. Users can append org-policy patterns via HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS
 * (colon-separated list of regex source strings; flags are forced to 'i').
 */
/** Language tags that trigger scanning. Case-insensitive. */
export const SHELL_LANG_TAGS = new Set([
    'bash', 'sh', 'zsh', 'fish', 'shell', 'console', 'terminal',
]);
/**
 * DANGER tier: patterns that almost certainly cause data loss / account
 * compromise / RCE when pasted without review. Tuned to minimize false
 * positives on common loopback/dev workflows — e.g. `mkfs` requires `/dev/`
 * so `mkfs.ext4 /tmp/loop.img` does NOT trigger.
 */
export const DANGER_PATTERNS = Object.freeze([
    // rm -rf / or rm -rf ~
    /\brm\s+-rf?\s+[\/~](\s|$)/,
    // curl|bash, wget|sh, etc. — piping network output into a shell interpreter.
    /\bcurl\b[^\n|]*\|\s*(sh|bash|zsh|fish)\b/,
    /\bwget\b[^\n|]*\|\s*(sh|bash|zsh|fish)\b/,
    // dd if=/anything of=/dev/sdX — raw disk overwrite
    /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|xvd)/,
    // Redirect to raw block device
    />\s*\/dev\/(sd|nvme|hd|xvd)/,
    // mkfs.<fs> on a /dev/ target
    /\bmkfs\.[a-z0-9]+\s+\/dev\//i,
    // chmod -R 0777 /  (world-writable on bare root — not /tmp/foo, which is noisy but bounded)
    /\bchmod\s+-R\s+0?777\s+\/(\s|$)/,
    // sudo rm -rf / sudo dd / sudo mkfs
    /\bsudo\s+(rm\s+-rf?|dd|mkfs)\b/,
    // Overwrite authorized_keys — persistent-access backdoor
    /\becho\s+[^|]*>\s*~?\/\.ssh\/authorized_keys/,
]);
/**
 * REVIEW tier: patterns that are SUSPICIOUS but have legitimate uses. We add
 * a "⚠ REVIEW" header and yellow gutter but don't call them destructive.
 */
export const REVIEW_PATTERNS = Object.freeze([
    // find / -delete — unusual outside of specific cleanup scripts
    /\bfind\s+\/\s.*-delete/,
    // tee into authorized_keys — ssh persistence
    /\btee\s+-?a?\s+~?\/\.ssh\//,
    // bash -c "$(curl ...)" — one-liner install pattern, not always destructive
    /\bbash\s+-c\s+"?\$\(\s*curl/,
    // source <(curl ...) — same pattern, different shell construct
    /\bsource\s+<\(\s*curl/,
    // truncate ~/.bashrc via `:  > ~/.bashrc`
    /:\s*>\s*~?\/\.bashrc/,
]);
/**
 * Hard cap on env-supplied pattern source length. 256 chars is comfortably
 * more than any legitimate shell-match pattern, and short enough that even a
 * worst-case-quadratic match against MAX_SCAN_LINE_CHARS stays well under
 * a millisecond.
 */
const MAX_EXTRA_PATTERN_SOURCE_CHARS = 256;
/**
 * Per-line scan cap. Lines longer than this are truncated before the DANGER/
 * REVIEW patterns run, so a multi-megabyte model-emitted code fence can't
 * burn seconds in a single regex call. Matches `--max-tokens 128000` times
 * a reasonable chars-per-token, so real output is never clipped.
 */
const MAX_SCAN_LINE_CHARS = 4096;
/**
 * Heuristic reject for patterns that LOOK catastrophic. Not a perfect
 * ReDoS detector (no proven-safe regex taxonomy exists in 100 lines of JS),
 * but it catches the common footguns: nested unbounded quantifiers and
 * nested groups with quantifiers, which cover the `(a+)+`, `(a*)*`,
 * `(a|aa)+`, `(a|b)+$` class of patterns. Safe patterns from the built-in
 * set (DANGER_PATTERNS above) pass this check.
 */
function looksCatastrophic(src) {
    // Nested-quantifier form: `(…<quantifier>…)<quantifier>` — e.g. `(a+)+`.
    // We look for a quantifier (`*`, `+`, `{n,}`) inside parens followed by
    // another quantifier immediately after the closing paren.
    if (/\([^()]*[+*][^()]*\)[+*{]/.test(src))
        return true;
    if (/\([^()]*\{\d*,?\}[^()]*\)[+*{]/.test(src))
        return true;
    // Quantified alternation: `(a|aa)+` — overlapping branches cause
    // exponential backtracking (NFA ambiguity on matching suffix).
    if (/\([^()]*\|[^()]*\)[+*{]/.test(src))
        return true;
    return false;
}
/**
 * Parse HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS into additional DANGER patterns.
 * Colon-separated regex source strings. Silently drops invalid entries with a
 * one-line stderr warning (so a malformed env var doesn't crash chat).
 *
 * Pattern-length cap + catastrophic-pattern heuristic reject catastrophic
 * ReDoS cases before the scanner ever runs them. Combined with the per-line
 * char cap in classifyShellBlock, this bounds worst-case scan cost.
 */
export function parseExtraPatterns(envValue) {
    if (!envValue)
        return [];
    const out = [];
    for (const raw of envValue.split(':')) {
        const trimmed = raw.trim();
        if (!trimmed)
            continue;
        if (trimmed.length > MAX_EXTRA_PATTERN_SOURCE_CHARS) {
            process.stderr.write(`[hoody chat] Skipping pattern in HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS: exceeds ${MAX_EXTRA_PATTERN_SOURCE_CHARS} chars.\n`);
            continue;
        }
        if (looksCatastrophic(trimmed)) {
            process.stderr.write(`[hoody chat] Skipping pattern in HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS (nested quantifier / ReDoS risk): ${trimmed}\n`);
            continue;
        }
        try {
            out.push(new RegExp(trimmed, 'i'));
        }
        catch (e) {
            process.stderr.write(`[hoody chat] Invalid regex in HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS: ${trimmed} (${e.message})\n`);
        }
    }
    return out;
}
export { MAX_SCAN_LINE_CHARS };
/**
 * Classify a fenced block. Returns 'none' for non-shell fences OR for shell
 * fences with no pattern match (still isShellFence=true → renderer adds the
 * review gutter+footer anyway).
 */
export function classifyShellBlock(opts) {
    const isShell = SHELL_LANG_TAGS.has(opts.lang.toLowerCase());
    if (!isShell) {
        return { severity: 'none', isShellFence: false, dangerLines: [], reviewLines: [] };
    }
    const dangerPatterns = opts.extraDanger
        ? [...DANGER_PATTERNS, ...opts.extraDanger]
        : DANGER_PATTERNS;
    const lines = opts.body.split('\n');
    const dangerLines = [];
    const reviewLines = [];
    for (let i = 0; i < lines.length; i++) {
        // Cap scan input so a single multi-megabyte line can't turn pattern
        // evaluation into seconds of CPU. Truncation is fine — destructive
        // patterns almost always appear at the start of a command.
        const rawLine = lines[i];
        const line = rawLine.length > MAX_SCAN_LINE_CHARS
            ? rawLine.slice(0, MAX_SCAN_LINE_CHARS)
            : rawLine;
        if (dangerPatterns.some(p => p.test(line))) {
            dangerLines.push(i);
            continue;
        }
        if (REVIEW_PATTERNS.some(p => p.test(line))) {
            reviewLines.push(i);
        }
    }
    const severity = dangerLines.length > 0 ? 'danger' : reviewLines.length > 0 ? 'review' : 'none';
    return { severity, isShellFence: true, dangerLines, reviewLines };
}
