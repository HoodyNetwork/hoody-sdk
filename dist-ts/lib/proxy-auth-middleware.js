/**
 * Kit Proxy Auth Middleware
 *
 * Injects Kit authentication credentials into requests targeting
 * Kit service URLs. Applied as the FIRST middleware so it runs
 * before user middlewares.
 */
import { isProxyAuthPolicy, base64Encode, withTokenQueryParam } from './proxy-auth.js';
import { deriveSiblingDomain } from './domain-utils.js';
import { recordCredentialQueryParam, recordCredentialHeader } from './redact.js';
/** Check if a URL matches the base URL's origin and path prefix (including its realm hosts). */
function isSameOriginAndPath(url, baseURL) {
    try {
        const u = new URL(url);
        const b = new URL(baseURL);
        if (u.origin === b.origin) {
            return u.pathname.startsWith(b.pathname.replace(/\/$/, '') || '/');
        }
        // Realm hosts ({realmId}.api.hoody.com: one realm-id label in front of the
        // base host) are same-origin for auth purposes. Any subdomain used to count,
        // so under a base with no api. label (kit hosts are containers.<base host>)
        // every kit request was taken for an API one and got no kit credential.
        if (u.protocol === b.protocol
            && u.hostname.endsWith('.' + b.hostname)
            && /^[0-9a-f]{24}$/i.test(u.hostname.slice(0, -b.hostname.length - 1))) {
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
            // Every header set below carries the credential. Its name is recorded
            // (CREDENTIAL_HEADERS_KEY, lib/redact.ts) because an operator can choose
            // it (kitAuth header: 'X-Access-Pass'), and the secret-header pattern the
            // HTTP clients confine and redact by cannot know that name: the value
            // followed a middleware to another origin and stayed plaintext in
            // ApiError.request.headers.
            let middlewareContext = ctx.middlewareContext;
            const set = (name, value) => {
                headers[name] = value;
                middlewareContext = recordCredentialHeader(middlewareContext, name);
            };
            // A token rule configured with a query parameter reads only that
            // parameter (proxy matrix.service.ts case 'token': param before
            // cookie/header). Put the credential in the URL and send no header;
            // the URL is what HttpClient.prepareUpgrade() hands a WebSocket, so a
            // browser socket carries it too.
            //
            // The parameter name is recorded in middlewareContext
            // (CREDENTIAL_QUERY_PARAMS_KEY, lib/redact.ts) so the HTTP client can
            // strip it if a later step moves the request to another origin, and
            // redact it from ApiError / logs whatever name the operator chose.
            if (resolvedAuth.type === 'token' && resolvedAuth.param !== undefined) {
                const nextUrl = withTokenQueryParam(url, { ...resolvedAuth, param: resolvedAuth.param });
                const middlewareContext = recordCredentialQueryParam(ctx.middlewareContext, resolvedAuth.param.trim());
                return { ...ctx, url: nextUrl, middlewareContext };
            }
            switch (resolvedAuth.type) {
                case 'password': {
                    const encoded = base64Encode(`${resolvedAuth.username}:${resolvedAuth.password}`);
                    set('Authorization', `Basic ${encoded}`);
                    break;
                }
                case 'jwt': {
                    const h = resolvedAuth.header || 'Authorization';
                    set(h, h.toLowerCase() === 'authorization'
                        ? `Bearer ${resolvedAuth.token}`
                        : resolvedAuth.token);
                    break;
                }
                case 'token': {
                    const h = resolvedAuth.header || 'Authorization';
                    set(h, h.toLowerCase() === 'authorization'
                        ? `Bearer ${resolvedAuth.value}`
                        : resolvedAuth.value);
                    break;
                }
                case 'containerClaim': {
                    set('X-Hoody-Container-Claim', resolvedAuth.claim);
                    set('X-Hoody-Token', resolvedAuth.token);
                    break;
                }
            }
            return middlewareContext === undefined ? { ...ctx, headers } : { ...ctx, headers, middlewareContext };
        },
    };
    return middleware;
}
