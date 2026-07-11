/**
 * Process-wide singletons for the docs-search tool.
 *
 * BOTH `runChat` (one-shot) AND `runRepl` (REPL) must consult the SAME
 * rate-limit bucket + trigger-dedupe cache, otherwise:
 *
 * - A programmatic SDK consumer that calls `runRepl()` multiple times in
 *   one process gets a fresh 20-req/hr budget for each call, bypassing
 *   the intended per-process cap.
 * - Mixed `runChat` + `runRepl` usage in one process would double-count
 *   the bucket against itself when the REPL had its own local limiter.
 *
 * Exposed as module-scoped singletons so `import { docsLimiter, triggerDedupe } from ...`
 * returns the same instance every time (ESM module-cache guarantee).
 *
 * The env-var `HOODY_CHAT_DOCS_RATE_LIMIT` is read ONCE at module load.
 * Tests that need to override it import `_resetDocsSingletonsForTests()`.
 */
import { RollingRateLimiter, DEFAULT_CLIENT_RATE_LIMIT } from './docs-search-tool.js';
import { DedupeCache } from './trigger-parse.js';
function buildLimiter() {
    return new RollingRateLimiter(Number(process.env.HOODY_CHAT_DOCS_RATE_LIMIT) || DEFAULT_CLIENT_RATE_LIMIT);
}
export let docsLimiter = buildLimiter();
export let triggerDedupe = new DedupeCache();
/** Test-only: rebuild both singletons so HOODY_CHAT_DOCS_RATE_LIMIT changes take effect. */
export function _resetDocsSingletonsForTests() {
    docsLimiter = buildLimiter();
    triggerDedupe = new DedupeCache();
}
