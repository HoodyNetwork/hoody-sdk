// A Bot in another page's tile (the bots page's tile view: a Bot on the Board). The host gives only
// the Bot's row key (`<computer>~<realm>~<id>`) and never imports this page.
//
// Contract, in plain words:
//   - It shows what the Bots page shows of one Bot without its settings: the name and status, the pinned card while a
//     gate waits (decided here through the same change as the Bots page, so one decision is sent once), and the
//     Activity log. Hiding task updates is the tile's own state, never the host page's URL.
//   - A key that names no Bot of this account (deleted, its computer stopped, a key from another account's Board) says
//     the Bot isn't here any more, with Open Bots; it never guesses another Bot.
//   - Open in Bots goes to the Bot on its own page.
//   - A refresh that fails keeps the last answer on screen with the load error and its retry above it.
//   - Everything the tile keeps (a typed answer, a decision in flight, older log rows, hide tasks) belongs to one Bot:
//     a new key starts the tile afresh, so nothing of one Bot is shown or sent as another's.
//   - A malformed key reads nothing (no computers list, no Bot lists).
import { Button, EmptyState, ErrorState, Skeleton, StatusPill, TextButton, useGo, useStrings } from '@kit';
import { useRef, useState } from 'react';
import { useDecideGate, useLoadOlder, useLog, type LogRow } from './data';
import { links } from './links';
import { parseBotKey, statusOf, withOlder } from './logic';
import { ActivityLog } from './parts/ActivityTab';
import { STATUS_TONE } from './parts/Bits';
import { GateCard } from './parts/GateCard';
import strings from './strings.en.json';
import s from './tile.module.css';
import { useScreenState, useTileBot } from './tileState';

export default function BotTile({ target }: { target: string }) {
  if (!parseBotKey(target)) return <Gone />;
  return <BotTileBody key={target} botKey={target} />;
}

function Gone() {
  const t = useStrings(strings);
  const go = useGo();
  return <EmptyState size="sm" icon="warn" title={t('bot.gone')} body={t('tile.goneBody')} action={<Button onPress={() => go(links.list)}>{t('tile.openList')}</Button>} />;
}

function BotTileBody({ botKey: key }: { botKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useScreenState(box);
  // The tile's root fills the Board tile's body: a column of definite height, so the Bot's tile takes the
  // height the Board gives it and the log's box (.tileLog) the height left under the header and the card.
  return (
    <div ref={box} className={s.root} data-bot-tile-root="">
      <BotTileState botKey={key} onScreen={seen !== false} admitted={seen === true} />
    </div>
  );
}

function BotTileState({ botKey: key, onScreen, admitted }: { botKey: string; onScreen: boolean; admitted: boolean }) {
  const t = useStrings(strings);
  const go = useGo();
  const at = useTileBot(key, onScreen, admitted);
  const viewQ = at.viewQ;
  const logQ = useLog(key);
  const loadOlder = useLoadOlder(key);
  const [older, setOlder] = useState<{ rows: LogRow[]; hasOlder: boolean } | null>(null);
  const [hideTasks, setHideTasks] = useState(false);
  const bot = at.bot;
  const decide = useDecideGate({ botKey: key, gate: bot?.gate ?? null }, [viewQ]);

  if (at.show === 'loading') return <Skeleton variant="detail" rows={4} />;
  if (at.show === 'error') return <ErrorState size="compact" title={t('bot.loadError')} error={at.error} onRetry={at.retry} />;
  if (at.show === 'gone' || !bot) return <Gone />;

  const status = statusOf(bot);
  const page = logQ.page ? withOlder(logQ.page, older) : undefined;
  return (
    <div className={s.tile} data-bot-tile={key}>
      <div className={s.tileHead}>
        <span className={s.tileName} dir="auto">
          {bot.name}
        </span>
        <StatusPill tone={STATUS_TONE[status]} dot>
          {t(`status.${status}`)}
        </StatusPill>
        <TextButton onPress={() => go(links.item(key))}>{t('tile.open')}</TextButton>
      </div>
      {at.refreshFailed && <ErrorState size="compact" title={t('bot.loadError')} error={at.error} onRetry={at.retry} />}
      {bot.gate != null && <GateCard key={`${bot.gate.id}:${bot.gate.generation}`} bot={bot} change={decide} />}
      {/* The log scrolls in its own box: the tile's header and waiting card stay where they are while it follows its end. */}
      <div className={s.tileLog} data-tile-log="">
        <ActivityLog
          page={page}
          loading={logQ.isPending}
          error={logQ.isError}
          onRetry={() => void logQ.refetch()}
          loadingOlder={loadOlder.running}
          olderFailed={loadOlder.outcome === 'failed'}
          onLoadOlder={() => {
            const before = page?.rows[0]?.seq;
            if (before === undefined) return;
            void loadOlder.run({ before }).then((r) => {
              const got = r.data;
              if (r.outcome === 'done' && got) setOlder((cur) => ({ rows: [...got.rows, ...(cur ? cur.rows : [])], hasOlder: got.hasOlder }));
            });
          }}
          hideTasks={hideTasks}
          onHideTasks={setHideTasks}
        />
      </div>
    </div>
  );
}
