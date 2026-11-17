// What one slot shows: the pure part (split out of tileInfo.ts so the terminal build shares it; the contract is at the
// top of tileInfo.ts). tileInfo.ts re-exports every name here and keeps terminalMenu (openOutside), infoFor and
// boardInfo (they read conversation links through links.ts tileConv).
import { BOARD_BROWSER_IDS, inRunBand, type RealmColor, type RealmRow } from '@core';
import type { Catalog } from '../embed/catalog';
import type { BoardComputer, ExpiredComputers } from '../computers';
import { isBotTile, isProgramTile, isUrlTile, type ConvRef, type Tile } from '../model/boards';
import type { SlotState } from '../model/tiles';
import type { EmbedValue } from '../embed/build';
import { TERM_THEMES } from '../options/themes';
import type { HubScheme } from './scheme';
import type { ShellTarget } from './shellChange';
import type { T } from './text';

/** Programs whose kits take parent_keys (Ctrl+Alt+B posts a message): the header hint follows it. */
export const PARENT_KEY_PROGRAMS: ReadonlySet<string> = new Set(['terminal', 'display', 'agent']);

export type TileState = SlotState | 'unknown';

export interface TileInfo {
  readonly slot: string;
  readonly tile: Tile | null;
  readonly computer: BoardComputer | null;
  readonly state: TileState;
  /** The computers list failed on the last read (shown state may be old). */
  readonly unchecked: boolean;
  readonly name: string;
  readonly computerName: string;
  readonly label: string;
  readonly title: string;
  /** " (2)" for the second tile of one session on this Board (boardInfo), else absent. */
  readonly suffix?: string;
  readonly url: string | null;
  readonly shareUrl: string | null;
  /** The catalogue refused this tile's address (a bad session or option). */
  readonly refused: boolean;
  readonly parentKeys: boolean;
  /** The computer's own colour, `#RRGGBB` (core computerColor), or null: no computer, or no usable colour. */
  readonly color: string | null;
  /** All realms only: the computer's realm as text (and its tint), or null. */
  readonly realm: TileRealm | null;
  /** A conversation tile's reference; absent for every other tile. */
  readonly conv?: ConvRef;
}

/** A tile's realm, shown as text in All realms. */
export interface TileRealm {
  readonly name: string;
  readonly tint: RealmColor | '';
}

/** Which realm the Board shows (useRealms().selected, 'all' or an id) and the realm list: one argument for every
 *  caller of infoFor and boardInfo, the Board and the program view alike. */
export interface RealmCtx {
  readonly selected: string;
  readonly rows: readonly RealmRow[] | null;
}

/** A realm name as the tile header's chip shows it: up to 13 characters whole, longer ones cut in the MIDDLE (first 7,
 *  "…", last 5) so names that share a start ("Acme Production", "Acme Product QA") still differ. The full name is in
 *  the chip's popover and the tile's accessible name. */
export function cutMiddle(name: string): string {
  const ch = Array.from(name);
  return ch.length > 13 ? `${ch.slice(0, 7).join('')}…${ch.slice(-5).join('')}` : name;
}

/** The tile's accessible name: its label (with the duplicate-session suffix), then its realm in All realms. */
export function groupLabel(i: TileInfo, t: T): string {
  return i.realm ? t('tile.inRealm', { label: i.label, realm: i.realm.name }) : i.label;
}

/** The realm a tile's computer shows in All realms: the first of its realm_ids that is in the realm list, else null.
 * In one realm, null: the realm is the page's, shown once in its header. */
export function realmOfTile(computer: BoardComputer | null, r: RealmCtx, t: T): TileRealm | null {
  if (r.selected !== 'all' || !computer) return null;
  for (const id of computer.realm_ids ?? []) {
    const row = r.rows?.find((x) => x.id === id);
    if (row) return { name: row.name.kind === 'alias' || row.name.kind === 'short' ? row.name.text : t('realm.global'), tint: row.tint };
  }
  return null;
}

export interface InfoCtx {
  readonly computers: readonly BoardComputer[] | null;
  readonly failed: boolean;
  /** The rows are the whole list (useBoardComputers().complete). Left out, as before: a missing computer is gone. */
  readonly complete?: boolean;
  /** The read that includes computers whose server's rental ended (useExpiredComputers), asked for while a tile's
   *  computer is missing from the whole list. Left out, as before: a missing computer is gone. */
  readonly expired?: Pick<ExpiredComputers, 'rows' | 'complete' | 'failed'>;
  readonly cat: Catalog | null;
  readonly domain: string;
  /** The page's own origin: a program frame's parent for the parent keys (tileUrl). Never the origin of conversation
   *  links: infoFor reads those on the Hub site (links.ts hubOrigin()). */
  readonly origin: string;
  /** The Hub's light or dark look: terminal and agent tiles follow it unless their own theme is set. */
  readonly scheme: HubScheme;
  readonly t: T;
}

/**
 * The Board's defaults for options a tile did not set: terminal and agent tiles get the Hoody palette that
 * matches the Hub's look, and a terminal hides its own toolbar (the tile bar carries its actions). Never stored and
 * never in a share link; a kept value always wins (tileUrl).
 */
export function boardDefaults(program: string, scheme: HubScheme): Readonly<Record<string, EmbedValue>> {
  if (program !== 'terminal' && program !== 'agent') return {};
  const theme = (scheme === 'dark' ? TERM_THEMES.hoodyDark : TERM_THEMES.hoodyLight) as unknown as Readonly<Record<string, string>>;
  return program === 'terminal' ? { theme, 'hide-toolbar': true } : { theme };
}

/** The host of a web address (its name when the person gave none). */
const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return url; } };

/** A tile's name as shown (header, chip, live region): its own name, else the default for its kind. */
export function tileName(tile: Tile, t: T): string {
  if (tile.name) return tile.name;
  if (isProgramTile(tile)) return t('tile.name', { program: tile.program, session: tile.session });
  if (isUrlTile(tile)) return hostOf(tile.url);
  if (isBotTile(tile)) return tile.bot;
  return tile.protocol === 'exec' ? tile.path || t('tile.script') : t('tile.port', { port: tile.port });
}

/**
 * A live terminal tile's own tools on its kit: the screenshot (save=false: nothing is kept on the
 * computer) and the raw output as a page or a download, on the tile's own origin. Opened in a new tab, never
 * fetched by the Hub: a terminal frame takes no sign-in token (only agent frames are signed, SignedFrame), so the
 * new tab is admitted the same way the frame is, and these addresses never carry a token. null for anything else
 * (agent terminals included: their host is the agent's).
 */
export function terminalTools(i: TileInfo): { screenshot: string; rawPage: string; rawDownload: string } | null {
  if (!isProgramTile(i.tile) || i.tile.program !== 'terminal' || i.state !== 'live' || !i.url) return null;
  let origin: string;
  try { origin = new URL(i.url).origin; } catch { return null; }
  const id = `terminal_id=${i.tile.session}`;
  return {
    screenshot: `${origin}/api/v1/terminal/screenshot?${id}&format=png&save=false`,
    rawPage: `${origin}/api/v1/terminal/raw?${id}&format=html`,
    rawDownload: `${origin}/api/v1/terminal/raw?${id}&format=download`,
  };
}

/** The terminal a live terminal tile's Options Shell row reads: an ssh tile too (shown, never changed). Never a
 *  terminal an app launch placed (the run-open band, 8001-9999): the terminal list the shell is read from, and Restart
 *  terminal and Change shell act on, holds only 1-8000, so they would call a running launch "not running". */
export function shellShown(i: TileInfo): ShellTarget | null {
  if (!terminalTools(i) || !i.computer || !isProgramTile(i.tile) || inRunBand(i.tile.session)) return null;
  return { computer: i.computer, session: i.tile.session, name: i.name };
}

/** The terminal whose shell a tile may change: a live plain terminal tile (never an ssh tile). */
export function shellTarget(i: TileInfo): ShellTarget | null {
  return isProgramTile(i.tile) && i.tile.ssh ? null : shellShown(i);
}

export function browserTarget(i: TileInfo): { computer: BoardComputer; session: number; name: string } | null {
  if (!i.computer || !isProgramTile(i.tile) || i.tile.program !== 'browser' || i.tile.session > BOARD_BROWSER_IDS[1]) return null;
  return { computer: i.computer, session: i.tile.session, name: i.name };
}
