// AI use on a Servers card in the terminal: one line per lane, as Billing's usage lanes draw them: the lane's name in
// its own column, then the meter and the percent (or the words for a lane with no reading). The web stacks name and
// percent over a full-width bar; a terminal cell is too coarse for that (each lane took two lines and its name ran
// into its value). Same lane rules and words as the web (ServerAi.tsx).
import { LANES, laneLevel, laneWords, usageRefusal, type LaneReading } from '@core';
import { Meter, UpgradeLink, useStrings } from '@kit';
import { Box, Text } from '@term/prim';
import { links as billingLinks } from '../../billing/links';
import strings from '../strings.en.json';
import type * as Web from './ServerAi';
import { aiUpgrade } from './upgrade';

/** The lane names' column: the longest name ("Quick decisions", "Transcription") and one cell before the meter. */
const NAME_W = 16;

const NONE = (lane: LaneReading['lane']): LaneReading => ({ lane, off: false, pct: null, resets: null });

function Lane({ l }: { l: LaneReading }) {
  const t = useStrings(strings);
  const w = laneWords(l);
  const words = t(w.k, w.v);
  const name = t(`aiu.lane.${l.lane}`);
  const level = laneLevel(l.pct);
  return (
    <Box dir="row" shrink={0} sem={{ role: 'listitem', name: t('aiu.laneTitle', { name, words }) }}>
      <Box width={NAME_W} shrink={0}><Text truncate>{name}</Text></Box>
      {l.off || l.pct === null ? (
        <Text colour="faint">{words}</Text>
      ) : (
        <Box dir="row" gap={1} shrink={0}>
          <Meter value={l.pct} label={name} tone={level === 'full' ? 'danger' : level === 'high' ? 'warn' : 'neutral'} />
          <Text>{t('aiu.pct', { pct: l.pct })}</Text>
        </Box>
      )}
    </Box>
  );
}

export const ServerAiFoot: typeof Web.ServerAiFoot = ({ id, read, room }) => {
  const t = useStrings(strings);
  const roomShown = !!room && room.available !== 'none';
  const roomLink = roomShown ? <UpgradeLink available={room.available} prominence={room.prominence} href={billingLinks.plans} label={t('srv.upgrade')} /> : null;
  const head = <Text colour="muted">{t('srv.col.ai').toUpperCase()}</Text>;
  const say = (line: string) => (
    <Box dir="column" shrink={0}>
      {head}
      <Text colour="faint">{line}</Text>
      {roomLink}
    </Box>
  );
  // A failed read wins over an older answer the query still holds: never an old reading shown as current.
  if (read.error) return say(t(usageRefusal((read.error as { kind?: string } | null)?.kind)));
  if (!read.data) return say(t('srv.ai.loading'));
  const row = read.data.byId[id];
  if (!row) return say(t(read.data.truncated ? 'srv.ai.notReadMore' : 'srv.ai.notRead'));
  if (!row.ok) return say(t('srv.ai.unavailable'));
  const up = roomShown ? null : aiUpgrade(row.lanes);
  return (
    <Box dir="column" shrink={0}>
      {head}
      <Box dir="column" shrink={0} sem={{ role: 'list' }}>
        {LANES.map((l) => <Lane key={l} l={row.lanes.find((x) => x.lane === l) ?? NONE(l)} />)}
      </Box>
      {up && up.available !== 'none' ? <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('srv.upgradeAi')} /> : roomLink}
    </Box>
  );
};
