// Public hrefs of the Board page: the only file other pages may import from this folder. Other pages pair
// usePageLink('board') with followPagePath(link, programViewPath(...), portViewPath(...) or boardAddPath(...), go)
// A computer is named by its handle (name.last4), never by its full id, except in an Add link
// (boardAddPath): the Board replaces that history entry at its first render with the link, before its saved Boards
// open or its computer list answers, so no entry the Board showed keeps the id. No URL of the program itself, no token.

import { hostEnv, hubSiteOrigin, type Target } from '@core';
import { computersDomain } from './computers';
import { CATALOG, type TileProgram } from './embed/catalog';
import { tileUrl } from './embed/options';
import { parseConvTileUrl } from './links.pure';
import { isUrlTile, type ConvRef, type Tile } from './model/boards';
import { useHubScheme } from './parts/scheme';
import { boardDefaults } from './parts/tileInfo.pure';
export { links, boardConnectSshLink, parseConnectSsh, convTileUrl, parseConvTileUrl, convTile, programViewPath, ROUTE_MAX, routeOk, portViewPath, parseView, parseProgramView, tileHostFits, isNewTerminal, openTile, openFits, boardAddPath, parseBoardAdd, linkBoardAddPath } from './links.pure';
export type { ConnectSshRef, ProgramViewRef, PortViewRef, ViewRef, BoardOpen, BoardKey, BoardAddAt, BoardAddRef, NewTerminalRef } from './links.pure';

/** The origin whose /auth/ pages are this Hub (core hubSiteOrigin: this page's when served, the chosen Hoody's in the
 *  one-file Hub, '' while none is chosen or outside a browser): the only origin whose conversation links a Board reads
 *  as conversations. '' links nothing. */
export const hubOrigin = (): string => hubSiteOrigin();

/** The conversation a tile shows: a web tile whose address is exactly a conversation's canonical link on this Hub's
 *  `origin` (parseConvTileUrl), else null (any other tile, another origin, no origin). Read from the address every
 *  time, so a tile the picker made from a pasted link and one convTile made are the same tile. */
export function tileConv(t: Tile | null | undefined, origin: string = hubOrigin()): ConvRef | null {
  return isUrlTile(t) ? parseConvTileUrl(t.url, origin) : null;
}

/**
 * A program session shown inline on another page (the AI page's Claude Code setup terminal), addressed exactly as a
 * Board tile of it: `url` is the frame address (the Board's defaults for what the page did not set: the Hoody palette of
 * the Hub's current light or dark look, a terminal's own toolbar hidden; parent keys and this page's origin), `shareUrl`
 * the Open in a new tab address (no Board option or default, as a tile's Copy link). null without a target or session,
 * or when the Board would refuse the address. Re-renders when the Hub's look changes.
 */
export function useInlineProgramUrls(program: TileProgram, session: number | null, target: Target | null): { url: string; shareUrl: string } | null {
  const scheme = useHubScheme();
  if (session === null || !target) return null;
  const at = { id: target.container.id, project_id: target.project.id, server_name: target.container.server_name ?? '' };
  // The page's own origin through the host seam (web: location.origin); a terminal has no frame parent: none.
  const origin = hostEnv().browserPage === true ? (hostEnv().pageAddress?.origin ?? '') : '';
  const live = tileUrl(CATALOG, { program, session }, at, { computersDomain: computersDomain(), origin, defaults: boardDefaults(program, scheme) });
  const share = tileUrl(CATALOG, { program, session }, at, { computersDomain: computersDomain(), share: true });
  return 'url' in live && 'url' in share ? { url: live.url, shareUrl: share.url } : null;
}

/** Put on Board beside another page's open-in-a-new-tab: pages reach the Board through this file only. */
export { BoardAddButton, useBoardAddEntry } from './BoardAddButton';

/** The Board's program frame (its sandbox and allow lists), for a page that shows one program session inline: the AI
 *  page's Claude Code setup terminal, a run-band terminal no Board tile can hold. */
export { Frame } from './parts/Frame';
