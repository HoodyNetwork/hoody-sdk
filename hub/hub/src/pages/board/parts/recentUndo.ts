// Recent > Clear's Undo, bound to where the list was cleared. The Recent list is one realm's and one account's, and a
// Boards write lands under whatever the page shows when it runs (data.ts apply): an Undo pressed after a realm,
// account or Forget switch would put the cleared realm's entries (computer and project ids) into another list. So the
// Clear takes its scope, and the Undo asks it at the press. The Board's own Clear checks the same three inline
// (BoardView.tsx onRecent.clear).
import { accountForgets, alive, capture } from '@core';

/** Takes the scope shown now (core's context and the account's Forget count). The answer, asked later: whether that
 *  scope is still the one shown: the same live session and account, the same realm, no Forget since. core's setRealm
 *  does not move the generation, so the realm is compared itself. */
export function recentScope(): () => boolean {
  const owner = capture();
  const forgets = accountForgets();
  return () => alive(owner) && capture().realm === owner.realm && accountForgets() === forgets;
}
