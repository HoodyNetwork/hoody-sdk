// openShortcutsSheet: a page opens the shell's `?` sheet from its own control (the Board's phone
// menu: phones have no `?` key, and pages never synthesize keys). The mounted AppShell registers the
// opener; without a shell it does nothing. It opens on purpose, so it does not wait for a closing menu.
let opener: (() => void) | undefined;

/** For AppShell: the function that shows the sheet. Returns the unregister. */
export function setShortcutsOpener(fn: () => void): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = undefined;
  };
}

/** Open the keyboard shortcuts sheet (the same one `?` opens, with this page's shortcuts). */
export function openShortcutsSheet(): void {
  opener?.();
}
