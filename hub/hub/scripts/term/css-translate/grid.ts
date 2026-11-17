// GRID POLICY. A grid container becomes a flex box when its template is a single line of tracks:
//   column        one column track (`minmax(0, 1fr)`, `1fr`, none)       → flexDirection column (exact)
//   equal-n       N equal fr tracks (`repeat(2, minmax(0, 1fr))`, `1fr 1fr`) → row, each child grow 1 basis 0
//   fill-auto     one fr track among auto/max-content (`minmax(0,1fr) auto`, `auto 1fr`, `auto 1fr auto`)
//   tracks        any mix of fr, auto, fixed (px/ch/rem) and minmax(L, fr) tracks (`88px 148px minmax(0,1fr)`)
//   auto-flow-column `grid-auto-flow: column` with no column template   → row of auto children
// The tracks become per-child styles (`childStyles[i]` for the i-th visible item). One grid row is exact; with more items
// than tracks CSS starts new rows, and the runtime chunks the items into row boxes of N (`fallback: 'chunk'`). Columns
// line up across those rows only when no track is content-sized (`aligned`); auto/max-content tracks are sized per row. Not translated (reported with counts): grid-template-areas, subgrid,
// tracks with unresolved or viewport-relative sizes, masonry.
//   auto-fit      `repeat(auto-fit|auto-fill, minmax(L, Nfr))` as the whole template → a WRAPPING row: every item basis
//                 L cells, grow N (as many side by side as fit, sharing the line; auto-fill's empty tracks are not kept)
import type { GridPlan, TermStyle } from './types';
import { commaParts, parseLength, topParts } from './values';
import { sizeCells, type Axis } from './units';
import valueParser from 'postcss-value-parser';

export type Track =
  | { kind: 'fr'; fr: number; min?: number | `${number}%` }
  | { kind: 'auto'; how: 'auto' | 'max-content' | 'min-content' }
  | { kind: 'fit'; max: number }
  | { kind: 'fixed'; size: number | `${number}%`; min?: number }
  | { kind: 'bad'; why: string };

function lenCells(v: string, axis: Axis): number | `${number}%` | { bad: string } {
  const l = parseLength(v);
  if (l.kind === 'zero') return 0;
  if (l.kind === 'px') return sizeCells(l.px, axis);
  if (l.kind === 'pct') return `${l.pct}%`;
  if (l.kind === 'bad') return { bad: l.why };
  return { bad: `${v}` };
}

export function parseTrack(t: string, axis: Axis): Track {
  const s = t.trim();
  const low = s.toLowerCase();
  if (low === 'auto' || low === 'max-content' || low === 'min-content') return { kind: 'auto', how: low };
  const fr = /^([\d.]+)fr$/i.exec(s);
  if (fr) return { kind: 'fr', fr: Number(fr[1]) };
  const fn = /^([a-z-]+)\((.*)\)$/is.exec(s);
  if (fn) {
    const name = fn[1]!.toLowerCase();
    const args = fn[2]!.split(',').map((a) => a.trim());
    if (name === 'minmax' && args.length === 2) {
      const [lo, hi] = args as [string, string];
      const hiFr = /^([\d.]+)fr$/i.exec(hi);
      const loLow = lo.toLowerCase();
      if (hiFr) {
        if (loLow === '0' || loLow === 'auto' || loLow === 'min-content') return { kind: 'fr', fr: Number(hiFr[1]) };
        const m = lenCells(lo, axis);
        if (typeof m === 'object') return { kind: 'bad', why: `minmax min ${lo}: ${m.bad}` };
        return { kind: 'fr', fr: Number(hiFr[1]), min: m };
      }
      if (/^(auto|max-content)$/i.test(hi)) return { kind: 'auto', how: 'auto' };
      const h = lenCells(hi, axis);
      if (typeof h === 'object') return { kind: 'bad', why: `minmax max ${hi}: ${h.bad}` };
      const m = loLow === '0' || loLow === 'auto' || loLow === 'min-content' ? undefined : lenCells(lo, axis);
      if (m !== undefined && typeof m === 'object') return { kind: 'bad', why: `minmax min ${lo}: ${m.bad}` };
      return { kind: 'fixed', size: h, ...(typeof m === 'number' ? { min: m } : {}) };
    }
    if (name === 'fit-content' && args.length === 1) {
      const m = lenCells(args[0]!, axis);
      if (typeof m !== 'number') return { kind: 'bad', why: `fit-content(${args[0]})` };
      return { kind: 'fit', max: m };
    }
    if (name === 'min' || name === 'max' || name === 'clamp' || name === 'calc') {
      const m = lenCells(s, axis);
      if (typeof m === 'object') return { kind: 'bad', why: m.bad };
      return { kind: 'fixed', size: m };
    }
    return { kind: 'bad', why: `${name}()` };
  }
  const m = lenCells(s, axis);
  if (typeof m === 'object') return { kind: 'bad', why: m.bad };
  return { kind: 'fixed', size: m };
}

/** Expand a track list: strips [line names], expands repeat(<int>, …). */
/** `repeat(auto-fit|auto-fill, minmax(L, Nfr))` as the whole column template: L in cells and N; a bad L or another track
 *  in the template = bad; anything else = undefined (not this shape). */
export function autoFit(columns: string | undefined): { min: number; fr: number } | { bad: string } | undefined {
  const v = (columns ?? '').replace(/\[[^\]]*\]/g, ' ').trim();
  if (!/^repeat\(\s*auto-(fit|fill)/i.test(v)) return undefined;
  const bad = { bad: 'repeat(auto-fit|auto-fill, …) other than minmax(<length>, <n>fr)' };
  // Split on TOP-LEVEL commas only: the min is often `min(100%, 260px)` (never wider than the container), which a
  // flat regex refused, and every such grid stacked in one full-width column at any terminal width.
  const whole = topParts(v);
  const rep = whole.length === 1 ? /^repeat\((.*)\)$/is.exec(whole[0]!) : null;
  const repArgs = rep ? commaParts(rep[1]!) : [];
  const mm = repArgs.length === 2 ? /^minmax\((.*)\)$/is.exec(repArgs[1]!) : null;
  const mmArgs = mm ? commaParts(mm[1]!) : [];
  const fr = mmArgs.length === 2 ? /^([\d.]+)fr$/i.exec(mmArgs[1]!) : null;
  if (!fr) return bad;
  const l = lenCells(fitMin(mmArgs[0]!), 'h');
  if (typeof l !== 'number' || l <= 0) return { bad: `repeat(${repArgs[0]}, minmax(${mmArgs[0]}, …)): min not a length` };
  return { min: l, fr: Number(fr[1]) };
}

/** `min(100%, L)` / `min(L, 100%)` as an auto-fit minimum is L: the 100% only lets a lone item be narrower than L in a
 *  container narrower than L, which the wrapping row's items already do (flexShrink 1, minWidth 0). Else `v` itself. */
function fitMin(v: string): string {
  const m = /^min\((.*)\)$/is.exec(v.trim());
  if (!m) return v;
  const a = commaParts(m[1]!);
  if (a.length !== 2) return v;
  if (/^100%$/.test(a[0]!)) return a[1]!;
  if (/^100%$/.test(a[1]!)) return a[0]!;
  return v;
}

export function splitTracks(value: string): { tracks: string[]; bad?: string } {
  const v = value.replace(/\[[^\]]*\]/g, ' ').trim();
  if (/^none$/i.test(v)) return { tracks: [] };
  if (/^subgrid/i.test(v)) return { tracks: [], bad: 'subgrid' };
  if (/^masonry/i.test(v)) return { tracks: [], bad: 'masonry' };
  const out: string[] = [];
  for (const p of topParts(v)) {
    const rep = /^repeat\((.*)\)$/is.exec(p);
    if (rep) {
      const node = valueParser(p).nodes[0] as valueParser.FunctionNode;
      const comma = node.nodes.findIndex((n) => n.type === 'div' && n.value === ',');
      const count = valueParser.stringify(node.nodes.slice(0, comma)).trim();
      const body = valueParser.stringify(node.nodes.slice(comma + 1)).trim();
      if (!/^\d+$/.test(count)) return { tracks: [], bad: `repeat(${count}, …)` };
      for (let i = 0; i < Number(count); i++) out.push(...topParts(body));
    } else out.push(p);
  }
  return { tracks: out };
}

export function trackStyle(t: Track, axis: 'row' | 'column'): TermStyle {
  const main = axis === 'row' ? 'width' : 'height';
  const minK = axis === 'row' ? 'minWidth' : 'minHeight';
  const maxK = axis === 'row' ? 'maxWidth' : 'maxHeight';
  switch (t.kind) {
    case 'fr':
      return { flexGrow: t.fr, flexShrink: 1, flexBasis: 0, [minK]: t.min ?? 0 };
    case 'auto':
      return t.how === 'min-content' ? { flexGrow: 0, flexShrink: 1 } : { flexGrow: 0, flexShrink: 0 };
    case 'fit':
      return { flexGrow: 0, flexShrink: 1, [maxK]: t.max };
    case 'fixed':
      return { flexGrow: 0, flexShrink: t.min !== undefined ? 1 : 0, [main]: t.size, ...(t.min !== undefined ? { [minK]: t.min } : {}) };
    default:
      return {};
  }
}

export interface GridInput {
  columns?: string;
  rows?: string;
  areas?: string;
  autoFlow?: string;
  autoColumns?: string;
}

export type GridResult = { ok: true; plan: GridPlan } | { ok: false; why: string; shape: string };

export function planGrid(g: GridInput): GridResult {
  const shape = `columns: ${g.columns ?? 'none'}${g.rows ? `; rows: ${g.rows}` : ''}${g.areas ? `; areas: ${g.areas}` : ''}${g.autoFlow ? `; flow: ${g.autoFlow}` : ''}`;
  if (g.areas && !/^none$/i.test(g.areas.trim())) return { ok: false, why: 'grid-template-areas', shape };
  if (g.columns && /var\(/.test(g.columns)) return { ok: false, why: 'track list holds an unresolved var() (set at run time)', shape };
  const flow = (g.autoFlow ?? 'row').toLowerCase();
  const fit = /column/.test(flow) || /dense/.test(flow) ? undefined : autoFit(g.columns);
  if (fit) {
    if ('bad' in fit) return { ok: false, why: fit.bad, shape };
    return { ok: true, plan: { pattern: 'auto-fit', tracks: 1, axis: 'row', childStyles: [{ flexGrow: fit.fr, flexShrink: 1, flexBasis: fit.min, minWidth: 0 }], fallback: 'wrap', aligned: true, source: shape } };
  }
  const cols = splitTracks(g.columns ?? 'none');
  if (cols.bad) return { ok: false, why: cols.bad, shape };
  const rows = splitTracks(g.rows ?? 'none');
  if (rows.bad) return { ok: false, why: `rows: ${rows.bad}`, shape };
  if (/column/.test(flow) && cols.tracks.length === 0) {
    if (/dense/.test(flow)) return { ok: false, why: 'grid-auto-flow: column dense', shape };
    return { ok: true, plan: { pattern: 'auto-flow-column', tracks: 0, axis: 'row', childStyles: [], fallback: 'chunk', aligned: false, source: shape } };
  }
  if (/dense/.test(flow)) return { ok: false, why: 'grid-auto-flow: dense', shape };
  if (cols.tracks.length <= 1) {
    // One column: a vertical stack. A row template sizes the children along it.
    if (cols.tracks.length === 1) {
      const t = parseTrack(cols.tracks[0]!, 'h');
      if (t.kind === 'bad') return { ok: false, why: t.why, shape };
      if (t.kind === 'fixed' && t.size !== '100%') return { ok: false, why: `one fixed column (${cols.tracks[0]}) narrower than the box`, shape };
    }
    const rts = rows.tracks.map((r) => parseTrack(r, 'v'));
    const bad = rts.find((t) => t.kind === 'bad');
    if (bad && bad.kind === 'bad') return { ok: false, why: `rows: ${bad.why}`, shape };
    return {
      ok: true,
      plan: { pattern: 'column', tracks: rts.length, axis: 'column', childStyles: rts.map((t) => trackStyle(t, 'column')), fallback: 'column', aligned: true, source: shape },
    };
  }
  const ts = cols.tracks.map((c) => parseTrack(c, 'h'));
  const bad = ts.find((t) => t.kind === 'bad');
  if (bad && bad.kind === 'bad') return { ok: false, why: bad.why, shape };
  const frs = ts.filter((t) => t.kind === 'fr');
  let pattern: GridPlan['pattern'];
  if (frs.length === ts.length && frs.every((t) => t.kind === 'fr' && t.fr === (frs[0] as { fr: number }).fr && t.min === undefined)) pattern = 'equal-n';
  else if (frs.length === 1 && ts.every((t) => t.kind === 'fr' || t.kind === 'auto')) pattern = 'fill-auto';
  else pattern = 'tracks';
  return {
    ok: true,
    plan: {
      pattern,
      tracks: ts.length,
      axis: 'row',
      childStyles: ts.map((t) => trackStyle(t, 'row')),
      fallback: 'chunk',
      aligned: ts.every((t) => t.kind === 'fr' || t.kind === 'fixed'),
      source: shape,
    },
  };
}
