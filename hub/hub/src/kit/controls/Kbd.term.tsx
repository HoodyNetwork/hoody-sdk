// Keyboard hints in the terminal: a key reads as [K]; a combination joins its keys with '+' (Ctrl+K), alternatives with
// a space. A terminal has no ⌘ key to show, so key names are always the spelled-out ones (Ctrl, Alt, Shift, Enter, Esc),
// whatever the platform; isApplePlatform says false here. ariaKeyshortcuts keeps the web's spelling (a value, not text).
import type * as Web from './Kbd';
import { Text } from '../../term/prim';

export type { KbdProps, ShortcutProps } from './Kbd';

const NAMES: Readonly<Record<string, string>> = { mod: 'Ctrl', cmd: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Esc' };
const APPLE: Readonly<Record<string, string>> = { mod: '⌘', cmd: '⌘', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧', enter: '↵', esc: 'Esc' };
const ARIA: Readonly<Record<string, string>> = { ctrl: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Escape', plus: 'Plus' };

/** A terminal is never an Apple keyboard as far as hints go: Mod is the Ctrl key it sends. */
export const isApplePlatform: typeof Web.isApplePlatform = () => false;

export const shortcutKeys: typeof Web.shortcutKeys = (shortcut, apple = false) => {
  const names = apple ? APPLE : NAMES;
  return shortcut
    .split('+')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map((k) => (k.toLowerCase() === 'plus' ? '+' : (names[k.toLowerCase()] ?? k)));
};

/** As text: 'Mod+K' → 'Ctrl+K' (the web joins with a space; here the '+' reads as one combination in mono). */
export const formatShortcut: typeof Web.formatShortcut = (shortcut, apple = false) => shortcutKeys(shortcut, apple).join(apple ? '' : '+');

export const ariaKeyshortcuts: typeof Web.ariaKeyshortcuts = (keys, apple = false) => {
  const combos = typeof keys === 'string' ? [keys] : keys;
  const name = (k: string) => {
    const low = k.toLowerCase();
    if (low === 'mod') return apple ? 'Meta' : 'Control';
    if (low === 'cmd') return 'Meta';
    return ARIA[low] ?? k;
  };
  return combos.map((c) => c.split('+').map((k) => k.trim()).filter((k) => k.length > 0).map(name).join('+')).join(' ');
};

export const Kbd: typeof Web.Kbd = ({ children }) => <Text colour="muted">[{children}]</Text>;

export const Shortcut: typeof Web.Shortcut = ({ keys }) => {
  const combos = typeof keys === 'string' ? [keys] : keys;
  return <Text colour="muted">{combos.map((c) => `[${formatShortcut(c)}]`).join(' ')}</Text>;
};

// Both stay inside a text run (`<p>Press <Kbd>j</Kbd> to move</p>` is one line), as the web's inline elements do.
(Kbd as { hxInline?: boolean }).hxInline = true;
(Shortcut as { hxInline?: boolean }).hxInline = true;
