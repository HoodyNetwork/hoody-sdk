// ipv4.ts: the IPv4 allow list rules shared by Keys (API tokens) and Bots (public access), and the "my address"
// read both offer as "Add my address".
//
// Contract, in plain words:
//   - ipv4Problem(entry): null for a canonical IPv4 address or IPv4 CIDR /0-/32 whose host bits are zero; else
//     the reason ('ipv6', 'bad_ip', 'bad_prefix', 'host_bits'). An entry is rejected, never repaired.
//   - parseAllowlist(text): splits on spaces, commas and new lines; empty input means "no restriction". Valid
//     entries once each, in typed order; every rejected entry with its reason; tooMany past ALLOWLIST_MAX.
//   - appendIp(text, ip): adds an address unless it is already listed. Every typed part is kept (a rejected one
//     included: the person fixes it, nothing is dropped behind their back).
//   - privateV4(ip): a private, loopback, link-local or shared (CGNAT) IPv4 address, which is no use in an allow
//     list (the page warns before adding it). Only those common ranges, for a warning: the API's own check is
//     wider and stays the authority (what it refuses, it refuses on save).
//   - myIpRoute: GET /ip on this page's Hoody API (base only): the address the service sees.
//   - geoLookupIp(raw): the canonical public IPv4 an address can be looked up under, else null. It follows the API's
//     own geo rule exactly: surrounding spaces trimmed, an
//     IPv4-mapped IPv6 (::ffff:a.b.c.d) collapsed to its dotted quad, every other IPv6, a host:port and a CIDR
//     refused, octets plain decimal with no leading zero, then the non-public ranges refused (0/8, 10/8, 100.64/10,
//     127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24,
//     203.0.113/24 and 224/3). The API refuses a whole lookup that holds one ineligible entry, so nothing that fails
//     here is ever sent. Not the allow list's privateV4, which only warns and keeps its own narrower list.
//   - ipLookupRoute: GET /ip/lookup (base only, signed in): the country and network the platform already holds for up
//     to IP_LOOKUP_MAX public IPv4 addresses, answered per address, null where it holds none; it never asks a
//     provider. An ineligible entry or more than the maximum fails the whole call with 400.
import { defineRoute } from './routes';

export type IpProblemCode = 'ipv6' | 'bad_ip' | 'bad_prefix' | 'host_bits';

/** One allowlist entry: canonical IPv4 or IPv4 CIDR /0-/32 with zero host bits. Rejected, never repaired. */
export function ipv4Problem(raw: string): IpProblemCode | null {
  if (raw.includes(':')) return 'ipv6';
  const slash = raw.indexOf('/');
  const addr = slash === -1 ? raw : raw.slice(0, slash);
  const octets = addr.split('.');
  if (octets.length !== 4) return 'bad_ip';
  let n = 0;
  for (const o of octets) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(o) || Number(o) > 255) return 'bad_ip';
    n = n * 256 + Number(o);
  }
  if (slash !== -1) {
    const p = raw.slice(slash + 1);
    if (!/^(0|[1-9][0-9]?)$/.test(p) || Number(p) > 32) return 'bad_prefix';
    if (n % 2 ** (32 - Number(p)) !== 0) return 'host_bits';
  }
  return null;
}

export const ALLOWLIST_MAX = 32;

export interface ParsedAllowlist {
  entries: string[];
  errors: Array<{ entry: string; code: IpProblemCode }>;
  tooMany: boolean;
}

const parts = (text: string): string[] => String(text ?? '').split(/[\s,]+/).filter((p) => p !== '');

/** Splits a typed list on spaces, commas and new lines; empty input means "no restriction". */
export function parseAllowlist(text: string, max: number = ALLOWLIST_MAX): ParsedAllowlist {
  const entries: string[] = [];
  const errors: ParsedAllowlist['errors'] = [];
  const seen = new Set<string>();
  for (const part of parts(text)) {
    const code = ipv4Problem(part);
    if (code) errors.push({ entry: part, code });
    else if (!seen.has(part)) {
      seen.add(part);
      entries.push(part);
    }
  }
  return { entries, errors, tooMany: entries.length > max };
}

/** Adds an address to a typed list unless it is there already; every typed part is kept. */
export function appendIp(text: string, ip: string): string {
  const have = parts(text);
  if (have.includes(ip)) return text;
  return [...have, ip].join(', ');
}

/** A private, loopback, link-local or shared IPv4 address (the common ranges only; a warning, not the API's check). */
export function privateV4(ip: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** GET /ip (base only): the address this page's Hoody API sees. */
export const myIpRoute = defineRoute<{ data?: { ip?: string } }>({ method: 'GET', path: '/ip', scope: 'base', baseOnly: true });

/** The most addresses one GET /ip/lookup carries (the API counts raw entries, duplicates included). */
export const IP_LOOKUP_MAX = 25;

/** The canonical dotted quad a public IPv4 can be looked up under (the API's own geo rule), else null. */
export function geoLookupIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let ip = raw.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1] as string;
  if (ip.includes(':')) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const o: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part) || (part.length > 1 && part.startsWith('0'))) return null;
    const v = Number.parseInt(part, 10);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    o.push(v);
  }
  const [a, b, c] = o as [number, number, number];
  const reserved = a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
  return reserved ? null : parts.join('.');
}

/** GET /ip/lookup (base only, signed in): per address, what the platform already holds (country, network) or null. */
export const ipLookupRoute = defineRoute<{ data?: unknown }>({ method: 'GET', path: '/ip/lookup', scope: 'base', baseOnly: true, query: ['ip'] });
