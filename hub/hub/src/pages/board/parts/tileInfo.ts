// What one slot shows, computed once per render for the whole Board (the tiles, chips, picker and keys share it).
//
// Contract, in plain words:
//   - infoFor(slot, tile, ctx, realmCtx) → the tile's names (program-N, computer, the "program · computer" label, the frame
//     title "program on computer"), its state and, only for a live tile whose address can be built, the frame URL
//     (Board options: parent keys + this page's origin, plus boardDefaults for what the tile left unset) and the
//     share URL (Copy link / Open in new tab: no Board options or defaults, never a token).
//   - terminalTools / terminalMenu: a live terminal's Screenshot and Raw output on its own kit, opened in a new tab.
//   - shellTarget: a live terminal tile on a known computer offers Change shell (ShellDialog); else null.
//     An SSH tile (tile.ssh) offers none: it is that ssh connection, not a shell.
//   - browserTarget: a browser tile on a known computer, on a number the Board reaches (BOARD_BROWSER_IDS), offers
//     DevTools (DevToolsDialog); else null. Running or not: the dialog reads it.
//   - An SSH tile has no share URL: opened on its own it would attach without the ssh check (parts/SshGate).
//   - state 'unknown': the computers read failed before any answer, or failed since (the computer is missing from
//     the rows an earlier read left), or the rows are a first page of a longer list (InfoCtx.complete false) that lacks
//     the computer: the card offers Try again, no frame. 'gone' only from a whole list that answered and has not failed since.
//   - A tile of a computer outside the selected realm's list is 'gone'; its frame is never built. With InfoCtx.expired
//     (the read that includes computers whose server's rental ended) 'gone' is said only when that read is whole and
//     lacks the computer too. Found there: the tile's computer is that row and the state 'attention' (status 'expired':
//     the subscription card). That read not answered yet: 'loading'; failed, or not the whole list: 'unknown'.
//   - Names: the tile's own name when the person gave one, else program-N, "port N" for an HTTP port, the
//     script's route for an exec script, the host for a web address, the Bot's id for a Bot tile (tileName).
//   - A Bot tile has the computer's state like any computer tile but no frame URL and no share URL: Tile.tsx
//     draws the Bots page's tile view in its place while the computer runs.
//   - Which computer: `color` is the tile's computer colour (core computerColor, null without one); in All
//     realms `realm` is the computer's realm shown as text (realmOfTile: the first of its realm_ids in the realm list),
//     else null. A web address tile has neither. realmCtx is a required argument: every caller says which realm shows.
//   - A web tile's frame and share URL are the address as typed; a port tile's are the computer's port address
//     (core buildPortUrl, plus the script's route), built only while the computer runs and the domain is known.
//   - A conversation tile: a web tile whose address is exactly a conversation's canonical link on
//     this Hub (links.ts tileConv, on links.ts hubOrigin(): the Hub site, never ctx.origin, the page's own origin, which
//     in the one-file Hub is another origin or "null"). `conv` is its reference; its computer is the row whose handle (core
//     computerHandle) the reference names, with that computer's state, colour and realm; there is NEVER a frame url (Tile.tsx
//     draws the conversation natively, not the Hub in a frame of itself); the share url is the canonical link (↗ opens it
//     in AI). A handle no row names is 'gone' only from a whole list that answered, else 'unknown'.
import { PARENT_KEY_PROGRAMS, realmOfTile, boardDefaults, tileName, terminalTools } from './tileInfo.pure';
export { PARENT_KEY_PROGRAMS, cutMiddle, groupLabel, realmOfTile, boardDefaults, tileName, terminalTools, shellShown, shellTarget, browserTarget } from './tileInfo.pure';
export type { TileState, TileInfo, TileRealm, RealmCtx, InfoCtx } from './tileInfo.pure';
import type { TileState, TileInfo, RealmCtx, InfoCtx } from './tileInfo.pure';
import { buildPortUrl, computerColor, computerHandle, computerState } from '@core';
import { openOutside, type MenuEntry } from '@kit';
import { tileUrl } from '../embed/options';
import { tileConv } from '../links';
import { isBotTile, isPortTile, isProgramTile, isUrlTile, tileComputer, type Board, type ConvRef, type Tile } from '../model/boards';
import { slotState } from '../model/tiles';
import { slots } from '../model/tree';
import type { T } from './text';

/** The tile-menu entries for terminalTools: each opens its address in a new tab. */
export function terminalMenu(i: TileInfo, t: T): MenuEntry[] {
  const tools = terminalTools(i);
  if (!tools) return [];
  const open = (u: string) => () => { openOutside(u); };
  return [
    { id: 'shot', label: t('tile.screenshot'), onAction: open(tools.screenshot) },
    { id: 'raw', label: t('tile.rawPage'), onAction: open(tools.rawPage) },
    { id: 'raw-dl', label: t('tile.rawDownload'), onAction: open(tools.rawDownload) },
  ];
}

export function infoFor(slot: string, tile: Tile | null, c: InfoCtx, realm: RealmCtx): TileInfo {
  const base = { slot, tile, unchecked: c.failed, parentKeys: isProgramTile(tile) && PARENT_KEY_PROGRAMS.has(tile.program), color: null, realm: null };
  if (!tile) return { ...base, computer: null, state: 'empty', name: '', computerName: '', label: c.t('empty.chip'), title: c.t('empty.chip'), url: null, shareUrl: null, refused: false };
  const name = tileName(tile, c.t);
  const conv = tileConv(tile);
  if (conv) return convInfo(base, tile, conv, name, c, realm);
  if (isUrlTile(tile)) return { ...base, computer: null, state: 'live', name, computerName: '', label: name, title: name, url: tile.url, shareUrl: tile.url, refused: false };
  const on = tileComputer(tile) as { project: string; computer: string };
  let computer = c.computers?.find((x) => x.id === on.computer) ?? null;
  let state: TileState = slotState(tile, c.computers);
  // Absence is a proof only from a read that answered, whole and not failed since: a computer missing from rows a later read
  // failed over, or from a first page that is not the whole list, is unknown. A computer the rows list keeps its row's state.
  if (c.failed && state === 'loading') state = 'unknown';
  if (state === 'gone' && !computer && (c.failed || c.complete === false)) state = 'unknown';
  // Missing from the whole list: the API leaves a computer whose server's rental ended out of it, so "deleted or moved"
  // is said only when the read that includes those lacks it too. Its row there is the tile's computer (never framed).
  if (state === 'gone' && !computer && c.expired) {
    const ended = c.expired.rows?.find((x) => x.id === on.computer && x.project_id === on.project) ?? null;
    if (ended) { computer = ended; state = 'attention'; }
    else if (c.expired.failed) state = 'unknown';
    else if (c.expired.rows === null) state = 'loading';
    else if (!c.expired.complete) state = 'unknown';
  }
  const computerName = computer?.name || c.t('tile.unknownComputer');
  let url: string | null = null, shareUrl: string | null = null, refused = false;
  if (isBotTile(tile)) {
    // Drawn by the Bots page's tile view (Tile.tsx), never a frame: no address, nothing to share.
  } else if (isPortTile(tile)) {
    if (state === 'live' && computer && c.domain) {
      const origin = buildPortUrl({ id: tile.project }, { id: computer.id, server_name: computer.server_name }, tile.protocol, tile.port);
      if (origin) url = shareUrl = origin + (tile.path ?? '');
    }
  } else if (state === 'live' && computer && c.cat && c.domain) {
    const target = { id: computer.id, project_id: tile.project, server_name: computer.server_name };
    const live = tileUrl(c.cat, tile, target, { computersDomain: c.domain, origin: c.origin, defaults: boardDefaults(tile.program, c.scheme) });
    const share = tileUrl(c.cat, tile, target, { computersDomain: c.domain, share: true });
    if ('url' in live && 'url' in share) { url = live.url; shareUrl = tile.ssh ? null : share.url; } else refused = true;
  }
  return {
    ...base,
    computer,
    color: computer ? computerColor(computer) : null,
    realm: realmOfTile(computer, realm, c.t),
    state,
    name,
    computerName,
    label: c.t('tile.label', { name, computer: computerName }),
    title: c.t('tile.frameTitle', { name, computer: computerName }),
    url,
    shareUrl,
    refused,
  };
}

/** A conversation tile's info: its computer by handle (one row only: two rows of one handle name none), no frame url. */
function convInfo(base: Pick<TileInfo, 'slot' | 'tile' | 'unchecked' | 'parentKeys'>, tile: Tile, conv: ConvRef, name: string, c: InfoCtx, realm: RealmCtx): TileInfo {
  const named = (c.computers ?? []).filter((x) => computerHandle(x) === conv.computer);
  const computer = named.length === 1 ? named[0]! : null;
  const run = computer ? computerState(computer.status) : null;
  let state: TileState = run ? (run === 'running' ? 'live' : run) : c.computers ? 'gone' : 'loading';
  if (c.failed && state === 'loading') state = 'unknown';
  if (state === 'gone' && !computer && (c.failed || c.complete === false)) state = 'unknown';
  const computerName = computer?.name || conv.computer;
  return {
    ...base,
    // Native, not a frame: the Board's own Ctrl+Alt+B (a page key that runs while typing) leaves it, so the hint names it.
    parentKeys: true,
    computer,
    color: computer ? computerColor(computer) : null,
    realm: realmOfTile(computer, realm, c.t),
    state,
    name,
    computerName,
    label: c.t('tile.label', { name, computer: computerName }),
    title: c.t('tile.frameTitle', { name, computer: computerName }),
    url: null,
    shareUrl: isUrlTile(tile) ? tile.url : null,
    refused: false,
    conv,
  };
}

/** Every slot of a Board, in reading order. The same session twice: the first keeps its plain label,
 *  each later one (reading order) gets " (2)", " (3)" on its label (header, chip, Swap with, live region) and title. */
export function boardInfo(b: Board, c: InfoCtx, realm: RealmCtx): TileInfo[] {
  const out = slots(b.layout).map((s) => infoFor(s, b.tiles[s] ?? null, c, realm));
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  const key = (i: TileInfo) => (isProgramTile(i.tile) ? i.tile.computer + '/' + i.tile.program + '/' + i.tile.session : '');
  for (const i of out) if (key(i)) total.set(key(i), (total.get(key(i)) ?? 0) + 1);
  return out.map((i) => {
    if (!key(i) || (total.get(key(i)) ?? 0) < 2) return i;
    const n = (seen.get(key(i)) ?? 0) + 1;
    seen.set(key(i), n);
    if (n === 1) return i;
    const suffix = c.t('tile.dup', { n });
    return { ...i, suffix, label: i.label + suffix, title: i.title + suffix };
  });
}
