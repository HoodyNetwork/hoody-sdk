// The one upsell piece: a small link to where a resource can be had in a bigger size, used the same way wherever the
// Hub shows a resource or a limit; a page never builds its own. It shows only where that upgrade exists and this
// session can buy it, never more than once per card (`UpgradeScope`), and it gets more visible only near a limit.
// The visible text is the whole accessible name; no icon-only form, no tooltip carrying the name.
import { createContext, useContext, useId, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { commerce, isFramed, useCan } from '@core';
import { usePageLink } from '../../shell/pageLinks';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { LinkButton } from './Button';
import { Link } from './Link';
import s from './UpgradeLink.module.css';

/**
 * `quiet` (default): a nav link ("Get more room") with an up arrow; blue, as every go link.
 * `near`: a small secondary link button with a warn dot, "Running low: Get more room" (from `UPGRADE_NEAR_PCT`).
 * `full`: the same with a danger dot, "Full: Get more room".
 */
export type UpgradeProminence = 'quiet' | 'near' | 'full';
/** Where the bigger size comes from: a plan step (billing), a Market listing (a bigger machine, a new server), or
 *  nowhere (the piece renders nothing). */
export type UpgradeAvailable = 'plan' | 'market' | 'none';

/** The share used (0-100) at which the piece turns `near`: the kit Meter's warn line (Widgets.tsx), so the link and the
 *  bar beside it change together. */
export const UPGRADE_NEAR_PCT = 75;

/** The piece's prominence for a share used (0-100; missing or not a number reads as quiet) and whether the resource is
 *  full. Full wins; a share at or above UPGRADE_NEAR_PCT is near; anything else is quiet. */
export function upgradeProminence(pct?: number | null, full?: boolean): UpgradeProminence {
  if (full) return 'full';
  if (typeof pct === 'number' && Number.isFinite(pct) && pct >= UPGRADE_NEAR_PCT) return 'near';
  return 'quiet';
}

/** The permission each destination needs (core/routePerms.ts): a plan step is a purchase, a Market machine a rental. */
const LEAF: Record<Exclude<UpgradeAvailable, 'none'>, string> = {
  plan: 'financial.subscriptions.purchase',
  market: 'financial.server_rental.rent_servers',
};
const PAGE: Record<Exclude<UpgradeAvailable, 'none'>, string> = { plan: 'billing', market: 'market' };

/** May this session follow an upgrade to `available`? Only when that page is served in this load, the session holds the
 *  permission (always in an account session; in a token session only if granted), the page is not framed (a framed page
 *  refuses every change, core/api.ts) and the account is not marked banned by the Market. */
export function useCanUpgrade(available: UpgradeAvailable): boolean {
  const target = available === 'none' ? null : available;
  const link = usePageLink(target ? PAGE[target] : '');
  const allowed = useCan(target ? LEAF[target] : LEAF.plan);
  // The latch is set by a refused Market call at any time: read it as a store so a ban hides the piece at once.
  const banned = useSyncExternalStore(commerce.subscribeMarketBanned, commerce.marketBanned);
  return target !== null && link !== null && allowed && !isFramed() && !banned;
}

// One per card. Each scope is a small store: the owner (the piece drawn) and the pieces waiting, in claim order. A
// piece claims only once it may draw, in a layout effect (render only reads the store, so an abandoned or repeated render
// changes nothing); its cleanup releases, and the next waiting piece becomes the owner at once. So a scope with an
// eligible piece settles to exactly one drawn before paint, and StrictMode's cleanup + setup ends with one owner again.
interface ScopeStore {
  claim(id: string): void;
  release(id: string): void;
  owner(): string | null;
  subscribe(fn: () => void): () => void;
}

function scopeStore(): ScopeStore {
  let owner: string | null = null;
  const waiting: string[] = [];
  const listeners = new Set<() => void>();
  let warned = false;
  const changed = () => { for (const l of [...listeners]) l(); };
  return {
    claim(id) {
      if (owner === id || waiting.includes(id)) return;
      if (owner === null) { owner = id; changed(); return; }
      waiting.push(id);
      if (import.meta.env.DEV && !warned) {
        warned = true;
        console.error('hub UpgradeLink: a second upgrade piece in one UpgradeScope is not drawn (one per card)');
      }
    },
    release(id) {
      const i = waiting.indexOf(id);
      if (i >= 0) waiting.splice(i, 1);
      if (owner !== id) return;
      owner = waiting.shift() ?? null;
      changed();
    },
    owner: () => owner,
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

const ScopeContext = createContext<ScopeStore | null>(null);
const noSubscribe = () => () => {};
const noOwner = () => null;

/** Wraps a card or panel: at most one UpgradeLink inside it is drawn, the first that could draw; when it goes, the next
 *  one waiting takes its place. */
export function UpgradeScope({ children }: { children: ReactNode }) {
  const [store] = useState(scopeStore);
  return <ScopeContext.Provider value={store}>{children}</ScopeContext.Provider>;
}

export interface UpgradeLinkProps {
  /** Where the bigger size comes from; 'none' renders nothing. */
  available: UpgradeAvailable;
  /** The place inside that page ('/billing#plans', '/market?sel=…'). */
  href: string;
  /** The page's own words for what it gets ("Get more room", "Get more AI"). */
  label: string;
  /** quiet (default), near or full: from `upgradeProminence`. */
  prominence?: UpgradeProminence;
  className?: string;
}

/** The upgrade link of one resource or limit; nothing when this session cannot follow it or its card already shows one. */
export function UpgradeLink({ available, href, label, prominence = 'quiet', className }: UpgradeLinkProps) {
  const t = useStrings(kitStrings);
  const can = useCanUpgrade(available);
  const id = useId();
  const scope = useContext(ScopeContext);
  // Only a piece that may draw claims, so a hidden first one never blocks a drawable second one.
  useLayoutEffect(() => {
    if (!scope || !can) return undefined;
    scope.claim(id);
    return () => scope.release(id);
  }, [scope, can, id]);
  const owner = useSyncExternalStore(scope ? scope.subscribe : noSubscribe, scope ? scope.owner : noOwner);
  if (!can || (scope && owner !== id)) return null;
  if (prominence === 'quiet') {
    return (
      <Link href={href} variant="nav" iconEnd="arrow-up" className={className} data-upgrade="quiet">
        {label}
      </Link>
    );
  }
  return (
    <LinkButton href={href} size="sm" variant="secondary" chip={false} className={className} data-upgrade={prominence}>
      <span className={prominence === 'full' ? s.dotFull : s.dotNear} aria-hidden="true" data-upgrade-dot="" />
      {t(prominence === 'full' ? 'upgrade.full' : 'upgrade.near', { label })}
    </LinkButton>
  );
}
