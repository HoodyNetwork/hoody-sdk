// Which shell menu is open (one at a time): the realm and computer switchers, the account menu, the page list of a
// narrow terminal. Triggers in the top bar (shell/Switchers.term.tsx) and keys (Alt+R, Alt+C, `[`) open them; the
// shell draws the open one at its root (Menus.tsx), over the page. The computer switcher registers while it shows,
// so openComputerSwitcher (a page asking for a pick, ComputerRequired) opens it only where it exists, as on the web.
// The state is the mount's (env/session.ts sessionSlot): a next mount starts with no menu open and no switcher counted.
import { useSyncExternalStore } from 'react';
import { sessionSlot } from '../env/session';

export type MenuKind = 'realm' | 'computer' | 'account' | 'nav';

const state = sessionSlot('shell.menus', () => ({
  open: null as MenuKind | null,
  listeners: new Set<() => void>(),
  mounted: new Map<MenuKind, number>(),
  shortcutsAction: null as (() => void) | null,
}));
const emit = () => { for (const l of [...state().listeners]) l(); };
const subscribe = (l: () => void) => { const ls = state().listeners; ls.add(l); return () => { ls.delete(l); }; };

export function openMenu(kind: MenuKind): void { const s = state(); if (s.open !== kind) { s.open = kind; emit(); } }
export function closeMenu(): void { const s = state(); if (s.open !== null) { s.open = null; emit(); } }
export function toggleMenu(kind: MenuKind): void { if (state().open === kind) closeMenu(); else openMenu(kind); }
export const openMenuNow = (): MenuKind | null => state().open;
export function useOpenMenu(): MenuKind | null { return useSyncExternalStore(subscribe, openMenuNow, openMenuNow); }

// Which switchers are mounted (they register while they show): the keys and openComputerSwitcher open only those.
export function registerSwitcher(kind: MenuKind): () => void {
  const s = state();
  s.mounted.set(kind, (s.mounted.get(kind) ?? 0) + 1);
  emit();
  return () => {
    const n = (s.mounted.get(kind) ?? 1) - 1;
    if (n <= 0) s.mounted.delete(kind);
    else s.mounted.set(kind, n);
    if (n <= 0 && s.open === kind) s.open = null;
    if (state() === s) emit();
  };
}
export const switcherShown = (kind: MenuKind): boolean => (state().mounted.get(kind) ?? 0) > 0;
export function useSwitcherShown(kind: MenuKind): boolean { return useSyncExternalStore(subscribe, () => switcherShown(kind), () => false); }

/** For tests: a fresh store. */
/** The account trigger's Keyboard shortcuts action (AccountMenu's onOpenShortcuts), read by the account menu's row. */
export function setAccountShortcuts(fn: (() => void) | null): () => void {
  const s = state();
  s.shortcutsAction = fn;
  return () => { if (s.shortcutsAction === fn) s.shortcutsAction = null; };
}
export const accountShortcuts = (): (() => void) | null => state().shortcutsAction;
export function resetMenusForTests(): void { const s = state(); s.open = null; s.mounted.clear(); s.shortcutsAction = null; emit(); }
