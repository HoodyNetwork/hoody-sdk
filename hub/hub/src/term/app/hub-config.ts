// The two domains a live mount needs before it can address anything but the API itself:
// read once by the HOST (the CLI, a launcher) from the public GET /api/v1/hub/config, before the mount, and
// handed to the client as `realmApiDomain` and `proxyDomain`. The live boot checks them again (live-seam.ts
// seamPlaces) and builds every computer address from the proxy domain (core/hosts.ts).
//
//   - Public: no credential is sent (the route reads none). One GET to exactly `<apiOrigin>/api/v1/hub/config`,
//     a redirect never followed, the answer bounded (CONFIG_MAX_BYTES) and given CONFIG_TIMEOUT_MS.
//   - `realm_api_domain` and `proxy_domain` are each a bare host name or null (the platform has none). A value of any
//     other shape, or a proxy domain nested with the API host or the realm API domain, is refused: the caller gets a
//     HubConfigRefusal with a fixed code and mounts nothing.
//   - null stays null: with no proxy domain the mount still runs and no computer address is built; with no realm API
//     domain the host decides (every call then goes to the API origin).
import type { WireRequest } from './cli-client';
import { SeamRefusal, apiOriginOf, domainOf } from './live-seam';

export const CONFIG_TIMEOUT_MS = 15_000;
export const CONFIG_MAX_BYTES = 16_384;

export type HubConfigCode = 'TERM_API_ORIGIN' | 'TERM_REALM_DOMAIN' | 'TERM_PROXY_DOMAIN' | 'HUB_CONFIG_UNREACHABLE' | 'HUB_CONFIG_STATUS' | 'HUB_CONFIG_SHAPE';
export class HubConfigRefusal extends Error {
  constructor(readonly code: HubConfigCode, readonly status = 0) { super(code); this.name = 'HubConfigRefusal'; }
}

export interface HubConfig {
  /** The origin asked, normalised. */
  readonly apiOrigin: string;
  /** A realm is reached at `<realm id>.<realmApiDomain>`; null when the platform has no realm hosts. */
  readonly realmApiDomain: string | null;
  /** Computers are served under it; null when the platform names none (no computer address is built). */
  readonly proxyDomain: string | null;
}

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const under = (h: string, d: string): boolean => h === d || h.endsWith('.' + d);

/** The answer's two domains, checked (see the header). Throws a HubConfigRefusal. */
export function hubConfigOf(apiOrigin: string, answer: unknown): HubConfig {
  const d = isRec(answer) && isRec(answer.data) ? answer.data : null;
  if (!d || !('realm_api_domain' in d) || !('proxy_domain' in d)) throw new HubConfigRefusal('HUB_CONFIG_SHAPE');
  try {
    const realmApiDomain = d.realm_api_domain === null ? null : domainOf(d.realm_api_domain, 'TERM_REALM_DOMAIN');
    const proxyDomain = d.proxy_domain === null ? null : domainOf(d.proxy_domain, 'TERM_PROXY_DOMAIN');
    const apiHost = apiOrigin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    // As seamPlaces: a computer address is never the API, under the API host, or under the realm API domain.
    if (proxyDomain !== null && (under(apiHost, proxyDomain) || under(proxyDomain, apiHost) || (realmApiDomain !== null && (under(proxyDomain, realmApiDomain) || under(realmApiDomain, proxyDomain))))) throw new SeamRefusal('TERM_PROXY_DOMAIN');
    return Object.freeze({ apiOrigin, realmApiDomain, proxyDomain });
  } catch (e) {
    throw e instanceof SeamRefusal ? new HubConfigRefusal(e.code) : e;
  }
}

/** Reads GET /api/v1/hub/config through `wire` (the host's transport: redirects never followed). */
export async function readHubConfig(apiOrigin: string, wire: (req: WireRequest) => Promise<Response>, o: { signal?: AbortSignal; timeoutMs?: number; loopbackHttp?: boolean } = {}): Promise<HubConfig> {
  let origin: string;
  try { origin = apiOriginOf(apiOrigin, o.loopbackHttp ? { loopbackHttp: true } : {}); } catch { throw new HubConfigRefusal('TERM_API_ORIGIN'); }
  const limit = AbortSignal.timeout(o.timeoutMs ?? CONFIG_TIMEOUT_MS);
  const signal = o.signal ? AbortSignal.any([o.signal, limit]) : limit;
  let res: Response;
  let text: string;
  try {
    res = await wire({ method: 'GET', url: origin + '/api/v1/hub/config', headers: { accept: 'application/json' }, body: null, signal, redirect: 'manual' });
    if (res.redirected || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect' || res.status !== 200) {
      try { await res.body?.cancel(); } catch { /* gone */ }
      throw new HubConfigRefusal('HUB_CONFIG_STATUS', res.status);
    }
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > CONFIG_MAX_BYTES) throw new HubConfigRefusal('HUB_CONFIG_SHAPE');
    text = await res.text();
  } catch (e) {
    if (e instanceof HubConfigRefusal) throw e;
    throw new HubConfigRefusal('HUB_CONFIG_UNREACHABLE');
  }
  if (text.length > CONFIG_MAX_BYTES) throw new HubConfigRefusal('HUB_CONFIG_SHAPE');
  let answer: unknown;
  try { answer = JSON.parse(text); } catch { throw new HubConfigRefusal('HUB_CONFIG_SHAPE'); }
  return hubConfigOf(origin, answer);
}
