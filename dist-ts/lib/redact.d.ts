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
/**
 * True for a body field or query parameter name that carries a credential:
 * a name in SECRET_FIELD_RE, or one whose last word is a secret noun
 * (`current_password`, `key_file_pass`, `client_credentials`, `confirm_token`,
 * `sse_customer_key`, `otp_code`, `approver_lease`). Names that only mention a
 * secret are not (`has_password`, `token_url`, `max_tokens`, `public_key`,
 * `idempotency_key`, `next_page_token`).
 */
export declare function isSecretFieldName(name: string): boolean;
/**
 * True for a header name in the secret set above. Exported so the browser
 * HttpClient's credential-scope check uses the same set the redactor does.
 */
export declare function isSecretHeaderName(name: string): boolean;
/**
 * `extraNames`: header names configured to carry a credential (the CLI's
 * renamed kit-token header, or the SDK's recorded kitAuth headers, see
 * CREDENTIAL_HEADERS_KEY), which an operator chose and the pattern cannot
 * know. Matched case-insensitively.
 */
export declare function redactHeaders(headers: Record<string, string>, extraNames?: readonly string[]): Record<string, string>;
/**
 * The middlewareContext key under which a request records the names of query
 * parameters that carry a credential (a kitAuth token with `param`, see
 * lib/proxy-auth.ts). The HTTP clients pass these names to `redactUrl` /
 * `redactSensitiveValue` and strip the parameters when a request leaves the
 * credential's origin. Value: `string[]`, deduplicated.
 */
export declare const CREDENTIAL_QUERY_PARAMS_KEY = "_credentialQueryParams";
/**
 * Record that `name` carries a credential in this request's URL. Mutates
 * `middlewareContext` (creating the array if absent, deduplicating) so every
 * holder of the context sees it, and returns the context — a new object when
 * none was given.
 */
export declare function recordCredentialQueryParam(middlewareContext: Record<string, unknown> | undefined, name: string): Record<string, unknown>;
/** The recorded credential parameter names of a middlewareContext (empty when none). */
export declare function credentialQueryParamsOf(middlewareContext: unknown): string[];
/**
 * The middlewareContext key under which a request records the names of the
 * headers that carry a credential (every header the kitAuth middleware sets,
 * including a `header` name the operator chose, which SECRET_HEADER_RE cannot
 * know). The HTTP clients treat these as credential headers when a request
 * leaves the credential's origin, and pass them to `redactHeaders` as
 * `extraNames`. Value: `string[]`, deduplicated.
 */
export declare const CREDENTIAL_HEADERS_KEY = "_credentialHeaders";
/**
 * Record that header `name` carries a credential in this request. Mutates
 * `middlewareContext` (creating the array if absent, deduplicating
 * case-insensitively) and returns it — a new object when none was given.
 */
export declare function recordCredentialHeader(middlewareContext: Record<string, unknown> | undefined, name: string): Record<string, unknown>;
/** The recorded credential header names of a middlewareContext (empty when none). */
export declare function credentialHeadersOf(middlewareContext: unknown): string[];
/**
 * Redact secret query params and URL userinfo. Unparseable URLs pass through
 * unchanged so error-attach paths never throw while scrubbing.
 *
 * `extraParamNames`: parameter names to redact in addition to the built-in
 * secret-name pattern — the request's recorded credential parameters
 * (`credentialQueryParamsOf(middlewareContext)`), whose names an operator
 * chose and the pattern cannot know. Matched case-insensitively.
 */
export declare function redactUrl(url: string, extraParamNames?: readonly string[]): string;
/**
 * Recursively clone an object/array with any secret key redacted. Protects
 * against circular references and caps recursion depth.
 *
 * `extraFieldNames`: names to treat as secret in addition to the built-in
 * pattern (the request's recorded credential query parameters). They redact
 * an object key of that name (e.g. a `query` record) and a `name=value` pair
 * inside any string value (e.g. a URL under a non-secret key).
 * `redactSensitiveValue(v)` behaves exactly as before.
 */
export declare function redactSensitiveValue(v: unknown, _depth?: number, seen?: WeakSet<object>, extraFieldNames?: readonly string[]): unknown;
