/**
 * Shared redaction helpers used by every HTTP client surface
 * (browser http-client, CLI http-client, generated Node http-client via the
 * generator template's `_redactHeaders` import).
 *
 * Every redaction call site in the SDK must go through one of these helpers
 * so the secret-key set, the placeholder string, depth limit, and cycle
 * handling stay identical across surfaces. Drift between surfaces causes
 * silent leaks of credentials into error contexts and observability sinks.
 *
 * Matchers are deny-by-pattern (allowlist by structure of the key name)
 * rather than allowlist of safe keys: the secret universe is open-ended
 * (every backend, third-party API, and exec script defines its own
 * credential field names) but the structural patterns are bounded.
 */
export declare function redactHeaders(headers: Record<string, string>): Record<string, string>;
/**
 * Redact secret query params and URL userinfo. Unparseable URLs pass through
 * unchanged so error-attach paths never throw while scrubbing.
 */
export declare function redactUrl(url: string): string;
/**
 * Recursively clone an object/array with any secret key redacted. Protects
 * against circular references and caps recursion depth.
 */
export declare function redactSensitiveValue(v: unknown, _depth?: number, seen?: WeakSet<object>): unknown;
