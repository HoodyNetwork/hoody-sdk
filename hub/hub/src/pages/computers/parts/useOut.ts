// Leaving for another page: through that page's own links.ts and the shell's link. A page this load does not
// serve has no link (no classic Hub to fall back to): its control checks `has` and is left out.
import { isFramed, useCan } from '@core';
import { followPageLink, useGo, usePageLink, type PageLink } from '@kit';
import { links as billing } from '../../billing/links';
import { links as guide } from '../../guide/links';
import { links as keys } from '../../keys/links';
import { links as logs } from '../../logs/links';
import { links as market } from '../../market/links';

/** The exact place (path and query) inside the Hub; nothing for a page this load does not serve. */
function followPagePath(link: PageLink | null, path: string, go: (to: string) => void): void {
  if (!link) return;
  if (link.kind === 'hub') go(path);
  else followPageLink(link, go);
}

export function useOut() {
  const go = useGo();
  const l = {
    billing: usePageLink('billing'),
    guide: usePageLink('guide'),
    keys: usePageLink('keys'),
    logs: usePageLink('logs'),
    market: usePageLink('market'),
  };
  // Buying, upgrading, paying and renewing need the purchase permission (a token may lack it; core/routePerms.ts
  // POST /subserver-subscriptions and its pay/upgrade routes) and an unframed page (a framed one refuses every change,
  // core/api.ts). Without both, the control would open a checkout that is refused, so it is left out.
  const purchase = useCan('financial.subscriptions.purchase') && !isFramed();
  return {
    /** Whether each place has somewhere to go in this load (a button for one with nowhere is left out). `buy`: billing is
     *  served AND this session may purchase there (Upgrade, See plans, Pay now, Renew). */
    has: { market: l.market !== null, billing: l.billing !== null, buy: l.billing !== null && purchase, guide: l.guide !== null, keys: l.keys !== null, logs: l.logs !== null },
    market: () => followPagePath(l.market, market.list, go),
    guide: () => followPagePath(l.guide, guide.guide, go),
    plans: () => followPagePath(l.billing, billing.plans, go),
    billing: () => followPagePath(l.billing, billing.billing, go),
    sshKeys: () => followPagePath(l.keys, keys.ssh, go),
    logsOf: (handle: string) => followPagePath(l.logs, logs.computer(handle), go),
  };
}
