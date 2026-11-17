// Page keys: a page declares its shortcuts once with usePageShortcuts.
// One rule for every page, the same as the shell's global keys (keys.ts): a key never fires while an
// overlay owns the keyboard (overlayOpen), while a field has it, during IME composition, or when
// something earlier already took it (defaultPrevented: a popover closing on Escape). Enter, Space and
// the arrows stay with a focused control (a button, tab, divider, menu item) that has its own meaning
// for them. The keys that apply right now are listed in the `?` sheet and offered in the palette
// (useCurrentPageShortcuts).
//
// A single key matches KeyboardEvent.key with no ⌘/Ctrl/Alt held (Shift only for a printed key: `H`).
// A chord lists its `mods` and matches KeyboardEvent.code, so the keyboard layout does
// not matter; the modifiers must match exactly. Only Ctrl+Alt+B may also work while a field has the
// keyboard (`whileTyping`), and on an AltGr layout a printed character in a field is not that chord.
// The shell's own keys (g ? / [, Mod K, Mod J, Alt R, Alt C) and the browser's F6 (with any modifier:
// it moves focus between the page and the browser's own bars, and out of an iframe) are never a
// page's: refused, not listed.
//
// The store, the ids and the matching rule live in pageShortcuts.pure.ts, shared with the terminal
// (pageShortcuts.term.ts); this file is the browser's side: KeyboardEvent, DOM focus, the window listener.
//
// Order: the shell's key handler (useGlobalKeys) runs global keys and the `g` jump first and hands
// every key it leaves to runPageKeys. While a shell handler is mounted, the page hooks' own listener
// stands aside, so the order never depends on which effect ran first (a page's effect runs before
// the shell's on a fresh mount). Outside the shell (page unit tests) the page listener handles keys.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { isApplePlatform } from '@kit/controls/Kbd';
import { isLocked } from '@core/shell';
import { frameOwnsKeys, overlayOpen, typing } from './keygate';
import {
  addPageShortcutList,
  findPageShortcut,
  pageShortcutGroups as groupsOf,
  pageShortcutId as idOf,
  pageShortcutKeys as keysOf,
  pageShortcutListCount,
  pageShortcutSignature,
  pageShortcutSnapshot,
  publishPageShortcuts,
  runPageShortcut as runById,
  setShortcutPlatform,
  subscribePageShortcuts,
  type PageShortcut,
  type PageShortcutGroup,
} from './pageShortcuts.pure';

export type { PageShortcutMod, PageShortcut, PageShortcutRow, PageShortcutGroup } from './pageShortcuts.pure';

// `mod` is ⌘ on Apple platforms, asked at each use.
setShortcutPlatform(isApplePlatform);

let shellHandlers = 0;

/** One id per shortcut (the palette's item id, the dedupe key): 'n', 'ctrl+alt+KeyB'. */
export function pageShortcutId(s: PageShortcut): string {
  return idOf(s);
}

const NAV_KEYS = new Set(['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const CONTROL = 'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="separator"], [role="slider"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="treeitem"], [role="gridcell"], [role="row"]';

/** A focused control that has its own meaning for Enter, Space or an arrow keeps it. */
function controlKeeps(e: KeyboardEvent): boolean {
  return NAV_KEYS.has(e.key) && e.target instanceof Element && e.target.closest(CONTROL) !== null;
}

/** Run the page key for this event, if one applies; claims the event when it does. */
export function runPageKeys(e: KeyboardEvent): boolean {
  // Locked: no page key runs.
  if (isLocked()) return false;
  if (e.defaultPrevented || e.isComposing || overlayOpen()) return false;
  const hit = findPageShortcut(e, { typing: typing(e.target), frame: frameOwnsKeys(e.target), controlKeeps: controlKeeps(e) });
  if (!hit) return false;
  e.preventDefault();
  hit.run();
  return true;
}

/** A shortcut's keys as the `?` sheet and the palette show them: ['Ctrl', 'Alt', 'B'], ['←']. */
export function pageShortcutKeys(s: PageShortcut, apple = isApplePlatform()): string[] {
  return keysOf(s, apple);
}

/** Group the listed keys (first-seen group order, ungrouped first) and merge same-label keys. */
export function pageShortcutGroups(list: readonly PageShortcut[]): PageShortcutGroup[] {
  return groupsOf(list);
}

/** For the shell's key handler: while claimed, page keys run only through runPageKeys. */
export function claimPageKeyOrder(): () => void {
  shellHandlers += 1;
  return () => {
    shellHandlers -= 1;
  };
}

// Outside the shell: one listener for all page parts, installed while any is mounted.
const standalone = (e: KeyboardEvent) => {
  if (shellHandlers === 0) runPageKeys(e);
};

/** Declare this page's keys. The latest handlers are used; the list may change between renders. */
export function usePageShortcuts(list: readonly PageShortcut[]): void {
  const latest = useRef(list);
  latest.current = list;
  const sig = pageShortcutSignature(list);

  useEffect(() => {
    if (pageShortcutListCount() === 0) window.addEventListener('keydown', standalone);
    const remove = addPageShortcutList(latest);
    return () => {
      remove();
      if (pageShortcutListCount() === 0) window.removeEventListener('keydown', standalone);
    };
  }, []);

  // A changed list (a key turned on or off, a new label) is listed again.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    publishPageShortcuts();
  }, [sig]);
}

/** The page keys that apply now (for the `?` sheet and the palette). Read-only. */
export function useCurrentPageShortcuts(): readonly PageShortcut[] {
  return useSyncExternalStore(subscribePageShortcuts, pageShortcutSnapshot, pageShortcutSnapshot);
}

/** The page keys that apply now, grouped and merged into rows (the `?` sheet and the palette). */
export function usePageShortcutGroups(): PageShortcutGroup[] {
  const list = useCurrentPageShortcuts();
  return useMemo(() => groupsOf(list), [list]);
}

/** Run a listed page key by its id (pageShortcutId: the palette's action, a tile's forwarded chord),
 *  with the page's latest handler. */
export function runPageShortcut(id: string): void {
  runById(id);
}
