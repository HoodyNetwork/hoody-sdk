// The global shortcut list in the terminal: generated from what the terminal keymap binds (src/term/shell/keymap.ts),
// which binds the same TABLE the web shows, with the terminal's own chord where a web one cannot work (TERM_CHORDS:
// Agent is Alt+J, Ctrl+J being a line feed). A TABLE row the terminal does not bind is left out; the terminal's own
// keys (q, Ctrl+C, Ctrl+Z, Tab) and its limits follow as a group of their own. Mod is Ctrl.
// A g-jump to a page this load hides is left out (the keymap ignores it too).
import { useMemo } from 'react';
import type * as Web from './shortcuts';
import { useStrings } from '@kit/strings';
import { JUMPS } from './keys.pure';
import { usePagesServed } from './pageLinks';
import { TABLE } from './shortcuts.pure';
import strings from './strings.en.json';
import { COMPONENT_GROUPS, SHELL_ROWS, TERM_CHORDS, TERMINAL_ROWS } from '../term/shell/keymap';
import { useSearchFieldPresent } from '../term/prim/searchPresence';
import termStrings from '../term/shell/strings.en.json';

export type { ShortcutRow, ShortcutGroup } from './shortcuts';
export { TABLE } from './shortcuts.pure';

export const useShortcuts: typeof Web.useShortcuts = () => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const served = usePagesServed();
  const hidden = Object.values(JUMPS).filter((id) => !served(id)).join(' ');
  // `/` is listed only while the screen holds a search field (without one the key only says there is none).
  const search = useSearchFieldPresent();
  return useMemo(() => {
    const gone = new Set(hidden.split(' ').filter(Boolean));
    const bound = new Set(SHELL_ROWS.filter((r) => !gone.has(r.jump ?? '')).map((r) => r.msg));
    const shared = TABLE.map((g) => ({
      id: g.id,
      title: t(g.title),
      rows: g.rows
        .filter((r) => (COMPONENT_GROUPS.includes(g.id) || bound.has(r.msg)) && (r.msg !== 'keys.search' || search))
        .map((r) => ({ keys: (TERM_CHORDS[r.msg] ?? r.keys).map((k) => k.replace('Mod', 'Ctrl').replace(' ', '+')), label: t(r.msg) })),
    })).filter((g) => g.rows.length > 0);
    const own = { id: 'terminal', title: tt('keys.group.terminal'), rows: TERMINAL_ROWS.map((r) => ({ keys: r.keys.map((k) => k.replace(' ', '+')), label: tt(r.msg) })) };
    return [...shared, own];
  }, [t, tt, hidden, search]);
};
