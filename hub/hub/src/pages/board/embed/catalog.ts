// The Board's copy of the SDK embed catalogue (embeds.catalog.v1.json), trimmed to the programs a tile can show.
//
// Contract, in plain words:
//   - catalog.ui.json is trimCatalog(<SDK generated/embeds.catalog.v1.json>) byte for byte as JSON; embed.sync.test.ts
//     compares it with the SDK file on hosts that have the SDK tree, and REGEN_BOARD_EMBEDS=1 rewrites it.
//   - The trim keeps, for each tile program, its host rule (services), its kit entry (views, default view, refused
//     names) and its views whole (params with type/enum/min/max/maxLength/pattern/format/serialize/encoder, required,
//     const, flags, the descriptions as a first draft for the option panels). Nothing is invented or renamed.
//   - The catalogue is data and guard rails, never the UI: panels are designed per program.
//   - CATALOG is the trimmed catalogue, part of the Board's own chunk (storage cleans options with it on every read
//     and write, so it cannot wait for a lazy load); loadCatalog() hands it over as a promise.
import catalogJson from './catalog.ui.json';

/** The programs a tile can show, in picker order. The first five are first-class (full option panels of their
 *  own); code, sqlite and notes have smaller panels of their own (options/model.ts). */
export const TILE_PROGRAMS = ['agent', 'terminal', 'display', 'files', 'browser', 'code', 'sqlite', 'notes'] as const;
export type TileProgram = (typeof TILE_PROGRAMS)[number];
export const FIRST_CLASS: readonly TileProgram[] = ['agent', 'terminal', 'display', 'files', 'browser'];

export function isTileProgram(p: unknown): p is TileProgram {
  return typeof p === 'string' && (TILE_PROGRAMS as readonly string[]).includes(p);
}

export type Scalar = string | number | boolean;

export interface CatParam {
  readonly wire: string;
  readonly in: 'query' | 'path';
  readonly type: string;
  readonly class: string;
  readonly enum?: readonly Scalar[];
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly wirePattern?: string;
  readonly format?: string;
  readonly repeat?: string;
  readonly serialize?: string;
  readonly encoder?: string;
  readonly label?: string;
  readonly publicDescription?: string;
}

export interface CatView {
  readonly kit: string;
  readonly view: string;
  readonly service: string;
  readonly program: string;
  readonly default: boolean;
  readonly label?: string;
  readonly publicDescription?: string;
  readonly path: string;
  readonly params: Readonly<Record<string, CatParam>>;
  readonly required: readonly string[];
  readonly const: Readonly<Record<string, Scalar>>;
  readonly flags: readonly string[];
  readonly freeQuery: boolean;
  readonly alias: string;
  readonly aliasSelector?: string;
}

export interface CatService {
  readonly segment: string;
  readonly segmentAtDefault?: string;
  readonly index?: { readonly min: number; readonly max: number; readonly default: number; readonly selects?: string };
  readonly port?: { readonly min: number; readonly max: number };
}

export interface CatRefusal { readonly class: string; readonly reasonCode: string; readonly replacement?: string }

export interface CatKit {
  readonly ui: string;
  readonly defaultView?: string;
  readonly views: readonly string[];
  readonly refused: Readonly<Record<string, CatRefusal>>;
  readonly publicDescription?: string;
}

export interface Catalog {
  readonly catalogVersion: number;
  readonly programs: readonly string[];
  readonly services: Readonly<Record<string, CatService>>;
  readonly kits: Readonly<Record<string, CatKit>>;
  readonly views: Readonly<Record<string, CatView>>;
}

interface SourceCatalog {
  catalogVersion: number;
  services: Record<string, unknown>;
  kits: Record<string, { views?: string[] }>;
  views: Record<string, unknown>;
}

/** The Board's catalogue from the SDK's: the tile programs' services, kits and views, unchanged. */
export function trimCatalog(src: SourceCatalog): Catalog {
  const services: Record<string, unknown> = {}, kits: Record<string, unknown> = {}, views: Record<string, unknown> = {};
  for (const p of TILE_PROGRAMS) {
    const kit = src.kits[p];
    if (!kit) throw new Error('catalogue has no kit ' + p);
    kits[p] = kit;
    for (const vid of kit.views ?? []) {
      const v = src.views[vid] as { service?: string } | undefined;
      if (!v) throw new Error('catalogue has no view ' + vid);
      views[vid] = v;
      if (v.service && src.services[v.service]) services[v.service] = src.services[v.service];
    }
  }
  return JSON.parse(JSON.stringify({ catalogVersion: src.catalogVersion, programs: [...TILE_PROGRAMS], services, kits, views })) as Catalog;
}

export const CATALOG = catalogJson as unknown as Catalog;

/** The trimmed catalogue. */
export function loadCatalog(): Promise<Catalog> {
  return Promise.resolve(CATALOG);
}

/** A program with one instance per computer (its service index selects nothing: files, sqlite, notes): the picker skips
 *  the session step and a picked tile is <program>-1 (Duplicate tile may still number a copy; any index opens the
 *  same instance). */
export function oneSession(cat: Catalog, kit: TileProgram): boolean {
  const k = cat.kits[kit];
  const v = k?.defaultView ? cat.views[k.defaultView] : undefined;
  return !!v?.service && cat.services[v.service]?.index?.selects === 'none';
}

/** The view name a new tile of this program is created with: the catalogue default when it builds with
 *  no option set, else the program's first view that does; undefined when none does (the program is not offered). */
export function startView(cat: Catalog, kit: TileProgram): string | undefined {
  const k = cat.kits[kit];
  const ok = (id: string | undefined) => id !== undefined && !!cat.views[id] && cat.views[id].required.length === 0;
  const id = ok(k?.defaultView) ? k?.defaultView : k?.views.find(ok);
  return id ? cat.views[id]?.view : undefined;
}
