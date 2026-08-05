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
import { RollingRateLimiter } from './service-client.js';
export declare let docsLimiter: RollingRateLimiter;
/** Test-only: rebuild the singleton so HOODY_CHAT_RATE_LIMIT changes take effect. */
export declare function _resetDocsSingletonsForTests(): void;
