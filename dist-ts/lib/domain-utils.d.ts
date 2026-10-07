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
export declare const DEFAULT_PLATFORM_DOMAIN = "hoody.com";
/** The platform sites reached by name under the platform domain. */
export type PlatformService = 'docs' | 'ai' | 'chatbot' | 'ip' | 'os';
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
export declare function platformDomain(baseURL: string | null | undefined): string;
/** The host of one platform site for an account: platformHost('https://api.example.test', 'docs') -> 'docs.example.test'. */
export declare function platformHost(baseURL: string | null | undefined, service: PlatformService): string;
/**
 * The https URL of one platform site for an account, with an optional path:
 * platformUrl('https://api.example.test', 'ai', '/api/v1') -> 'https://ai.example.test/api/v1'.
 */
export declare function platformUrl(baseURL: string | null | undefined, service: PlatformService, path?: string): string;
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
export declare function deriveSiblingDomain(baseURL: string, sibling: string): string;
