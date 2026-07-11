/**
 * Hoody response-signature helpers.
 *
 * These utilities make `X-Hoody-Signature` easy to consume from SDK callers:
 * - extract a signature header from Response/Headers/plain objects
 * - parse and validate the header into typed fields
 * - cryptographically verify the Ed25519 signature against the canonical
 *   signed message (`<t>\n<m>\n<s>\n<path>\n<body>`) and the caller-provided
 *   public key
 *
 * Hoody API currently emits:
 *   t=<unix_ts>,kid=<key_id>,m=<method>,s=<status>,path=<url_path>,sig=<hex>
 *
 * Canonical signed message (matches the Hoody API response signer):
 *   `${t}\n${method}\n${statusCode}\n${path}\n${body}`
 *
 * Note:
 * - `m`/`s` are optional in the parser for forward/backward compatibility with
 *   older servers that omit them, but BOTH are required for `verifyHoodySignatureHeader`
 *   because they are part of the canonical signed payload.
 * - `sig` is expected to be a 64-byte ED25519 signature in hex (128 chars)
 */
import nacl from 'tweetnacl';
function isHeadersLike(value) {
    return Boolean(value) && typeof value.get === 'function';
}
function normalizeHeaderValue(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(value) && value.length > 0) {
        return normalizeHeaderValue(value[0]);
    }
    return undefined;
}
function getHeaderFromRecord(record, headerName) {
    const target = headerName.toLowerCase();
    for (const [key, value] of Object.entries(record)) {
        if (key.toLowerCase() !== target)
            continue;
        return normalizeHeaderValue(value);
    }
    return undefined;
}
/**
 * Extract `X-Hoody-Signature` from Response/Headers/plain header maps.
 */
export function getHoodySignatureHeader(source) {
    if (isHeadersLike(source)) {
        return normalizeHeaderValue(source.get('x-hoody-signature'));
    }
    if (source && typeof source === 'object' && 'headers' in source) {
        const nested = source.headers;
        if (!nested)
            return undefined;
        return getHoodySignatureHeader(nested);
    }
    if (source && typeof source === 'object') {
        return getHeaderFromRecord(source, 'x-hoody-signature');
    }
    return undefined;
}
function parsePairs(rawHeader) {
    const fields = {};
    // Split ONLY on commas outside quoted strings — a naive split on every
    // `,` would truncate values that legitimately contain commas (URL paths
    // like `/items/a,b,c`, multi-value lists). The tokenizer walks the string
    // respecting the `key=value,key=value` structure.
    let i = 0;
    while (i < rawHeader.length) {
        // Skip leading whitespace + optional comma
        while (i < rawHeader.length && (rawHeader[i] === ' ' || rawHeader[i] === '\t' || rawHeader[i] === ','))
            i++;
        if (i >= rawHeader.length)
            break;
        // Read key up to '='
        const keyStart = i;
        while (i < rawHeader.length && rawHeader[i] !== '=' && rawHeader[i] !== ',')
            i++;
        if (i >= rawHeader.length || rawHeader[i] !== '=') {
            // No '=' for this token; skip it
            while (i < rawHeader.length && rawHeader[i] !== ',')
                i++;
            continue;
        }
        const key = rawHeader.slice(keyStart, i).trim().toLowerCase();
        i++; // skip '='
        // Read value — may be quoted (preserves commas/spaces)
        let value = '';
        if (rawHeader[i] === '"') {
            i++;
            const vStart = i;
            while (i < rawHeader.length && rawHeader[i] !== '"') {
                if (rawHeader[i] === '\\' && i + 1 < rawHeader.length)
                    i++;
                i++;
            }
            value = rawHeader.slice(vStart, i);
            if (i < rawHeader.length)
                i++; // skip closing quote
            // Skip to next comma
            while (i < rawHeader.length && rawHeader[i] !== ',')
                i++;
        }
        else {
            const vStart = i;
            while (i < rawHeader.length && rawHeader[i] !== ',')
                i++;
            value = rawHeader.slice(vStart, i).trim();
        }
        if (key && value)
            fields[key] = value;
    }
    return fields;
}
/**
 * Parse and validate a Hoody signature header value.
 *
 * @throws Error when required fields are missing or malformed.
 */
export function parseHoodySignatureHeader(rawHeader) {
    const raw = rawHeader.trim();
    if (!raw) {
        throw new Error('X-Hoody-Signature is empty');
    }
    const fields = parsePairs(raw);
    const t = fields.t;
    const kid = fields.kid;
    const path = fields.path;
    const sig = fields.sig;
    const m = fields.m;
    const s = fields.s;
    if (!t)
        throw new Error('X-Hoody-Signature missing "t"');
    if (!kid)
        throw new Error('X-Hoody-Signature missing "kid"');
    if (!path)
        throw new Error('X-Hoody-Signature missing "path"');
    if (!sig)
        throw new Error('X-Hoody-Signature missing "sig"');
    if (!/^\d+$/.test(t)) {
        throw new Error(`Invalid signature timestamp "t": ${t}`);
    }
    const timestamp = Number(t);
    if (!Number.isSafeInteger(timestamp)) {
        throw new Error(`Signature timestamp is not a safe integer: ${t}`);
    }
    if (!/^[0-9a-f]{128}$/i.test(sig)) {
        throw new Error('Signature "sig" must be 128 hex characters');
    }
    let method;
    if (m) {
        const normalizedMethod = m.toUpperCase();
        if (!/^[A-Z]+$/.test(normalizedMethod)) {
            throw new Error(`Invalid signature method "m": ${m}`);
        }
        method = normalizedMethod;
    }
    let statusCode;
    if (s) {
        if (!/^\d{3}$/.test(s)) {
            throw new Error(`Invalid signature status code "s": ${s}`);
        }
        statusCode = Number(s);
    }
    return {
        raw,
        timestamp,
        keyId: kid,
        path,
        signatureHex: sig.toLowerCase(),
        ...(method ? { method } : {}),
        ...(statusCode !== undefined ? { statusCode } : {}),
        fields,
    };
}
/**
 * Extract + parse `X-Hoody-Signature` in one step.
 * Returns `undefined` when the header does not exist.
 */
export function parseHoodySignatureFrom(source) {
    const header = getHoodySignatureHeader(source);
    if (!header)
        return undefined;
    return parseHoodySignatureHeader(header);
}
/** Convert a lowercase hex string into a Uint8Array. */
function hexToBytes(hex) {
    if (hex.length % 2 !== 0)
        throw new Error('hex string has odd length');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
        if (!Number.isFinite(byte))
            throw new Error(`invalid hex at offset ${i * 2}`);
        out[i] = byte;
    }
    return out;
}
/** UTF-8 encode a string into bytes. Uses the global TextEncoder (available in Node 11+ and all modern browsers). */
function utf8(s) {
    return new TextEncoder().encode(s);
}
/**
 * Cryptographically verify a parsed `X-Hoody-Signature` against the response
 * that carried it. Returns `true` on success, `false` on any failure (bad sig,
 * mismatched method/status/path, stale timestamp, wrong kid, malformed inputs).
 *
 * Throws only when the caller's own inputs are structurally invalid (wrong
 * pubkey length, non-integer status, etc.) — a server-sent bad signature
 * returns `false`, never throws.
 *
 * The canonical signed message is:
 *   `${header.timestamp}\n${header.method}\n${header.statusCode}\n${header.path}\n${bodyUtf8}`
 * where `header.method`/`statusCode`/`path` MUST equal the caller-provided
 * `input.method`/`statusCode`/`path` — the verifier rejects a mismatch to
 * prevent cross-method/path/status replay.
 */
export function verifyHoodySignatureHeader(header, input, options = {}) {
    const { method, statusCode, path, body, publicKey } = input;
    if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) {
        throw new Error('verifyHoodySignatureHeader: publicKey must be a 32-byte Uint8Array');
    }
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
        throw new Error(`verifyHoodySignatureHeader: invalid statusCode ${statusCode}`);
    }
    if (typeof method !== 'string' || method.length === 0) {
        throw new Error('verifyHoodySignatureHeader: method must be a non-empty string');
    }
    // The verifier REQUIRES m/s/path in the header — older servers that omit
    // m/s produce headers that this function correctly refuses to validate.
    if (header.method === undefined)
        return false;
    if (header.statusCode === undefined)
        return false;
    if (!header.path)
        return false;
    // Cross-binding: header's bound fields must match the response the caller
    // actually received. A server returning a valid signature for a different
    // method/status/path MUST NOT validate against the caller's actual response.
    if (header.method !== method.toUpperCase())
        return false;
    if (header.statusCode !== statusCode)
        return false;
    if (header.path !== path)
        return false;
    // Optional kid allowlist (key rotation pinning).
    if (options.allowedKeyIds !== undefined) {
        const set = options.allowedKeyIds instanceof Set
            ? options.allowedKeyIds
            : new Set(options.allowedKeyIds);
        if (!set.has(header.keyId))
            return false;
    }
    // Freshness check. Default 5 minutes per the upstream recommendation.
    const skew = options.maxSkewSeconds ?? 300;
    if (Number.isFinite(skew)) {
        const now = options.now ?? Math.floor(Date.now() / 1000);
        if (Math.abs(now - header.timestamp) > skew)
            return false;
    }
    // Build the canonical signed message. Matches the Hoody API response
    // signer byte-for-byte.
    const bodyStr = typeof body === 'string' ? body : new TextDecoder('utf-8').decode(body);
    const message = utf8(`${header.timestamp}\n${header.method}\n${header.statusCode}\n${header.path}\n${bodyStr}`);
    let sig;
    try {
        sig = hexToBytes(header.signatureHex);
    }
    catch {
        return false;
    }
    if (sig.length !== 64)
        return false;
    return nacl.sign.detached.verify(message, sig, publicKey);
}
/**
 * Convenience: extract the header from a Response/Headers/plain object,
 * parse it, and verify. Returns `false` if the header is absent or malformed.
 * Never throws for server-sent data — only for structurally-invalid caller input.
 */
export function verifyHoodySignatureFrom(source, input, options = {}) {
    let parsed;
    try {
        const maybe = parseHoodySignatureFrom(source);
        if (!maybe)
            return false;
        parsed = maybe;
    }
    catch {
        return false;
    }
    return verifyHoodySignatureHeader(parsed, input, options);
}
