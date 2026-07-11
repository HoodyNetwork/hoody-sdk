/**
 * system-prompt.ts — composes the immutable system prompt from:
 *   1. security header (fixed)
 *   2. core instructions (mirrors system-prompt.txt verbatim)
 *   3. product blurb (checked-in)
 *
 * The system prompt is IMMUTABLE once constructed; per-turn retrieval is
 * appended to the USER message (not system) so the guardrail stays stable
 * across a REPL session.
 */
export interface BuildSystemPromptOptions {
    /** User's message (first-turn) used for selective retrieval. */
    userMessage: string;
    /** Total prompt token budget. Default 4000. Treated as the SYSTEM-prompt
     *  cap; response tokens and history are accounted for separately by the
     *  caller (run.ts plumbs history budget in later phases). */
    contextTokens?: number;
}
export interface BuildSystemPromptResult {
    /** Assembled system prompt: SECURITY_HEADER + CORE_INSTRUCTIONS + BLURB. */
    systemPrompt: string;
    /** Per-turn retrieval block (group index + packed commands). Caller wraps
     *  this as `<retrieved-context>…</retrieved-context>` inside the USER
     *  message — NOT injected into the system role. Keeps the guardrail
     *  immutable across REPL turns. */
    retrievalText: string;
    selectedCommandPaths: string[];
}
/**
 * Build the system prompt (stable across turns) and the per-turn retrieval
 * block (freshly computed for the current user message) separately.
 *
 * Measured sizes at default config:
 *   SECURITY_HEADER ~100 tokens
 *   CORE_INSTRUCTIONS ~700 tokens (mirrors system-prompt.txt)
 *   PRODUCT_BLURB ~400 tokens
 *   → ~1200 tokens of fixed system content.
 *
 * The retrieval block is sized separately against `contextTokens`. With the
 * default 4000-token budget, retrieval gets up to ~2600 tokens after a
 * conservative response reserve is backed out by the caller.
 */
export declare function buildSystemPrompt(opts: BuildSystemPromptOptions): BuildSystemPromptResult;
/** Exposed for unit tests. */
export declare const _internals: {
    SECURITY_HEADER: string;
    CORE_INSTRUCTIONS: string;
};
