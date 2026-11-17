// The shown realm's name (shownRealmName), apart from context.tsx: it needs core's realmLabel, and context.tsx stays
// react-only because @kit/hooks exports useShellData from it (kit/entries.closure.test.ts).
import { realmLabel } from '@core';
import type { ShellData } from './context';

/** The shown realm's name, one rule for every place in the top bar that names it: `allName`
 *  only for the all selection; a listed realm's own name; a selected realm missing from the list (a deferred or failed
 *  list read) by the name core keeps for it (its alias, else its short id), else `thisName`. Never `allName` while
 *  requests stay scoped to one realm, and never another realm's name. */
export function shownRealmName(d: ShellData, allName: string, thisName: string): string {
  if (d.realmId === 'all') return allName;
  const listed = d.realms.find((r) => r.id === d.realmId);
  if (listed) return listed.name;
  const n = realmLabel(d.realmId);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : thisName;
}
