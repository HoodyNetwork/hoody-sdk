// Which keys the Home Shortcuts card shows (shared by the web card and the terminal one, ShortcutsCard.term.tsx).
import type { ShortcutRow, useShortcuts } from '@kit';

/** The card is a hint, the sheet is the list: the first three keys that work everywhere, and one jump. "/" searches
 *  a page's list, and Home has none, so it is left out here. */
export function pickShortcuts(groups: ReturnType<typeof useShortcuts>): ShortcutRow[] {
  const everywhere = groups.find((g) => g.id === 'everywhere')?.rows.filter((r) => r.keys.join(' ') !== '/').slice(0, 3) ?? [];
  // The first jump that is not to Home itself (Home is where this card is).
  const jump = groups.find((g) => g.id === 'go')?.rows.find((r) => r.keys.join(' ') !== 'g h');
  return jump ? [...everywhere, jump] : everywhere;
}
