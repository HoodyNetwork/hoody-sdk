// A folder pane's keys in the terminal: Backspace or Alt+Up goes up a folder, Shift+N makes one, the keys every terminal
// file manager has. No DOM box to listen on here, so they go through the page shortcut store (usePageShortcuts): they
// run while no field has the keyboard (the store's rule, as the web's input/dialog check), and the `?` sheet lists them.
// They belong to the pane's box (`within`): with two panes open, the pane holding the focus has them, as on the web;
// with the focus in neither (or one pane), the first-mounted pane's keys run, as before.
import { usePageShortcuts, useStrings } from '@kit';
import type * as Web from './folderKeys';
import strings from './strings.en.json';

export const useFolderKeys: typeof Web.useFolderKeys = (box, upKey, newKey) => {
  const t = useStrings(strings);
  const up = () => upKey.current();
  usePageShortcuts([
    { key: 'Backspace', label: t('action.up'), run: up, palette: false, within: box },
    { key: 'ArrowUp', mods: ['alt'], label: t('action.up'), run: up, palette: false, within: box },
    { key: 'N', label: t('action.newFolder'), run: () => newKey.current(), within: box },
  ]);
};
