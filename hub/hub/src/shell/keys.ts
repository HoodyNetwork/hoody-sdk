// Global keys. None fire while a program frame owns the keys (keygate frameOwnsKeys, not even ⌘/Ctrl K
// and J), and only ⌘/Ctrl K and J while typing in a field; only ⌘/Ctrl K and J use modifiers
// (plus Alt R / Alt C). `g` starts a two-key jump (g h Home, g c Computers, …) for one second; the key
// after `g` is always spent on the jump, even when it names no page. Every key left over goes to the
// current page's keys (runPageKeys), after the global ones: one order, whatever the effect order.
import { useEffect, useRef } from 'react';
import { isLocked } from '@core/shell';
import type { PageManifest } from '@kit/page';
import { chromeHidden, restoreChrome } from './chrome';
import { frameOwnsKeys, overlayOpen, typing } from './keygate';
import { shownPageRoot } from './pageHost';
import { claimPageKeyOrder, runPageKeys } from './pageShortcuts';
import { JUMP_MS, JUMPS } from './keys.pure';

export { JUMPS } from './keys.pure';

export interface GlobalKeyActions {
  palette: () => void;
  shortcuts: () => void;
  toggleSidebar: () => void;
  toggleAsk: () => void;
  go: (path: string) => void;
  /** While the switch line shows a realm switch: cancel it. True when it cancelled one. */
  cancelSwitch?: () => boolean;
}

function focusSearch(): boolean {
  const input = shownPageRoot()?.querySelector<HTMLInputElement>('[data-hub-search] input, input[data-hub-search]');
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

export function useGlobalKeys(pages: readonly PageManifest[], actions: GlobalKeyActions): void {
  const ref = useRef(actions);
  ref.current = actions;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => {
    const release = claimPageKeyOrder();
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      // Locked: no app key runs, Ctrl/⌘K and Ctrl/⌘J included; the lock screen's own keys stay.
      if (isLocked()) return;
      if (e.defaultPrevented) return;
      // A program frame owns the keys: they are the program's. Only a page chord kept while typing (the Board's
      // leave) may run, so there is always a way out.
      if (frameOwnsKeys(e.target)) {
        gAt = 0;
        runPageKeys(e);
        return;
      }
      const a = ref.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      // Ctrl/⌘K and Ctrl/⌘J are the shell's, except inside an IME composition (the composition's keys, handled below).
      if (mod && !e.altKey && !e.shiftKey && key === 'k' && !e.isComposing) {
        e.preventDefault();
        a.palette();
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && key === 'j' && !e.isComposing) {
        e.preventDefault();
        a.toggleAsk();
        return;
      }
      // A key typed in a field, an IME composition or an open overlay: the shell has nothing more (so
      // macOS Option+R / Option+C still type ® / ç); a page chord may still apply (runPageKeys keeps
      // its own rules, e.g. Ctrl+Alt+B while typing).
      if (e.isComposing || typing(e.target) || overlayOpen()) {
        runPageKeys(e);
        return;
      }
      // Alt+R / Alt+C open the realm / computer switcher, which focus mode hides.
      if (e.altKey && !mod && !e.shiftKey && (e.code === 'KeyR' || e.code === 'KeyC') && !chromeHidden()) {
        const btn = document.querySelector<HTMLElement>(`[data-hub-switch="${e.code === 'KeyR' ? 'realm' : 'computer'}"]`);
        if (btn) {
          e.preventDefault();
          btn.click();
          return;
        }
      }
      if (mod || e.altKey) {
        runPageKeys(e);
        return;
      }
      // Focus mode: Esc on the chrome brings the shell back, before any page's own Esc.
      if (e.key === 'Escape' && !e.shiftKey && chromeHidden()) {
        gAt = 0;
        e.preventDefault();
        restoreChrome();
        return;
      }
      // A realm switch on the switch line: Esc cancels it, before any page's own Esc.
      if (e.key === 'Escape' && !e.shiftKey && a.cancelSwitch?.()) {
        gAt = 0;
        e.preventDefault();
        return;
      }
      if (gAt > 0 && Date.now() - gAt < JUMP_MS) {
        gAt = 0;
        e.preventDefault();
        const id = JUMPS[key];
        const page = id ? pagesRef.current.find((p) => p.id === id) : undefined;
        if (page) a.go(page.path);
        return;
      }
      gAt = 0;
      if (key === 'g' && !e.shiftKey) {
        gAt = Date.now();
      } else if (e.key === '/') {
        if (focusSearch()) e.preventDefault();
      } else if (e.key === '?') {
        e.preventDefault();
        a.shortcuts();
      } else if (e.key === '[') {
        e.preventDefault();
        a.toggleSidebar();
      } else {
        runPageKeys(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      release();
    };
  }, []);
}
