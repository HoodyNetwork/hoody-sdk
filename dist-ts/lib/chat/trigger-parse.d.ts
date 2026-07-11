/**
 * trigger-parse — detect the user's `@hoody.com` docs-search trigger with
 * robustness against incidental matches.
 *
 * Contract:
 *   - Unicode-safe lookbehind: `@hoody.com` must NOT be part of a word
 *     (rejects `foo@hoody.com` email, `а@hoody.com` Cyrillic homograph).
 *   - Strip fenced/inline/indented code blocks before matching so a pasted
 *     example containing `@hoody.com` does NOT trigger.
 *   - Stripped query must be ≥ 8 chars. Shorter → TTY prompt, non-TTY refuse.
 *   - 60-second intra-process dedupe on identical queries (callers pass a
 *     cache map).
 */
export interface DetectTriggerOptions {
    userMessage: string;
}
export interface DetectTriggerResult {
    /** True if a valid trigger was found after all strippers. */
    hit: boolean;
    /** User message with the @hoody.com token removed; used as the fallback
     *  query if the surrounding text is all that's available. */
    strippedMessage: string;
    /** The proposed query: user message minus the trigger, trimmed. */
    query: string;
}
/**
 * Strip four code forms so `@hoody.com` appearing in quoted examples does
 * NOT trigger the search:
 *   1. Backtick fences (```) — closed or unclosed. Unclosed eats to EOM.
 *   2. Tilde fences (~~~) — same rules. CommonMark alternative delimiter.
 *   3. Inline single-backtick spans.
 *   4. Indented code lines: 4-space OR leading-tab (CommonMark convention).
 */
export declare function stripCodeContexts(s: string): string;
/**
 * Detect whether `@hoody.com` appears in the user's message OUTSIDE of any
 * code context.
 */
export declare function detectTrigger(opts: DetectTriggerOptions): DetectTriggerResult;
export interface DedupeEntry<T> {
    at: number;
    result: T;
}
export declare class DedupeCache<T> {
    private ttlMs;
    private map;
    constructor(ttlMs?: number);
    get(key: string, now?: number): T | undefined;
    set(key: string, result: T, now?: number): void;
    clear(): void;
}
/** Escape `&`, `<`, `>` so a crafted payload cannot break out of wrappers. */
export declare function escapeXmlLike(s: string): string;
