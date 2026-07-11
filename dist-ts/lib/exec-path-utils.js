/**
 * Shared path validation and normalization utilities for exec extensions.
 *
 * Used by both exec-script-execution.ts and exec-scripts.ts to avoid
 * duplicating security-critical path handling logic.
 *
 * Threat model:
 *   User-supplied paths arrive URL-encoded (possibly multi-layer) and may
 *   contain directory traversal (`..`), absolute prefixes (`/`), Windows
 *   separators (`\`), or null bytes (`\0`). Every path is repeatedly decoded
 *   to a fixed point and then validated in both raw and decoded forms to
 *   prevent bypass via double-encoding.
 */
/**
 * Upper bound on the number of iterative decodeURIComponent passes.
 * Adversarial inputs may be multi-layer URL-encoded (e.g. %252F -> %2F -> /).
 * 8 passes is generous enough for any legitimate encoding depth while
 * bounding CPU time against pathological inputs.
 */
export const MAX_URL_DECODE_PASSES = 8;
/**
 * Matches a `%` that is NOT followed by two hex digits (i.e. a malformed percent-encoding).
 * decodeURIComponent throws on lone `%` characters; this regex lets us escape them
 * to `%25` before decoding so the function does not throw on partially-encoded input.
 */
export const LONE_PERCENT = /%(?![0-9A-Fa-f]{2})/g;
export function escapeLonePercents(path) {
    return path.replace(LONE_PERCENT, '%25');
}
/**
 * Iteratively decode a URL-encoded path until it reaches a fixed point
 * (i.e. decoding produces no change) or exceeds MAX_URL_DECODE_PASSES.
 *
 * This defeats double-encoding (and triple-, etc.) attacks where an attacker
 * encodes `../` as `%252F..%252F` so a single decodeURIComponent pass does
 * not reveal the traversal. By repeating until stable, every layer of encoding
 * is stripped regardless of depth.
 *
 * Throws if the path contains invalid URL encoding (malformed % sequences
 * after lone-percent escaping) or if the depth limit is exceeded (likely
 * adversarial infinite-encoding).
 */
export function decodePathRepeatedly(path, helperName) {
    let decoded = path;
    for (let attempt = 0; attempt < MAX_URL_DECODE_PASSES; attempt += 1) {
        let next = decoded;
        try {
            next = decodeURIComponent(escapeLonePercents(decoded));
        }
        catch {
            throw new Error(`${helperName} path contains invalid URL encoding`);
        }
        if (next === decoded) {
            return decoded;
        }
        decoded = next;
    }
    throw new Error(`${helperName} path exceeded URL-decoding depth limit`);
}
/**
 * Validate a path (in both raw and decoded forms) against common attack vectors.
 *
 * Checks and their threat models:
 *   - Absolute path (`/`): prevents escaping the exec scripts root directory.
 *   - Windows separators (`\`): prevents bypasses on Windows or mixed-platform deployments.
 *   - Null bytes (`\0`): prevents C-string truncation attacks in downstream native code.
 *   - `..` segments: prevents directory traversal. Checked on BOTH the raw and decoded
 *     forms to catch traversal hidden behind URL encoding.
 */
export function validatePathCommon(normalized, decoded, helperName) {
    if (decoded.startsWith('/')) {
        throw new Error(`${helperName} path cannot resolve to an absolute path`);
    }
    if (decoded.includes('\\')) {
        throw new Error(`${helperName} path cannot resolve to Windows separators`);
    }
    if (decoded.includes('\0')) {
        throw new Error(`${helperName} path cannot resolve to null bytes`);
    }
    const hasTraversal = (value) => value.split('/').filter(Boolean).includes('..');
    if (hasTraversal(normalized) || hasTraversal(decoded)) {
        throw new Error(`${helperName} path cannot contain ".." segments`);
    }
}
/**
 * Validate a user-supplied path for use as a relative exec script path.
 *
 * Validates BOTH the raw (trimmed) form AND the fully-decoded form, because
 * an attacker could craft a raw path that looks safe but decodes to a traversal.
 * For example: raw "foo%2F..%2Fbar" looks relative, but decodes to "foo/../bar".
 *
 * Returns the trimmed (but not decoded) path for use in API requests — the server
 * performs its own decoding, so we must not double-decode the value we send.
 */
export function assertBasePath(path, helperName) {
    const normalized = path.trim();
    if (!normalized) {
        throw new Error(`${helperName} requires a non-empty path`);
    }
    if (normalized.startsWith('/')) {
        throw new Error(`${helperName} expects a relative path (no leading "/")`);
    }
    if (normalized.includes('\\')) {
        throw new Error(`${helperName} expects POSIX-style paths ("/"), not "\\\\"`);
    }
    if (normalized.includes('\0')) {
        throw new Error(`${helperName} path contains invalid null byte`);
    }
    const decoded = decodePathRepeatedly(normalized, helperName);
    validatePathCommon(normalized, decoded, helperName);
    return normalized;
}
