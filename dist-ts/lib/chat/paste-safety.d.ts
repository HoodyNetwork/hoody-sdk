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
export type PasteSeverity = 'danger' | 'review' | 'none';
/** Language tags that trigger scanning. Case-insensitive. */
export declare const SHELL_LANG_TAGS: Set<string>;
/**
 * DANGER tier: patterns that almost certainly cause data loss / account
 * compromise / RCE when pasted without review. Tuned to minimize false
 * positives on common loopback/dev workflows — e.g. `mkfs` requires `/dev/`
 * so `mkfs.ext4 /tmp/loop.img` does NOT trigger.
 */
export declare const DANGER_PATTERNS: readonly RegExp[];
/**
 * REVIEW tier: patterns that are SUSPICIOUS but have legitimate uses. We add
 * a "⚠ REVIEW" header and yellow gutter but don't call them destructive.
 */
export declare const REVIEW_PATTERNS: readonly RegExp[];
/**
 * Per-line scan cap. Lines longer than this are truncated before the DANGER/
 * REVIEW patterns run, so a multi-megabyte model-emitted code fence can't
 * burn seconds in a single regex call. Matches `--max-tokens 128000` times
 * a reasonable chars-per-token, so real output is never clipped.
 */
declare const MAX_SCAN_LINE_CHARS = 4096;
/**
 * Parse HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS into additional DANGER patterns.
 * Colon-separated regex source strings. Silently drops invalid entries with a
 * one-line stderr warning (so a malformed env var doesn't crash chat).
 *
 * Pattern-length cap + catastrophic-pattern heuristic reject catastrophic
 * ReDoS cases before the scanner ever runs them. Combined with the per-line
 * char cap in classifyShellBlock, this bounds worst-case scan cost.
 */
export declare function parseExtraPatterns(envValue: string | undefined): RegExp[];
export { MAX_SCAN_LINE_CHARS };
export interface ClassifyOptions {
    /** Language tag from the fence (e.g. "bash", "shell", ""). Case-insensitive. */
    lang: string;
    /** Body of the fenced block (no backticks). Scanned line-by-line. */
    body: string;
    /** Extra DANGER patterns to add on top of the built-in set. */
    extraDanger?: RegExp[];
}
export interface ClassificationResult {
    severity: PasteSeverity;
    /** True if the block is a shell-tagged fence (triggers gutter+footer). */
    isShellFence: boolean;
    /** Line numbers (0-indexed) that matched DANGER, for per-line highlighting. */
    dangerLines: number[];
    /** Line numbers (0-indexed) that matched REVIEW. */
    reviewLines: number[];
}
/**
 * Classify a fenced block. Returns 'none' for non-shell fences OR for shell
 * fences with no pattern match (still isShellFence=true → renderer adds the
 * review gutter+footer anyway).
 */
export declare function classifyShellBlock(opts: ClassifyOptions): ClassificationResult;
