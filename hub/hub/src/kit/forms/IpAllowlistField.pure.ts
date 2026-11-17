// The pure rules of IpAllowlistField (web and terminal): reading the caller's address from a page's query, and what
// "Add my IP" does with the answer. No React, no DOM.
import { appendIp, ipv4Problem, privateV4 } from '@core';
import type { IpDetails } from '../data/IpInfo';

/** readIp from a page's myIp query read on press: null when the refetch failed, also over an earlier answer the query
 *  still holds (a failed read is no address, never the old one). */
export function readIpFrom(q: { refetch: () => Promise<{ isError: boolean; data?: IpDetails | null }> }): () => Promise<IpDetails | null> {
  return async () => {
    const r = await q.refetch();
    return r.isError ? null : (r.data ?? null);
  };
}

/** What an "Add my IP" answer does to the list `cur`: the note to show (an ipf.* string key) and whether the address is
 *  shown. An answer that is neither IPv6 nor one plain IPv4 address is no address: nothing is shown or added. */
export function myIpOutcome(me: IpDetails | null, cur: string): { note: 'failed' | 'v6' | 'private' | 'have' | 'added'; show: boolean } {
  const ip = me?.ip;
  if (!me || !ip) return { note: 'failed', show: false };
  if (me.version !== 6 && (ipv4Problem(ip) !== null || ip.includes('/'))) return { note: 'failed', show: false };
  // The list takes IPv4 only: an IPv6 address is shown, never added (the field would refuse it).
  if (me.version === 6) return { note: 'v6', show: true };
  if (privateV4(ip)) return { note: 'private', show: true };
  if (appendIp(cur, ip) === cur) return { note: 'have', show: true };
  return { note: 'added', show: true };
}

/** The list with `ip` added: in front of what is being typed (focused), else appended; unchanged when it is there. */
export function withMyIp(cur: string, ip: string, focused: boolean): string {
  return appendIp(cur, ip) === cur ? cur : focused ? `${ip}, ${cur}` : appendIp(cur, ip);
}
