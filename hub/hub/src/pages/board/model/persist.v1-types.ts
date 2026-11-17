// TEST ONLY, FROZEN. The Board types as persist.v1-frozen.ts was written against them (boards.ts before its noun rename):
// the in-memory tile names its computer `container`, the old Hub storage shape that frozen parser reads and writes. boards.ts
// renamed that field to `computer`; this copy keeps the old shape so the frozen parser compiles unchanged and keeps proving
// that today's Hub reads what an old Hub tab wrote. Never edit it to follow boards.ts, and never import it from product code
// (persist.v1-frozen.ts and persist.frozen.test.ts alone import it; persist.frozen.test.ts pins both files' bytes).
import type { EmbedValue } from '../embed/build';
import type { TileProgram } from '../embed/catalog';
import type { Ssh } from '../sshRules';
import type { Node } from './tree';
import { freshRealm as boardsFreshRealm, isProgramTile as boardsIsProgramTile } from './boards';

export interface TileRef {
  readonly project: string;
  readonly container: string;
  readonly program: TileProgram;
  readonly session: number;
  readonly view?: string;
  readonly params?: Readonly<Record<string, EmbedValue>>;
  readonly ssh?: Ssh;
  readonly name?: string;
  readonly tid?: string;
  readonly dropped?: readonly string[];
}

export interface UrlTile {
  readonly url: string;
  readonly name?: string;
  readonly tid?: string;
}

export interface PortTile {
  readonly project: string;
  readonly container: string;
  readonly protocol: 'http' | 'exec';
  readonly port: number;
  readonly path?: string;
  readonly name?: string;
  readonly tid?: string;
}

export interface BotTile {
  readonly project: string;
  readonly container: string;
  readonly realm: string;
  readonly bot: string;
  readonly name?: string;
  readonly tid?: string;
}

export type Tile = TileRef | UrlTile | PortTile | BotTile;

export interface BoardFor { readonly c: string; readonly k: string }

export interface Board {
  readonly id: string;
  readonly name: string;
  readonly layout: Node;
  readonly tiles: Readonly<Record<string, Tile | null>>;
  readonly active: string;
  readonly max: string | null;
  readonly mode?: 'scroll';
  readonly for?: BoardFor;
  readonly at?: number;
}

export interface RealmBoards {
  readonly v: 1;
  readonly active: string;
  readonly boards: readonly Board[];
  readonly recents: readonly TileRef[];
  readonly keep?: true;
  readonly gone?: readonly string[];
  readonly unreadable?: { readonly at: number; readonly raw: string };
}

export type Rand = () => number;

// The two boards.ts functions the frozen parser calls, under the old types: the SAME function objects (persist.frozen.test.ts),
// only their declared types differ. Neither cares which name the computer field has: freshRealm's realm holds no tile (one
// Board, one empty slot), and isProgramTile reads only whether `program` is in the tile.
export const freshRealm = boardsFreshRealm as unknown as (rand: Rand) => RealmBoards;
export const isProgramTile = boardsIsProgramTile as unknown as (t: Tile | null | undefined) => t is TileRef;
