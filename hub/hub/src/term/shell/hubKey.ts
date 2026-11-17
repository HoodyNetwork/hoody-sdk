// The engine's key event as the web's KeyboardEvent would report it (key, code, modifier flags), so the shared
// declarations (shell/shortcuts.pure.ts, shell/keys.pure.ts, a page's usePageShortcuts list) and the shared matching
// rule (shell/pageShortcuts.pure.ts) read terminal keys unchanged.
//
// What a terminal cannot tell apart (legacy encoding; the Kitty keyboard protocol would, the engine asks for it only
// when configured): Ctrl+M is Enter, Ctrl+I is Tab, Ctrl+[ is Esc, Ctrl+H is Backspace on many terminals, and Shift
// is lost on Ctrl+letter. `code` assumes a US layout for printed symbols (`?` is Shift+Slash).
import type { KeyLike } from '../../shell/pageShortcuts.pure';
import type { Key } from '../prim';

export interface HubKey extends KeyLike {
  /** The engine's own name ('return', 'escape', 'k', '?'), for terminal-only bindings. */
  name: string;
}

const NAMED: Readonly<Record<string, { key: string; code: string }>> = {
  return: { key: 'Enter', code: 'Enter' },
  linefeed: { key: 'Enter', code: 'Enter' },
  enter: { key: 'Enter', code: 'NumpadEnter' },
  escape: { key: 'Escape', code: 'Escape' },
  space: { key: ' ', code: 'Space' },
  tab: { key: 'Tab', code: 'Tab' },
  backspace: { key: 'Backspace', code: 'Backspace' },
  delete: { key: 'Delete', code: 'Delete' },
  insert: { key: 'Insert', code: 'Insert' },
  up: { key: 'ArrowUp', code: 'ArrowUp' },
  down: { key: 'ArrowDown', code: 'ArrowDown' },
  left: { key: 'ArrowLeft', code: 'ArrowLeft' },
  right: { key: 'ArrowRight', code: 'ArrowRight' },
  home: { key: 'Home', code: 'Home' },
  end: { key: 'End', code: 'End' },
  pageup: { key: 'PageUp', code: 'PageUp' },
  pagedown: { key: 'PageDown', code: 'PageDown' },
};

/** Printed symbols to their US-layout code, and whether Shift makes them. */
const SYMBOL: Readonly<Record<string, readonly [string, boolean]>> = {
  '[': ['BracketLeft', false], '{': ['BracketLeft', true], ']': ['BracketRight', false], '}': ['BracketRight', true],
  '-': ['Minus', false], _: ['Minus', true], '=': ['Equal', false], '+': ['Equal', true],
  ',': ['Comma', false], '<': ['Comma', true], '.': ['Period', false], '>': ['Period', true],
  '/': ['Slash', false], '?': ['Slash', true], '\\': ['Backslash', false], '|': ['Backslash', true],
  ';': ['Semicolon', false], ':': ['Semicolon', true], "'": ['Quote', false], '"': ['Quote', true],
  '`': ['Backquote', false], '~': ['Backquote', true],
  '!': ['Digit1', true], '@': ['Digit2', true], '#': ['Digit3', true], $: ['Digit4', true], '%': ['Digit5', true],
  '^': ['Digit6', true], '&': ['Digit7', true], '*': ['Digit8', true], '(': ['Digit9', true], ')': ['Digit0', true],
};

/** The web view of one engine key. */
export function hubKey(k: Key): HubKey {
  const alt = k.meta || k.option;
  const base = { name: k.name, ctrlKey: k.ctrl, altKey: alt, metaKey: k.super === true };
  const named = NAMED[k.name];
  if (named) return { ...base, key: named.key, code: named.code, shiftKey: k.shift };
  const f = /^f(\d{1,2})$/.exec(k.name);
  if (f) return { ...base, key: `F${f[1]}`, code: `F${f[1]}`, shiftKey: k.shift };
  // A letter: the engine names it in lower case and reports Shift; the web key is the printed letter.
  if (/^[a-z]$/.test(k.name)) {
    const key = k.shift && !k.ctrl ? k.name.toUpperCase() : k.name;
    return { ...base, key, code: `Key${k.name.toUpperCase()}`, shiftKey: k.shift };
  }
  if (/^[A-Z]$/.test(k.name)) return { ...base, key: k.name, code: `Key${k.name}`, shiftKey: true };
  if (/^\d$/.test(k.name)) return { ...base, key: k.name, code: `Digit${k.name}`, shiftKey: k.shift };
  const sym = SYMBOL[k.name];
  if (sym) return { ...base, key: k.name, code: sym[0], shiftKey: k.shift || sym[1] };
  // Anything else printed (a non-Latin letter, an emoji): its own text, no code.
  return { ...base, key: k.name.length > 0 ? k.name : k.sequence, code: '', shiftKey: k.shift };
}

/** The key as people read it in a terminal: "Ctrl+K", "Alt+R", "?", "Esc". */
export function keyLabel(k: Pick<HubKey, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey'>): string {
  const mods = [k.ctrlKey && 'Ctrl', k.altKey && 'Alt'].filter(Boolean) as string[];
  const name = k.key === ' ' ? 'Space' : k.key === 'Escape' ? 'Esc' : k.key.length === 1 && mods.length ? k.key.toUpperCase() : k.key;
  return [...mods, name].join('+');
}
