// "Start something" in the terminal. The web's tile is one bordered link holding an icon, a name and a line of
// meaning that WRAPS in its column; the compat drawing put the whole tile in one link text, which is one line, so
// every meaning ended in an ellipsis ("Assistants that w…"). Here a tile is words: the name is the link (as a realm
// row's name is in the realms card) and the meaning wraps under it, two tiles a line as the web's grid. The icon
// mark has no cell form. Which tiles show, where they lead and the More links are the web file's rules.
import { Link, Widget, useStrings } from '@kit';
import { Box, Text } from '@term/prim';
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
import type * as Web from './QuickActions';

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
const BODY = { bot: 'actions.bot.body', board: 'actions.board.body', script: 'actions.script.body', schedule: 'actions.schedule.body' } as const;
const bodyKey = (id: TileId) => (id in BODY ? BODY[id as keyof typeof BODY] : undefined);
/** Tiles a line, as the web's grid. */
const COLUMNS = 2;

type Resolved = TileDef & { href: string; asPage: boolean };

export const QuickActions: typeof Web.QuickActions = ({ hasComputer, title }) => {
  const t = useStrings(strings);
  // One link read per page in a fixed order (the web file's useTargets).
  const targets: Partial<Record<TileId, { href: string; asPage: boolean } | null>> = {
    bot: usePageTarget('bots', PATH.bot),
    board: usePageTarget('board', PATH.board),
    script: usePageTarget('scripts', PATH.script),
    schedule: usePageTarget('schedules', PATH.schedule),
    keys: usePageTarget('keys', PATH.keys),
    vault: usePageTarget('vault', PATH.vault),
    ai: usePageTarget('ai', PATH.ai),
    computer: usePageTarget('computers', PATH.computer),
  };
  const tiles = tilesFor({ hasComputer }).flatMap((tile): Resolved[] => {
    const target = targets[tile.id];
    return target ? [{ ...tile, ...target }] : [];
  });
  const main = tiles.filter((x) => x.main);
  if (main.length === 0) return null;
  const more = tiles.filter((x) => !x.main);
  const label = (x: Resolved): string => t(x.asPage ? `actions.${x.id}.page` : `actions.${x.id}`);
  const lines: Resolved[][] = [];
  for (let i = 0; i < main.length; i += COLUMNS) lines.push(main.slice(i, i + COLUMNS));
  return (
    <Widget size="s" title={title}>
      {/* .quick: padding-block-start sp-2 under the card's title; .tileName is semibold. */}
      <Box height={1} shrink={0} />
      <Box dir="column" gap={1} alignSelf="stretch" shrink={0}>
        <Box dir="column" gap={1} alignSelf="stretch" shrink={0} sem={{ role: 'list' }}>
          {lines.map((line) => (
            <Box key={line[0]!.id} dir="row" gap={2} alignSelf="stretch" shrink={0}>
              {line.map((x) => {
                const body = bodyKey(x.id);
                return (
                  <Box key={x.id} dir="column" grow={1} shrink={1} minWidth={0} raw={{ flexBasis: 0 }} sem={{ role: 'listitem' }}>
                    <Box dir="row" shrink={0} minWidth={0}><Link variant="nav" href={x.href}><Text bold>{label(x)}</Text></Link></Box>
                    {body ? <Text colour="muted">{t(body)}</Text> : null}
                  </Box>
                );
              })}
              {line.length < COLUMNS ? <Box grow={1} shrink={1} minWidth={0} raw={{ flexBasis: 0 }} /> : null}
            </Box>
          ))}
        </Box>
        {more.length > 0 ? (
          <Box dir="column" alignSelf="stretch" shrink={0}>
            <Text colour="muted" bold>{t('actions.more').toUpperCase()}</Text>
            <Box dir="row" wrap gap={2} gapY={0} alignSelf="stretch" shrink={0} sem={{ role: 'list' }}>
              {more.map((x) => <Box key={x.id} dir="row" shrink={1} minWidth={0} sem={{ role: 'listitem' }}><Link variant="nav" href={x.href}>{label(x)}</Link></Box>)}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Widget>
  );
};
