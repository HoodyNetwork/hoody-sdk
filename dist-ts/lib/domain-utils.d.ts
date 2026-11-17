/**
 * Domain derivation utilities for Hoody SDK.
 *
 * Derives sibling domains (computers, ip) from a configured API base URL.
 * The operator configures ONE value (baseURL); everything else is derived:
 *   api.custom.com -> computers.custom.com, ip.custom.com, {realm}.api.custom.com
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
/** The host label a computer's kit hosts are emitted under: `{projectId}-{computerId}-{kit}-{n}.{server}.computers.<base host>`. */
export declare const COMPUTERS_LABEL = "computers";
/** The label kit hosts lived under before the rename. It still routes, so it is still accepted wherever a kit host is recognised. */
export declare const LEGACY_COMPUTERS_LABEL = "containers";
/**
 * Both spellings of a computers domain, canonical first. The label is swapped only when it is the
 * leading label, so the match that uses these lists stays an exact suffix match:
 *   computersDomainFamilies('computers.custom.com') -> ['computers.custom.com', 'containers.custom.com']
 *   computersDomainFamilies('containers.custom.com') -> ['computers.custom.com', 'containers.custom.com']
 * A domain that carries neither label (localhost, an IP literal, a custom host) is returned alone.
 */
export declare function computersDomainFamilies(domain: string): string[];
/** True when `host` is one of the two spellings of the computers domain, or a host under one of them (exact suffix, never "any subdomain"). */
export declare function isComputersHost(host: string, domain: string): boolean;
/**
 * True when no subdomain can be put in front of the domain: a bracketed IPv6 literal, or a last label the URL parser
 * reads as an IPv4 number (decimal or 0x), so `server.127.0.0.1` is parsed as an address and no resolver takes it.
 */
export declare function isIpDomain(domain: string): boolean;
/** `localhost` and `*.localhost`: names a resolver sends to the loopback address, so a kit host can sit under them. */
export declare function isLocalhostDomain(domain: string): boolean;
/**
 * The computers domain for an API base URL. This is the one derivation: the SDK client, the CLI client, the embeds
 * runtime, the kitAuth middleware and local-exit all call it.
 *
 * Ordered branches: an IPv4 or IPv6 literal and bare `localhost` are kept as the host (there is no
 * DNS suffix to transform; localhost still resolves a kit host under it, an IP address cannot); `computers.*` and
 * the earlier `containers.*` are kept; a 24-hex realm label before `.api.` is replaced; `api.` becomes `computers.`;
 * the first `.api.` becomes `.computers.` (so `api.localhost` gives `computers.localhost`); a `*.localhost` name
 * without an api label is kept (`dev.localhost`); otherwise `computers.` is prepended. An empty or unparseable
 * base URL gives `computers.hoody.com`.
 *
 * An IP address base has no kit host: use requireDnsComputersDomain() where a kit host is about to be built.
 */
export declare function computersDomainFor(baseURL: string | undefined): string;
/** Why an IP address base URL cannot reach a computer; shared by the SDK, the CLI and the generated services. */
export declare const IP_BASE_URL_MESSAGE: string;
/**
 * computersDomainFor(), refused when the result is an IP address. Call it where a kit host is about to be built; an
 * account-only client on an IP base URL never gets here, so it keeps working.
 */
export declare function requireDnsComputersDomain(baseURL: string | undefined): string;
/**
 * Derive a sibling domain from a base URL by replacing the 'api' subdomain.
 *
 * Examples:
 *   deriveSiblingDomain('https://api.custom.com', 'computers') -> 'computers.custom.com'
 *   deriveSiblingDomain('https://abc123.api.custom.com', 'ip') -> 'ip.custom.com'
 *   deriveSiblingDomain('https://backend.custom.com', 'computers') -> 'computers.backend.custom.com'
 *
 * @param baseURL - The configured API base URL
 * @param sibling - The sibling subdomain prefix (e.g., 'computers', 'ip')
 * @returns The derived sibling domain (hostname only, no protocol)
 */
export declare function deriveSiblingDomain(baseURL: string, sibling: string): string;
