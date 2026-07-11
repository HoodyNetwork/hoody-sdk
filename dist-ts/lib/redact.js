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
const SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|code|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials)$/i;
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
export function redactHeaders(headers) {
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => SECRET_HEADER_RE.test(k) ? [k, PLACEHOLDER] : [k, v]));
}
/**
 * Redact secret query params and URL userinfo. Unparseable URLs pass through
 * unchanged so error-attach paths never throw while scrubbing.
 */
export function redactUrl(url) {
    if (typeof url !== 'string' || url.length === 0)
        return url;
    try {
        const u = new URL(url);
        if (u.username)
            u.username = PLACEHOLDER;
        if (u.password)
            u.password = PLACEHOLDER;
        for (const key of Array.from(u.searchParams.keys())) {
            if (SECRET_FIELD_RE.test(key))
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
                if (SECRET_FIELD_RE.test(decodeURIComponent(k)))
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
 */
export function redactSensitiveValue(v, _depth = 0, seen = new WeakSet()) {
    if (_depth > MAX_DEPTH)
        return '[depth-limit]';
    if (v === null || v === undefined)
        return v;
    // Value-shape scrub: an hdy_ launch token embedded in a string VALUE (e.g. a
    // redirect URL under a non-secret key) is invisible to the SECRET_FIELD_RE
    // name pass below, so scrub it by shape here — mirrors redactUrl's belt-and-
    // suspenders HDY_TOKEN_VALUE_RE pass (URL_TOKEN_AUTOLOGIN_PLAN §4 value-shape).
    if (typeof v === 'string')
        return v.replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
    if (typeof v !== 'object')
        return v;
    if (seen.has(v))
        return '[Circular]';
    seen.add(v);
    if (Array.isArray(v))
        return v.map((x) => redactSensitiveValue(x, _depth + 1, seen));
    const out = {};
    for (const [k, val] of Object.entries(v)) {
        out[k] = SECRET_FIELD_RE.test(k) ? PLACEHOLDER : redactSensitiveValue(val, _depth + 1, seen);
    }
    return out;
}
