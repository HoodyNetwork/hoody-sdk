/**
 * Domain derivation utilities for Hoody SDK.
 *
 * Derives sibling domains (containers, ip) from a configured API base URL.
 * The operator configures ONE value (baseURL); everything else is derived:
 *   api.custom.com -> containers.custom.com, ip.custom.com, {realm}.api.custom.com
 */
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
