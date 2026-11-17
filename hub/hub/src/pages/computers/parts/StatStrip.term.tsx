// The summary above the computers list, in the terminal: ONE line (wrapping when the screen is narrow) in place of the
// kit StatStrip's three rows (label, number, detail). At 80x24 those rows left room for three computers on the first
// screen. Same words and numbers as the web strip: "Computers 8 · 4 running · 2 stopped · 1 failed · 1 starting    Servers 3".
// A label is never followed by a bare second number ("8 4 running"): the detail is joined with " · ".
import { UpgradeLink, useStrings } from '@kit';
import type { ReactNode } from 'react';
import { Box, Text } from '@term/prim';
import { links as billingLinks } from '../../billing/links';
import { serverKey, serverLabel, stripSplit } from '../logic';
import strings from '../strings.en.json';
import type * as Web from './StatStrip';
import { slotsOf, slotsUpgrade } from './upgrade';

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: ReactNode }) {
  return (
    <Box dir="row" gapX={1} shrink={0}>
      <Text colour="muted">{label}</Text>
      <Text bold>{String(value)}</Text>
      {detail === undefined ? null : typeof detail === 'string' ? <Text colour="muted">{`· ${detail}`}</Text> : <><Text colour="muted">·</Text>{detail}</>}
    </Box>
  );
}

export const StatStrip: typeof Web.StatStrip = ({ computers, servers }) => {
  const t = useStrings(strings);
  const names = new Set(computers.map((c) => serverLabel(c).name || serverKey(c)));
  const up = slotsUpgrade(servers);
  const slots = slotsOf(servers);
  return (
    <Box dir="row" wrap gapX={4} gapY={0} shrink={0} sem={{ role: 'group', name: t('strip.label') }}>
      <Stat label={t('strip.computers')} value={computers.length} detail={stripSplit(computers, t)} />
      <Stat label={t('strip.servers')} value={names.size} />
      {slots.max > 0 ? (
        <Stat
          label={t('strip.slots')}
          value={t('srv.capOf', { used: slots.used, max: slots.max })}
          detail={up.available === 'none' ? undefined : <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />}
        />
      ) : null}
    </Box>
  );
};
