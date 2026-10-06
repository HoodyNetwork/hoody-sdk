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
// Covers non-X-prefixed secret headers (Api-Key, Access-Token, Refresh-Token,
// Secret-Key, Bearer, Session-Token, Id-Token, etc.) so they don't leak into
// ApiError.request.headers and any middleware/onError log paths.
const SECRET_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/i;
/**
 * Secret query-param / body-field key matcher. Anchored word list — does
 * NOT match substrings (e.g. `my_key_name` is not a key, but `apikey` is).
 *
 * Covers generated credential field names that kit services, exec scripts,
 * and third-party APIs commonly emit:
 *   private_key, public_key_secret, client_secret, client_id_secret,
 *   secret_access_key, aws_secret, bearer_token, id_token, session_token,
 *   credential, ssh_pass*, socks5_pass*, proxy_password, db_password.
 */
const SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|code|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials|key|jwt)$/i;
// Value-shape matcher for a Hoody bearer carried in a URL by a NON-secret param
// name (e.g. ?hdy_token=) or embedded in a path segment, so it is scrubbed by
// SHAPE regardless of which key/surface carries it. Real token shape is
// hdy_<24hex>_<48hex>: the `_` separator (and base64url `-`) are NOT in
// [a-zA-Z0-9], so a `[a-zA-Z0-9]`-only class stops at the first underscore and
// leaks the high-entropy second half next to the placeholder — the class MUST
// include `_`/`-` to swallow the whole value. Kept in lockstep with the
// `hdy_` SECRET_PATTERN in lib/chat/redact.ts.
const HDY_TOKEN_VALUE_RE = /hdy_[A-Za-z0-9_-]{20,}/g;
const PLACEHOLDER = '[REDACTED]';
const MAX_DEPTH = 6;
/**
 * True for a header name in the secret set above. Exported so the browser
 * HttpClient's credential-scope check uses the same set the redactor does.
 */
export function isSecretHeaderName(name) {
    return SECRET_HEADER_RE.test(name);
}
/**
 * `extraNames`: header names configured to carry a credential (the CLI's
 * renamed kit-token header, or the SDK's recorded kitAuth headers, see
 * CREDENTIAL_HEADERS_KEY), which an operator chose and the pattern cannot
 * know. Matched case-insensitively.
 */
export function redactHeaders(headers, extraNames) {
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => SECRET_HEADER_RE.test(k) || isExtraName(k, extraNames) ? [k, PLACEHOLDER] : [k, v]));
}
/**
 * The middlewareContext key under which a request records the names of query
 * parameters that carry a credential (a kitAuth token with `param`, see
 * lib/proxy-auth.ts). The HTTP clients pass these names to `redactUrl` /
 * `redactSensitiveValue` and strip the parameters when a request leaves the
 * credential's origin. Value: `string[]`, deduplicated.
 */
export const CREDENTIAL_QUERY_PARAMS_KEY = '_credentialQueryParams';
/**
 * Record that `name` carries a credential in this request's URL. Mutates
 * `middlewareContext` (creating the array if absent, deduplicating) so every
 * holder of the context sees it, and returns the context — a new object when
 * none was given.
 */
export function recordCredentialQueryParam(middlewareContext, name) {
    const ctx = middlewareContext ?? {};
    const existing = ctx[CREDENTIAL_QUERY_PARAMS_KEY];
    const list = Array.isArray(existing) ? existing.filter((n) => typeof n === 'string') : [];
    if (!list.includes(name))
        list.push(name);
    ctx[CREDENTIAL_QUERY_PARAMS_KEY] = list;
    return ctx;
}
/** The recorded credential parameter names of a middlewareContext (empty when none). */
export function credentialQueryParamsOf(middlewareContext) {
    const v = middlewareContext?.[CREDENTIAL_QUERY_PARAMS_KEY];
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.length > 0) : [];
}
/**
 * The middlewareContext key under which a request records the names of the
 * headers that carry a credential (every header the kitAuth middleware sets,
 * including a `header` name the operator chose, which SECRET_HEADER_RE cannot
 * know). The HTTP clients treat these as credential headers when a request
 * leaves the credential's origin, and pass them to `redactHeaders` as
 * `extraNames`. Value: `string[]`, deduplicated.
 */
export const CREDENTIAL_HEADERS_KEY = '_credentialHeaders';
/**
 * Record that header `name` carries a credential in this request. Mutates
 * `middlewareContext` (creating the array if absent, deduplicating
 * case-insensitively) and returns it — a new object when none was given.
 */
export function recordCredentialHeader(middlewareContext, name) {
    const ctx = middlewareContext ?? {};
    const existing = ctx[CREDENTIAL_HEADERS_KEY];
    const list = Array.isArray(existing) ? existing.filter((n) => typeof n === 'string') : [];
    if (!list.some((n) => n.toLowerCase() === name.toLowerCase()))
        list.push(name);
    ctx[CREDENTIAL_HEADERS_KEY] = list;
    return ctx;
}
/** The recorded credential header names of a middlewareContext (empty when none). */
export function credentialHeadersOf(middlewareContext) {
    const v = middlewareContext?.[CREDENTIAL_HEADERS_KEY];
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.length > 0) : [];
}
/** Case-insensitive membership in a caller-supplied list of extra secret names. */
function isExtraName(name, extra) {
    if (!extra || extra.length === 0)
        return false;
    const lower = wellFormed(name).toLowerCase();
    return extra.some((n) => typeof n === 'string' && wellFormed(n).toLowerCase() === lower);
}
/**
 * Lone surrogates → U+FFFD, as a URL serialiser writes them, so a configured
 * name compares equal to the key URLSearchParams decodes back.
 */
function wellFormed(s) {
    const f = s.toWellFormed;
    return typeof f === 'function' ? f.call(s) : s;
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Scrub `name=value` pairs for the given parameter names anywhere in a string
 * (a URL embedded in an error message or a log line). Textual, so it works on
 * relative and unparseable URLs too. Names are matched case-insensitively in
 * every form a URL can spell them: raw, percent-encoded
 * (`encodeURIComponent`, `a%20b`) and form-encoded (URLSearchParams, `a+b`).
 *
 * This runs while an error is being built, so it must never throw: a name
 * that cannot be encoded (a lone surrogate makes encodeURIComponent throw
 * URIError) redacts the WHOLE value instead of masking the real error.
 */
function scrubNamedParams(text, extra) {
    if (!extra || extra.length === 0 || typeof text !== 'string')
        return text;
    try {
        let out = text;
        for (const name of extra) {
            if (typeof name !== 'string' || name.length === 0)
                continue;
            const forms = new Set([
                name,
                // URLSearchParams never throws: it replaces a lone surrogate with
                // U+FFFD, exactly as a URL serialiser does, so this form also covers
                // a name encodeURIComponent cannot handle.
                new URLSearchParams([[name, '']]).toString().slice(0, -1),
            ]);
            try {
                forms.add(encodeURIComponent(name));
            }
            catch {
                // Lone surrogate: no URL can spell the name this way (a serialiser
                // writes the U+FFFD form above), so there is nothing more to match.
            }
            const alternatives = [...forms].map(escapeRegExp).join('|');
            const re = new RegExp(`([?&])(${alternatives})=([^&#\\s"']*)`, 'gi');
            out = out.replace(re, `$1$2=${encodeURIComponent(PLACEHOLDER)}`);
        }
        return out;
    }
    catch {
        return PLACEHOLDER;
    }
}
/**
 * Redact secret query params and URL userinfo. Unparseable URLs pass through
 * unchanged so error-attach paths never throw while scrubbing.
 *
 * `extraParamNames`: parameter names to redact in addition to the built-in
 * secret-name pattern — the request's recorded credential parameters
 * (`credentialQueryParamsOf(middlewareContext)`), whose names an operator
 * chose and the pattern cannot know. Matched case-insensitively.
 */
export function redactUrl(url, extraParamNames) {
    if (typeof url !== 'string' || url.length === 0)
        return url;
    try {
        const u = new URL(url);
        if (u.username)
            u.username = PLACEHOLDER;
        if (u.password)
            u.password = PLACEHOLDER;
        for (const key of Array.from(u.searchParams.keys())) {
            if (SECRET_FIELD_RE.test(key) || isExtraName(key, extraParamNames))
                u.searchParams.set(key, PLACEHOLDER);
        }
        // Belt-and-suspenders: scrub any hdy_-shaped value by shape (path segments,
        // or a token carried under a non-secret param name). `_`/`-` are URL-
        // unreserved so the shape survives URL.toString() encoding.
        return u.toString().replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
    }
    catch {
        // Fallback for relative URLs / non-parseable strings: scrub query string textually.
        const qIdx = url.indexOf('?');
        if (qIdx < 0)
            return url;
        const hashIdx = url.indexOf('#', qIdx);
        const base = url.slice(0, qIdx + 1);
        const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
        const queryRaw = url.slice(qIdx + 1, queryEnd);
        const tail = hashIdx >= 0 ? url.slice(hashIdx) : '';
        if (queryRaw.length === 0)
            return url;
        const parts = queryRaw.split('&').map(pair => {
            const eq = pair.indexOf('=');
            if (eq < 0)
                return pair;
            const k = pair.slice(0, eq);
            try {
                const dk = decodeURIComponent(k);
                if (SECRET_FIELD_RE.test(dk) || isExtraName(dk, extraParamNames))
                    return `${k}=${encodeURIComponent(PLACEHOLDER)}`;
            }
            catch { /* leave as-is on decode failure */ }
            return pair;
        });
        return (base + parts.join('&') + tail).replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
    }
}
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
export function redactSensitiveValue(v, _depth = 0, seen = new WeakSet(), extraFieldNames) {
    if (_depth > MAX_DEPTH)
        return '[depth-limit]';
    if (v === null || v === undefined)
        return v;
    // Value-shape scrub: an hdy_ launch token embedded in a string VALUE (e.g. a
    // redirect URL under a non-secret key) is invisible to the SECRET_FIELD_RE
    // name pass below, so scrub it by shape here — mirrors redactUrl's belt-and-
    // suspenders HDY_TOKEN_VALUE_RE pass (token value-shape).
    if (typeof v === 'string')
        return scrubNamedParams(v.replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER), extraFieldNames);
    if (typeof v !== 'object')
        return v;
    if (seen.has(v))
        return '[Circular]';
    seen.add(v);
    if (Array.isArray(v))
        return v.map((x) => redactSensitiveValue(x, _depth + 1, seen, extraFieldNames));
    const out = {};
    for (const [k, val] of Object.entries(v)) {
        out[k] = SECRET_FIELD_RE.test(k) || isExtraName(k, extraFieldNames)
            ? PLACEHOLDER
            : redactSensitiveValue(val, _depth + 1, seen, extraFieldNames);
    }
    return out;
}
