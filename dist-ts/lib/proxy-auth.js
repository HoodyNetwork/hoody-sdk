/**
 * Kit Proxy Authentication Types (v1 — simplified)
 *
 * These types define credentials for authenticating against
 * Hoody Kit services protected by proxy permissions.
 */
/** Type guard: distinguishes ProxyAuth (has 'type') from ProxyAuthPolicy. */
export function isProxyAuthPolicy(auth) {
    return auth !== null && typeof auth === 'object' && !('type' in auth);
}
/**
 * UTF-8-safe Base64 encoding (works in both browser and Node.js).
 * Checks Buffer first (Node.js — no deprecated functions) then btoa (browser).
 */
export function base64Encode(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str).toString('base64');
    }
    // Browser: btoa only handles Latin-1, so encode UTF-8 first
    return btoa(unescape(encodeURIComponent(str)));
}
