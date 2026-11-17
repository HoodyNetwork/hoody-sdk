// The Home Shortcuts card in the terminal: one key and its label per line (the web's grid of equal tiles does not fit a
// card a few dozen cells wide: its keys were squeezed into narrow columns, "Sh/ow/th/is"), then All shortcuts.
import { Button, Kbd, Widget, openShortcutsSheet, useShortcuts, useStrings } from '@kit';
import strings from '../strings.en.json';
import { CUSTOMIZE_KEY } from '../logic';
import type * as Web from './ShortcutsCard';
import { pickShortcuts } from './shortcutsPick';
import { Box, Text, widestCells } from '@term/prim';

export { pickShortcuts } from './shortcutsPick';

/** A bracket key inside its key cap's own brackets read "[[]": it gets a space on each side, "[ [ ]". */
const capOf = (k: string): string => (k === '[' || k === ']' ? ` ${k} ` : k);

export const ShortcutsCard: typeof Web.ShortcutsCard = ({ title }) => {
  const t = useStrings(strings);
  const rows = pickShortcuts(useShortcuts());
  // The keys take the widest key's column ("[Ctrl+K]", "[g] [c]"), so every label starts on one column.
  const keysOf = (r: { keys: readonly string[] }) => r.keys.flatMap((combo) => combo.split(' '));
  const keyCells = (keys: string[]) => keys.reduce((n, k) => n + widestCells([capOf(k)]) + 2, 0) + Math.max(0, keys.length - 1);
  const keyWidth = Math.max(keyCells([CUSTOMIZE_KEY]), ...rows.map((r) => keyCells(keysOf(r))));
  const line = (key: string, keys: string[], label: string) => (
    <Box key={key} dir="row" gap={1} shrink={0}>
      <Box dir="row" gap={1} shrink={0} width={keyWidth}>{keys.map((k, i) => <Kbd key={`${i}-${k}`}>{capOf(k)}</Kbd>)}</Box>
      <Text>{label}</Text>
    </Box>
  );
  return (
    <Widget size="s" level="fill" title={title}>
      <Box dir="column" shrink={0}>
        {rows.map((r) => line(r.keys.join(' '), keysOf(r), r.label))}
        {line('customize', [CUSTOMIZE_KEY], t('customize.key'))}
        <Box dir="row" shrink={0}>
          {/* No icon: the command icon's terminal glyph (⁎) reads as noise before the words. */}
          <Button variant="secondary" onPress={() => openShortcutsSheet()}>{t('keys.all')}</Button>
        </Box>
      </Box>
    </Widget>
  );
};
