// What the shell shows about the signed-in context: realms, computers, the account. AppShell mounts
// <LiveShellData> (live.tsx), which fills this from core; without a provider the shell shows an empty,
// non-switchable context (never fixture data).
// Ids here are opaque handles: the shell never shows a whole one (a realm missing from the list shows core's short id,
// shownRealmName in realmName.ts). This file stays react-only: @kit/hooks exports useShellData from it, and the hooks
// closure takes no core (kit/entries.closure.test.ts).
import { createContext, type ReactNode, useContext } from 'react';

export type RealmColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export interface ShellRealm {
  id: string;
  name: string;
  color?: RealmColor;
  /** Computers in this realm, from the realm list's usage; null or absent while unknown, which
   *  shows nothing (an unknown count never reads as 0). */
  computers?: number | null;
}

export interface ShellComputer {
  id: string;
  name: string;
  /** Location line, e.g. "Singapore · sg-2". */
  location?: string;
  /** Regional indicator flag emoji, e.g. "🇸🇬". */
  flag?: string;
  running?: boolean;
  /** The computer's own colour as `#RRGGBB` (core computerColor), or none when it has no valid one. */
  color?: string;
}

export interface ShellData {
  realms: readonly ShellRealm[];
  /** Current realm id, or 'all'. */
  realmId: string;
  setRealm?: (id: string) => void;
  /** Tries to read the realm list again (its computer counts too): the realm menu and the phone sheet call it as they
   *  open, so counts follow a computer rented or deleted since. Fire and forget: a failed read keeps the counts shown,
   *  and an open while a read for the same context runs adds no request. */
  refreshRealms?: () => void;
  /** A realm switch core is running (it checks the realm before it switches): the realm it goes to, or 'all'. */
  switchingTo?: string;
  computers: readonly ShellComputer[];
  /** The realm's computer list is not known yet: `'loading'` before it answers (or while Try again reads it),
   *  `'unknown'` when the read failed or an empty page of a longer list answered. Absent once rows came or a whole
   *  list answered zero: only then is an empty `computers` "none" (an unknown list never reads as none). */
  computersRead?: 'loading' | 'unknown';
  /** Reads the computer list again (the person's Try again; nothing retries on its own). Its promise settles when that
   *  read ends, so a caller knows its own attempt is over even when no loading render came between. */
  retryComputers?: () => Promise<unknown> | void;
  computerId?: string;
  setComputer?: (id: string) => void;
  /** Show no computer ("All computers"): pages that list across computers show them all, the others ask for a pick. */
  clearComputer?: () => void;
  account?: { name: string; detail?: string };
  /** The only sign-out path (core wraps clearAuthTokens). */
  signOut?: () => void;
  /** Unread notification count for the bell. */
  unread?: number;
  /** The server stopped counting (summary is_capped): the count shows as "N+". */
  unreadCapped?: boolean;
  /** Bots waiting for the user: the sidebar badge and the phone bar's Bots dot. */
  botsWaiting?: number;
  /** botsWaiting is only a lower bound (a computer past the first page, or one whose Bots read failed, may hold more):
   *  the badge shows "N+" and says "at least N". */
  botsWaitingAtLeast?: boolean;
}

const EMPTY: ShellData = { realms: [], realmId: 'all', computers: [] };

const Ctx = createContext<ShellData | null>(null);

export function ShellDataProvider({ value, children }: { value: ShellData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellData(): ShellData {
  return useContext(Ctx) ?? EMPTY;
}

/** A shell around this render (its top bar's computer list). A page drawn without one (alone in a test) has no list to
 *  speak for, so it never says "no computers". */
export function useInShell(): boolean {
  return useContext(Ctx) !== null;
}

/** Where a running realm switch goes: its row (none for All realms) and its name. `name` is null for a realm the
 *  shell has no row for (the switching words never show an id, not even a short one). Null without a switch. */
export function switchTarget(d: ShellData, allName: string): { realm?: ShellRealm; name: string | null } | null {
  if (d.switchingTo === undefined) return null;
  if (d.switchingTo === 'all') return { name: allName };
  const realm = d.realms.find((r) => r.id === d.switchingTo);
  return { realm, name: realm?.name ?? null };
}

/** A badge count, one format everywhere (bell, sidebar, Inbox tab): over 99 or capped shows "99+" / "N+". */
export function countText(n: number, capped = false): string {
  return capped || n > 99 ? `${Math.min(n, 99)}+` : String(n);
}

/** Up to two initials for the account avatar ("Ada Lovelace" → "AL"); "?" without a name. */
export function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const out = parts.slice(0, 2).map((p) => Array.from(p)[0] ?? '').join('').toUpperCase();
  return out || '?';
}
