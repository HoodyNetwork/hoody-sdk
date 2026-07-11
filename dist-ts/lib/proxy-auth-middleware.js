/**
 * Kit Proxy Auth Middleware
 *
 * Injects Kit authentication credentials into requests targeting
 * Kit service URLs. Applied as the FIRST middleware so it runs
 * before user middlewares.
 */
import { isProxyAuthPolicy, base64Encode } from './proxy-auth.js';
import { deriveSiblingDomain } from './domain-utils.js';
/** Check if a URL matches the base URL's origin and path prefix (including realm subdomains). */
function isSameOriginAndPath(url, baseURL) {
    try {
        const u = new URL(url);
        const b = new URL(baseURL);
        if (u.origin === b.origin) {
            return u.pathname.startsWith(b.pathname.replace(/\/$/, '') || '/');
        }
        // Realm-scoped subdomains (e.g. {realmId}.api.hoody.com) are same-origin for auth purposes
        if (u.protocol === b.protocol && u.hostname.endsWith('.' + b.hostname)) {
            return u.pathname.startsWith(b.pathname.replace(/\/$/, '') || '/');
        }
        return false;
    }
    catch {
        // Malformed URL on either side → fall back to a literal prefix check.
        // We intentionally fail-CLOSED-ish: this is "is the request going back
        // to the configured baseURL?" — a string-prefix match is conservative
        // (matches the baseURL exactly, won't match a third-party origin), and
        // the auth header is only attached when this returns true.
        return url.startsWith(baseURL);
    }
}
/**
 * Creates a middleware that injects proxy auth credentials into Kit requests.
 *
 * @param getAuth - Getter for the proxy auth configuration or policy
 * @param baseURL - The API base URL (used to distinguish API vs Kit requests)
 */
export function createProxyAuthMiddleware(getAuth, baseURL) {
    // Derive the containers domain from baseURL (domain-agnostic).
    // e.g. api.custom.com -> containers.custom.com
    const containersDomain = deriveSiblingDomain(baseURL, 'containers');
    function isKitUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname.endsWith('.' + containersDomain) || hostname === containersDomain;
        }
        catch {
            return false;
        }
    }
    // Tag the middleware so withContainer()'s override-strip filter can
    // identify and remove the parent's proxy-auth middleware when kitAuth is
    // overridden. Without this tag the filter never matches and stale headers
    // survive into the child client. Cast-through-unknown to carry the excess
    // property past IHttpClientMiddleware's structural check.
    const middleware = {
        _proxyAuthMiddleware: true,
        onRequest(ctx) {
            // Only inject for Kit URLs (full URLs that don't match API baseURL origin)
            const url = ctx.url;
            if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
                return ctx;
            }
            // Skip API requests (same origin + path as baseURL)
            if (baseURL && isSameOriginAndPath(url, baseURL)) {
                return ctx;
            }
            // Only inject for verified Kit URLs (derived containers domain)
            if (!isKitUrl(url)) {
                return ctx;
            }
            // 1. Resolve auth configuration
            // Per-request override takes priority
            const requestAuth = ctx.middlewareContext?.kitAuth;
            let resolvedAuth;
            const auth = getAuth();
            if (requestAuth) {
                resolvedAuth = requestAuth;
            }
            else if (auth && isProxyAuthPolicy(auth)) {
                const namespace = ctx.middlewareContext?._kitNamespace;
                resolvedAuth = (namespace && auth.services?.[namespace]) || auth.default;
            }
            else if (auth) {
                resolvedAuth = auth;
            }
            if (!resolvedAuth || resolvedAuth.type === 'ip') {
                return ctx;
            }
            const headers = { ...ctx.headers };
            switch (resolvedAuth.type) {
                case 'password': {
                    const encoded = base64Encode(`${resolvedAuth.username}:${resolvedAuth.password}`);
                    headers['Authorization'] = `Basic ${encoded}`;
                    break;
                }
                case 'jwt': {
                    const h = resolvedAuth.header || 'Authorization';
                    headers[h] = h.toLowerCase() === 'authorization'
                        ? `Bearer ${resolvedAuth.token}`
                        : resolvedAuth.token;
                    break;
                }
                case 'token': {
                    const h = resolvedAuth.header || 'Authorization';
                    headers[h] = h.toLowerCase() === 'authorization'
                        ? `Bearer ${resolvedAuth.value}`
                        : resolvedAuth.value;
                    break;
                }
                case 'containerClaim': {
                    headers['X-Hoody-Container-Claim'] = resolvedAuth.claim;
                    headers['X-Hoody-Token'] = resolvedAuth.token;
                    break;
                }
            }
            return { ...ctx, headers };
        },
    };
    return middleware;
}
