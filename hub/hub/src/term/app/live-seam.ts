// What a live mount checks of the host's client before anything is sent:
// the API origin and the two domains, once at boot, and each wire attempt against what was admitted.
// Pure functions: the live boot and the send policy call them; nothing here sends or stores.
import type { WireAttempt } from '../host-types';

export class SeamRefusal extends Error {
  constructor(readonly code: 'TERM_API_ORIGIN' | 'TERM_PROXY_DOMAIN' | 'TERM_REALM_DOMAIN') { super(code); this.name = 'SeamRefusal'; }
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const bareHost = (v: unknown): v is string => typeof v === 'string' && v.length <= 253 && v.split('.').length >= 2 && v.split('.').every((l) => LABEL.test(l)) && !/^[0-9.]+$/.test(v);
const LOOPBACK = /^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/;

/**
 * The API origin, normalised (`https://host[:port]`), or a SeamRefusal TERM_API_ORIGIN. https only, except http to a
 * loopback address when `loopbackHttp` is set (tests); no user info, path, query or fragment; a lower-case host name
 * as given (no other spelling is accepted); the default port dropped.
 */
export function apiOriginOf(v: unknown, o: { loopbackHttp?: boolean } = {}): string {
  const no = (): never => { throw new SeamRefusal('TERM_API_ORIGIN'); };
  if (typeof v !== 'string' || v.length > 300 || /[\s\\@?#]/.test(v) || v !== v.trim()) return no();
  const m = /^(https?):\/\/([^/:]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?\/?$/.exec(v);
  if (!m) return no();
  const [, scheme, host, port] = m as unknown as [string, string, string, string | undefined];
  const loop = LOOPBACK.test(host);
  if (scheme === 'http' ? !(loop && o.loopbackHttp === true) : !(loop || bareHost(host))) return no();
  const n = port === undefined ? null : Number(port);
  if (n !== null && (n < 1 || n > 65535 || String(n) !== port)) return no();
  const dflt = scheme === 'https' ? 443 : 80;
  return `${scheme}://${host}${n === null || n === dflt ? '' : `:${n}`}`;
}

/** A bare host name (lower case, at least two labels, no scheme, port, path or address literal), or a SeamRefusal of `code`. */
export function domainOf(v: unknown, code: 'TERM_PROXY_DOMAIN' | 'TERM_REALM_DOMAIN'): string {
  if (!bareHost(v)) throw new SeamRefusal(code);
  return v;
}

/** The client's three places, checked together: what a live boot keeps for the life of the mount. */
export function seamPlaces(client: { apiOrigin?: unknown; realmApiDomain?: unknown; proxyDomain?: unknown }, o: { loopbackHttp?: boolean } = {}): { apiOrigin: string; realmApiDomain: string; proxyDomain: string | null } {
  const apiOrigin = apiOriginOf(client.apiOrigin, o);
  const realmApiDomain = domainOf(client.realmApiDomain, 'TERM_REALM_DOMAIN');
  const proxyDomain = client.proxyDomain === undefined ? null : domainOf(client.proxyDomain, 'TERM_PROXY_DOMAIN');
  const apiHost = apiOrigin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  // A computer address must never be the API, sit under the API host, or sit under the realm API domain (admission row 3).
  const under = (h: string, d: string): boolean => h === d || h.endsWith('.' + d);
  if (proxyDomain !== null && (under(apiHost, proxyDomain) || under(proxyDomain, apiHost) || under(proxyDomain, realmApiDomain) || under(realmApiDomain, proxyDomain))) throw new SeamRefusal('TERM_PROXY_DOMAIN');
  return { apiOrigin, realmApiDomain, proxyDomain };
}

/** What was admitted for one send (the part of the Admission a wire attempt is compared with). */
export interface AdmittedSend {
  readonly method: string;
  readonly url: string;
  readonly bodyDigest: string | null;
  /** Kit and agent sends: the final headers, [lower-case name, sha256 of the value], any order. Absent on the Hoody leg (the client adds its own there). */
  readonly headers?: ReadonlyArray<readonly [string, string]>;
}
export type AttemptVerdict = 'ok' | 'TERM_POLICY_BYPASS';
const sameHeaders = (a: ReadonlyArray<readonly [string, string]>, b: ReadonlyArray<readonly [string, string]>): boolean => {
  const key = (h: ReadonlyArray<readonly [string, string]>): string => h.map(([n, d]) => `${n}\0${d}`).sort().join('\n');
  return a.length === b.length && new Set(a.map(([n]) => n)).size === a.length && key(a) === key(b);
};
/** One attempt against its admission: the same method, URL and body; on a computer leg the same final headers and no cookie. A missing attempt is a bypass. */
export function attemptVerdict(admitted: AdmittedSend, attempt: WireAttempt | undefined): AttemptVerdict {
  if (!attempt || typeof attempt !== 'object') return 'TERM_POLICY_BYPASS';
  if (attempt.method !== admitted.method || attempt.url !== admitted.url || attempt.bodyDigest !== admitted.bodyDigest) return 'TERM_POLICY_BYPASS';
  if (admitted.headers !== undefined) {
    if (attempt.cookie !== false || !Array.isArray(attempt.headers) || !sameHeaders(admitted.headers, attempt.headers as ReadonlyArray<readonly [string, string]>)) return 'TERM_POLICY_BYPASS';
  }
  return 'ok';
}
/**
 * The `beforeWire` a bound send hands the client: `live()` first (the mount's own gate), then the attempt against
 * the admission. A refusal is reported once through `onBypass` (a code, never a value) and the client sends nothing.
 */
export function boundBeforeWire(admitted: AdmittedSend, live: () => boolean, onBypass: (code: 'TERM_POLICY_BYPASS') => void): (attempt?: WireAttempt) => boolean {
  return (attempt) => {
    if (!live()) return false;
    const v = attemptVerdict(admitted, attempt);
    if (v !== 'ok') { onBypass(v); return false; }
    return true;
  };
}
