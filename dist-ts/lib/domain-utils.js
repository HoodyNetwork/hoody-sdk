/**
 * Domain derivation utilities for Hoody SDK.
 *
 * Derives sibling domains (containers, ip) from a configured API base URL.
 * The operator configures ONE value (baseURL); everything else is derived:
 *   api.custom.com -> containers.custom.com, ip.custom.com, {realm}.api.custom.com
 *
 * The same rule gives the platform's own sites (docs, ai, chatbot, ip, os): see platformDomain().
 * No node: import here: the browser entry and the CLI both load this module.
 */
/**
 * The platform an API host is assumed to belong to when it names none: no base URL, one that does
 * not parse, localhost or an IP literal. It is the only platform literal the link helpers below
 * fall back to.
 */
export const DEFAULT_PLATFORM_DOMAIN = 'hoody.com';
const REALM_API_PREFIX = /^[a-f0-9]{24}\.api\./i;
/**
 * The platform domain of an account: the domain its API host sits under, read from the configured
 * API base URL at run time.
 *
 *   platformDomain('https://api.hoody.com')           -> 'hoody.com'
 *   platformDomain('https://{realm}.api.hoody.com')   -> 'hoody.com'
 *   platformDomain('https://api.custom.example/v1')   -> 'custom.example'
 *   platformDomain('https://backend.custom.example')  -> 'backend.custom.example'
 *   platformDomain(undefined | 'nonsense' | 'http://localhost:3000' | 'http://10.0.0.1')
 *                                                     -> DEFAULT_PLATFORM_DOMAIN
 *
 * One published package serves every platform, so a host written into the code is right for one of
 * them only. Every built-in link and endpoint (docs, ai, chatbot, ip, os) is this domain with the
 * site's label in front: an account on one platform is never shown, and never sends anything to,
 * another platform's sites.
 */
export function platformDomain(baseURL) {
    if (typeof baseURL !== 'string' || baseURL === '')
        return DEFAULT_PLATFORM_DOMAIN;
    let host;
    try {
        host = new URL(baseURL).hostname.toLowerCase().replace(/\.+$/, '');
    }
    catch {
        return DEFAULT_PLATFORM_DOMAIN;
    }
    // Only a DNS name can carry a platform: not an empty host, an IP literal or localhost.
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
        return DEFAULT_PLATFORM_DOMAIN;
    if (/^\d+(?:\.\d+){3}$/.test(host) || host === 'localhost' || host.endsWith('.localhost'))
        return DEFAULT_PLATFORM_DOMAIN;
    if (REALM_API_PREFIX.test(host))
        return host.replace(REALM_API_PREFIX, '');
    if (host.startsWith('api.'))
        return host.slice(4);
    const infix = host.indexOf('.api.');
    if (infix !== -1)
        return host.slice(infix + 5);
    return host;
}
/** The host of one platform site for an account: platformHost('https://api.example.test', 'docs') -> 'docs.example.test'. */
export function platformHost(baseURL, service) {
    return `${service}.${platformDomain(baseURL)}`;
}
/**
 * The https URL of one platform site for an account, with an optional path:
 * platformUrl('https://api.example.test', 'ai', '/api/v1') -> 'https://ai.example.test/api/v1'.
 */
export function platformUrl(baseURL, service, path = '') {
    return `https://${platformHost(baseURL, service)}${path}`;
}
/**
 * Derive a sibling domain from a base URL by replacing the 'api' subdomain.
 *
 * Examples:
 *   deriveSiblingDomain('https://api.custom.com', 'containers') -> 'containers.custom.com'
 *   deriveSiblingDomain('https://abc123.api.custom.com', 'ip') -> 'ip.custom.com'
 *   deriveSiblingDomain('https://backend.custom.com', 'containers') -> 'containers.backend.custom.com'
 *
 * @param baseURL - The configured API base URL
 * @param sibling - The sibling subdomain prefix (e.g., 'containers', 'ip')
 * @returns The derived sibling domain (hostname only, no protocol)
 */
export function deriveSiblingDomain(baseURL, sibling) {
    try {
        const host = new URL(baseURL).hostname;
        if (!host)
            return `${sibling}.hoody.com`;
        // Already the target sibling
        if (host.startsWith(`${sibling}.`))
            return host;
        // Strip realm prefix (24-hex ObjectId)
        const realmPattern = /^[a-f0-9]{24}\.api\./i;
        if (realmPattern.test(host)) {
            return host.replace(realmPattern, `${sibling}.`);
        }
        // Standard: api.X -> sibling.X
        if (host.startsWith('api.')) {
            return `${sibling}.${host.slice(4)}`;
        }
        // Infix: Y.api.X -> Y.sibling.X
        const replaced = host.replace('.api.', `.${sibling}.`);
        if (replaced !== host)
            return replaced;
        // Guard: localhost and IP literals — don't prepend sibling
        if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) {
            return `${sibling}.hoody.com`;
        }
        // Catch-all: prepend sibling
        return `${sibling}.${host}`;
    }
    catch {
        return `${sibling}.hoody.com`;
    }
}
