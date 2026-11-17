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
export const DEFAULT_PLATFORM_DOMAIN = 'hoody.com';

/** The platform sites reached by name under the platform domain. */
export type PlatformService = 'docs' | 'ai' | 'chatbot' | 'ip' | 'os';

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
export function platformDomain(baseURL: string | null | undefined): string {
  if (typeof baseURL !== 'string' || baseURL === '') return DEFAULT_PLATFORM_DOMAIN;
  let host: string;
  try {
    host = new URL(baseURL).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    return DEFAULT_PLATFORM_DOMAIN;
  }
  // Only a DNS name can carry a platform: not an empty host, an IP literal or localhost.
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) return DEFAULT_PLATFORM_DOMAIN;
  if (/^\d+(?:\.\d+){3}$/.test(host) || host === 'localhost' || host.endsWith('.localhost')) return DEFAULT_PLATFORM_DOMAIN;
  if (REALM_API_PREFIX.test(host)) return host.replace(REALM_API_PREFIX, '');
  if (host.startsWith('api.')) return host.slice(4);
  const infix = host.indexOf('.api.');
  if (infix !== -1) return host.slice(infix + 5);
  return host;
}

/** The host of one platform site for an account: platformHost('https://api.example.test', 'docs') -> 'docs.example.test'. */
export function platformHost(baseURL: string | null | undefined, service: PlatformService): string {
  return `${service}.${platformDomain(baseURL)}`;
}

/**
 * The https URL of one platform site for an account, with an optional path:
 * platformUrl('https://api.example.test', 'ai', '/api/v1') -> 'https://ai.example.test/api/v1'.
 */
export function platformUrl(baseURL: string | null | undefined, service: PlatformService, path = ''): string {
  return `https://${platformHost(baseURL, service)}${path}`;
}

/** The host label a computer's kit hosts are emitted under: `{projectId}-{computerId}-{kit}-{n}.{server}.computers.<base host>`. */
export const COMPUTERS_LABEL = 'computers';
/** The label kit hosts lived under before the rename. It still routes, so it is still accepted wherever a kit host is recognised. */
export const LEGACY_COMPUTERS_LABEL = 'containers';

/**
 * Both spellings of a computers domain, canonical first. The label is swapped only when it is the
 * leading label, so the match that uses these lists stays an exact suffix match:
 *   computersDomainFamilies('computers.custom.com') -> ['computers.custom.com', 'containers.custom.com']
 *   computersDomainFamilies('containers.custom.com') -> ['computers.custom.com', 'containers.custom.com']
 * A domain that carries neither label (localhost, an IP literal, a custom host) is returned alone.
 */
export function computersDomainFamilies(domain: string): string[] {
  const d = domain.toLowerCase();
  for (const label of [COMPUTERS_LABEL, LEGACY_COMPUTERS_LABEL]) {
    if (d.startsWith(`${label}.`)) {
      const rest = d.slice(label.length);
      return [`${COMPUTERS_LABEL}${rest}`, `${LEGACY_COMPUTERS_LABEL}${rest}`];
    }
  }
  return [d];
}

/** True when `host` is one of the two spellings of the computers domain, or a host under one of them (exact suffix, never "any subdomain"). */
export function isComputersHost(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  return computersDomainFamilies(domain).some((d) => h === d || h.endsWith('.' + d));
}

/**
 * True when no subdomain can be put in front of the domain: a bracketed IPv6 literal, or a last label the URL parser
 * reads as an IPv4 number (decimal or 0x), so `server.127.0.0.1` is parsed as an address and no resolver takes it.
 */
export function isIpDomain(domain: string): boolean {
  if (domain.startsWith('[') || domain.includes(':')) return true;
  const labels = domain.split('.');
  if (labels.length > 1 && labels[labels.length - 1] === '') labels.pop();
  return /^(?:\d+|0x[0-9a-f]*)$/i.test(labels[labels.length - 1]!);
}

/** `localhost` and `*.localhost`: names a resolver sends to the loopback address, so a kit host can sit under them. */
export function isLocalhostDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return d === 'localhost' || d.endsWith('.localhost');
}

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
export function computersDomainFor(baseURL: string | undefined): string {
  const fallback = `${COMPUTERS_LABEL}.hoody.com`;
  if (baseURL === undefined || baseURL === '') return fallback;
  let host: string;
  try {
    host = new URL(baseURL).hostname;
  } catch {
    return fallback;
  }
  if (!host) return fallback;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.toLowerCase() === 'localhost') return host;
  if (host.startsWith(`${COMPUTERS_LABEL}.`) || host.startsWith(`${LEGACY_COMPUTERS_LABEL}.`)) return host;
  const realm = /^[a-f0-9]{24}\.api\./i;
  if (realm.test(host)) return host.replace(realm, `${COMPUTERS_LABEL}.`);
  if (host.startsWith('api.')) return `${COMPUTERS_LABEL}.${host.slice(4)}`;
  const replaced = host.replace('.api.', `.${COMPUTERS_LABEL}.`);
  if (replaced !== host) return replaced;
  // A `*.localhost` name with no api label is kept (it already resolves a kit host under it); anything else gets the label.
  if (isLocalhostDomain(host)) return host;
  return `${COMPUTERS_LABEL}.${host}`;
}

/** Why an IP address base URL cannot reach a computer; shared by the SDK, the CLI and the generated services. */
export const IP_BASE_URL_MESSAGE =
  "The API base URL is an IP address, so no computer kit host can be built from it (kit hosts are subdomains of the API host). "
  + 'Use a DNS name for the base URL: localhost works for a local API.';

/**
 * computersDomainFor(), refused when the result is an IP address. Call it where a kit host is about to be built; an
 * account-only client on an IP base URL never gets here, so it keeps working.
 */
export function requireDnsComputersDomain(baseURL: string | undefined): string {
  const domain = computersDomainFor(baseURL);
  if (isIpDomain(domain)) throw new Error(IP_BASE_URL_MESSAGE);
  return domain;
}

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
export function deriveSiblingDomain(baseURL: string, sibling: string): string {
  // The computers domain has one derivation (computersDomainFor), shared with the SDK and CLI clients.
  if (sibling === COMPUTERS_LABEL) return computersDomainFor(baseURL);
  try {
    const host = new URL(baseURL).hostname;
    if (!host) return `${sibling}.hoody.com`;

    // Already the target sibling (the computers label also keeps its earlier spelling)
    if (host.startsWith(`${sibling}.`)) return host;
    if (sibling === COMPUTERS_LABEL && host.startsWith(`${LEGACY_COMPUTERS_LABEL}.`)) return host;

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
    if (replaced !== host) return replaced;

    // Guard: localhost and IP literals — don't prepend sibling
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) {
      return `${sibling}.hoody.com`;
    }

    // Catch-all: prepend sibling
    return `${sibling}.${host}`;
  } catch {
    return `${sibling}.hoody.com`;
  }
}
