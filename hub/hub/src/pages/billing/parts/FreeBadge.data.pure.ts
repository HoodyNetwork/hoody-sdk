// The Free badge's shared part (split out of FreeBadge.data.ts so the terminal build can share it): its reads, its own
// store and every hook that touches no browser global. FreeBadge.data.ts re-exports the public names and keeps
// useFreeVerdict (window/document listeners). The privates exported here (source, store, subscribe, version, cutoff,
// pendingNow, syncPending) are for FreeBadge.data.ts only: one instance each, never copied.
import { useEffect, useState } from 'react';
import { capture, commerce, commerceRules, coreSource, defineRoute, useCan, type SourceTable } from '@core';
import { freeNetworkMbps } from './FreeBadge.logic';

const routes = {
  servers: defineRoute({ method: 'GET', path: '/servers', scope: 'base' }),
  subs: defineRoute({ method: 'GET', path: '/subserver-subscriptions', scope: 'base', query: ['limit', 'offset'] }),
} as const;

// The badge must not outlive a purchase. Its answers count only while they are fresh (FRESH_MS) and were read after the
// last cutoff: a purchase of this browser starting or ending (billing's checkout reports it through usePurchaseActivity),
// a retained purchase of core's being cleared (see pendingNow), and the window or tab being shown again (a purchase may
// have been made elsewhere). While a purchase of this browser is in flight or unresolved, also one whose checkout was
// closed or whose recovery runs outside it, the badge stays off. A cutoff also moves the reads to a new key, so an
// answer to a request sent before it (also a first read still out) lands on a key nobody reads. The lists are re-read
// every two minutes. A purchase made on another device shows at the next read at the latest.
const table: SourceTable = {
  reads: {
    freeServers: { route: routes.servers, select: (raw) => raw, refetchMs: 120_000 },
    freeSubs: { route: routes.subs, input: () => ({ query: { limit: 200, offset: 0 } }), select: (raw) => raw, refetchMs: 120_000 },
  },
  changes: {},
};

export const source = coreSource('billing', table);

// The badge's own small store: the purchases in flight (one token per open checkout) and the last cutoff.
export const store = { busy: new Set<symbol>(), cutoff: 0, version: 0, hadPending: false, listeners: new Set<() => void>() };
function emit(): void {
  store.version += 1;
  for (const l of [...store.listeners]) l();
}
export const subscribe = (l: () => void): (() => void) => {
  store.listeners.add(l);
  return () => {
    store.listeners.delete(l);
  };
};
export const version = (): number => store.version;
// Strictly increasing, so two cutoffs in one millisecond are still two (the reads' key follows it).
export function cutoff(): void {
  store.cutoff = Math.max(Date.now(), store.cutoff + 1);
  emit();
}

/**
 * A purchase of this person that may still happen or may have happened: core's retained buy/pay attempts, upgrades,
 * reservation intents and rent markers (the set billing's unresolved band lists). It outlives the checkout drawer.
 * Going from some to none is a cutoff, whoever cleared it (the drawer, a recovery check, another tab).
 */
export function pendingNow(): boolean {
  const ctx = capture();
  const own = commerce.shownOwner(ctx)?.owner ?? null;
  if (!own) return false;
  return (
    commerceRules.readPendingAll().some((e) => e.user_id === own) ||
    commerce.pendingUpgrades(own).length > 0 ||
    commerce.marketPendingFor(ctx).length > 0 ||
    commerce.rentPendingFor(ctx).length > 0
  );
}
export function syncPending(): boolean {
  const now = pendingNow();
  if (store.hadPending && !now) {
    store.hadPending = false;
    cutoff();
  } else store.hadPending = now;
  return now;
}

/**
 * A retained purchase may have changed (billing: a recovery check ended, an attempt was cleared; core: a rent marker;
 * another tab). Always a cutoff: the change may have come and gone between two looks, so nothing here depends on
 * having seen the purchase pending.
 */
export function purchaseStoresChanged(): void {
  store.hadPending = pendingNow();
  cutoff();
}

/** Billing's checkout says whether a purchase of this browser is in flight or unresolved (sending, reading back, unknown). Ending (also unmounting) is a cutoff: the older answers no longer count. */
export function usePurchaseActivity(active: boolean): void {
  const [token] = useState(() => Symbol('purchase'));
  useEffect(() => {
    if (!active) return undefined;
    store.busy.add(token);
    emit();
    return () => {
      store.busy.delete(token);
      cutoff();
    };
  }, [active, token]);
}

/**
 * The free server's network cap (FreeBadge.logic freeNetworkMbps) from the verdict's own GET /servers read, same key;
 * null while it is not read. The card shows it only where the verdict is 'free', so it carries the verdict's freshness.
 */
export function useFreeNetworkMbps(): number | null {
  const account = useCan('account');
  const q = source.useQuery<unknown, { g: number }>('freeServers', { g: store.cutoff }, { enabled: account });
  return account && q.isSuccess ? freeNetworkMbps(q.data) : null;
}

/** Tests only: how many purchases of this browser are out, and when the badge's answers were last cut off. */
export const freeBadgeStateForTests = (): { busy: number; cutoff: number } => ({ busy: store.busy.size, cutoff: store.cutoff });

/** Tests only. */
export function resetFreeBadgeForTests(): void {
  store.busy.clear();
  store.cutoff = 0;
  store.version = 0;
  store.hadPending = false;
}
