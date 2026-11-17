// hosts.ts: the addresses of a computer's ports (buildPortUrl, agentBaseFor).
//
// Contract:
//   - Every port on a computer: https://<project>-<container>-<protocol>-<port>.<server>.<proxy domain>.
//     Empty without a server or a proxy domain. The proxy domain comes from the host env (hostEnv().proxyDomain;
//     web: the page's data-proxy-domain attribute; terminal: none), an unrendered {{placeholder}} counting as none.
//     The standalone Hub has no rendered page, so there it is the domain its chosen Hoody named (origin.ts), and ''
//     until one is chosen. hosts.ts reads no browser global itself (the terminal allows none).
//   - A host label holds 63 characters (RFC 1035). A terminal label that would not fit is named `t-<N>`, the
//     containers proxy's short alias for the terminal kit (the SDK's terminalHostLabel rule).
//   - The computer's agent is its named URL <project>-<container>-agent-1, the only one that starts an idle
//     agent. Every Hub call to the agent uses it.
//   - portAddress is the address a page shows for a port (http unless named). In fixture mode with no proxy
//     domain (a page test that boots no fixture core) it is the same address under hoody.example, so the page
//     still has one to show.
//   - routingNode is the one server name an address takes: the flat server_name, never the subserver's display name
//     server.name (a host the proxy does not serve); a row without it has no address.
//   - maskAddress is how an address shows on screen: the middle of every 24-hex run (the project and computer
//     ids, which grant access) hidden. Copy, Open and the QR code always take the whole address.
import type { Target } from './ctx';
import { hostEnv } from './host-env';

const MAX_HOST_LABEL = 63;
let override: string | null = null;
let source: (() => string | null) | null = null;

/** The page's proxy domain, or ''. */
export function proxyDomain(): string {
  if (override !== null) return override;
  const chosen = source ? source() : null;
  if (chosen !== null) return chosen;
  let raw = '';
  try { raw = hostEnv().proxyDomain || ''; } catch { raw = ''; }
  return /\{\{/.test(raw) ? '' : raw;
}

/** origin.ts: the standalone Hub's proxy domain reader. It answers null on a served page (the page is read) and a
 *  string, possibly '', on the standalone one. Kept as a hook so this file imports nothing at run time. */
export function setProxyDomainSource(read: (() => string | null) | null): void {
  source = read;
}

/** Fixture mode and tests: a fixed proxy domain (null reads the page again). */
export function setProxyDomain(d: string | null): void {
  override = d;
}

/** The protocol part of a port's host label: 't' for a terminal whose long label would pass 63 characters (the SDK's terminalHostLabel rule), else the protocol.
 *  The label measured is `<pid>-<cid>-terminal-<port>` (no server or proxy domain), from the parts as they appear in
 *  it: pass them URI-encoded, as buildPortUrl does. */
export function hostSegment(pid: string, cid: string, protocol: string, port: string): string {
  return protocol === 'terminal' && (pid + '-' + cid + '-terminal-' + port).length > MAX_HOST_LABEL ? 't' : protocol;
}

/**
 * The routing node of a computer row: the flat `server_name` the API sends (the parent routing host, for a computer on a
 * subserver too), or '' when the row has none. It is the only server name an address, a Target or an identity may take.
 * The nested `server.name` is the subserver's own display name, a host the proxy does not serve: never read it for routing.
 */
export function routingNode(row: { readonly server_name?: unknown } | null | undefined): string {
  const n = row?.server_name;
  return typeof n === 'string' ? n : '';
}

export function buildPortUrl(project: Target['project'] | null | undefined, container: Target['container'] | null | undefined, protocol: string, port: number | string): string {
  return portUrlOn(proxyDomain(), project, container, protocol, port);
}

function portUrlOn(d: string, project: Target['project'] | null | undefined, container: Target['container'] | null | undefined, protocol: string, port: number | string): string {
  if (!project || !container || !container.server_name || !d) return '';
  const e = encodeURIComponent;
  const pid = e(project.id), cid = e(container.id), proto = e(String(protocol)), n = e(String(port));
  return 'https://' + pid + '-' + cid + '-' + hostSegment(pid, cid, proto, n) + '-' + n + '.' + e(container.server_name) + '.' + d;
}

export function agentBaseFor(project: Target['project'] | null | undefined, container: Target['container'] | null | undefined): string {
  return buildPortUrl(project, container, 'agent', 1);
}

/**
 * The address a page shows for a port of a computer, or '' while the server or proxy domain is unknown. Fixture builds
 * (__HUB_FIXTURES__) instead fall back to a hoody.example stand-in, so a fixture computer always has an address.
 */
export function portAddress(project: Target['project'] | null | undefined, container: Target['container'] | null | undefined, port: number | string, protocol = 'http'): string {
  const real = buildPortUrl(project, container, protocol, port);
  return real || !__HUB_FIXTURES__ ? real : portUrlOn('hoody.example', project, container, protocol, port);
}

/** An address as it shows on screen: every 24-hex run (any case) as its first and last four characters. */
export function maskAddress(u: string | null | undefined): string {
  return String(u ?? '').replace(/[0-9a-f]{24}/gi, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
}

// The two host families of a computer's programs: `<server>.computers.<realm>` and `<server>.containers.<realm>` are both
// served, so a check against "the proxy domain" has to take both (mirrors the API side).
const FAMILY_LABELS: readonly string[] = ['computers', 'containers'];

/**
 * The domains a configured proxy domain stands for: itself, and the same domain under the sibling family label when its
 * first label is a family label (`computers.example.test` also stands for `containers.example.test`). A domain whose
 * first label is not a family label stands for itself only. Lower case, no trailing dot; '' gives none.
 */
export function familyDomains(configured: string): string[] {
  const d = String(configured || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!d) return [];
  const [first, ...rest] = d.split('.');
  return rest.length > 0 && first !== undefined && FAMILY_LABELS.includes(first) ? FAMILY_LABELS.map((label) => [label, ...rest].join('.')) : [d];
}

/**
 * True when `host` is under the configured proxy domain or its family twin: the exact suffix only, a dot before it
 * (`evilcomputers.x` and `computers.x.evil.org` are never under `computers.x`). Case and a trailing dot are ignored.
 * `strict` leaves the domain itself out (a host must be a subdomain of it).
 */
export function hostUnderFamily(host: string, configured: string, strict = false): boolean {
  const h = String(host || '').toLowerCase().replace(/\.+$/, '');
  if (!h) return false;
  return familyDomains(configured).some((d) => h.endsWith('.' + d) || (!strict && h === d));
}
