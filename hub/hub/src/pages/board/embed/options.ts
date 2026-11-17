// Program options of a tile: what a tile may keep, how its URL is built, and which options the Board sets itself.
//
// Contract, in plain words:
//   - A tile keeps {view, params}: a view name of its program (absent = the default view) and only the options the
//     user changed, by catalogue param id. cleanParams keeps an option only when the view has it, it is not refused
//     (by the catalogue or the Board), not Board-owned, and its value passes the catalogue checks (checkOption); anything else is dropped, never fixed.
//   - BOARD_OWNED options are set by the Board on every URL and never shown or kept: parent_keys / parent_origin
//     (Ctrl+Alt+B leaves a terminal, agent or display tile) and embedderOrigin (files).
//   - BOARD_REFUSED options are ones the catalogue allows but the Board does not offer (
//     recording and the viewer's retry / give-up knobs). Like a catalogue refusal they are never shown, placed or kept;
//     options.test.ts fails when one leaves the catalogue, so the list cannot go stale.
//   - tileUrl builds the URL with buildEmbedUrl: typed options as params, passthrough ones as query in the view's
//     param order. It adds no credential: an agent tile's sign-in token is the live frame's business, never kept.
//     ctx.defaults are the Board's own defaults for options the tile did not set (the Hub-matched terminal
//     palette, the hidden terminal toolbar); a kept value always wins. The share form (Copy link) leaves the
//     Board-owned options and the Board's defaults out.
//   - Its host follows core's rule for every port address (hostSegment): a terminal whose long host label would pass
//     63 characters (24-character ids, numbers above 9999, such as an older app launch's terminal-15001) gets the short
//     t-<N> host, the address the apps launcher opened for those launches. The SDK builder alone would refuse it.
import { hostSegment } from '@core';
import { buildEmbedUrl, checkOption, type EmbedResult, type EmbedTarget, type EmbedValue } from './build';
import { startView, type CatParam, type CatView, type Catalog, type TileProgram } from './catalog';

export const BOARD_OWNED: readonly string[] = ['parent_keys', 'parent_origin', 'embedderOrigin'];

/** Per program: option id → why the Board does not offer it. */
export const BOARD_REFUSED: Readonly<Partial<Record<TileProgram, Readonly<Record<string, string>>>>> = {
  display: {
    record: 'records the display and starts a download on every tile load',
    record_codec: 'recording',
    record_format: 'recording',
    record_fps: 'recording',
    reconnect_count: 'retry behaviour',
    slow_retry_delay: 'retry behaviour',
    slow_retry_max_ms: 'retry behaviour',
    soft_giveup_attempts: 'give-up behaviour',
    soft_giveup_ms: 'give-up behaviour',
  },
};

/** The Board does not offer this option of this program (BOARD_REFUSED). */
export function boardRefused(kit: TileProgram, id: string): boolean {
  const m = BOARD_REFUSED[kit];
  return m !== undefined && Object.prototype.hasOwnProperty.call(m, id);
}

/** A kept option value is small: at most this many characters as JSON. */
export const OPTION_VALUE_MAX = 2048;

export interface ProgramOption {
  readonly id: string;
  /** The param as the first view that has it declares it (the views of a kit agree on shared params). */
  readonly param: CatParam;
  /** The view ids that take it, in the kit's order. */
  readonly views: readonly string[];
}

/** Every user option of a program across its views, in catalogue order (Board-owned and Board-refused ones left out). */
export function programOptions(cat: Catalog, kit: TileProgram): ProgramOption[] {
  const out = new Map<string, { id: string; param: CatParam; views: string[] }>();
  for (const vid of cat.kits[kit]?.views ?? []) {
    for (const [id, param] of Object.entries(cat.views[vid]?.params ?? {})) {
      if (BOARD_OWNED.includes(id) || boardRefused(kit, id)) continue;
      const had = out.get(id);
      if (had) had.views.push(vid);
      else out.set(id, { id, param, views: [vid] });
    }
  }
  return [...out.values()];
}

/** The view a tile names, as its catalogue entry. An absent or unknown name is the kit's start view (the one a new tile
 *  gets: it builds with no option set), never a default view that needs a field the tile never had. */
export function tileView(cat: Catalog, kit: TileProgram, view: string | undefined): CatView | null {
  const k = cat.kits[kit];
  if (!k) return null;
  const start = startView(cat, kit);
  const id = view !== undefined && k.views.includes(kit + '.' + view) ? kit + '.' + view : start !== undefined ? kit + '.' + start : k.defaultView;
  return id !== undefined ? cat.views[id] ?? null : null;
}

function sizeOk(v: unknown): boolean {
  try { return JSON.stringify(v).length <= OPTION_VALUE_MAX; } catch { return false; }
}

/** The options a tile may keep for this view (see the contract). */
export function cleanParams(cat: Catalog, kit: TileProgram, view: string | undefined, params: unknown): Record<string, EmbedValue> {
  const v = tileView(cat, kit, view);
  const out: Record<string, EmbedValue> = {};
  if (!v || !params || typeof params !== 'object' || Array.isArray(params)) return out;
  const refused = cat.kits[kit]?.refused ?? {};
  for (const [id, value] of Object.entries(params as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(v.params, id) || BOARD_OWNED.includes(id) || boardRefused(kit, id) || Object.prototype.hasOwnProperty.call(refused, id)) continue;
    const p = v.params[id] as CatParam;
    if (!sizeOk(value) || checkOption(p, id, value) !== null) continue;
    out[id] = value as EmbedValue;
  }
  return out;
}

/** A URL as the user typed it (scheme://…): saved exactly as typed, user:pw@ and any query (?key=, ?sig=, ?token=)
 *  included. */
const URL_VALUE = /^[a-z][a-z0-9+.-]*:\/\//i;
/** A raw credential in a plain (non-URL) text field: a JWT or a bearer header. */
const CREDENTIAL_TEXT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.|\bbearer\s+\S/i;

/** Why the Board will not keep this option value: 'credential' (a JWT or bearer header typed into a plain text
 *  field), or null (kept). A URL value is never refused, whatever it carries (user:pw@, ?key=, ?token=). storableParams
 *  leaves a refused value out of storage; the Board says so when a save had one (refusedParams), so it is never
 *  dropped silently. */
export function storageRefusal(value: unknown): 'credential' | null {
  return typeof value === 'string' && !URL_VALUE.test(value.trim()) && CREDENTIAL_TEXT.test(value) ? 'credential' : null;
}

/** The option ids of params whose value storageRefusal refuses (shown to the person when they save). */
export function refusedParams(params: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(params).filter(([, v]) => storageRefusal(v) !== null).map(([id]) => id);
}

/** The options a tile may keep in storage: cleanParams (catalogue ids only, checked values; URL options such as
 *  iframe_url and panel kept exactly as typed) minus any value storageRefusal refuses. On read and on write. */
export function storableParams(cat: Catalog, kit: TileProgram, view: string | undefined, params: unknown): Record<string, EmbedValue> {
  const out = cleanParams(cat, kit, view, params);
  for (const [id, value] of Object.entries(out)) if (storageRefusal(value) !== null) delete out[id];
  return out;
}

export interface TileUrlInput {
  readonly program: TileProgram;
  readonly session: number;
  readonly view?: string;
  readonly params?: Readonly<Record<string, EmbedValue>>;
}

/**
 * The tile's URL (see the contract). origin: this page's origin, given to the program for the parent keys. share:
 * the "Copy link" URL, which carries the user's options but none of the Board's own.
 */
export function tileUrl(cat: Catalog, tile: TileUrlInput, target: EmbedTarget, ctx: { computersDomain: string; origin?: string; share?: boolean; defaults?: Readonly<Record<string, EmbedValue>> }): EmbedResult {
  const v = tileView(cat, tile.program, tile.view);
  const kept = cleanParams(cat, tile.program, tile.view, tile.params ?? {});
  const params: Record<string, EmbedValue> = {}, query: Record<string, string | number | boolean> = {};
  const origin = ctx.origin && /^https?:\/\/[^/]+$/.test(ctx.origin) ? ctx.origin : undefined;
  for (const [id, p] of Object.entries(v?.params ?? {})) {
    let value: EmbedValue | undefined = kept[id];
    if (!ctx.share && id === 'parent_keys') value = true;
    if (!ctx.share && (id === 'parent_origin' || id === 'embedderOrigin') && origin) value = origin;
    if (value === undefined && !ctx.share && ctx.defaults && Object.prototype.hasOwnProperty.call(ctx.defaults, id) && !boardRefused(tile.program, id)) value = ctx.defaults[id];
    if (value === undefined) continue;
    if (p.class === 'typed') params[id] = value;
    else query[p.wire] = value as string | number | boolean;
  }
  return buildEmbedUrl(cat, tile.program, target, { view: v ? v.view : tile.view, index: tile.session, params, query }, { computersDomain: ctx.computersDomain, hostSegment });
}
