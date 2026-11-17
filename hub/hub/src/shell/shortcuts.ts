// The shell's global keys as data: the `?` sheet and the Guide's Keyboard section both
// render this one list, so they cannot drift from each other or from keys.ts. 'Mod' is ⌘ on Apple
// platforms and Ctrl elsewhere.
import { useMemo } from 'react';
import { askOn } from '@kit/ask';
import { useStrings } from '@kit/strings';
import { JUMPS } from './keys.pure';
import { usePagesServed } from './pageLinks';
import { TABLE, type Label } from './shortcuts.pure';
import strings from './strings.en.json';
import { IS_MAC } from './TopBar';

export { TABLE } from './shortcuts.pure';

export interface ShortcutRow {
  /** Keys pressed in order (a chord is one entry, e.g. "⌘ K"). */
  keys: readonly string[];
  label: string;
}
export interface ShortcutGroup {
  id: string;
  title: string;
  rows: readonly ShortcutRow[];
}

/**
 * The global shortcut list, translated, with Mod resolved for this platform. Read-only. A g-jump to
 * a page this load hides is left out (keys.ts ignores it too).
 */
export function useShortcuts(): readonly ShortcutGroup[] {
  const t = useStrings(strings);
  const served = usePagesServed();
  const hidden = Object.values(JUMPS).filter((id) => !served(id)).join(' ');
  return useMemo(() => {
    const gone = new Set(hidden.split(' ').filter(Boolean));
    const jump = (keys: readonly string[]) => (keys[0] === 'g' && keys.length === 2 ? JUMPS[keys[1] ?? ''] : undefined);
    const shown = (r: { keys: readonly string[]; msg: Label }) => (askOn() || r.msg !== 'keys.ask') && !gone.has(jump(r.keys) ?? '');
    const mod = IS_MAC ? '⌘' : 'Ctrl';
    return TABLE.map((g) => ({
      id: g.id,
      title: t(g.title),
      rows: g.rows.filter(shown).map((r) => ({ keys: r.keys.map((k) => k.replace('Mod', mod)), label: t(r.msg) })),
    }));
  }, [t, hidden]);
}
