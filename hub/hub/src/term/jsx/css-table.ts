// The CSS translator's table (scripts/term/css-translate) as a resolver for style.ts: a small cascade.
//
// For an element it collects, as blocks with a specificity and an order:
//   - the base entry of each of its module classes (specificity 0,1,0, in className order);
//   - every variant of those classes whose `when` holds: conditions on the element itself (other classes, attributes,
//     tag, structural pseudo-classes it can decide from its place among its siblings, :not) and on its ancestors
//     (descendant and child combinators, innermost first);
//   - every child rule an ancestor hands down (`.list > li`, `.prose p`, `.crumbs li > svg`) whose `match` holds for
//     this element (and whose path, if any, matches the ancestors between the two);
// sorts them by specificity then order, and applies style, text, hidden, contents, border, grid and `unset` in turn.
// A condition it cannot decide (an unknown pseudo-class, a position it was not told) makes the block not apply, never
// apply wrongly. Classes the table marks partial are applied and counted; untranslatable ones are counted and left out.
// styleLedger() is the page's degradation report.
//
// Generated boxes (::before / ::after): the pseudo rules of the element's classes whose `when` holds and the pseudo
// child rules handed down whose `match` holds cascade the same way, per side, into `pseudo.before` / `pseudo.after`.
// A side is drawn when its merged content is set, is not `none` and the box is not display: none. A box that is
// absolutely positioned is not drawn (a hit area, or a 1-2px bar or dot: one cell here would cover content) and is
// counted in styleLedger().pseudoSkipped; an empty box in flow is drawn for its size (a flex line break).
import type { AttrCond, ChildRule, ClassEntry, Conditions, GridPlan, Table, TermBorder, TermStyle as CssStyle, TermText, Variant, When } from '../../../scripts/term/css-translate/types';
import { TOKEN_OF, type Colour } from '../prim/tokens';
import { RUNTIME_STYLE_CAPS } from '../../../scripts/term/css-translate/caps';
import type { BorderStyle, ElementInfo, GridLayout, PseudoStyle, StyleFrame, StyleResolver, TermStyle, TextStyle } from './style';

const COLOUR_OF = new Map<string, Colour>(Object.entries(TOKEN_OF).map(([c, t]) => [t as string, c as Colour]));
// Tokens the web flattens from translucent values, by the role they play.
for (const [t, c] of [['--hx-muted', 'muted'], ['--hx-line', 'line'], ['--hx-line-strong', 'lineStrong'], ['--hx-danger', 'danger'], ['--hx-warn', 'warn'], ['--hx-acc', 'acc']] as const) if (!COLOUR_OF.has(t)) COLOUR_OF.set(t, c);

const used = { partial: new Map<string, number>(), untranslatable: new Map<string, number>(), unknownColours: new Map<string, number>(), unknownClasses: new Map<string, number>(), unconsumed: new Map<string, number>(), pseudoSkipped: new Map<string, number>() };
const known = new WeakMap<ClassEntry, string[]>();
/** Style keys of a class the runtime does not consume (RUNTIME_STYLE_CAPS): such a class is partial, whatever the translator said. */
function unconsumedOf(e: ClassEntry): string[] {
  let k = known.get(e);
  if (!k) {
    const keys = [...Object.keys(e.style ?? {}), ...(e.variants ?? []).flatMap((v) => Object.keys(v.style ?? {}))];
    k = [...new Set(keys.filter((x) => !RUNTIME_STYLE_CAPS.has(x)))];
    known.set(e, k);
  }
  return k;
}
const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };

export interface StyleLedger { partial: string[]; untranslatable: string[]; unknownColours: string[]; unknownClasses: string[]; unconsumed: string[]; /** `<selector>` of ::before / ::after boxes that applied and were not drawn (absolutely positioned, or empty with no size). */ pseudoSkipped: string[] }
/** Class ids used so far whose style is approximate or missing, and colour tokens with no terminal role. */
export const styleLedger = (): StyleLedger => ({ partial: [...used.partial.keys()].sort(), untranslatable: [...used.untranslatable.keys()].sort(), unknownColours: [...used.unknownColours.keys()].sort(), unknownClasses: [...used.unknownClasses.keys()].sort(), unconsumed: [...used.unconsumed.keys()].sort(), pseudoSkipped: [...used.pseudoSkipped.keys()].sort() });
export function clearStyleLedger(): void { for (const m of Object.values(used)) m.clear(); }

function colourOf(c: string | undefined): Colour | undefined {
  if (!c?.startsWith('token:')) return undefined;
  const k = COLOUR_OF.get(c.slice(6));
  if (!k) bump(used.unknownColours, c.slice(6));
  return k;
}

function textOf(t: TermText | undefined, into: TextStyle): void {
  if (!t) return;
  const fg = colourOf(t.fg);
  if (fg) into.colour = fg;
  if (t.bold !== undefined) into.bold = t.bold;
  if (t.dim !== undefined) into.dim = t.dim;
  if (t.italic !== undefined) into.italic = t.italic;
  if (t.underline !== undefined) into.underline = t.underline;
  if (t.strikethrough !== undefined) into.strike = t.strikethrough;
  if (t.transform !== undefined) into.transform = t.transform;
  if (t.listMarker !== undefined) into.listMarker = t.listMarker;
  if (t.wrap !== undefined) into.wrap = t.wrap;
  if (t.truncate !== undefined) into.truncate = t.truncate;
  if (t.wrap === 'none' && t.truncate === undefined && into.truncate === undefined) into.truncate = true;
  if (t.maxLines !== undefined) into.maxLines = t.maxLines;
  if (t.align !== undefined) into.align = t.align;
}

// ---- conditions ----------------------------------------------------------------------------------------------------

function attrHolds(c: AttrCond, attrs: Readonly<Record<string, string>>): boolean {
  const v = attrs[c.name];
  if (v === undefined) return false;
  if (c.op === undefined) return true;
  const want = c.value ?? '';
  const a = c.insensitive ? v.toLowerCase() : v;
  const w = c.insensitive ? want.toLowerCase() : want;
  switch (c.op) {
    case '=': return a === w;
    case '~=': return a.split(/\s+/).includes(w);
    case '|=': return a === w || a.startsWith(w + '-');
    case '^=': return w !== '' && a.startsWith(w);
    case '$=': return w !== '' && a.endsWith(w);
    case '*=': return w !== '' && a.includes(w);
  }
  return false;
}

/** an+b against a 1-based position. */
function nth(expr: string, pos: number): boolean | undefined {
  const e = expr.replace(/\s+/g, '').toLowerCase();
  if (e === 'odd') return pos % 2 === 1;
  if (e === 'even') return pos % 2 === 0;
  if (/^[+-]?\d+$/.test(e)) return pos === Number(e);
  const m = /^([+-]?\d*)n([+-]\d+)?$/.exec(e);
  if (!m) return undefined;
  const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
  const b = Number(m[2] ?? 0);
  if (a === 0) return pos === b;
  const k = (pos - b) / a;
  return Number.isInteger(k) && k >= 0;
}

function pseudoHolds(p: string, el: ElementInfo): boolean {
  const i = el.index;
  const n = el.count;
  const known = i !== undefined && n !== undefined;
  const m = /^([a-z-]+)(?:\((.*)\))?$/.exec(p.replace(/^:+/, ''));
  if (!m) return false;
  switch (m[1]) {
    case 'first-child': return known && i === 0;
    case 'last-child': return known && i === n - 1;
    case 'only-child': return known && n === 1;
    case 'nth-child': return known && nth(m[2] ?? '', i + 1) === true;
    case 'nth-last-child': return known && nth(m[2] ?? '', n - i) === true;
    case 'empty': return el.empty;
    case 'disabled': return el.attrs.disabled !== undefined || el.attrs['aria-disabled'] === 'true';
    case 'enabled': return el.attrs.disabled === undefined;
    case 'checked': return el.attrs.checked !== undefined || el.attrs['aria-checked'] === 'true';
    case 'required': return el.attrs.required !== undefined;
    case 'open': return el.attrs.open !== undefined;
    default: return false; // undecidable here: the block does not apply
  }
}

function holds(c: Conditions | undefined, el: ElementInfo): boolean {
  if (!c) return true;
  if (c.classes?.length) {
    for (const k of c.classes) {
      const name = k.startsWith('global:') ? k.slice(7) : k;
      if (!el.classes.includes(name)) return false;
    }
  }
  if (c.tags?.length && !c.tags.includes(el.tag)) return false;
  if (c.attrs?.length && !c.attrs.every((a) => attrHolds(a, el.attrs))) return false;
  if (c.pseudo?.length && !c.pseudo.every((p) => pseudoHolds(p, el))) return false;
  if (c.not?.length && c.not.some((x) => holds(x, el))) return false;
  // `+`: decided only from a previous sibling the parent named; unknown or none = does not hold.
  if (c.prev && (!el.prev || !holds(c.prev, el.prev))) return false;
  // :is() / :where() lists: one alternative of each.
  if (c.any?.length && !c.any.every((alts) => alts.some((x) => holds(x, el)))) return false;
  return true;
}

/** `ancestors` conditions (innermost first; `direct` = this one is the parent of the one inside it) against a chain. */
function ancestorsHold(conds: NonNullable<When['ancestors']>, chain: readonly StyleFrame[], ci = 0, from = 0): boolean {
  if (ci === conds.length) return true;
  const c = conds[ci]!;
  if (c.direct) return from < chain.length && holds(c, chain[from]!.info) && ancestorsHold(conds, chain, ci + 1, from + 1);
  for (let d = from; d < chain.length; d++) if (holds(c, chain[d]!.info) && ancestorsHold(conds, chain, ci + 1, d + 1)) return true;
  return false;
}

/** A child rule's `path` (the compounds between its subject and its context, innermost first) against the frames
 *  between the element and the context at `depth`: every one is matched in order, and when the rule is `direct` the
 *  outermost one sits right under the context. */
function pathHolds(path: NonNullable<ChildRule['path']>, direct: boolean, chain: readonly StyleFrame[], depth: number, ci = 0, from = 0): boolean {
  if (ci === path.length) return direct ? from === depth : from <= depth;
  const c = path[ci]!;
  if (c.direct) return from < depth && holds(c, chain[from]!.info) && pathHolds(path, direct, chain, depth, ci + 1, from + 1);
  for (let d = from; d < depth; d++) if (holds(c, chain[d]!.info) && pathHolds(path, direct, chain, depth, ci + 1, d + 1)) return true;
  return false;
}
/** Whether the child rule held by the ancestor at `depth` reaches down to an element with this chain. */
const reaches = (r: ChildRule, chain: readonly StyleFrame[], depth: number): boolean =>
  r.path?.length ? depth >= r.path.length && pathHolds(r.path, r.direct, chain, depth) : !r.direct || depth === 0;

const whenHolds = (w: When | undefined, el: ElementInfo, chain: readonly StyleFrame[]): boolean =>
  !w || (holds(w.self, el) && (!w.ancestors?.length || ancestorsHold(w.ancestors, chain)));

// ---- cascade -------------------------------------------------------------------------------------------------------

interface Block {
  spec: readonly [number, number, number];
  order: number;
  style?: CssStyle;
  text?: TermText;
  border?: TermBorder | null;
  hidden?: boolean;
  contents?: boolean;
  grid?: GridPlan | null;
  unset?: string[];
  /** Spans every track of its grid (grid-column: 1 / -1). */
  spanAll?: boolean;
}
/** One ::before / ::after rule that holds for the element. */
interface PseudoBlock { spec: readonly [number, number, number]; order: number; side: 'before' | 'after'; selector: string; content?: string[] | 'none'; style?: CssStyle; text?: TermText; border?: TermBorder | null; hidden?: boolean }

/** The generated box of one side, from the rules that hold (cascade order), or undefined when none is drawn. */
function pseudoOf(side: 'before' | 'after', all: PseudoBlock[]): PseudoStyle | undefined {
  const blocks = all.filter((b) => b.side === side).sort((a, b) => a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.spec[2] - b.spec[2] || a.order - b.order);
  let content: string[] | 'none' | undefined;
  let from = '';
  const raw: Record<string, unknown> = {};
  const text: TextStyle = {};
  let border: TermBorder | null = null;
  let hidden = false;
  for (const b of blocks) {
    if (b.content !== undefined) { content = b.content; from = b.selector; }
    if (b.style) Object.assign(raw, b.style);
    textOf(b.text, text);
    if (b.border !== undefined) border = b.border;
    if (b.hidden !== undefined) hidden = b.hidden;
  }
  if (content === undefined || content === 'none' || hidden) return undefined;
  const str = content.join('');
  // Out of flow (a hit area, a bar, a dot, a mark in the padding), or empty with no size: nothing a cell can show.
  if (raw.position === 'absolute' || (str === '' && Object.keys(raw).length === 0)) { bump(used.pseudoSkipped, from); return undefined; }
  const style: PseudoStyle['style'] = {};
  if (Object.keys(raw).length) style.box = { raw };
  if (Object.keys(text).length) style.text = text;
  if (border) style.border = borderOf(border);
  return { text: str, style };
}

/** A child rule handed down by an ancestor, with how far it reaches. */
interface Handed { rule: ChildRule; depth: number }

const BASE_SPEC = [0, 1, 0] as const;
const TABLE_MIN_HEIGHT: ReadonlySet<string> = new Set(['tr', 'td', 'th']);
const bySpec = (a: Block, b: Block): number => a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.spec[2] - b.spec[2] || a.order - b.order;

function borderOf(b: TermBorder): BorderStyle {
  const colour = colourOf(b.color);
  return { sides: [...b.sides], divider: b.divider === true || b.sides.length === 1, ...(colour ? { colour } : {}) };
}
function gridOf(g: GridPlan): GridLayout | undefined {
  if (g.pattern === 'column' || (g.tracks <= 1 && g.fallback !== 'wrap')) return undefined; // one column: plain stacking, nothing per item
  return { tracks: g.tracks, axis: g.axis, childStyles: g.childStyles as Readonly<Record<string, unknown>>[], fallback: g.fallback };
}

export function resolverFor(table: Table): StyleResolver {
  const srcOrder = new Map<string, number>(Object.keys(table.classes).map((id, i) => [id, i]));
  return (el, chain) => {
    const entries: ClassEntry[] = [];
    for (const c of el.classes) {
      const e = table.classes[c];
      if (!e) { if (c.includes('#')) bump(used.unknownClasses, c); continue; }
      if (e.status === 'untranslatable') { bump(used.untranslatable, e.id); continue; }
      const miss = unconsumedOf(e);
      if (miss.length) { bump(used.unconsumed, `${e.id} (${miss.join(',')})`); bump(used.partial, e.id); }
      else if (e.status === 'partial') bump(used.partial, e.id);
      entries.push(e);
    }
    // Child rules reaching this element: the parent's (direct or not), every further ancestor's descendant rules, and
    // rules with a path whose compounds match the ancestors in between.
    const handed: Handed[] = [];
    for (let d = 0; d < chain.length; d++) for (const r of chain[d]!.childRules as readonly ChildRule[]) if (reaches(r, chain, d)) handed.push({ rule: r, depth: d });
    if (entries.length === 0 && handed.length === 0) return undefined;

    // CSS cascade order: equal specificity resolves by SOURCE order (the table keeps each module's rules in source order),
    // never by the order of names in className.
    entries.sort((a, b) => (srcOrder.get(a.id) ?? 0) - (srcOrder.get(b.id) ?? 0));
    const blocks: Block[] = [];
    let order = 0;
    for (const e of entries) blocks.push({ spec: BASE_SPEC, order: order++, style: e.style, text: e.text, border: e.border, hidden: e.hidden, contents: e.contents, grid: e.grid, spanAll: e.gridItem?.spanAll });
    for (const e of entries) for (const v of e.variants ?? []) if (whenHolds(v.when, el, chain)) blocks.push({ ...variantBlock(v), order: order++ });
    const pseudo: PseudoBlock[] = [];
    for (const e of entries) for (const r of e.pseudo ?? []) if (whenHolds(r.when, el, chain)) pseudo.push({ spec: r.specificity, order: order++, side: r.side, selector: r.selector, content: r.content, style: r.style, text: r.text, border: r.border, hidden: r.hidden });
    for (const h of handed) {
      // The rule's `when` is about the element holding it: that ancestor and the ones above it.
      if (holds(h.rule.match, el) && whenHolds(h.rule.when, chain[h.depth]!.info, chain.slice(h.depth + 1))) {
        // `.list li::before`: about this element's generated box, never the element.
        if (h.rule.pseudo) { pseudo.push({ spec: h.rule.specificity, order: order++, side: h.rule.pseudo.side, selector: h.rule.selector, content: h.rule.pseudo.content, style: h.rule.style, text: h.rule.text, border: h.rule.border, hidden: h.rule.hidden }); continue; }
        blocks.push({ spec: h.rule.specificity, order: order++, style: h.rule.style, text: h.rule.text, border: h.rule.border, hidden: h.rule.hidden, contents: h.rule.contents, spanAll: h.rule.gridItem?.spanAll });
      }
    }
    blocks.sort(bySpec);

    const raw: Record<string, unknown> = {};
    const text: TextStyle = {};
    let hidden = false;
    let contents = false;
    let border: TermBorder | null = null;
    let grid: GridPlan | null = null;
    for (const b of blocks) {
      for (const k of b.unset ?? []) delete raw[k];
      if (b.style) Object.assign(raw, b.style);
      textOf(b.text, text);
      if (b.hidden !== undefined) hidden = b.hidden;
      if (b.contents !== undefined) contents = b.contents;
      if (b.border !== undefined) border = b.border;
      if (b.grid !== undefined) grid = b.grid;
    }
    // CSS tables: `height` on a row or a cell is the least it gets; its content still makes it taller.
    if (raw.height !== undefined && TABLE_MIN_HEIGHT.has(el.tag)) {
      if (raw.minHeight === undefined) raw.minHeight = raw.height;
      delete raw.height;
    }
    const out: TermStyle = {};
    const box: NonNullable<TermStyle['box']> = {};
    const g = grid ? gridOf(grid) : undefined;
    if (grid && raw.flexDirection === undefined && !g) raw.flexDirection = grid.axis;
    if (Object.keys(raw).length) box.raw = raw;
    if (raw.flexDirection === 'row' || raw.flexDirection === 'row-reverse') box.dir = 'row';
    else if (raw.flexDirection !== undefined) box.dir = 'column';
    if (hidden) box.hidden = true;
    if (Object.keys(box).length) out.box = box;
    if (Object.keys(text).length) out.text = text;
    if (contents) out.contents = true;
    if (border) out.border = borderOf(border);
    if (g) { out.grid = g; if (!box.dir) box.dir = g.axis; out.box = box; }
    // A span from the element's own class, a variant that holds or a rule an ancestor hands down (`.create > *`).
    if (blocks.some((b) => b.spanAll)) out.spanAll = true;
    const rules = entries.flatMap((e) => e.childRules ?? []);
    if (rules.length) out.childRules = rules;
    if (pseudo.length) {
      const before = pseudoOf('before', pseudo);
      const after = pseudoOf('after', pseudo);
      if (before || after) out.pseudo = { ...(before ? { before } : {}), ...(after ? { after } : {}) };
    }
    return out;
  };
}

function variantBlock(v: Variant): Omit<Block, 'order'> {
  return { spec: v.specificity, style: v.style, text: v.text, border: v.border, hidden: v.hidden, contents: v.contents, grid: v.grid, unset: v.unset, spanAll: v.gridItem?.spanAll };
}
