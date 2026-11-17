// The legacy /market route: the Market lives under Plans & billing as its Bare metal
// view. An old link lands there with what it pointed at, once and in place of this address (`replace`): a listing
// (sel, days), the reservations (tab=reservations, rsel), and the lists' search, sort, page and filters: the Bare metal
// view's own keys and nothing else. An old hand-off to the plans (#plans or ?plan=) opens the Plans view with its plan,
// why and sub. A Billing this load does not serve: its own link.
import { DetailPage, followPageLink, useGo, useLocationHash, usePageLink, useSearch, useStrings } from '@kit';
import { useEffect, useRef } from 'react';
import { plansKeys, serversKeys } from '../billing/links';
import strings from './strings.en.json';

/** Where an old /market address goes now: built only from the keys the target view reads (plansKeys, serversKeys),
 * so an old link can never open a Billing drawer (sheet, checkout) or carry anything else. */
export function redirectFor(search: Readonly<Record<string, unknown>>, hash: string): string {
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  const plans = hash.endsWith('#plans') || !!str(search.plan);
  const known: readonly string[] = plans ? plansKeys : serversKeys;
  const q = new URLSearchParams({ view: plans ? 'plans' : 'servers' });
  for (const [k, v] of Object.entries(search)) {
    const s = str(v);
    if (!s || !known.includes(k) || (k === 'tab' && s !== 'reservations')) continue;
    q.set(k, s);
  }
  return `/billing?${q.toString()}`;
}

export default function MarketRedirect() {
  const t = useStrings(strings);
  const go = useGo();
  const search = useSearch();
  // The route's anchor in the form redirectFor reads ('#plans'), from the router (no browser location needed).
  const anchor = useLocationHash();
  const link = usePageLink('billing');
  const to = redirectFor(search, anchor ? '#' + anchor : '');
  // Once only: the router may render this route again after the move; a second move from that render would drop
  // what the old link pointed at.
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current || !link) return;
    moved.current = true;
    if (link.kind === 'hub') go(to, { replace: true });
    else followPageLink(link, go);
  }, [go, to, link]);
  // Shown only until the move (or for good when this load serves no Plans & billing): the page's name and where it went.
  return <DetailPage header={{ title: t('title'), subtitle: t('opening') }} />;
}
