// Start something: the usual first moves, one click each. Four tiles with a visible one-line meaning, then a few
// plain links. Every one is a real link (middle-click, copy link). A tile goes to the creation place of a page this
// load serves; a page it hides draws no tile (there is no classic view). Tiles whose prerequisite does
// not hold (a computer in the realm) are left out.
import { useId } from 'react';
import { Icon, Link, Widget, useStrings, type IconName } from '@kit';
import { links as ai } from '../../ai/links';
import { links as board } from '../../board/links';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import { links as keys } from '../../keys/links';
import { links as schedules } from '../../schedules/links';
import { links as vault } from '../../vault/links';
import { links as scripts } from '../../scripts/links';
import strings from '../strings.en.json';
import { tilesFor, type TileDef, type TileId } from '../logic';
import { usePageTarget } from './usePageTarget';
import s from './home.module.css';

const PATH: Record<TileId, string> = {
  bot: bots.newBot(),
  board: board.board,
  script: scripts.new,
  schedule: schedules.create,
  keys: keys.list,
  vault: vault.list,
  ai: ai.connect(),
  computer: computers.create,
};

const ICON: Record<TileId, IconName> = {
  bot: 'bot',
  board: 'board',
  script: 'scripts',
  schedule: 'schedules',
  keys: 'key',
  vault: 'lock',
  ai: 'ai',
  computer: 'plus',
};

type Resolved = TileDef & { href: string; asPage: boolean };

/** The visible one-line meaning of the four big tiles. */
const BODY = { bot: 'actions.bot.body', board: 'actions.board.body', script: 'actions.script.body', schedule: 'actions.schedule.body' } as const;
const bodyKey = (id: TileId) => (id in BODY ? BODY[id as keyof typeof BODY] : undefined);

/** Every tile's target, one link read per page in a fixed order. */
function useTargets(): Partial<Record<TileId, { href: string; asPage: boolean }>> {
  const bot = usePageTarget('bots', PATH.bot);
  const boardT = usePageTarget('board', PATH.board);
  const script = usePageTarget('scripts', PATH.script);
  const schedule = usePageTarget('schedules', PATH.schedule);
  const key = usePageTarget('keys', PATH.keys);
  const vaultT = usePageTarget('vault', PATH.vault);
  const aiT = usePageTarget('ai', PATH.ai);
  const computer = usePageTarget('computers', PATH.computer);
  const out: Partial<Record<TileId, { href: string; asPage: boolean }>> = {};
  for (const [id, v] of [['bot', bot], ['board', boardT], ['script', script], ['schedule', schedule], ['keys', key], ['vault', vaultT], ['ai', aiT], ['computer', computer]] as const) if (v) out[id] = v;
  return out;
}

function Tile({ tile }: { tile: Resolved }) {
  const t = useStrings(strings);
  const label = t(tile.asPage ? `actions.${tile.id}.page` : `actions.${tile.id}`);
  if (!tile.main) {
    return (
      <li>
        <Link variant="nav" className={s.touchLink} href={tile.href}>
          {label}
        </Link>
      </li>
    );
  }
  const body = bodyKey(tile.id);
  return (
    <li className={s.tileItem}>
      <Link variant="plain" className={s.tile} href={tile.href} data-tile={tile.id}>
        <span className={s.tileIcon} aria-hidden="true">
          <Icon name={ICON[tile.id]} size="md" />
        </span>
        <span className={s.tileText}>
          <span className={s.tileName}>{label}</span>
          {body && <span className={s.tileBody}>{t(body)}</span>}
        </span>
      </Link>
    </li>
  );
}

export function QuickActions({ hasComputer, title }: { hasComputer: boolean; title: string }) {
  const t = useStrings(strings);
  const targets = useTargets();
  const moreId = useId();
  const tiles = tilesFor({ hasComputer }).flatMap((tile): Resolved[] => {
    const target = targets[tile.id];
    return target ? [{ ...tile, ...target }] : [];
  });
  const main = tiles.filter((x) => x.main);
  // Without a main tile (an empty realm) the card would be a title over a few links: the rail has those pages.
  if (main.length === 0) return null;
  const more = tiles.filter((x) => !x.main);
  return (
    <Widget size="s" title={title}>
      <div className={s.quick}>
        <ul className={s.tiles}>
          {main.map((tile) => (
            <Tile key={tile.id} tile={tile} />
          ))}
        </ul>
        {more.length > 0 && (
          <div className={s.more}>
            <span id={moreId} className={s.moreLabel}>{t('actions.more')}</span>
            <ul className={s.moreList} aria-labelledby={moreId}>
              {more.map((tile) => (
                <Tile key={tile.id} tile={tile} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Widget>
  );
}
