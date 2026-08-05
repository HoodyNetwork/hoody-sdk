/**
 * Process-wide singleton for the chat service's client-side rate limiter.
 *
 * BOTH `runChat` (one-shot) AND `runRepl` (REPL) must consult the SAME bucket,
 * otherwise a programmatic SDK consumer that calls `runRepl()` several times in
 * one process gets a fresh budget each call, bypassing the per-process cap.
 *
 * Exposed as a module-scoped singleton so `import { docsLimiter } from ...`
 * returns the same instance every time (ESM module-cache guarantee).
 *
 * `HOODY_CHAT_RATE_LIMIT` is read ONCE at module load. Tests that need to
 * override it import `_resetDocsSingletonsForTests()`.
 */
import { RollingRateLimiter, DEFAULT_CLIENT_RATE_LIMIT } from './service-client.js';
function buildLimiter() {
    return new RollingRateLimiter(Number(process.env.HOODY_CHAT_RATE_LIMIT) || DEFAULT_CLIENT_RATE_LIMIT);
}
export let docsLimiter = buildLimiter();
/** Test-only: rebuild the singleton so HOODY_CHAT_RATE_LIMIT changes take effect. */
export function _resetDocsSingletonsForTests() {
    docsLimiter = buildLimiter();
}
