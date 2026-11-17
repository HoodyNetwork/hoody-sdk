// AI use on a Servers card: the server's five lanes by core's lane rules, the same as Billing's usage table.
// What was not read is never a 0: reading, could not be read, not read (past the read's servers), unavailable for this
// server, and a lane with no reading each say so in words.
import { LANES, laneLevel, laneWords, usageRefusal, type LaneReading } from '@core';
import { Meter, UpgradeLink, cx, useStrings } from '@kit';
import { links as billingLinks } from '../../billing/links';
import strings from '../strings.en.json';
import type { ServersAi } from '../types';
import { aiUpgrade, type Upgrade } from './upgrade';
import s from './parts.module.css';

const NONE = (lane: LaneReading['lane']): LaneReading => ({ lane, off: false, pct: null, resets: null });

function Lane({ l }: { l: LaneReading }) {
  const t = useStrings(strings);
  const w = laneWords(l);
  const words = t(w.k, w.v);
  const name = t(`aiu.lane.${l.lane}`);
  const title = t('aiu.laneTitle', { name, words });
  const level = laneLevel(l.pct);
  return (
    <li className={s.aiLane} title={title}>
      <span className={s.aiName}>{name}</span>
      {l.off || l.pct === null ? (
        <span className={cx(s.faint, s.aiWords)}>{words}</span>
      ) : (
        <>
          <span className={s.aiPct}>{t('aiu.pct', { pct: l.pct })}</span>
          <span className={s.aiBar}>
            <Meter value={l.pct} label={title} tone={level === 'full' ? 'danger' : level === 'high' ? 'warn' : 'neutral'} size="fill" />
          </span>
        </>
      )}
    </li>
  );
}

/** The card footer: `read` is the servers' AI usage read (only made while cards show). `room`: the card's room upgrade
 *  (Get more room), drawn in the footer's last cell; while it shows, no AI one is added (one per card). */
export function ServerAiFoot({ id, read, room }: { id: string; read: { data: ServersAi | undefined; error: unknown }; room?: Upgrade }) {
  const t = useStrings(strings);
  const roomShown = !!room && room.available !== 'none';
  const roomLink = roomShown ? (
    <span className={s.aiUp}>
      <UpgradeLink available={room.available} prominence={room.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />
    </span>
  ) : null;
  const say = (line: string, busy = false) => (
    <div className={s.ai} aria-busy={busy || undefined}>
      <span className={s.aiHead}>{t('srv.col.ai')}</span>
      <span className={cx(s.faint, s.aiLine)}>{line}</span>
      {roomLink}
    </div>
  );
  // A failed read wins over an older answer the query still holds: never an old reading shown as current.
  if (read.error) return say(t(usageRefusal((read.error as { kind?: string } | null)?.kind)));
  if (!read.data) return say(t('srv.ai.loading'), true);
  const row = read.data.byId[id];
  if (!row) return say(t(read.data.truncated ? 'srv.ai.notReadMore' : 'srv.ai.notRead'));
  if (!row.ok) return say(t('srv.ai.unavailable'));
  const up = roomShown ? null : aiUpgrade(row.lanes);
  return (
    <div className={s.ai}>
      <span className={s.aiHead}>{t('srv.col.ai')}</span>
      <ul className={s.aiLanes}>
        {LANES.map((l) => (
          <Lane key={l} l={row.lanes.find((x) => x.lane === l) ?? NONE(l)} />
        ))}
      </ul>
      {up && up.available !== 'none' ? (
        <span className={s.aiUp}>
          <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('srv.upgradeAi')} />
        </span>
      ) : (
        roomLink
      )}
    </div>
  );
}
