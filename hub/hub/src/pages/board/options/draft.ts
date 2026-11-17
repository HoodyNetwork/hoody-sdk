// The Options panel's working copy and its rules, free of React.
//
// Contract, in plain words:
//   - A draft is {view, params}: the view name the Opens control picked (programs with several views) and the
//     options set so far. Nothing leaves the draft before Save; Save hands over saveDraft(): only the options of
//     rows that show and are enabled on that view, passed through cleanParams, and the view written explicitly
//     for programs with several views (files and code start on 'root').
//   - Checks are the catalogue's checkOption plus the Board's size limit (OPTION_VALUE_MAX as JSON), and the
//     Opens block's required fields. errorsOf maps each problem to one strings key with its vars; a row's own
//     pattern text (patternErr) names what the pattern wants.
//   - Hidden or disabled rows are neither checked nor saved: nothing invisible can block Save.
//   - changedCount counts the options a tile keeps, plus one when the view is not the program's start view.
//   - Display quality presets and the files page-parts writer live here so they are tested alone.
import { checkOption, type EmbedErrorCode, type EmbedValue } from '../embed/build';
import type { CatParam, CatView, Catalog, Scalar, TileProgram } from '../embed/catalog';
import { OPTION_VALUE_MAX, cleanParams, tileView } from '../embed/options';
import { PANELS, rowIds, startView, type OpensField, type Params, type Row, type Section } from './model';

export interface Draft {
  readonly view: string | undefined;
  readonly params: Params;
  /** The Opens values each view left behind on a view switch (withView): this panel's memory only, never saved. */
  readonly byView?: Readonly<Record<string, Params>>;
}

export interface FieldError {
  readonly key: string;
  readonly vars?: Readonly<Record<string, string | number>>;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The view name a tile shows (embed tileView decides what an absent or unknown name means). */
export function viewName(cat: Catalog, program: TileProgram, view: string | undefined): string | undefined {
  if (!PANELS[program].opens) return undefined;
  return tileView(cat, program, view)?.view ?? startView(program);
}

export function catView(cat: Catalog, program: TileProgram, view: string | undefined): CatView | null {
  return tileView(cat, program, view);
}

/** The tile as saved: its view and the options it keeps (cleanParams). The panel compares the working draft against
 *  this, so it is never seeded: a seeded folder must read as a change that Save stores. */
export function openDraft(cat: Catalog, program: TileProgram, view: string | undefined, params: unknown): Draft {
  const v = viewName(cat, program, view);
  return { view: v, params: cleanParams(cat, program, v, params) };
}

/** The working draft a panel starts from: the saved draft with its view's folder seeded (as withView does), so a tile
 *  saved on a folder view without its folder opens at '/' with Save enabled. */
export function seedDraft(cat: Catalog, program: TileProgram, d: Draft): Draft {
  const params = seedFolder(cat, program, d.view, d.params);
  return params === d.params ? d : { ...d, params };
}

/** The folder field each view starts at '/', listed literally: Files Editor's path is a file and Code
 *  One extension's folder is optional, so neither is seeded. */
const FOLDER_SEED: Partial<Record<TileProgram, Readonly<Record<string, string>>>> = {
  files: { folder: 'path', search: 'directory' },
  code: { editor: 'folder' },
};

/** The params with the view's folder field set to '/' when it is empty and the catalogue requires it. */
function seedFolder(cat: Catalog, program: TileProgram, view: string | undefined, params: Params): Params {
  const id = view !== undefined ? FOLDER_SEED[program]?.[view] : undefined;
  if (id === undefined || (params[id] !== undefined && params[id] !== '') || opensOptional(catView(cat, program, view), id)) return params;
  return { ...params, [id]: '/' };
}

/**
 * The draft on another view (the Opens control). An Opens field keeps its value across the switch only when both
 * views name it with the same label key; otherwise its meaning differs (Files path: a folder or a file), so the
 * leaving view's value goes to byView and the entering view gets back its own, if it had one. The folder seed
 * applies last, so '/' is never carried into a file path. Save writes only draft.params, as shown.
 */
export function withView(cat: Catalog, program: TileProgram, d: Draft, view: string): Draft {
  if (view === d.view) return d;
  const leaving = opensFields(program, d.view);
  const entering = opensFields(program, view);
  const params: Record<string, EmbedValue> = { ...d.params };
  const left: Record<string, EmbedValue> = {};
  for (const f of leaving) {
    if (entering.some((e) => e.id === f.id && e.key === f.key)) continue;
    const value = params[f.id];
    if (value !== undefined) left[f.id] = value;
    delete params[f.id];
  }
  const byView: Record<string, Params> = { ...d.byView };
  if (d.view !== undefined) byView[d.view] = left;
  for (const [id, value] of Object.entries(byView[view] ?? {})) if (params[id] === undefined && entering.some((e) => e.id === id)) params[id] = value;
  return { view, params: seedFolder(cat, program, view, params), byView };
}

/** Saved options the catalogue no longer accepts: dropped at the next Save. */
export function staleIds(cat: Catalog, program: TileProgram, view: string | undefined, params: unknown): string[] {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return [];
  const kept = cleanParams(cat, program, viewName(cat, program, view), params);
  return Object.keys(params).filter((id) => !own(kept, id));
}

/** Sets (value defined) or unsets one option. */
export function setOption(d: Draft, id: string, value: EmbedValue | undefined): Draft {
  const params: Record<string, EmbedValue> = { ...d.params };
  if (value === undefined) delete params[id];
  else params[id] = value;
  return { ...d, params };
}

export function setOptions(d: Draft, values: Readonly<Record<string, EmbedValue | undefined>>): Draft {
  let out = d;
  for (const [id, v] of Object.entries(values)) out = setOption(out, id, v);
  return out;
}

/** Reset all: no option, and the program's start view. */
export function resetDraft(program: TileProgram): Draft {
  return { view: startView(program), params: {} };
}

// ── What shows ───────────────────────────────────────────────────────────────────────

/** The row shows: the view takes every id it writes (a group row: any), and its `when` holds. */
export function rowShown(r: Row, v: CatView | null, p: Params): boolean {
  if (!v) return false;
  const ids = rowIds(r);
  const takes = r.kind === 'parts' || r.kind === 'quality' || r.kind === 'size' ? ids.some((id) => own(v.params, id)) : ids.every((id) => own(v.params, id));
  return takes && (!('when' in r) || !r.when || r.when(p));
}

export function rowEnabled(r: Row, p: Params): boolean {
  return !('needs' in r) || !r.needs || p[r.needs] !== undefined;
}

/** The sections that show on this view (a section with no row on it hides), each with its showing rows. */
export function shownSections(program: TileProgram, v: CatView | null, p: Params): Array<{ section: Section; rows: Row[] }> {
  return PANELS[program].sections
    .map((section) => ({ section, rows: section.rows.filter((r) => rowShown(r, v, p)) }))
    .filter((x) => x.rows.length > 0);
}

/** The Opens block fields of a view. */
export function opensFields(program: TileProgram, view: string | undefined): readonly OpensField[] {
  return (view !== undefined && PANELS[program].opensFields?.[view]) || [];
}

/** A field of the Opens block that may stay empty (code folder on One extension). */
export function opensOptional(v: CatView | null, id: string): boolean {
  return !!v && !v.required.includes(id);
}

/** The ids the draft keeps right now: rows that show and are enabled, and the Opens fields of the view. */
export function liveIds(program: TileProgram, v: CatView | null, p: Params): string[] {
  const ids = opensFields(program, v?.view).map((f) => f.id);
  for (const { rows } of shownSections(program, v, p)) for (const r of rows) if (rowEnabled(r, p)) for (const id of rowIds(r)) if (v && own(v.params, id)) ids.push(id);
  return ids;
}

// ── Checks ───────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en');

/** The one error line for a value the catalogue refuses. */
export function errorText(p: CatParam, id: string, value: unknown, code: EmbedErrorCode, patternErr?: string): FieldError {
  if (p.type === 'integer' || p.type === 'number') {
    if (typeof value === 'number' && p.type === 'integer' && !Number.isInteger(value)) return { key: 'err.whole' };
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (p.min !== undefined && p.max !== undefined) return { key: 'err.range', vars: { min: fmt(p.min), max: fmt(p.max) } };
      if (p.min !== undefined) return { key: 'err.min', vars: { min: fmt(p.min) } };
      if (p.max !== undefined) return { key: 'err.max', vars: { max: fmt(p.max) } };
    }
    return { key: 'err.whole' };
  }
  if (p.serialize === 'json') return { key: 'err.json' };
  if (typeof value === 'string') {
    if (p.encoder === 'path-segments') {
      if (!value.startsWith('/')) return { key: 'err.slash' };
      if (value.slice(1).split('/').some((s) => s === '.' || s === '..')) return { key: 'err.dots' };
    }
    if (p.maxLength !== undefined && value.length > p.maxLength) return { key: 'err.maxLength', vars: { max: fmt(p.maxLength) } };
    if (p.format === 'uri' || p.pattern === '^https?://') return { key: 'err.url' };
    if (p.pattern !== undefined && patternErr) return { key: patternErr };
  }
  void id;
  void code;
  return { key: 'err.invalid' };
}

/** null when the value may be kept, else its error line (catalogue check, then the Board's size limit). */
export function checkValue(p: CatParam, id: string, value: unknown, patternErr?: string): FieldError | null {
  const code = checkOption(p, id, value);
  if (code !== null) return errorText(p, id, value, code, patternErr);
  let size = Infinity;
  try { size = JSON.stringify(value).length; } catch { /* not serialisable: too long to keep */ }
  return size > OPTION_VALUE_MAX ? { key: 'err.tooLong', vars: { max: fmt(OPTION_VALUE_MAX) } } : null;
}

const patternOf = (program: TileProgram, id: string): string | undefined => {
  const panel = PANELS[program];
  for (const fields of Object.values(panel.opensFields ?? {})) for (const f of fields) if (f.id === id && f.patternErr) return f.patternErr;
  for (const s of panel.sections) for (const r of s.rows) if (r.id === id && 'patternErr' in r && r.patternErr) return r.patternErr;
  return undefined;
};

/**
 * The draft's problems by option id: live ids only. `bad` carries a control's own parse failure (a JSON theme
 * that is not an object yet), which wins over the value check.
 */
export function errorsOf(cat: Catalog, program: TileProgram, d: Draft, bad: Readonly<Record<string, FieldError>> = {}): Record<string, FieldError> {
  const v = catView(cat, program, d.view);
  const out: Record<string, FieldError> = {};
  if (!v) return out;
  for (const f of opensFields(program, v.view)) {
    if ((d.params[f.id] === undefined || d.params[f.id] === '') && !opensOptional(v, f.id)) out[f.id] = { key: f.key + '.required' };
  }
  for (const id of liveIds(program, v, d.params)) {
    if (out[id]) continue;
    if (bad[id]) { out[id] = bad[id]; continue; }
    const value = d.params[id];
    if (value === undefined) continue;
    const e = checkValue(v.params[id] as CatParam, id, value, patternOf(program, id));
    if (e) out[id] = e;
  }
  return out;
}

/** The draft without the values Save would refuse: the preview draws only what can be saved (a refused size or
 *  colour shows the default until it is fixed). */
export function validParams(params: Params, errors: Readonly<Record<string, FieldError>>): Params {
  const out: Record<string, EmbedValue> = {};
  for (const [id, value] of Object.entries(params)) if (!errors[id]) out[id] = value;
  return out;
}

/** Where each error sits: 'opens' or a section id, in panel order. */
export function errorPlaces(program: TileProgram, v: CatView | null, d: Draft, errors: Readonly<Record<string, FieldError>>): Array<{ place: string; ids: string[] }> {
  const out: Array<{ place: string; ids: string[] }> = [];
  const opens = opensFields(program, v?.view).map((f) => f.id).filter((id) => errors[id]);
  if (opens.length) out.push({ place: 'opens', ids: opens });
  for (const { section, rows } of shownSections(program, v, d.params)) {
    const ids = rows.filter((r) => rowEnabled(r, d.params)).flatMap((r) => [...rowIds(r)]).filter((id) => errors[id]);
    if (ids.length) out.push({ place: section.id, ids });
  }
  return out;
}

// ── Save and counts ──────────────────────────────────────────────────────────────────

export interface Saved {
  readonly view?: string;
  readonly params: Record<string, EmbedValue>;
}

/** What Save hands the Board: the live, valid options (cleanParams) and the view (explicit when it has several). */
export function saveDraft(cat: Catalog, program: TileProgram, d: Draft): Saved {
  const v = catView(cat, program, d.view);
  const live = new Set(liveIds(program, v, d.params));
  const picked: Record<string, EmbedValue> = {};
  for (const [id, value] of Object.entries(d.params)) if (live.has(id) && value !== '') picked[id] = value;
  const params = cleanParams(cat, program, d.view, picked);
  return PANELS[program].opens && d.view !== undefined ? { view: d.view, params } : { params };
}

/** The "N changed" count of saved options: kept options, plus one for a view other than the start view. */
export function changedCount(cat: Catalog, program: TileProgram, view: string | undefined, params: unknown): number {
  const v = viewName(cat, program, view);
  const n = Object.keys(cleanParams(cat, program, v, params)).length;
  return n + (PANELS[program].opens && v !== startView(program) ? 1 : 0);
}

/** Changed options per place (section id or 'opens') of a draft, for the "2 changed" chips. */
export function changedIn(cat: Catalog, program: TileProgram, d: Draft): Record<string, number> {
  const v = catView(cat, program, d.view);
  const out: Record<string, number> = {};
  const opens = opensFields(program, v?.view).filter((f) => d.params[f.id] !== undefined).length;
  if (opens) out.opens = opens;
  for (const { section, rows } of shownSections(program, v, d.params)) {
    const n = rows.filter((r) => rowEnabled(r, d.params)).flatMap((r) => [...rowIds(r)]).filter((id) => d.params[id] !== undefined && v && own(v.params, id)).length;
    if (n) out[section.id] = n;
  }
  return out;
}

/** The saved form of two drafts is the same (Save has nothing to do). */
export function sameSaved(a: Saved, b: Saved): boolean {
  const norm = (s: Saved) => JSON.stringify([s.view ?? null, Object.keys(s.params).sort().map((k) => [k, s.params[k]])]);
  return norm(a) === norm(b);
}

// ── Display quality presets ─────────────────────────────────────────────────────────

export type Quality = 'sharp' | 'smooth' | 'low' | 'custom';
export const QUALITY_IDS = ['encoding', 'video', 'bandwidth_limit', 'quality_mode', 'quality'] as const;
/** No preset sets quality_mode or quality, so either one set reads as Custom (they are Fine-tune only). */
const PRESETS: Readonly<Record<Exclude<Quality, 'custom'>, Readonly<Record<(typeof QUALITY_IDS)[number], Scalar | undefined>>>> = {
  sharp: { encoding: undefined, video: undefined, bandwidth_limit: undefined, quality_mode: undefined, quality: undefined },
  smooth: { encoding: 'auto', video: true, bandwidth_limit: undefined, quality_mode: undefined, quality: undefined },
  low: { encoding: 'jpeg', video: undefined, bandwidth_limit: 2000000, quality_mode: undefined, quality: undefined },
};

/** The preset the quality options match, or 'custom'. */
export function qualityOf(p: Params): Quality {
  for (const [name, set] of Object.entries(PRESETS)) {
    if (QUALITY_IDS.every((id) => p[id] === set[id])) return name as Quality;
  }
  return 'custom';
}

/** A preset sets every quality id (unsetting the ones it does not name), so presets round-trip. */
export function applyQuality(d: Draft, q: Exclude<Quality, 'custom'>): Draft {
  return setOptions(d, PRESETS[q]);
}

/** Mbit/s typed in the field → whole bits per second (rounded); empty or not a number → unset. */
export function mbitToBits(mbit: number): number | undefined {
  return Number.isFinite(mbit) ? Math.round(mbit * 1e6) : undefined;
}

// ── Files page parts ─────────────────────────────────────────────────────────

export type Part = 'header' | 'sidebar' | 'preview' | 'footer' | 'borders';
/** Each part and the catalogue flag that hides it (borders: borderless). */
const PART_ID = Object.fromEntries([
  ['header', 'hideHeader'],
  ['sidebar', 'hideSidebar'],
  ['preview', 'hidePreview'],
  ['footer', 'hideFooter'],
  ['borders', 'borderless'],
]) as Readonly<Record<Part, string>>;
export const PART_IDS = ['chromeless', ...Object.values(PART_ID)];

/** The parts a view offers (the editor has no sidebar or preview). */
export function partsOf(v: CatView | null): Part[] {
  return (Object.keys(PART_ID) as Part[]).filter((part) => !!v && own(v.params, PART_ID[part]));
}

/** What shows with these params: chromeless hides all unless a part's own flag is false. */
export function partShown(p: Params, part: Part): boolean {
  const flag = p[PART_ID[part]];
  return p.chromeless === true ? flag === false : flag !== true;
}

/**
 * The params for a ticked set: (a) hideX/borderless=true per unticked part, (b) chromeless=true plus
 * hideX/borderless=false per ticked part; the shorter wins, (a) on a tie. Only the view's parts count.
 */
export function partsParams(offered: readonly Part[], ticked: ReadonlySet<Part>): Record<string, boolean | undefined> {
  const a: Record<string, boolean> = {}, b: Record<string, boolean> = { chromeless: true };
  for (const part of offered) {
    if (ticked.has(part)) b[PART_ID[part]] = false;
    else a[PART_ID[part]] = true;
  }
  const pick = Object.keys(b).length < Object.keys(a).length ? b : a;
  const out: Record<string, boolean | undefined> = {};
  for (const id of PART_IDS) out[id] = pick[id];
  return out;
}
