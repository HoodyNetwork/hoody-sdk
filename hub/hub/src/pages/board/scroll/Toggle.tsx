// The Layout menu's Scroll entry.
//
// Contract, in plain words:
//   - One entry, "Scroll", a checkbox item (the kit menu's `checked`: aria-checked and a check) on while the Board
//     scrolls. Choosing it asks the Board to switch mode (Fit ⇄ Scroll), with the undo label for that change (the
//     Board's own undo takes it).
import { useStrings, type MenuEntry } from '@kit';
import { parseMode, type BoardMode } from './mode';
import strings from './strings.en.json';

export function useScrollEntry(mode: BoardMode, onMode: (next: BoardMode, undoLabel: string) => void): MenuEntry {
  const t = useStrings(strings);
  const on = parseMode(mode) === 'scroll';
  return {
    id: 'scroll',
    label: t('menu.scroll'),
    checked: on,
    onAction: () => onMode(on ? undefined : 'scroll', t('undo.scroll')),
  };
}
