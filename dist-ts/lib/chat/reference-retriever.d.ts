/**
 * reference-retriever — lexical keyword match against the compacted CLI
 * reference, for injection into the system prompt.
 *
 * Strategy (NOT semantic retrieval — documented as lexical heuristic):
 *   1. Tokenize the user message: lowercase, split on non-word, drop
 *      stopwords, drop ≤1-char tokens.
 *   2. For every (group, command) pair, compute a score:
 *        + 3 if a user token matches the group name or any group alias exactly.
 *        + 2 per substring match of the command path against a user token.
 *        + 1 per keyword match in the command summary.
 *   3. Sort commands by score desc, pack into the token budget.
 *   4. ALWAYS prefix with the full group one-line index regardless of
 *      score, so the model never misses an entire group just because
 *      scoring surfaced the wrong keyword.
 *
 * Token estimation is a chars/4 heuristic — documented worst-case 1.8× inflation
 * for CJK/emoji-heavy messages. We rely on the provider's max_tokens cap and
 * the 60s stream timeout to bound cost, not on precise token accounting.
 */
import type { CliReference, RefCommand } from './ai-cli-reference.generated.js';
export interface RetrievalOptions {
    userMessage: string;
    reference: CliReference;
    /** Total budget for the retrieval block in tokens. Index costs a floor. */
    budgetTokens: number;
}
export interface RetrievalResult {
    /** Rendered markdown block to append to the system prompt. */
    text: string;
    /** Rough token count (chars/4). */
    approxTokens: number;
    /** Commands that made it into the packed detail section. */
    selectedCommands: RefCommand[];
}
/**
 * Main entry point.
 */
export declare function retrieveReference(opts: RetrievalOptions): RetrievalResult;
