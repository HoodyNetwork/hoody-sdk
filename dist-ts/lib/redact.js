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
const SECRET_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-.*-lease|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/i;
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
const SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials|key|jwt)$/i;
// SECRET_FIELD_RE is a list of whole names, so it knows only the names someone
// wrote down. The specs name credentials in many more ways (current_password,
// key_file_pass, client_credentials, sse_customer_key, confirm_token, …), all
// built the same way: qualifiers, then the noun that says what the value is.
// isSecretFieldName reads the noun.
const SECRET_NOUNS = ['password', 'passwd', 'pwd', 'pass', 'passphrase', 'secret', 'secrets', 'token', 'credential', 'credentials', 'cookie', 'cookies', 'jwt'];
// A leading verb makes the field a switch about the secret, not the secret (has_password, persist_credentials).
const FLAG_PREFIXES = ['has', 'is', 'ask', 'persist', 'require', 'requires', 'cors', 'use', 'allow', 'remember'];
// "..._token" that is a paging cursor.
const CURSOR_QUALIFIERS = ['page', 'next', 'prev', 'previous', 'continuation', 'pagination', 'cursor'];
// "..._key" that is not key material.
const PLAIN_KEY_QUALIFIERS = ['public', 'idempotency', 'cache', 'logical', 'action', 'sort', 'partition', 'primary', 'foreign', 'host'];
// "..._code" that is a one-time credential (a bare `code` is an error code; see isOauthCodeContext).
const SECRET_CODE_QUALIFIERS = ['otp', 'totp', 'mfa', 'auth', 'authorization', 'device', 'verification', 'recovery', 'backup'];
// A trailing encoding says how the value is written, not what it is (sse_customer_key_base64, key_pem).
const ENCODING_SUFFIXES = ['base64', 'b64', 'b64url', 'hex', 'pem'];
// Keys that sit beside an OAuth authorization `code`.
const OAUTH_CODE_SIBLINGS = ['state', 'redirect_uri', 'redirecturi', 'code_verifier', 'codeverifier', 'grant_type', 'granttype', 'client_id', 'clientid'];
/** snake_case, kebab-case and camelCase names as lower-case words. */
function nameWords(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}
/**
 * True for a body field or query parameter name that carries a credential:
 * a name in SECRET_FIELD_RE, or one whose last word is a secret noun
 * (`current_password`, `key_file_pass`, `client_credentials`, `confirm_token`,
 * `sse_customer_key`, `otp_code`, `approver_lease`). Names that only mention a
 * secret are not (`has_password`, `token_url`, `max_tokens`, `public_key`,
 * `idempotency_key`, `next_page_token`).
 */
export function isSecretFieldName(name) {
    if (typeof name !== 'string' || name.length === 0)
        return false;
    if (SECRET_FIELD_RE.test(name))
        return true;
    const words = nameWords(name);
    while (words.length > 1 && ENCODING_SUFFIXES.includes(words[words.length - 1]))
        words.pop();
    if (words.length < 2)
        return words.length === 1 && (words[0] === 'key' || SECRET_NOUNS.includes(words[0]));
    if (FLAG_PREFIXES.includes(words[0]))
        return false;
    const noun = words[words.length - 1];
    const qualifiers = words.slice(0, -1);
    if (noun === 'token')
        return !qualifiers.some((word) => CURSOR_QUALIFIERS.includes(word));
    if (SECRET_NOUNS.includes(noun))
        return true;
    if (noun === 'key')
        return !qualifiers.some((word) => PLAIN_KEY_QUALIFIERS.includes(word));
    if (noun === 'code')
        return qualifiers.some((word) => SECRET_CODE_QUALIFIERS.includes(word));
    if (noun === 'lease')
        return qualifiers.includes('approver');
    return false;
}
/** In a URL a signature is the credential too (a presigned link: X-Amz-Signature, sig). */
function isSecretUrlParam(name) {
    if (isSecretFieldName(name))
        return true;
    const words = nameWords(name);
    const noun = words[words.length - 1];
    return noun === 'signature' || noun === 'sig';
}
/**
 * A bare `code` is an error code almost everywhere, and masking it hid every
 * server error code that was printed through the redactor. It is a credential
 * only as an OAuth authorization code, which travels with `state`,
 * `redirect_uri`, `code_verifier`, `grant_type` or `client_id`.
 */
function isOauthCodeContext(keys) {
    return keys.some((key) => OAUTH_CODE_SIBLINGS.includes(key.toLowerCase()));
}
/**
 * An absolute URL too long to parse cheaply: its userinfo and its whole query
 * string go, the rest stays. One pass over the text.
 */
function scrubLongUrl(text) {
    const authorityStart = text.indexOf('//') + 2;
    let authorityEnd = authorityStart;
    while (authorityEnd < text.length && text[authorityEnd] !== '/' && text[authorityEnd] !== '?' && text[authorityEnd] !== '#')
        authorityEnd++;
    const at = text.lastIndexOf('@', authorityEnd - 1);
    const userinfo = at >= authorityStart;
    const queryAt = text.indexOf('?', authorityEnd);
    const hashAt = text.indexOf('#', authorityEnd);
    const hasQuery = queryAt >= 0 && (hashAt < 0 || queryAt < hashAt);
    if (!userinfo && !hasQuery)
        return text.replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
    const head = text.slice(0, authorityStart) + (userinfo ? PLACEHOLDER + '@' + text.slice(at + 1, authorityEnd) : text.slice(authorityStart, authorityEnd));
    const pathEnd = hasQuery ? queryAt : hashAt >= 0 ? hashAt : text.length;
    const path = text.slice(authorityEnd, pathEnd);
    const query = hasQuery ? '?' + encodeURIComponent(PLACEHOLDER) : '';
    const fragment = hashAt >= 0 ? text.slice(hashAt) : '';
    return (head + path + query + fragment).replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
}
/**
 * A string that is one absolute URL carrying userinfo or a secret parameter is redacted as a URL.
 * So is a relative one (it starts with `/` or `?`, has no whitespace and carries a query): its
 * query gets redactUrl's relative rule, the OAuth-context `code` included.
 */
function scrubUrlValue(text, extra) {
    if (/^[/?]\S*$/.test(text) && text.includes('?'))
        return redactUrl(text, extra);
    if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(text))
        return text;
    if (text.length > 8192)
        return scrubLongUrl(text);
    try {
        const u = new URL(text);
        const keys = Array.from(u.searchParams.keys());
        const oauth = isOauthCodeContext(keys);
        const secret = u.username !== '' || u.password !== ''
            || keys.some((key) => isSecretUrlParam(key) || isExtraName(key, extra) || (oauth && key.toLowerCase() === 'code'));
        return secret ? redactUrl(text, extra) : text;
    }
    catch {
        return text;
    }
}
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
        const keys = Array.from(u.searchParams.keys());
        const oauth = isOauthCodeContext(keys);
        for (const key of keys) {
            if (isSecretUrlParam(key) || isExtraName(key, extraParamNames) || (oauth && key.toLowerCase() === 'code'))
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
        const pairs = queryRaw.split('&');
        // The same OAuth-context rule as the absolute branch: a code beside state, redirect_uri, ...
        // is a one-time credential.
        const decodedKeys = [];
        for (const pair of pairs) {
            const eq = pair.indexOf('=');
            try {
                decodedKeys.push(decodeURIComponent((eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, ' ')));
            }
            catch { /* not a key this rule can read */ }
        }
        const oauth = isOauthCodeContext(decodedKeys);
        const parts = pairs.map(pair => {
            const eq = pair.indexOf('=');
            if (eq < 0)
                return pair;
            const k = pair.slice(0, eq);
            try {
                const dk = decodeURIComponent(k);
                if (isSecretUrlParam(dk) || isExtraName(dk, extraParamNames) || (oauth && dk.toLowerCase() === 'code'))
                    return `${k}=${encodeURIComponent(PLACEHOLDER)}`;
            }
            catch { /* leave as-is on decode failure */ }
            return pair;
        });
        return (base + parts.join('&') + tail).replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER);
    }
}
/**
 * A byte or stream value is never walked: Object.entries gives a typed array
 * one key per byte, and an error answer to a 4 MiB upload ran the process out
 * of memory. Only its type and size are kept (the Node http-client template
 * inlines the same check as `_binaryPlaceholder`). Type and size come from
 * the built-in getters, which check the value's internal slots, so a
 * shadowed `byteLength` or `Symbol.toStringTag` cannot put text in the
 * placeholder, and the label is one of a fixed set.
 */
const TYPED_ARRAY_PROTO = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayName = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, Symbol.toStringTag).get;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'byteLength').get;
const dataViewByteLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const sharedArrayBufferByteLength = typeof SharedArrayBuffer === 'function'
    ? Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')?.get
    : undefined;
/** The getter's answer for `v`, or undefined when `v` is not the type the getter belongs to. */
function brandedSize(get, v) {
    if (get === undefined)
        return undefined;
    try {
        return get.call(v);
    }
    catch {
        return undefined;
    }
}
function binaryPlaceholder(v) {
    if (ArrayBuffer.isView(v)) {
        const name = typedArrayName.call(v);
        return typeof name === 'string'
            ? `[binary ${name}, ${Number(typedArrayByteLength.call(v))} bytes]`
            : `[binary DataView, ${Number(dataViewByteLength.call(v))} bytes]`;
    }
    // An async iterable is a stream body whatever its prototype (an object literal can be one).
    if (typeof v[Symbol.asyncIterator] === 'function')
        return '[stream]';
    // A JSON body is made of plain objects: no other byte or stream type to look for.
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null)
        return undefined;
    const ab = brandedSize(arrayBufferByteLength, v);
    if (ab !== undefined)
        return `[binary ArrayBuffer, ${Number(ab)} bytes]`;
    const sab = brandedSize(sharedArrayBufferByteLength, v);
    if (sab !== undefined)
        return `[binary SharedArrayBuffer, ${Number(sab)} bytes]`;
    const g = globalThis;
    const blob = g.Blob === undefined ? undefined : brandedSize(Object.getOwnPropertyDescriptor(g.Blob.prototype, 'size')?.get, v);
    if (blob !== undefined)
        return `[binary ${g.File !== undefined && v instanceof g.File ? 'File' : 'Blob'}, ${Number(blob)} bytes]`;
    if (g.ReadableStream !== undefined && v instanceof g.ReadableStream)
        return '[stream]';
    return undefined;
}
/**
 * Recursively clone an object/array with any secret key redacted. Protects
 * against circular references and caps recursion depth. A byte or stream
 * value becomes a placeholder with its type and size (`binaryPlaceholder`),
 * and an object that throws while it is read becomes `[unreadable]`: this
 * runs while an error is being built, and must not replace that error.
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
    // A credential inside a URL VALUE (`?token=`, `access_token=`, `X-Amz-Signature=`, userinfo)
    // gets the scrub redactUrl gives the request URL.
    if (typeof v === 'string')
        return scrubNamedParams(scrubUrlValue(v.replace(HDY_TOKEN_VALUE_RE, PLACEHOLDER), extraFieldNames), extraFieldNames);
    if (typeof v !== 'object')
        return v;
    try {
        const binary = binaryPlaceholder(v);
        if (binary !== undefined)
            return binary;
        if (seen.has(v))
            return '[Circular]';
        seen.add(v);
        if (Array.isArray(v))
            return v.map((x) => redactSensitiveValue(x, _depth + 1, seen, extraFieldNames));
        const out = {};
        const oauth = isOauthCodeContext(Object.keys(v));
        for (const [k, val] of Object.entries(v)) {
            out[k] = isSecretFieldName(k) || isExtraName(k, extraFieldNames) || (oauth && k.toLowerCase() === 'code')
                ? PLACEHOLDER
                : redactSensitiveValue(val, _depth + 1, seen, extraFieldNames);
        }
        return out;
    }
    catch {
        return '[unreadable]';
    }
}
