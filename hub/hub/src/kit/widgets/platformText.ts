// The platform hosts, platformText and cliCommand: the pure half of agentHints.ts (which adds the parts that read the
// page's location and storage). Nothing here may touch location or storage: the `@kit/pure` entry exports from this file.

export interface PlatformHosts {
  /** The platform's own domain: the skill URL and `ssh` use it. */
  root: string;
  api: string;
  install: string;
  sdk: string;
  /** The Hub's short address (it opens the Hub in the browser). */
  hub: string;
}

const COM: PlatformHosts = { root: 'hoody.com', api: 'api.hoody.com', install: 'install.hoody.com', sdk: 'sdk.hoody.com', hub: 'hub.hoody.com' };

/**
 * The proven hosts of a known platform, or undefined for any other domain. A first-match chain with the public platform
 * first, the second platform's hosts written relative to its domain: never a map keyed by domain.
 */
function knownHosts(domain: string): PlatformHosts | undefined {
  if (domain === 'hoody.com') return COM;
  if (domain === 'hoody.com') return { root: domain, api: 'api.' + domain, install: 'install.' + domain, sdk: 'sdk.' + domain, hub: 'hub.' + domain };
  return undefined;
}

const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * The hosts for the page's own host (location.host). A known platform gets its proven hosts; another api.<domain> keeps
 * its own api host (the Hub is talking to it right now) and hoody.com for the rest; anything else is hoody.com.
 */
export function platformHosts(pageHost: string): PlatformHosts {
  const host = pageHost.toLowerCase().replace(/:\d+$/, '');
  const m = /^api\.(.+)$/.exec(host);
  if (!m || !HOST_RE.test(host)) return COM;
  return knownHosts(m[1] ?? '') ?? { ...COM, api: host };
}

const PREFIX: Readonly<Record<string, keyof PlatformHosts>> = { 'api.': 'api', 'install.': 'install', 'sdk.': 'sdk', 'hub.': 'hub' };

/** The API the hoody CLI calls when it is given no --base-url: the npm package hoody-sdk is published once, for
 *  hoody.com. A
 *  platform's own install.<domain> binary defaults to that platform, so the flag a command shows there changes nothing. */
const CLI_DEFAULT_API = 'api.hoody.com';

/** A hoody CLI command for the platform: `--base-url` only when the platform's API is not the CLI's default, so on
 *  hoody.com it reads `hoody login`. The one place a Hub command gets the flag: never write it by hand
 *  (app/conformance.clibaseurl.test.ts fails on a hand-written one). */
export function cliCommand(args: string, hosts: PlatformHosts): string {
  return hosts.api === CLI_DEFAULT_API ? `hoody ${args}` : `hoody --base-url https://${hosts.api} ${args}`;
}

/** A line written for hoody.com, pointed at the platform: hoody.com and its api/install/sdk/hub hosts only (docs, bots and other names
 * untouched). A whole host only: a dot after it ends a sentence, never a longer name such as hoody.com.example. */
export function platformText(text: string, hosts: PlatformHosts): string {
  return text.replace(/(?<![\w.-])(api\.|install\.|sdk\.|hub\.)?hoody\.com(?![\w-]|\.[\w-])/g, (_m, p: string | undefined) => hosts[(p && PREFIX[p]) || 'root']);
}
