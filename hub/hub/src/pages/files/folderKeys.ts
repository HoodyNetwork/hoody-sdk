// A folder pane's own keys: Backspace or Alt+Up goes up, Shift+N makes a folder, while the pane's list has
// focus and no field, dialog or combobox does. A native listener on the folder box (the box is no control of its own;
// the key belongs to the list inside it). Moved out of view.tsx so the terminal (folderKeys.term.ts) has its own.
import { useEffect, type MutableRefObject, type RefObject } from 'react';

export function useFolderKeys(box: RefObject<HTMLDivElement | null>, upKey: MutableRefObject<() => void>, newKey: MutableRefObject<() => void>): void {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: globalThis.KeyboardEvent) => {
      const at = e.target as HTMLElement | null;
      const isNew = e.key === 'N' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      // Alt+Up goes up too (the folder-view key of Explorer and Nautilus).
      const isUp = e.key === 'Backspace' || (e.key === 'ArrowUp' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey);
      if ((!isUp && !isNew) || e.defaultPrevented || !at || at.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      if (isNew) newKey.current();
      else upKey.current();
    };
    el.addEventListener('keydown', on);
    return () => el.removeEventListener('keydown', on);
    // Mount only, as in the view: the box is attached once and both keys are read through their refs when pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
