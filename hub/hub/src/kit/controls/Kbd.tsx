// Keyboard hints: `Kbd` is one key, `Shortcut` a combination. One chip look everywhere: menus,
// tooltips, inside buttons and in prose. The chip takes its colours from the text around it, so the same
// component reads on a card, in a dark tooltip and on the accent fill of a primary button.
import type { ReactNode } from 'react';
import { cx } from './Button';
import s from './Kbd.module.css';

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** One key, e.g. <Kbd>j</Kbd>. For a combination use Shortcut. */
export function Kbd({ children, className }: KbdProps) {
  return <kbd className={cx(s.kbd, className)}>{children}</kbd>;
}

/** True on Apple platforms, where `Mod` is ⌘. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

// Key names in a shortcut string, as they appear on the keyboard. Letters stay as written:
// `j` is the j key, `J` is Shift+J only when written `Shift+J`.
const APPLE: Readonly<Record<string, string>> = { mod: '⌘', cmd: '⌘', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧', enter: '↵', esc: 'Esc' };
const OTHER: Readonly<Record<string, string>> = { mod: 'Ctrl', cmd: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Esc' };

/**
 * The keys of a shortcut string for this platform: 'Mod+K' → ['⌘', 'K'] on a Mac and
 * ['Ctrl', 'K'] elsewhere. Keys are joined by '+'; a lone '+' key is written 'Plus'.
 */
export function shortcutKeys(shortcut: string, apple = isApplePlatform()): string[] {
  const names = apple ? APPLE : OTHER;
  return shortcut
    .split('+')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map((k) => (k.toLowerCase() === 'plus' ? '+' : (names[k.toLowerCase()] ?? k)));
}

/** A shortcut as plain text for a title or an aria-keyshortcuts-like label ('Ctrl K'). */
export function formatShortcut(shortcut: string, apple = isApplePlatform()): string {
  return shortcutKeys(shortcut, apple).join(apple ? '' : ' ');
}

// Key names as aria-keyshortcuts spells them (WAI-ARIA: Control, Meta, Alt, Shift, Enter, Escape; a '+' key is Plus).
const ARIA: Readonly<Record<string, string>> = { ctrl: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Escape', plus: 'Plus' };

/** A shortcut string as an aria-keyshortcuts value: 'Mod+J' → 'Control+J', or 'Meta+J' on Apple; alternatives space-separated. */
export function ariaKeyshortcuts(keys: string | readonly string[], apple = isApplePlatform()): string {
  const combos = typeof keys === 'string' ? [keys] : keys;
  const name = (k: string) => {
    const low = k.toLowerCase();
    if (low === 'mod') return apple ? 'Meta' : 'Control';
    if (low === 'cmd') return 'Meta';
    return ARIA[low] ?? k;
  };
  return combos.map((c) => c.split('+').map((k) => k.trim()).filter((k) => k.length > 0).map(name).join('+')).join(' ');
}

export interface ShortcutProps {
  /** 'Mod+K', 'Alt+R', 'j'. Several alternatives: an array (['j', 'k'] renders `j` `k`). */
  keys: string | readonly string[];
  className?: string;
  /** Inside a control that names the keys in aria-keyshortcuts, the badge stays out of its name. */
  'aria-hidden'?: boolean;
}

/** A shortcut as kbd chips, one per key ('Mod+J' → `Ctrl` `J`), platform-aware. */
export function Shortcut({ keys, className, 'aria-hidden': hidden }: ShortcutProps) {
  const combos = typeof keys === 'string' ? [keys] : keys;
  return (
    <span className={cx(s.shortcut, className)} aria-hidden={hidden || undefined}>
      {combos.map((combo, i) => (
        <kbd key={`${i}-${combo}`} className={s.combo}>
          {shortcutKeys(combo).map((k, j) => (
            <kbd key={`${j}-${k}`} className={s.kbd}>
              {k}
            </kbd>
          ))}
        </kbd>
      ))}
    </span>
  );
}
