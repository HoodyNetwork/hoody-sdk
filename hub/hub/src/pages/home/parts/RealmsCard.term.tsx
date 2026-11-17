// The Home realms card in the terminal: the web card's rows, in as many columns as keep every row whole. The web grid
// puts two realms side by side from 200px a column, enough there for a name, its count and "Showing"; 200px is 25
// cells, and a row needs more than that here ("Personal 3 computers Showing" lost its name to "Per…"). So the realms
// sit two across only when the widest row fits in half the card, else one per line (the web's narrow-card layout).
// All realms is a line of its own, as on the web.
import { TextButton, Widget, useShellData, useStrings } from '@kit';
import { useRealms } from '@core';
import { Box, Text, useBoxSize } from '@term/prim';
import strings from '../strings.en.json';
import { RealmSwatch } from './RealmSwatch';
import { REALM_COL_GAP, realmColumns, realmRowCells } from './realmsLayout';
import type * as Web from './RealmsCard';

export const RealmsCard: typeof Web.RealmsCard = ({ title }) => {
  const t = useStrings(strings);
  const realms = useRealms();
  const setRealm = useShellData().setRealm;
  const [size, onSize] = useBoxSize();
  const rows = realms.rows ?? [];
  if (!setRealm || rows.length < 2) return null;
  const all = { id: 'all', label: t('realms.all'), tint: '' as const, computers: null as number | null };
  const named = rows.map((r) => ({ id: r.id, label: 'text' in r.name ? r.name.text : r.id.slice(0, 8), tint: r.tint, computers: r.computers }));
  const items = [all, ...named].map((r) => {
    const showing = realms.selected === r.id;
    const count = typeof r.computers === 'number' ? t('realms.count', { count: r.computers }) : undefined;
    return { ...r, showing, count, cells: realmRowCells([r.label, ...(count ? [count] : []), ...(showing ? [t('realms.showing')] : [])]) };
  });
  const columns = realmColumns(size?.width ?? 0, items.slice(1).map((r) => r.cells));
  // A row: the name is the control (the web's whole row is one button; here a row is words, and the name is pressed).
  const row = (r: (typeof items)[number]) => (
    <Box key={r.id} dir="row" gap={1} padX={1} grow={1} shrink={1} minWidth={0} raw={{ flexBasis: 0 }}>
      {r.id === 'all' ? <Text> </Text> : <RealmSwatch tint={r.tint} />}
      <Box dir="row" grow={1} shrink={1} minWidth={0}>
        <TextButton onPress={() => (r.showing ? undefined : setRealm(r.id))}>{r.label}</TextButton>
      </Box>
      {/* "Showing" before the count: the counts of every row then end in one column. */}
      {r.showing && <Text bold>{t('realms.showing')}</Text>}
      {r.count !== undefined && <Text colour="muted">{r.count}</Text>}
    </Box>
  );
  // Lines: All realms alone, then the realms `columns` at a time.
  const lines: (typeof items)[] = [[items[0]!]];
  for (let i = 1; i < items.length; i += columns) lines.push(items.slice(i, i + columns));
  return (
    <Widget size="s" level="rows" title={title} description={t('realms.body')}>
      <Box dir="column" alignSelf="stretch" shrink={0} onSize={onSize}>
        {lines.map((line) => (
          <Box key={line[0]!.id} dir="row" gap={REALM_COL_GAP} alignSelf="stretch">
            {line.map(row)}
            {/* An odd last realm keeps its column's width. */}
            {columns === 2 && line.length === 1 && line[0]!.id !== 'all' ? <Box grow={1} shrink={1} minWidth={0} raw={{ flexBasis: 0 }} /> : null}
          </Box>
        ))}
      </Box>
    </Widget>
  );
};
