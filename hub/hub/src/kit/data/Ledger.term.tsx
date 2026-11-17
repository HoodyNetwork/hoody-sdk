// Ledger and ShortcutTable in the terminal: label at the start, the amount at the end of one line (spaces between,
// so a selection reads "Label   $12.00"), the total after a rule. A warn row carries its mark, so it reads in mono.
import { type ReactElement, type ReactNode } from 'react';
import type * as Web from './Ledger';
import { Box, Text } from '../../term/prim';
import { cellWidth, cleanText } from '../../term/prim/TableCells';
import { useStrings } from '../strings';
import strings from './Ledger.strings.en.json';

export type { LedgerRow, LedgerAttach, LedgerProps, ShortcutTableRow, ShortcutTableGroup, ShortcutTableProps } from './Ledger';

function Amount({ children, bold, colour }: { children: ReactNode; bold?: boolean; colour: 'ink' | 'muted' | 'warn' }): ReactElement {
  return typeof children === 'string' || typeof children === 'number'
    ? <Text colour={colour} bold={bold}>{cleanText(String(children))}</Text>
    : <Box dir="row" shrink={0}>{children}</Box>;
}

export const Ledger: typeof Web.Ledger = ({ rows, total, attach }) => (
  <Box dir="column" shrink={0}>
    {rows.map((r) => {
      const colour = r.tone === 'warn' ? 'warn' : r.tone === 'muted' ? 'muted' : 'ink';
      return (
        <Box key={r.id} dir="column" shrink={0}>
          <Box dir="row" gap={2} justify="between">
            <Text colour={colour === 'ink' ? 'ink' : colour} shrink={1}>{r.tone === 'warn' ? '! ' : ''}{cleanText(r.label)}</Text>
            <Amount colour={colour}>{r.amount}</Amount>
          </Box>
          {r.note !== undefined && <Box dir="row" pad={{ left: 2 }}>{typeof r.note === 'string' ? <Text colour="muted">{cleanText(r.note)}</Text> : r.note}</Box>}
        </Box>
      );
    })}
    {total && (
      <Box dir="row" gap={2} justify="between" border={['top']} borderColour="line">
        <Text colour="ink" bold>{cleanText(total.label)}</Text>
        <Amount colour="ink" bold>{total.amount}</Amount>
      </Box>
    )}
    {attach && (
      <Box dir="row" gap={2} padX={1} bg="card" shrink={0}>
        <Box grow={1} shrink={1}>{typeof attach.text === 'string' ? <Text colour="warn">! {attach.text}</Text> : attach.text}</Box>
        {attach.action ?? null}
      </Box>
    )}
  </Box>
);

function chordKeys(chord: string, space: string): string[] {
  const keys = chord.split(' ').filter((k) => k.length > 0);
  return keys.length > 0 ? keys : [space];
}

export const ShortcutTable: typeof Web.ShortcutTable = ({ groups }) => {
  const t = useStrings(strings);
  const keyText = (r: Web.ShortcutTableRow) =>
    r.keys.map((chord) => chordKeys(chord, t('keys.space')).map((k) => `[${k}]`).join(' ')).join(r.then ? ' then ' : ' or ');
  const width = Math.min(28, Math.max(0, ...groups.flatMap((g) => g.rows.map((r) => cellWidth(keyText(r))))));
  return (
    <Box dir="column" shrink={0} gap={1}>
      {groups.map((g) => (
        <Box key={g.id} dir="column" shrink={0}>
          {g.title && <Text colour="ink" bold>{g.title}</Text>}
          {g.rows.map((r) => (
            <Box key={r.label} dir="row" gap={2} shrink={0}>
              <Text colour="blueText" width={width}>{keyText(r)}</Text>
              <Text colour="ink" shrink={1}>{r.label}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};
