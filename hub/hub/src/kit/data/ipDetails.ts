// The GET /api/v1/ip answer read as IpDetails, apart from IpInfo.tsx so @kit/pure can import it: no React, no CSS.

/** What GET /api/v1/ip says about an address (data.ip and data.ip_info). Absent fields are absent. */
export interface IpDetails {
  ip: string;
  version: 4 | 6 | null;
  hostname?: string;
  city?: string;
  region?: string;
  /** ISO 3166-1 alpha-2, capitals. */
  country?: string;
  postal?: string;
  timezone?: string;
  /** "lat,long". */
  loc?: string;
  network?: { asn?: string; name?: string; domain?: string; type?: string };
  anycast?: boolean;
  mobile?: boolean;
  anonymous?: boolean;
  satellite?: boolean;
  hosting?: boolean;
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function versionOf(ip: string): 4 | 6 | null {
  if (ip.includes(':')) return 6;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? 4 : null;
}

/** The details in an answer of GET /api/v1/ip; null when it names no address. */
export function ipDetailsFrom(body: unknown): IpDetails | null {
  const data = rec(rec(body)?.data);
  const ip = str(data?.ip);
  if (!ip) return null;
  const out: IpDetails = { ip, version: versionOf(ip) };
  const info = rec(data?.ip_info);
  if (!info) return out;
  const put = <K extends keyof IpDetails>(k: K, v: IpDetails[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  put('hostname', str(info.hostname));
  put('city', str(info.city));
  put('region', str(info.region));
  const cc = str(info.country);
  put('country', cc && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : undefined);
  put('postal', str(info.postal));
  put('timezone', str(info.timezone));
  put('loc', str(info.loc));
  const asn = rec(info.asn);
  if (asn) {
    const n: NonNullable<IpDetails['network']> = {};
    for (const k of ['asn', 'name', 'domain', 'type'] as const) {
      const v = str(asn[k]);
      if (v) n[k] = v;
    }
    if (Object.keys(n).length) out.network = n;
  }
  put('anycast', bool(info.is_anycast));
  put('mobile', bool(info.is_mobile));
  put('anonymous', bool(info.is_anonymous));
  put('satellite', bool(info.is_satellite));
  put('hosting', bool(info.is_hosting));
  return out;
}
