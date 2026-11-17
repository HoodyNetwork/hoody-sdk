// The Bot link zone of this Hub's platform: a port of the Hoody SDK's botZoneFor (hoody-sdk lib/bot-label.ts) and
// platformDomain (lib/domain-utils.ts).
//
// Contract, in plain words:
//   - botZoneFor and platformDomain give what the SDK's give for the same input. botZone.test.ts compares their
//     bodies with the SDK source where that tree exists, and checks the answers everywhere.
//   - botZoneFor stays the SDK's first-match chain, production first, the second zone written relative to the
//     platform: never a map or a list. Keep the body the same as the SDK's.
//   - zoneOfApiHost gives the zone of the platform an API host belongs to (the page's realm API domain, such as
//     api.<platform>), or '' when the host is empty or its platform has no Bot zone. It never guesses a zone.

/** The production Bot zone. */
export const BOT_URL_ZONE = 'hoody.bot';

/** The platform an API host is assumed to belong to when it names none (the SDK's DEFAULT_PLATFORM_DOMAIN). */
export const DEFAULT_PLATFORM_DOMAIN = 'hoody.com';

const REALM_API_PREFIX = /^[a-f0-9]{24}\.api\./i;

/** The Bot zone of a platform domain, or undefined when the platform has none. */
export function botZoneFor(platform: unknown): string | undefined {
  if (platform === 'hoody.com') return BOT_URL_ZONE;
  if (platform === 'hoody.com') return 'bots.' + platform;
  return undefined;
}

/** The platform domain an API base URL sits under (api.<platform>, <realm>.api.<platform>, ...). */
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

/** The Bot zone of the platform an API host belongs to, or '' (no host, or a platform without a Bot zone). */
export function zoneOfApiHost(host: string): string {
  return host === '' ? '' : (botZoneFor(platformDomain('https://' + host)) ?? '');
}
