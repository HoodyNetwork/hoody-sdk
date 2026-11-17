// One class (or one class under a variant condition): its cascaded declarations → terminal style + diagnostics.
import { expand, physicalName } from './expand';
import { planGrid } from './grid';
import type { Spec } from './selectors';
import type { Align, Cells, Colour, GridPlan, Outcome, OutcomeKind, TermBorder, TermStyle, TermText } from './types';
import { offsetCells, sizeCells, spaceCells, UNIT, type Axis } from './units';
import { leadingVar, parseLength, parseNumber, percentOrLength, resolveVars, topParts, type VarLookup } from './values';

export interface SrcDecl {
  prop: string;
  value: string;
  important: boolean;
  order: number;
  spec: Spec;
  /** At-rule chain or selector, when not a plain single-class rule. */
  via?: string;
  /** True for declarations owned by the variant being translated (diagnostics are reported for these only). */
  own?: boolean;
  file: string;
  line: number;
}

export interface Scope {
  /** tokens.css and module `:root` custom properties. */
  global(name: string): { value: string; from: string } | undefined;
  /** The same name declared by OTHER rules of the module (an ancestor element, presumably). */
  module(name: string): { value: string; from: string; ambiguous?: string[] } | undefined;
}

export interface Translation {
  style: TermStyle;
  text: TermText;
  border?: TermBorder | null;
  hidden?: boolean;
  contents?: boolean;
  grid?: GridPlan;
  gridItem?: { spanAll: true };
  container?: { name?: string; type?: string };
  notes: string[];
  outcomes: Map<SrcDecl, Outcome>;
  /** Raw grid shape when display:grid could not be planned (for the report). */
  gridFailure?: { why: string; shape: string };
}

const RANK: Record<OutcomeKind, number> = {
  unexpressible: 6,
  lossy: 5,
  translated: 4,
  paint: 3,
  meta: 2,
  overridden: 1,
  'not-applied': 0,
  dropped: 0,
};

/** Paint-only properties: no terminal meaning. Value = reason. */
const PAINT: Array<[RegExp, string]> = [
  [/^(border-radius|border-.*-radius)$/, 'corner radius'],
  [/^(box-shadow|text-shadow|filter|backdrop-filter|mix-blend-mode|isolation|opacity-.*)$/, 'shadow/filter'],
  [/^(transition.*|animation.*|will-change)$/, 'motion'],
  [/^(transform|transform-origin|translate|scale|rotate|perspective.*|backface-visibility)$/, 'visual transform (a translate used for positioning is lost)'],
  [/^(cursor|pointer-events|user-select|-webkit-user-select|touch-action|-webkit-tap-highlight-color|-webkit-touch-callout|caret-color|accent-color|resize|appearance|-webkit-appearance)$/, 'pointer/interaction'],
  [/^(outline.*)$/, 'focus outline (the runtime draws focus)'],
  [/^(font-size|font-family|line-height|letter-spacing|word-spacing|font-variant.*|font-feature-settings|font-kerning|font-stretch|font-optical-sizing|-webkit-font-smoothing|-moz-osx-font-smoothing|text-rendering|font-synthesis.*)$/, 'type metrics (one monospace size)'],
  [/^(text-decoration-(color|thickness|style)|text-underline-offset|text-underline-position|text-indent|tab-size|hyphens|overflow-wrap|word-break|word-wrap|line-break|text-wrap|text-wrap-style|-webkit-box-orient|text-size-adjust|-webkit-text-size-adjust|quotes|text-justify)$/, 'text detail'],
  [/^(list-style-(position|image)|counter-.*|content)$/, 'list markers/generated content'],
  [/^(background-image|background-position.*|background-size|background-repeat|background-clip|background-origin|background-attachment|background-blend-mode)$/, 'background image/gradient'],
  [/^(clip-path|mask.*|-webkit-mask.*|fill|stroke.*|shape-rendering|image-rendering|object-fit|object-position|color-interpolation.*)$/, 'shape/clip/svg paint'],
  [/^(scrollbar-.*|scroll-.*|overscroll-behavior.*|overflow-anchor|overflow-clip-margin|-webkit-overflow-scrolling)$/, 'scroll behaviour'],
  [/^(color-scheme|forced-color-adjust|print-color-adjust|-webkit-print-color-adjust|-webkit-text-security|direction|unicode-bidi|vertical-align)$/, 'rendering hint'],
  [/^(clip)$/, 'legacy clip (the sr-only pattern)'],
  [/^(contain|content-visibility|contain-intrinsic-.*|table-layout|border-collapse|border-spacing|caption-side|empty-cells|box-decoration-break|-webkit-box-decoration-break)$/, 'containment/table paint'],
  [/^(syntax|inherits|initial-value)$/, '@property descriptor'],
];

const UNEXPRESSIBLE: Array<[RegExp, string]> = [
  [/^(aspect-ratio)$/, 'aspect-ratio (no OpenTUI option; cells are 1:2)'],
  [/^(order)$/, 'order (Yoga has no order)'],
  [/^(float|clear)$/, 'float'],
  [/^(columns|column-count|column-width|column-rule.*|column-span|column-fill)$/, 'multi-column layout'],
  [/^(writing-mode|text-orientation)$/, 'writing mode'],
  [/^(grid-column|grid-row|grid-area|grid-column-start|grid-column-end|grid-row-start|grid-row-end)$/, 'grid placement of a child (spans/lines have no flex form; a no-op only inside a one-column grid)'],
];

export function paintReason(prop: string): string | undefined {
  for (const [re, why] of PAINT) if (re.test(prop)) return why;
  return undefined;
}

/** A dropped declaration that changes layout in the browser and would differ in the terminal. A reset (margin/padding
 *  0, min-width 0, list-style) undoes a browser default the terminal never had, so losing it costs nothing. */
export function isLayoutLoss(prop: string, value: string): boolean {
  if (!isLayoutProp(prop)) return false;
  const p = physicalName(prop);
  const v = value.trim().toLowerCase();
  if (/^(margin|padding)/.test(p) && /^0(px)?(\s+0(px)?)*$/.test(v)) return false;
  if (/^min-(width|height)$/.test(p) && /^(0|0px|auto)$/.test(v)) return false;
  return true;
}

/** Layout-affecting property (used to judge dropped rules). */
export function isLayoutProp(prop: string): boolean {
  const p = physicalName(prop);
  if (p.startsWith('--')) return false;
  if (paintReason(p)) return false;
  return /^(display|position|top|right|bottom|left|inset.*|z-index|flex.*|order|align-.*|justify-.*|place-.*|gap|row-gap|column-gap|grid.*|width|height|min-.*|max-.*|padding.*|margin.*|overflow.*|visibility|box-sizing|aspect-ratio|float|clear|columns|column-.*|white-space|line-clamp|border.*width|border|border-(top|right|bottom|left)|border-(inline|block).*)$/.test(p);
}

const ALIGN: Record<string, Align> = {
  'flex-start': 'flex-start',
  start: 'flex-start',
  'self-start': 'flex-start',
  left: 'flex-start',
  'flex-end': 'flex-end',
  end: 'flex-end',
  'self-end': 'flex-end',
  right: 'flex-end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
  'first baseline': 'baseline',
  'last baseline': 'baseline',
  auto: 'auto',
};

const JUSTIFY: Record<string, NonNullable<TermStyle['justifyContent']>> = {
  'flex-start': 'flex-start',
  start: 'flex-start',
  left: 'flex-start',
  normal: 'flex-start',
  'flex-end': 'flex-end',
  end: 'flex-end',
  right: 'flex-end',
  center: 'center',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
};

type Res = { kind: OutcomeKind; detail?: string };

interface Winner {
  value: string;
  src: SrcDecl;
}

function cascadeKey(d: SrcDecl): number[] {
  return [d.important ? 1 : 0, d.spec[0], d.spec[1], d.spec[2], d.order];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  return 0;
}

const SIDE_AXIS: Record<string, Axis> = { top: 'v', bottom: 'v', left: 'h', right: 'h' };
const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

export function translateDecls(declsIn: readonly SrcDecl[], scope: Scope): Translation {
  const decls = [...declsIn].sort((a, b) => cmp(cascadeKey(a), cascadeKey(b)));
  const notes = new Set<string>();
  const outcomes = new Map<SrcDecl, Outcome>();
  // 1. Own custom properties (cascaded).
  const own = new Map<string, Winner>();
  for (const d of decls) if (d.prop.startsWith('--')) own.set(d.prop, { value: d.value, src: d });
  const lookup: VarLookup = (name) => {
    const o = own.get(name);
    if (o) return { value: o.value, from: 'own' };
    const g = scope.global(name);
    if (g) return g;
    const m = scope.module(name);
    if (m) {
      if (m.ambiguous) notes.add(`${name} is declared differently by ${m.ambiguous.join(', ')}; used ${m.from}`);
      else notes.add(`${name} taken from ${m.from} (assumed ancestor)`);
      return { value: m.value, from: m.from };
    }
    return undefined;
  };
  const unresolvedOf = (v: string): string[] => resolveVars(v, lookup).unresolved;
  const res = (v: string): string => resolveVars(v, lookup).value;

  // 2. Expand and cascade longhands.
  const winners = new Map<string, Winner>();
  const longhandsOf = new Map<SrcDecl, string[]>();
  for (const d of decls) {
    if (d.prop.startsWith('--')) {
      outcomes.set(d, { decl: `${d.prop}: ${d.value}`, kind: 'meta', detail: 'custom property (feeds var())', ...(d.via ? { via: d.via } : {}) });
      continue;
    }
    const pairs = expand(d.prop, d.value, res);
    longhandsOf.set(
      d,
      pairs.map(([p]) => p),
    );
    for (const [p, v] of pairs) winners.set(p, { value: v, src: d });
  }
  const results = new Map<string, Res>(); // longhand → result
  const set = (p: string, kind: OutcomeKind, detail?: string): void => {
    results.set(p, { kind, ...(detail ? { detail } : {}) });
  };
  const style: TermStyle = {};
  const text: TermText = {};
  const W = (p: string): string | undefined => {
    const w = winners.get(p);
    return w ? res(w.value).trim() : undefined;
  };
  const Wl = (p: string): string | undefined => W(p)?.toLowerCase();

  // Run-time custom properties: a length that still holds var() after resolution.
  const checkUnresolved = (p: string): boolean => {
    const w = winners.get(p);
    if (!w) return false;
    const un = unresolvedOf(w.value);
    if (un.length > 0) {
      set(p, 'unexpressible', `${un.join(', ')} has no value in CSS (set at run time from a style attribute?)`);
      return true;
    }
    return false;
  };

  // 3. display (and grid).
  const display = Wl('display');
  const isGrid = display === 'grid' || display === 'inline-grid';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const blockish = display === 'block' || display === 'flow-root' || display === 'list-item';
  const inlineFlow = display === 'inline' || display === 'inline-block';
  let hidden: boolean | undefined;
  let contents: boolean | undefined;
  let grid: GridPlan | undefined;
  let gridFailure: Translation['gridFailure'];
  if (display !== undefined) {
    if (isFlex) {
      style.flexDirection = 'row';
      if (display === 'inline-flex') set('display', 'lossy', 'inline-flex as flex row: in a block parent CSS shrink-wraps it on a text line, Yoga stretches it');
      else set('display', 'translated', 'flex → box (CSS default direction row)');
    } else if (blockish) {
      style.flexDirection = 'column';
      set('display', 'translated', `${display} → column box`);
    } else if (display === 'none') {
      hidden = true;
      set('display', 'translated', 'hidden');
    } else if (display === 'contents') {
      contents = true;
      set('display', 'translated', 'contents → runtime renders the children in place (no box)');
    } else if (inlineFlow) {
      set('display', 'lossy', `${display}: no inline formatting in Yoga; laid out as a column box`);
    } else if (display === '-webkit-box') {
      if (winners.has('line-clamp')) set('display', 'translated', 'line-clamp box → text maxLines');
      else set('display', 'unexpressible', '-webkit-box without line-clamp');
    } else if (isGrid) {
      const g = planGrid({
        columns: W('grid-template-columns'),
        rows: W('grid-template-rows'),
        areas: W('grid-template-areas'),
        autoFlow: W('grid-auto-flow'),
        autoColumns: W('grid-auto-columns'),
      });
      if (g.ok) {
        grid = g.plan;
        style.flexDirection = g.plan.axis;
        if (g.plan.fallback === 'wrap') style.flexWrap = 'wrap';
        const exact = g.plan.pattern === 'column' || g.plan.aligned;
        set(
          'display',
          exact ? 'translated' : 'lossy',
          g.plan.pattern === 'auto-fit'
            ? `grid (auto-fit) → wrapping row box, each item basis ${String(g.plan.childStyles[0]?.flexBasis)} cells, growing to share the line`
            : g.plan.pattern === 'column'
            ? `grid with one column → column box${g.plan.tracks > 0 ? ' (row tracks → grid.childStyles)' : ''}`
            : `grid (${g.plan.pattern}, ${g.plan.tracks || 'any'} tracks) → ${g.plan.axis} box, tracks → grid.childStyles, more items → rows of ${g.plan.tracks || 'n'}${exact ? '' : '; content-sized (auto) tracks are sized per row, so columns do not line up across rows'}`,
        );
        for (const p of ['grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-columns'])
          if (winners.has(p)) set(p, exact ? 'translated' : 'lossy', 'tracks → grid.childStyles');
        if (winners.has('grid-template-areas')) set('grid-template-areas', 'translated', 'none');
        if (winners.has('grid-auto-rows')) set('grid-auto-rows', 'lossy', 'implicit row size ignored (rows size to content)');
      } else {
        gridFailure = { why: g.why, shape: g.shape };
        set('display', 'unexpressible', `grid not translated: ${g.why}`);
        for (const p of ['grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows'])
          if (winners.has(p)) set(p, 'unexpressible', `grid not translated: ${g.why}`);
      }
    } else if (/^table/.test(display)) set('display', 'unexpressible', `${display} (table layout)`);
    else set('display', 'unexpressible', `display: ${display}`);
  }
  const containerKind = isGrid ? (grid ? 'grid' : 'grid-failed') : isFlex ? 'flex' : blockish || inlineFlow ? 'block' : display === undefined ? 'unknown' : 'other';
  const noFlexEffect = containerKind === 'block' || containerKind === 'grid-failed';
  for (const p of ['grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows'])
    if (winners.has(p) && !results.has(p)) set(p, isGrid ? 'unexpressible' : 'paint', isGrid ? 'grid not translated' : 'no effect (not a grid in this class)');

  // 4. Longhands.
  for (const [p, w] of winners) {
    if (results.has(p)) continue;
    const v = res(w.value).trim();
    const lv = v.toLowerCase();
    // Global keywords.
    if (/^(inherit|initial|unset|revert|revert-layer)$/.test(lv) && !/^(color|background-color|font)$/.test(p)) {
      set(p, 'lossy', `${lv}: kept the runtime default`);
      continue;
    }
    switch (p) {
      case 'flex-direction': {
        const m = { row: 'row', column: 'column', 'row-reverse': 'row-reverse', 'column-reverse': 'column-reverse' }[lv] as TermStyle['flexDirection'];
        if (!m) set(p, 'unexpressible', `flex-direction: ${v}`);
        else if (isGrid) set(p, 'paint', 'no effect on a grid');
        else if (noFlexEffect) set(p, 'paint', `no effect (display: ${display})`);
        else {
          style.flexDirection = m;
          set(p, 'translated', display === undefined ? `${m} (no display in this class: assumes a flex class beside it)` : m);
        }
        break;
      }
      case 'flex-wrap': {
        const m = ({ nowrap: 'no-wrap', wrap: 'wrap', 'wrap-reverse': 'wrap-reverse' } as const)[lv as 'nowrap'];
        if (!m) set(p, 'unexpressible', v);
        else if (isGrid || noFlexEffect) set(p, 'paint', 'no effect (not a flex box)');
        else {
          style.flexWrap = m;
          set(p, 'translated', m);
        }
        break;
      }
      case 'align-items':
      case 'align-self': {
        const key = lv === 'normal' ? (p === 'align-items' ? 'stretch' : 'auto') : lv.replace(/^(safe|unsafe)\s+/, '');
        const m = ALIGN[key];
        if (!m) {
          set(p, 'unexpressible', `${p}: ${v}`);
          break;
        }
        if (p === 'align-items' && grid && grid.axis === 'column') {
          set(p, 'paint', 'no effect in a one-column grid (rows size to content)');
          break;
        }
        if (p === 'align-items' && noFlexEffect) {
          set(p, 'paint', `no effect (display: ${display})`);
          break;
        }
        if (p === 'align-items') style.alignItems = m;
        else style.alignSelf = m;
        set(p, key === 'last baseline' ? 'lossy' : 'translated', m);
        break;
      }
      case 'justify-content': {
        const m = JUSTIFY[lv.replace(/^(safe|unsafe)\s+/, '')];
        if (!m) {
          set(p, lv === 'stretch' ? 'lossy' : 'unexpressible', `justify-content: ${v}`);
          break;
        }
        if (grid && grid.axis === 'column') {
          if (m === 'flex-start') set(p, 'translated', 'start (default)');
          else if (m === 'center' || m === 'flex-end') {
            style.alignItems = style.alignItems ?? m;
            set(p, 'lossy', `the column track ${m === 'center' ? 'centred' : 'at the end'}: children aligned ${m} instead`);
          } else set(p, 'paint', 'no effect in a one-column grid');
          break;
        }
        if (grid && grid.childStyles.some((c) => (c.flexGrow ?? 0) > 0)) {
          set(p, 'paint', 'no effect: an fr track takes the free space');
          break;
        }
        if (noFlexEffect) {
          set(p, 'paint', `no effect (display: ${display})`);
          break;
        }
        style.justifyContent = m;
        set(p, 'translated', m);
        break;
      }
      case 'align-content': {
        const k = lv.replace(/^(safe|unsafe)\s+/, '');
        if (k === 'normal' || k === 'start' || k === 'flex-start' || k === 'stretch') set(p, 'translated', 'default');
        else if (grid && grid.axis === 'column' && JUSTIFY[k]) {
          style.justifyContent = JUSTIFY[k];
          set(p, 'translated', `rows packed ${k} → justifyContent ${JUSTIFY[k]}`);
        } else if (Wl('flex-wrap') === 'wrap') set(p, 'unexpressible', `align-content: ${v} on wrapped lines (no OpenTUI alignContent option)`);
        else set(p, 'paint', 'no effect on a single line');
        break;
      }
      case 'justify-items':
      case 'justify-self': {
        const k = lv.replace(/^(safe|unsafe)\s+/, '');
        if (p === 'justify-items' && grid && grid.axis === 'column') {
          const m = ALIGN[k === 'normal' ? 'stretch' : k];
          if (m) {
            style.alignItems = m;
            set(p, 'translated', `one column: items ${m}`);
          } else set(p, 'unexpressible', v);
        } else if (k === 'normal' || k === 'stretch' || k === 'auto') set(p, 'translated', 'default');
        else if (isGrid || display === undefined) set(p, 'lossy', `${p}: ${v} (alignment inside a grid track has no flex form)`);
        else set(p, 'paint', 'no effect outside grid');
        break;
      }
      case 'flex-grow':
      case 'flex-shrink': {
        const n = parseNumber(v);
        if (n === undefined) set(p, 'unexpressible', v);
        else {
          if (p === 'flex-grow') style.flexGrow = n;
          else style.flexShrink = n;
          set(p, 'translated', String(n));
        }
        break;
      }
      case 'flex-basis': {
        if (checkUnresolved(p)) break;
        if (lv === 'auto' || lv === 'content') {
          style.flexBasis = 'auto';
          set(p, lv === 'content' ? 'lossy' : 'translated', 'auto');
          break;
        }
        const l = parseLength(v);
        if (l.kind === 'zero') {
          style.flexBasis = 0;
          set(p, 'translated', '0');
        } else if (l.kind === 'px') {
          style.flexBasis = sizeCells(l.px, 'h');
          set(p, 'lossy', `${style.flexBasis} cells, read as a WIDTH (the parent's direction is unknown here)`);
        } else if (l.kind === 'pct') {
          // OpenTUI's flexBasis takes no percent. `flex-basis: 100%` in a wrapping row puts the item on a line of its
          // own: a percent WIDTH (basis auto) does the same in a row parent.
          style.flexBasis = 'auto';
          if (style.width === undefined && !winners.has('width')) style.width = `${l.pct}%`;
          set(p, 'lossy', `${l.pct}% → width ${l.pct}% with basis auto (OpenTUI flexBasis takes cells or auto; read as a WIDTH)`);
        }
        else set(p, 'unexpressible', l.kind === 'bad' ? l.why : v);
        break;
      }
      case 'row-gap':
      case 'column-gap': {
        if (checkUnresolved(p)) break;
        const axis: Axis = p === 'row-gap' ? 'v' : 'h';
        const key = p === 'row-gap' ? 'rowGap' : 'columnGap';
        if (lv === 'normal') {
          style[key] = 0;
          set(p, 'translated', '0');
          break;
        }
        if (noFlexEffect && containerKind === 'block') {
          set(p, 'paint', `no effect (display: ${display})`);
          break;
        }
        const l = parseLength(v);
        if (l.kind === 'zero') style[key] = 0;
        else if (l.kind === 'px') style[key] = spaceCells(l.px, axis);
        else if (l.kind === 'pct') style[key] = `${l.pct}%`;
        else {
          set(p, 'unexpressible', l.kind === 'bad' ? l.why : v);
          break;
        }
        set(p, 'translated', `${String(style[key])} ${axis === 'h' ? 'cols' : 'rows'}${l.kind === 'px' ? ` (${l.px}px)` : ''}`);
        break;
      }
      case 'padding-top':
      case 'padding-right':
      case 'padding-bottom':
      case 'padding-left':
      case 'margin-top':
      case 'margin-right':
      case 'margin-bottom':
      case 'margin-left': {
        if (checkUnresolved(p)) break;
        const [kind, side] = p.split('-') as ['padding' | 'margin', string];
        const axis = SIDE_AXIS[side]!;
        const key = `${kind}${cap(side)}` as keyof TermStyle;
        if (lv === 'auto' && kind === 'margin') {
          (style as Record<string, unknown>)[key] = 'auto';
          set(p, 'translated', 'auto');
          break;
        }
        const l = parseLength(v);
        if (l.kind === 'zero') (style as Record<string, unknown>)[key] = 0;
        else if (l.kind === 'px') {
          const c = spaceCells(l.px, axis);
          // A negative top/bottom margin pulls a box up into the gap above it on the web. A terminal parent often draws
          // no row there, and -1 row puts the box ON its neighbour's row (two texts mixed on one line). Never overlap.
          if (kind === 'margin' && axis === 'v' && c < 0) {
            (style as Record<string, unknown>)[key] = 0;
            set(p, 'lossy', `negative ${l.px}px (would draw over the neighbouring row) → 0`);
            break;
          }
          (style as Record<string, unknown>)[key] = c;
          if (l.px < 0 && c === 0) {
            set(p, 'lossy', `negative ${l.px}px (a hairline overlap) → 0`);
            break;
          }
        } else if (l.kind === 'pct') (style as Record<string, unknown>)[key] = `${l.pct}%`;
        else {
          set(p, 'unexpressible', l.kind === 'bad' ? l.why : v);
          break;
        }
        set(p, 'translated', `${String((style as Record<string, unknown>)[key])} ${axis === 'h' ? 'cols' : 'rows'}${l.kind === 'px' ? ` (${l.px}px)` : ''}`);
        break;
      }
      case 'width':
      case 'height':
      case 'min-width':
      case 'min-height':
      case 'max-width':
      case 'max-height': {
        if (checkUnresolved(p)) break;
        const axis: Axis = p.endsWith('width') ? 'h' : 'v';
        const key = (p.startsWith('min-') ? 'min' + cap(p.slice(4)) : p.startsWith('max-') ? 'max' + cap(p.slice(4)) : p) as keyof TermStyle;
        const put = (c: Cells): void => {
          (style as Record<string, unknown>)[key] = c;
        };
        if (lv === 'auto') {
          if (p.startsWith('min-')) set(p, 'translated', 'auto (CSS content minimum; Yoga minimum is 0)');
          else {
            put('auto');
            set(p, 'translated', 'auto');
          }
          break;
        }
        if (lv === 'none' && p.startsWith('max-')) {
          set(p, 'translated', 'none');
          break;
        }
        if (/^(max-content|min-content|fit-content|-webkit-fit-content|-moz-fit-content)$/.test(lv)) {
          if (p.startsWith('min-') && lv !== 'min-content') set(p, 'unexpressible', `${p}: ${lv} (a content-based minimum; Yoga cannot measure it)`);
          else if (p.startsWith('min-')) set(p, 'lossy', `${p}: min-content treated as 0`);
          else set(p, 'unexpressible', `${p}: ${lv} (shrink-wrap: Yoga stretches on the cross axis; no keyword)`);
          break;
        }
        if (/^(stretch|-webkit-fill-available|-moz-available)$/.test(lv)) {
          put('100%');
          set(p, 'lossy', `${lv} → 100%`);
          break;
        }
        // `min(P%, L)` / `max(P%, L)`: the percent bounded by the length (`width: min(100%, 760px)` is width 100%, at most
        // 95 cols). Without it the box has no width and a centred page (margin auto) shrinks to its content, cutting it.
        const mm = percentOrLength(v);
        if (mm && !p.startsWith('min-')) {
          const lim = sizeCells(mm.px, axis);
          const unit = axis === 'h' ? 'cols' : 'rows';
          if (!p.startsWith('max-')) {
            const boundProp = `${mm.f === 'min' ? 'max' : 'min'}-${p}`;
            const boundKey = (mm.f === 'min' ? 'max' : 'min') + cap(p);
            put(`${mm.pct}%`);
            // A bound the rule states itself wins (it is the cascade's own value for that property).
            if (winners.has(boundProp)) set(p, 'lossy', `${mm.pct}% (the rule's own ${boundProp} stands for the ${lim}-${unit} bound)`);
            else {
              (style as Record<string, unknown>)[boundKey] = lim;
              set(p, 'translated', `${mm.pct}%, ${mm.f === 'min' ? 'at most' : 'at least'} ${lim} ${unit} (${mm.px}px)`);
            }
          } else if (mm.f === 'min') {
            // A maximum of the smaller of the two: the length, plus the percent when it is under the parent's whole size.
            put(lim);
            set(p, mm.pct >= 100 ? 'translated' : 'lossy', `${lim} ${unit} (${mm.px}px)${mm.pct >= 100 ? ` (${mm.pct}% of the parent bounds it anyway)` : `; the ${mm.pct}% bound is not kept`}`);
          } else set(p, 'unexpressible', `${p}: max(%, length) (the larger of two bounds)`);
          break;
        }
        const l = parseLength(v);
        if (l.kind === 'zero') {
          put(0);
          set(p, 'translated', '0');
        } else if (l.kind === 'pct') {
          put(`${l.pct}%`);
          set(p, 'translated', `${l.pct}%`);
        } else if (l.kind === 'vh' && axis === 'v') {
          // The viewport height is the height of the region the page is mounted in (the shell's content pane), read at
          // run time by the compat runtime (jsx/dom.ts, VH_LENGTH): `<vh>vh<±rows>`. It never grows with the content.
          const rows = l.px === 0 ? 0 : Math.sign(l.px) * sizeCells(Math.abs(l.px), 'v');
          put(`${l.vh}vh${rows < 0 ? '-' : '+'}${Math.abs(rows)}`);
          set(p, 'translated', `${l.vh}% of the mounted region's rows${rows ? ` ${rows < 0 ? '-' : '+'} ${Math.abs(rows)}` : ''} (run time)`);
        } else if (l.kind === 'px') {
          const c = sizeCells(l.px, axis);
          put(c);
          if (l.px < UNIT.HAIRLINE_PX) set(p, 'lossy', `${l.px}px hairline → ${c} ${axis === 'h' ? 'col' : 'row'}`);
          else if (axis === 'v' && l.px > UNIT.CELL_H_PX && l.px < UNIT.SIZE_ONE_ROW_BELOW_PX)
            set(p, 'translated', `1 row (${l.px}px: one line + control chrome)`);
          else set(p, 'translated', `${c} ${axis === 'h' ? 'cols' : 'rows'} (${l.px}px)`);
        } else set(p, 'unexpressible', l.kind === 'bad' ? l.why : `${p}: ${v}`);
        break;
      }
      case 'position': {
        if (lv === 'relative' || lv === 'static') {
          style.position = lv;
          set(p, 'translated', lv);
        } else if (lv === 'absolute') {
          style.position = 'absolute';
          set(p, 'translated', 'absolute (Yoga places it in its parent; CSS in the nearest positioned ancestor)');
        } else if (lv === 'sticky') {
          // In flow; at run time jsx/sticky.ts offsets it from the nearest scroll box by the CSS rule (top/bottom insets
          // below; left/right are not kept: a page scrolls on one axis).
          style.sticky = { ...(style.sticky ?? {}) };
          set(p, 'translated', 'sticky: in flow, kept inside the nearest scroll box at run time (top/bottom)');
        }
        else if (lv === 'fixed') set(p, 'unexpressible', 'fixed: anchored to the viewport (needs an overlay layer)');
        else set(p, 'unexpressible', v);
        break;
      }
      case 'top':
      case 'right':
      case 'bottom':
      case 'left': {
        if (checkUnresolved(p)) break;
        const pos = Wl('position');
        if (pos === 'sticky') {
          if (p === 'left' || p === 'right') { set(p, 'lossy', 'sticky offset on the inline axis (pages scroll on one axis)'); break; }
          if (checkUnresolved(p)) break;
          const sl = parseLength(v);
          const cells = sl.kind === 'zero' ? 0 : sl.kind === 'px' ? Math.max(0, offsetCells(sl.px, 'v')) : null;
          if (cells === null) { set(p, 'lossy', `sticky ${p} ${v}: not a length in cells; 0 used`); style.sticky = { ...(style.sticky ?? {}), [p]: 0 }; break; }
          style.sticky = { ...(style.sticky ?? {}), [p]: cells };
          set(p, 'translated', `sticky ${p} inset ${cells}`);
          break;
        }
        if (pos === 'fixed') {
          set(p, 'unexpressible', 'offset of a fixed box');
          break;
        }
        if (pos !== 'absolute' && pos !== 'relative') {
          set(p, pos === undefined ? 'lossy' : 'paint', pos === undefined ? 'offset without position in this class: kept' : 'no effect (static)');
          if (pos !== undefined) break;
        }
        const axis = SIDE_AXIS[p]!;
        if (lv === 'auto') {
          style[p] = 'auto';
          if (!results.has(p)) set(p, 'translated', 'auto');
          break;
        }
        const l = parseLength(v);
        if (l.kind === 'zero') style[p] = 0;
        else if (l.kind === 'px') style[p] = offsetCells(l.px, axis);
        else if (l.kind === 'pct') style[p] = `${l.pct}%`;
        else {
          set(p, 'unexpressible', l.kind === 'bad' ? l.why : v);
          break;
        }
        if (!results.has(p)) set(p, 'translated', `${String(style[p])}${l.kind === 'px' ? ` (${l.px}px)` : ''}`);
        break;
      }
      case 'z-index': {
        const n = parseNumber(v);
        if (lv === 'auto') set(p, 'translated', 'auto');
        else if (n === undefined) set(p, 'unexpressible', v);
        else {
          style.zIndex = n;
          set(p, 'translated', String(n));
        }
        break;
      }
      case 'overflow-x':
      case 'overflow-y': {
        const other = p === 'overflow-x' ? Wl('overflow-y') : Wl('overflow-x');
        const vals = [lv, other ?? 'visible'];
        let o: TermStyle['overflow'];
        if (vals.some((x) => x === 'auto' || x === 'scroll')) o = 'scroll';
        else if (vals.some((x) => x === 'hidden' || x === 'clip')) o = 'hidden';
        else o = 'visible';
        if (o !== 'visible') style.overflow = o;
        const differ = other !== undefined && other !== lv && o !== 'visible';
        const scrollNote = o === 'scroll' ? '; the runtime needs a scroll box' : '';
        set(p, differ ? 'lossy' : 'translated', `${o}${differ ? ' (one overflow for both axes)' : ''}${scrollNote}`);
        break;
      }
      case 'visibility':
        if (lv === 'visible') set(p, 'translated', 'visible');
        else if (lv === 'hidden' || lv === 'collapse') { hidden = true; set(p, 'lossy', `visibility: ${lv} → hidden (its space is not kept)`); }
        else set(p, 'unexpressible', `visibility: ${lv}`);
        break;
      case 'box-sizing':
        set(p, lv === 'border-box' ? 'paint' : 'lossy', lv === 'border-box' ? 'Yoga is border-box' : 'content-box: Yoga sizes include padding');
        break;
      case 'container':
      case 'container-type':
      case 'container-name':
        set(p, 'meta', 'container query scope (recorded on the class)');
        break;
      // ── text ──
      case 'color':
      case 'background-color': {
        const c = colourOf(w.value);
        const key = p === 'color' ? 'fg' : 'bg';
        if (c.kind === 'noop') set(p, 'translated', `${lv}: inherits`);
        else {
          text[key] = c.colour;
          set(p, c.lossy ? 'lossy' : 'translated', c.detail ?? c.colour);
        }
        break;
      }
      case 'font-weight': {
        const b = boldOf(lv);
        if (b === undefined) set(p, 'unexpressible', v);
        else {
          text.bold = b;
          set(p, 'translated', b ? 'bold' : 'regular');
        }
        break;
      }
      case 'font-style':
        text.italic = /italic|oblique/.test(lv);
        set(p, 'translated', text.italic ? 'italic' : 'upright');
        break;
      case 'font': {
        if (/^(inherit|initial|unset|revert)$/.test(lv)) {
          set(p, 'translated', `${lv}: inherits`);
          break;
        }
        const parts = topParts(v).map((x) => x.toLowerCase());
        const weight = parts.find((x) => /^(\d{3}|bold|bolder|lighter)$/.test(x));
        text.bold = weight ? (boldOf(weight) ?? false) : false;
        text.italic = parts.some((x) => x === 'italic' || x === 'oblique');
        set(p, 'translated', `${text.bold ? 'bold' : 'regular'}${text.italic ? ' italic' : ''} (size/family/line-height: paint)`);
        break;
      }
      case 'text-decoration-line': {
        const parts = lv.split(/\s+/);
        text.underline = parts.includes('underline');
        if (parts.includes('line-through')) text.strikethrough = true;
        else if (lv === 'none') text.strikethrough = false;
        set(p, parts.includes('overline') ? 'lossy' : 'translated', lv);
        break;
      }
      case 'text-decoration-style':
        set(p, 'paint', 'decoration style/colour');
        break;
      case 'list-style':
      case 'list-style-type': {
        // The marker a classed list asks for (the runtime numbers or bullets its items). Position and image are paint.
        // The runtime reads it on the list's own class only, so `none` needs no value: a classed list has no marker.
        const words = lv.split(/\s+/);
        const m = words.some((x) => /^(decimal|decimal-leading-zero)$/.test(x)) ? 'decimal' : words.some((x) => /^(disc|circle|square)$/.test(x)) ? 'bullet' : undefined;
        if (m) {
          text.listMarker = m;
          set(p, 'translated', `list marker ${m}`);
        } else set(p, 'paint', 'list markers/generated content'); // none (the reset) and markers with no terminal drawing
        break;
      }
      case 'text-transform': {
        const m = (['uppercase', 'lowercase', 'capitalize', 'none'] as const).find((x) => x === lv);
        if (m) {
          text.transform = m;
          set(p, 'translated', m);
        } else set(p, 'paint', v);
        break;
      }
      case 'white-space': {
        if (lv === 'nowrap') text.wrap = 'none';
        else if (lv === 'pre') text.wrap = 'pre';
        else if (/^(normal|pre-wrap|pre-line|break-spaces|wrap)$/.test(lv)) text.wrap = lv === 'pre-wrap' || lv === 'break-spaces' ? 'pre' : 'wrap';
        else {
          set(p, 'unexpressible', v);
          break;
        }
        set(p, 'translated', `wrap ${text.wrap}`);
        break;
      }
      case 'text-overflow':
        if (lv === 'ellipsis') {
          text.truncate = true;
          set(p, 'translated', 'truncate with …');
        } else set(p, 'translated', 'clip');
        break;
      case 'text-align': {
        const m = ({ start: 'left', left: 'left', end: 'right', right: 'right', center: 'center', justify: 'left', 'match-parent': 'left' } as const)[lv as 'start'];
        if (!m) set(p, 'unexpressible', v);
        else {
          text.align = m;
          set(p, lv === 'justify' ? 'lossy' : 'translated', m);
        }
        break;
      }
      case 'line-clamp': {
        const n = parseNumber(lv) ?? NaN;
        if (lv === 'none') set(p, 'translated', 'none');
        else if (Number.isInteger(n) && n > 0) {
          text.maxLines = n;
          set(p, 'translated', `maxLines ${n}`);
        } else set(p, 'unexpressible', v);
        break;
      }
      case 'opacity': {
        const n = /%$/.test(lv) ? Number(lv.slice(0, -1)) / 100 : parseNumber(lv);
        if (n === undefined || !Number.isFinite(n)) set(p, 'unexpressible', v);
        else if (n >= 0.85) set(p, 'translated', 'opaque');
        // Kept visible on purpose: opacity 0 is the web's hover/focus-reveal pattern (DataTable .rowActions, .sortIcon);
        // the terminal has no hover, so hiding it would remove those controls for good.
        else if (n <= 0.05) set(p, 'paint', 'transparent until a hover/focus rule reveals it: shown (the terminal has no hover)');
        else {
          text.dim = true;
          set(p, 'lossy', `opacity ${n} → dim`);
        }
        break;
      }
      default: {
        if (/^border-(top|right|bottom|left)-(width|style|color)$/.test(p)) break; // border stage
        if (p === 'border-radius') break; // border stage
        const why = paintReason(p);
        if (why) {
          set(p, 'paint', why);
          break;
        }
        const un = UNEXPRESSIBLE.find(([re]) => re.test(p));
        if (un) {
          if (/^grid-(column|row|area)/.test(p) && /^auto(\s*\/\s*auto)?$/.test(lv)) set(p, 'translated', 'auto placement');
          else set(p, 'unexpressible', un[1]);
          break;
        }
        set(p, 'unexpressible', `unclassified property ${p}`);
      }
    }
  }

  // 5. Border.
  let border: TermBorder | null | undefined;
  const borderProps = [...winners.keys()].filter((p) => /^border-(top|right|bottom|left)-(width|style|color)$/.test(p));
  if (borderProps.length > 0) {
    const sides: TermBorder['sides'] = [];
    let colourRaw: string | undefined;
    let heavy = false;
    let dashed = false;
    let double = false;
    for (const s of ['top', 'right', 'bottom', 'left'] as const) {
      const st = Wl(`border-${s}-style`);
      const wd = W(`border-${s}-width`);
      if (!st || st === 'none' || st === 'hidden') continue;
      let px = 3;
      if (wd !== undefined) {
        const l = parseLength(wd);
        px = l.kind === 'px' ? l.px : l.kind === 'zero' ? 0 : wd.toLowerCase() === 'thin' ? 1 : wd.toLowerCase() === 'thick' ? 5 : 3;
      }
      if (px <= 0) continue;
      sides.push(s);
      if (px >= 2) heavy = true;
      if (st === 'dashed' || st === 'dotted') dashed = true;
      if (st === 'double') double = true;
      colourRaw ??= winners.get(`border-${s}-color`)?.value;
    }
    if (sides.length === 0) {
      border = null;
      for (const p of borderProps) set(p, 'translated', 'no border');
    } else {
      const radius = W('border-radius');
      const rl = radius ? parseLength(topParts(radius)[0] ?? '0') : undefined;
      const rounded = sides.length === 4 && rl !== undefined && ((rl.kind === 'px' && rl.px >= 6) || rl.kind === 'pct');
      border = { sides, style: double ? 'double' : heavy ? 'heavy' : rounded ? 'rounded' : 'single' };
      const c = colourRaw ? colourOf(colourRaw) : undefined;
      if (c && c.kind !== 'noop') border.color = c.colour;
      if (sides.length < 4) border.divider = sides.length === 1;
      const frame = sides.length === 4;
      for (const p of borderProps) {
        const side = p.split('-')[1] as 'top';
        if (!sides.includes(side)) set(p, 'translated', 'side not drawn');
        else
          set(
            p,
            frame && !dashed ? 'translated' : 'lossy',
            frame ? `frame (${border.style}; costs a cell on each side)${dashed ? ', dashed drawn solid' : ''}` : `${side} rule: a 1px line becomes a whole ${side === 'top' || side === 'bottom' ? 'row' : 'column'}`,
          );
      }
    }
  }
  if (winners.has('border-radius') && !results.has('border-radius')) set('border-radius', 'paint', border?.style === 'rounded' ? 'rounded frame' : 'corner radius');

  // 6. Cross-property effects.
  // The visually-hidden (screen-reader only) pattern: a 1px absolutely placed box that clips its content.
  const tiny = (p: string): boolean => {
    const v = W(p);
    if (v === undefined) return false;
    const l = parseLength(v);
    return l.kind === 'zero' || (l.kind === 'px' && l.px <= 1);
  };
  if (Wl('position') === 'absolute' && tiny('width') && tiny('height') && /hidden|clip/.test(`${Wl('overflow-x') ?? ''} ${Wl('overflow-y') ?? ''}`)) {
    hidden = true;
    for (const p of ['position', 'width', 'height', 'overflow-x', 'overflow-y', 'clip', 'clip-path', 'top', 'left', 'right', 'bottom', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'white-space'])
      if (winners.has(p)) set(p, 'translated', 'visually-hidden (screen-reader only) pattern → hidden');
    for (const k of Object.keys(style) as Array<keyof TermStyle>) delete style[k];
    notes.add('visually-hidden (sr-only) text: hidden in the terminal (a screen reader reads the terminal text itself)');
  }
  let gridItem: { spanAll: true } | undefined;
  const gc = W('grid-column')?.replace(/\s+/g, ' ');
  if (gc && /^(1 \/ -1|1 \/ span \d+|span \d+ \/ -1|-1 \/ 1)$/.test(gc) && !/^1 \/ span 1$/.test(gc)) {
    gridItem = { spanAll: true };
    set('grid-column', 'translated', 'spans every track → gridItem.spanAll (a row of its own)');
  }
  if (text.truncate && text.wrap !== 'none') notes.add('text-overflow: ellipsis without white-space: nowrap: CSS shows no ellipsis');
  if (style.position !== 'absolute' && style.position !== 'relative' && style.zIndex !== undefined) {
    delete style.zIndex;
    if (winners.has('z-index')) set('z-index', 'paint', 'no effect (not positioned)');
  }
  if ((typeof style.width === 'number' || typeof style.height === 'number') && style.flexShrink === undefined && !hidden) {
    style.flexShrink = 1;
    notes.add('flexShrink 1 added: CSS shrinks a sized flex item by default; OpenTUI would set 0 for a numeric width/height');
  }
  if (display === undefined && (style.flexDirection || style.flexWrap || style.alignItems || style.justifyContent || style.columnGap !== undefined))
    notes.add('flex container properties without display in this class: assumes a flex class beside it');
  if (grid && grid.pattern !== 'column') notes.add(`grid → ${grid.tracks || 'any'} tracks: apply grid.childStyles per visible child; more children than tracks → lay out as a column`);
  if (containerKind === 'grid-failed') notes.add('grid layout NOT translated: children stack as a column');

  const container =
    winners.has('container-type') || winners.has('container-name') || winners.has('container')
      ? ((): { name?: string; type?: string } => {
          const c = W('container');
          const name = W('container-name') ?? (c ? c.split('/')[0]!.trim() : undefined);
          const type = W('container-type') ?? (c && c.includes('/') ? c.split('/')[1]!.trim() : undefined);
          return { ...(name && name !== 'none' ? { name } : {}), ...(type ? { type } : {}) };
        })()
      : undefined;

  // 7. Outcomes per source declaration.
  for (const [d, lhs] of longhandsOf) {
    const won = lhs.filter((p) => winners.get(p)?.src === d);
    if (won.length === 0) {
      outcomes.set(d, { decl: `${d.prop}: ${d.value}`, kind: 'overridden', ...(d.via ? { via: d.via } : {}) });
      continue;
    }
    let best: Res = { kind: 'paint' };
    const details: string[] = [];
    for (const p of won) {
      const r = results.get(p) ?? { kind: 'unexpressible' as const, detail: `no handler for ${p}` };
      if (RANK[r.kind] > RANK[best.kind]) best = r;
      if (r.detail && !details.includes(r.detail)) details.push(won.length > 1 ? `${p}: ${r.detail}` : r.detail);
    }
    outcomes.set(d, { decl: `${d.prop}: ${d.value}`, kind: best.kind, ...(details.length > 0 ? { detail: details.join('; ') } : {}), ...(d.via ? { via: d.via } : {}) });
  }

  return {
    style,
    text,
    ...(border !== undefined ? { border } : {}),
    ...(hidden ? { hidden } : {}),
    ...(contents ? { contents } : {}),
    ...(grid ? { grid } : {}),
    ...(gridItem ? { gridItem } : {}),
    ...(container ? { container } : {}),
    ...(gridFailure ? { gridFailure } : {}),
    notes: [...notes],
    outcomes,
  };

  function colourOf(raw: string): { kind: 'noop' } | { kind: 'colour'; colour: Colour; lossy?: boolean; detail?: string } {
    const r = raw.trim();
    const low = r.toLowerCase();
    if (/^(inherit|currentcolor|unset|initial|revert)$/.test(low)) return { kind: 'noop' };
    if (/^(transparent|none)$/.test(low)) return { kind: 'colour', colour: 'none', detail: 'none' };
    const single = /^var\(\s*--[\w-]+\s*(,.*)?\)$/s.test(r);
    const first = leadingVar(r) ?? /var\(\s*(--[\w-]+)/.exec(r)?.[1];
    if (first) {
      // Follow module-local / own names until a global (tokens.css or module :root) name.
      let name = first;
      const via: string[] = [];
      for (let i = 0; i < 12; i++) {
        if (scope.global(name)) break;
        const o = own.get(name);
        const m = o ? { value: o.value } : scope.module(name);
        if (!m) break;
        const next = leadingVar(m.value);
        if (!next) {
          const lit = m.value.trim();
          return { kind: 'colour', colour: `literal:${lit}`, lossy: true, detail: `${name} = ${lit} (a literal colour)` };
        }
        via.push(name);
        name = next;
      }
      const known = scope.global(name) !== undefined || own.has(name) || scope.module(name) !== undefined;
      const colour: Colour = `token:${name}` as Colour;
      const parts: string[] = [];
      if (via.length > 0) parts.push(`via ${via.join(' → ')}`);
      if (!known) parts.push(`${name} has no CSS value (set at run time)`);
      if (!single) parts.push(`${/^([a-z-]+)\(/i.exec(r)?.[1] ?? 'expression'}() approximated by its first token`);
      return { kind: 'colour', colour, lossy: !single, ...(parts.length > 0 ? { detail: `${colour} (${parts.join('; ')})` } : {}) };
    }
    return { kind: 'colour', colour: `literal:${r}`, detail: `literal ${r}` };
  }
}

function boldOf(v: string): boolean | undefined {
  if (v === 'bold' || v === 'bolder') return true;
  if (v === 'normal' || v === 'lighter') return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n >= 600;
}
