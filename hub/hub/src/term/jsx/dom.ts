// Raw HTML elements in shared code, drawn in the terminal. The compat JSX runtime (jsx-runtime.ts) turns every DOM tag
// into <Dom tag=...>; this file decides what it is here, by the tag table (tags.ts) and the class styles (style.ts).
//
// - Each Dom element resolves its classes against its ancestors (a style context threaded down the tree: their tags,
//   classes, attributes and the child rules they hand down) and its place among its siblings (structural pseudo-classes,
//   grid items). Text style inherits as CSS colour does.
// - A container lays out its children: a run of bare text and inline tags becomes one Text, except inside a flex or grid
//   container (the class says so), where every element is an item of its own. A grid gives the i-th item its track's
//   style; more items than tracks are chunked into rows (or stacked, by the translator's fallback).
// - Readable fallbacks where a class cannot be honoured: a row with no gap gets one column between items; an inline
//   element's horizontal padding or margin inside a text run becomes spaces, its min-width pads the text.
// - Borders follow tags.ts drawnSides (frames on tables / fieldsets / dialogs, header dividers, side rules; card
//   outlines and row dividers vanish). display: contents draws the children in place.
// - Generated content (CSS ::before / ::after, style.pseudo): a synthetic span is put first / last among the element's
//   children and styled from the rule, so the layout above places it: in the text run of inline flow (`$ ` + command),
//   or as an item of a flex row or grid. It is no sibling for :first-child / :nth-child / list
//   numbers and does not change :empty. Fields and selects (replaced elements) get none.
// - Interaction: button / summary / [role=button] / onClick / tabIndex >= 0 are focusable and pressable; input,
//   textarea and select are fields; label[htmlFor] focuses its field; a form submits on Enter in a field or a submit
//   button. Handlers get event objects (element.ts); onKeyDown, onFocus and onBlur bubble through compat ancestors.
//   Refs get a TermElement (element.ts). dangerouslySetInnerHTML is refused (nothing drawn, counted).
// - Every string drawn here reaches the engine through the host text filter (prim/safe.ts).
// - Known gap: a parent's child rules (`.x > *`, `.x > :first-child`, `.x > * + *`) resolve only for ELEMENTS; a
//   component child that draws prims (a kit Button, Badge, Link) never sees them: `.toolbar > * { flex: none }` leaves a
//   kit Button shrinkable, `.list > * + * { margin-top: 1 }` puts no gap above a kit row. The one case handled is an
//   auto margin on a component flex item (ItemBox: Files' `.barActions > :first-child { margin-inline-start: auto }`);
//   the rest waits for a way to give the rule to what the component draws without a box around every component.
import {
  Children, cloneElement, createContext, createElement, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactElement, type ReactNode, type Ref, Fragment } from 'react';
import { Box, type BoxProps } from '../prim/Box';
import { usePaneSize } from '../prim/size';
import { useFocusChange, useFocusable, type Focusable, type Key } from '../prim/focus';
import { Pressable } from '../prim/Pressable';
import { FocusInkCtx, focusInk } from '../prim/FocusInk';
import { Scroll } from '../prim/Scroll';
import { safeLinkUrl } from '../prim/safe';
import { registerInlineIdText, useSem } from '../prim/semantics';
import { Br, setTextChildrenJoin, Text, useInText, type TextProps } from '../prim/Text';
import { widestCells } from '../prim/TableCells';
import { useFlatLine } from '../prim/FlatLine';
import { FieldInput, type FieldHandle } from '../prim/FieldInput';
import { SecretInput } from '../prim/SecretInput';
import { FilePicker } from './filePick';
import { semOfDom, SemOnly } from '../prim/semdom';
import { PageFlowRoot, useSticky, type StickySpec } from './sticky';
import { useCentreUp } from '../prim/centre';
import { adopt, attrsOf, changeEvent, createTermElement, focusEvent, keyEvent, pressEvent, submitEvent, type ElementHost, type NodeLike, type TermEvent } from './element';
import { styleResolver, useStyleResolver, type ElementInfo, type PseudoStyle, type StyleFrame, type StyleResolver, type TermStyle, type TextStyle } from './style';
import { drawnSides, isPressable, TAGS, UNKNOWN_TAG, type TagRule } from './tags';

export interface DomProps { tag: string; [prop: string]: unknown }
type Handler = (e: TermEvent) => void;

// ---- ledger --------------------------------------------------------------------------------------------------------

const ledger = { unknownTags: new Map<string, number>(), refusedHtml: 0, unsupported: new Map<string, number>() };
/** Event props the compat runtime honours; any other `on*` on a raw tag is a recorded degradation (`tag.onX`). */
export const SUPPORTED_EVENTS: ReadonlySet<string> = new Set(['onClick', 'onKeyDown', 'onKeyUp', 'onChange', 'onInput', 'onFocus', 'onBlur', 'onSubmit', 'onToggle']);
/** Tags drawn with no row in tags.ts, and dangerouslySetInnerHTML refusals, so far. */
export const domLedger = (): { unknownTags: Record<string, number>; refusedHtml: number; unsupported: Record<string, number> } => ({ unknownTags: Object.fromEntries(ledger.unknownTags), refusedHtml: ledger.refusedHtml, unsupported: Object.fromEntries([...ledger.unsupported].sort()) });
export const clearDomLedger = (): void => { ledger.unknownTags.clear(); ledger.refusedHtml = 0; ledger.unsupported.clear(); };

// ---- navigation seam -----------------------------------------------------------------------------------------------

let navigate: ((path: string) => void) | null = null;
/** The app installs how an `<a href="/route">` without its own onClick navigates (null: it does nothing). */
export function setDomNavigate(fn: ((path: string) => void) | null): void { navigate = fn; }

// ---- contexts ------------------------------------------------------------------------------------------------------

/** Handlers of a compat ancestor that bubble (innermost first in the chain). */
/** A form's submit buttons in mount order (the first is the default button) and whether each is off now; `submitted`
 *  hears each submit (the browser's submit event: a field that clears itself after one, OtpField). */
interface FormState { submitters: Map<object, () => boolean>; submitted: Set<() => void> }
interface Bubble { el: unknown; onKeyDown?: Handler; onFocus?: Handler; onBlur?: Handler; onSubmit?: Handler; form?: boolean; formState?: FormState }
interface DomCtxValue { frames: readonly StyleFrame[]; text: TextStyle; chain: readonly Bubble[]; parentEl: Record<string, unknown> | null; /** The focus ink of the focused control this element is inside: it wins over a descendant's own colour (a muted note in a focused button was muted grey on the focus fill, unreadable). */ ink?: TextStyle; /** The compat parent box's main axis. */ dir?: 'row' | 'column'; /** False when the parent's height is indefinite (auto): a percent height there computes to auto. Absent = definite (the pane). */ hDef?: boolean; /** True when the parent is a row sized by its content (a row item with no width that does not grow, as `flex: 0 0 auto`): CSS sizes it at max-content, so a child's 0 basis is its content there. */ wContent?: boolean }
const ROOT: DomCtxValue = { frames: [], text: {}, chain: [], parentEl: null };
const DomCtx = createContext<DomCtxValue>(ROOT);

/** Where a child sits in its compat parent; given by the parent (cloneElement for a Dom child, context otherwise). */
interface Slot { i?: number; n?: number; /** The previous element sibling (CSS `+`); absent when there is none or it is a component. */ prev?: ElementInfo; grid?: Readonly<Record<string, unknown>>; marker?: string; /** Given to a component's grid item: the element it renders says whether it spans every track. */ onSpan?: (on: boolean) => void; /** Given to a component's flex item (ItemBox): the element it renders hands its own item style up to the box. */ onClaim?: (item: Readonly<Record<string, unknown>>) => void }
const SlotCtx = createContext<Slot | null>(null);

/** A component's grid item: the track on a box around it, until the element it renders reports that it spans every
 *  track (`grid-column: 1 / -1`, known only once it resolves its classes); then the whole width (the grid wraps). */
const SPAN_RAW: Readonly<Record<string, unknown>> = { width: '100%', flexGrow: 0, flexShrink: 0, minWidth: 0 };
function TrackBox({ track, place, children }: { track: Readonly<Record<string, unknown>>; place: Slot; children?: ReactNode }): ReactNode {
  const [span, setSpan] = useState(false);
  const slot = useMemo(() => ({ ...place, onSpan: (on: boolean) => setSpan(on) }), [place.i, place.n, place.marker, place.prev]);
  return createElement(SlotCtx.Provider, { value: slot }, createElement(Box, { raw: span ? SPAN_RAW : track }, children));
}

/** A component as a flex item that a parent's child rule pushes with an auto margin (Files' bar: `.barActions >
 *  :first-child { margin-inline-start: auto }` on a kit Button, which draws prims and never sees the rule): the item's
 *  margins and flex go on a box around it. An element the component renders gets the rule itself: it hands its own
 *  item style (margins and flex, its cascade as CSS has it) up to the box and drops it, so the box is the flex item
 *  and nothing is applied twice (the element keeping the auto margin inside a content-sized box moved nothing). Only for an auto margin: a plain box around every component a
 *  `> *` rule reaches would change how they grow. */
const ITEM_KEYS = ['marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf'] as const;
function componentItemRaw(st: TermStyle | undefined): Record<string, unknown> | undefined {
  const r = st?.box?.raw as Record<string, unknown> | undefined;
  if (!r || (r.marginLeft !== 'auto' && r.marginRight !== 'auto')) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of ITEM_KEYS) if (r[k] !== undefined) out[k] = r[k];
  return out;
}
/** The item keys of an element's resolved box, and the box without them. */
function splitItem(raw: Readonly<Record<string, unknown>> | undefined): { item: Record<string, unknown>; rest: Record<string, unknown> } {
  const item: Record<string, unknown> = {};
  const rest: Record<string, unknown> = { ...raw };
  for (const k of ITEM_KEYS) if (rest[k] !== undefined) { item[k] = rest[k]; delete rest[k]; }
  return { item, rest };
}
const sameItem = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean =>
  ITEM_KEYS.every((k) => a[k] === b[k]);
function ItemBox({ item, place, children }: { item: Readonly<Record<string, unknown>>; place: Slot; children?: ReactNode }): ReactNode {
  const [claimed, setClaimed] = useState<Readonly<Record<string, unknown>> | null>(null);
  const slot = useMemo(() => ({ ...place, onClaim: (own: Readonly<Record<string, unknown>>) => setClaimed((was) => (was && sameItem(was, own) ? was : own)) }), [place.i, place.n, place.marker, place.prev]);
  return createElement(SlotCtx.Provider, { value: slot }, createElement(Box, { raw: claimed ?? item }, children));
}

/** A page element as a flex item of a PRIM row (a Drawer's footer: `<span className={s.footReason}>` beside the kit's
 *  buttons). The element resolves its item style against a row (its DomCtx said the page's column: `flex: 1 1 14rem`
 *  became 28 ROWS of height and the footer covered the drawer's body) and hands it to this box, which is the item.
 *  `item` is what the box has when the element sets nothing (the row's own default for a web child). */
const NO_PLACE: Slot = {};
export function RowItem({ item, children }: { item: Readonly<Record<string, unknown>>; children?: ReactNode }): ReactNode {
  const ctx = useContext(DomCtx);
  const row = useMemo<DomCtxValue>(() => ({ ...ctx, dir: 'row', wContent: false }), [ctx]);
  const [claimed, setClaimed] = useState<Readonly<Record<string, unknown>> | null>(null);
  const slot = useMemo<Slot>(() => ({ ...NO_PLACE, onClaim: (own: Readonly<Record<string, unknown>>) => setClaimed((was) => (was && sameItem(was, own) ? was : own)) }), []);
  return createElement(DomCtx.Provider, { value: row }, createElement(SlotCtx.Provider, { value: slot }, createElement(Box, { raw: { ...item, ...claimed } }, children)));
}

const DetailsCtx = createContext<{ open: boolean; toggle(): void } | null>(null);

/** Fields by id, for label[htmlFor]. */
const fieldsById = new Map<string, { focus(): void; press?(): void }>();
/** Raw `<form id>` elements drawn now, for a submit button outside the form (`<Button type="submit" form={id}>`). */
const formsById = new Map<string, { submit(submitter: unknown): void; state: FormState }>();

/**
 * Submits the raw `<form id={id}>` drawn now, as the browser does for `<button type="submit" form={id}>` outside it:
 * its onSubmit gets a submit event (preventDefault, submitter). False when no such form is drawn.
 */
export function submitRawForm(id: string, submitter?: unknown): boolean {
  const f = formsById.get(id);
  if (!f) return false;
  f.submit(submitter ?? null);
  return true;
}

/** The raw `<form>` around the caller (a kit Button inside one submits it), or null outside any raw form. */
export function useEnclosingRawForm(): {
  submit(submitter?: unknown): void;
  /** Enter in a field: submits only while the form's default submit button is on (false: nothing submitted). */
  implicit(): boolean;
  /** Hears each submit of the form, whatever sent it (Enter, a submit button inside or naming it). Returns the unsubscribe. */
  onSubmitted(fn: () => void): () => void;
} | null {
  const chain = useContext(DomCtx).chain;
  const has = chain.some((b) => b.form);
  const live = useRef(chain);
  live.current = chain;
  return useMemo(() => (has ? {
    submit: (submitter?: unknown) => submitForm(live.current, submitter ?? null),
    implicit: () => implicitSubmit(live.current),
    onSubmitted: (fn: () => void) => {
      const st = live.current.find((b) => b.form)?.formState;
      st?.submitted.add(fn);
      return () => { st?.submitted.delete(fn); };
    },
  } : null), [has]);
}

/** The submit event's listeners (before the form's onSubmit, as in a browser). */
function announceSubmit(st: FormState | undefined): void {
  if (st) for (const fn of [...st.submitted]) fn();
}

/**
 * A submit button of a raw form (inside it, or outside naming it by `formId`): registers it, in mount order, so
 * Enter in a field of that form submits only while the form's default (first) submit button is on, as in a browser.
 * `off()` is read at submit time (disabled, pending). A kit Button with type="submit" calls this.
 */
export function useRawFormSubmitter(off: () => boolean, formId?: string, on = true): void {
  const chain = useContext(DomCtx).chain;
  const state = formId ? undefined : chain.find((b) => b.form)?.formState;
  const live = useRef(off);
  live.current = off;
  const [, bump] = useState(0);
  // In a layout effect: a button drawn again in the commit of NumberField's Enter (the page's re-render) is back in the
  // form before that field's submit, a passive effect of the same commit, looks for the default button.
  useLayoutEffect(() => {
    if (!on) return;
    const st = state ?? (formId ? formsById.get(formId)?.state : undefined);
    if (!st) { if (formId) { const t = setTimeout(() => bump((n) => n + 1), 0); return () => clearTimeout(t); } return; }
    const key = {};
    st.submitters.set(key, () => live.current());
    return () => { st.submitters.delete(key); };
  });
}

/** Implicit submission (Enter in a single-line field): refused while the default submit button is off. False when
 *  nothing was submitted (no submit event in a browser). */
function implicitSubmit(chain: readonly Bubble[]): boolean {
  const form = chain.find((b) => b.form);
  if (!form) return false;
  const first = form.formState?.submitters.values().next();
  if (first && !first.done && first.value()) return false;
  submitForm(chain, null);
  return true;
}

// ---- helpers -------------------------------------------------------------------------------------------------------

const isDomEl = (c: unknown): c is ReactElement<DomProps> => isValidElement(c) && c.type === Dom;
const ruleOf = (tag: string): TagRule => TAGS[tag] ?? UNKNOWN_TAG;
const isNothing = (c: unknown): boolean => isDomEl(c) && (ruleOf(c.props.tag).kind === 'nothing' || c.props.hidden === true);
/** The synthetic child standing for a ::before / ::after box (see Dom). */
const pseudoOf = (c: unknown): PseudoStyle | undefined => (isDomEl(c) ? (c.props.__pseudo as PseudoStyle | undefined) : undefined);
/** An empty generated box is drawn for its size (a flex line break): a box of its own, never part of a text run. */
const pseudoBoxed = (c: unknown): boolean => pseudoOf(c)?.text === '';
const pseudoChild = (side: 'before' | 'after', ps: PseudoStyle): ReactElement => createElement(Dom, { tag: 'span', key: '::' + side, __pseudo: ps }, ...(ps.text === '' ? [] : [ps.text]));
/** The children (already flat, their keys untouched so a box that comes and goes remounts nothing) with the element's generated boxes around them. */
const withGenerated = (kids: ReactNode[], gen: TermStyle['pseudo']): ReactNode[] => (gen ? [...(gen.before ? [pseudoChild('before', gen.before)] : []), ...kids, ...(gen.after ? [pseudoChild('after', gen.after)] : [])] : kids);
const isPrimitive = (c: unknown): c is string | number | bigint => typeof c === 'string' || typeof c === 'number' || typeof c === 'bigint';
const truthyAttr = (v: unknown): boolean => v === true || v === 'true';

function interactive(p: Readonly<Record<string, unknown>>): boolean {
  return typeof p.onClick === 'function' || (typeof p.htmlFor === 'string' && p.htmlFor !== '');
}
/** True when a child can sit inside a Text: text, or an inline tag whose own children can. */
/**
 * A component that draws inline text only (one prim Text, which nests as a span inside a run): it sets a static
 * `hxInline = true` (Kbd, Shortcut, FieldSwatch). Such a component stays in the text run instead of ending it.
 */
export const isInlineComponent = (c: unknown): boolean => isValidElement(c) && typeof c.type !== 'string' && (c.type as { hxInline?: unknown } | null)?.hxInline === true;
/**
 * A component that always draws a block (the web's is a `<div>`/`<pre>` on lines of its own): it sets a static
 * `hxBlock = true` (CodeBlock). Beside text it is never part of that text's line (`<li>Run this <CodeBlock/></li>`).
 */
export const isBlockComponent = (c: unknown): boolean => isValidElement(c) && typeof c.type !== 'string' && (c.type as { hxBlock?: unknown } | null)?.hxBlock === true;
function inlineOnly(node: ReactNode): boolean {
  let ok = true;
  Children.forEach(node, (c) => {
    if (!ok || c === null || c === undefined || typeof c === 'boolean' || isPrimitive(c) || isInlineComponent(c)) return;
    if (isDomEl(c)) {
      const r = ruleOf(c.props.tag);
      if (r.kind === 'br' || isNothing(c)) return;
      if (r.kind === 'inline' && !interactive(c.props) && !classBlock(c.props, c.props.tag) && !pseudoBoxed(c) && inlineOnly(c.props.children as ReactNode)) return;
    }
    ok = false;
  });
  return ok;
}
/** A component element (not a raw tag, not a prim Text): what it draws is unknown until it renders. */
const isComponentEl = (c: unknown): c is ReactElement => isValidElement(c) && c.type !== Dom && c.type !== Text && c.type !== Fragment && typeof c.type !== 'string';
/**
 * Children with fragments opened (a fragment never changes text flow). Children.toArray keys each level from ".0", so a
 * child taken out of a fragment is re-keyed under the fragment's own key (".1/.0", as React's own nesting): without it
 * the head before a fragment and the fragment's first child are both ".0" (duplicate-key warning, PlanCard).
 */
function flatChildren(node: ReactNode, under = ''): ReactNode[] {
  const out: ReactNode[] = [];
  for (const c of Children.toArray(node)) {
    if (isValidElement(c) && c.type === Fragment) out.push(...flatChildren((c.props as { children?: ReactNode }).children, `${under}${String(c.key)}/`));
    else out.push(under !== '' && isValidElement(c) ? cloneElement(c, { key: under + String(c.key) }) : c);
  }
  return out;
}
/**
 * True when nothing static decides CSS :empty: every child is nothing (null, false, '') or a component element, whose
 * output (possibly nothing) is known only once it renders. Text or a raw element child makes it plainly not empty.
 */
function contentUnknown(node: ReactNode): boolean {
  const kids = flatChildren(node);
  return kids.length > 0 && kids.every((c) => c === null || c === undefined || c === false || c === '' || isComponentEl(c));
}
/** After every frame: whether the box drew any child (its engine node has children). Reported on change only. */
function useDrawnChildren(node: { current: NodeLike | null }, report: ((drew: boolean) => void) | undefined,
  inner?: { current: NodeLike | null }): void {
  useEffect(() => {
    const n = node.current as (NodeLike & { getChildren?(): unknown[]; isDestroyed?: boolean; onLifecyclePass?: (() => void) | null }) | null;
    if (!report || !n || typeof n.getChildren !== 'function') return;
    let last: boolean | null = null;
    const pass = (): void => {
      if (n.isDestroyed) return;
      // `inner`: the node whose children count (a scroll's content), read on the outer box's pass.
      const c = inner ? (inner.current as { getChildren?(): unknown[] } | null) : n;
      const drew = (c?.getChildren?.().length ?? 0) > 0;
      if (drew !== last) { last = drew; report(drew); }
    };
    pass();
    const before = n.onLifecyclePass ?? null;
    n.onLifecyclePass = before ? () => { before(); pass(); } : pass;
    return () => { if (!n.isDestroyed) n.onLifecyclePass = before; };
  }, [node, report, inner]);
}
/** An inline tag whose classes make it a block (`display: block|flex` on a span): it starts its own line, as on the web. */
function classBlock(p: Readonly<Record<string, unknown>>, tag: string): boolean {
  const r = styleResolver();
  if (!r || typeof p.className !== 'string' || p.className.trim() === '') return false;
  const st = r({ tag, classes: p.className.split(/\s+/).filter(Boolean), attrs: {}, empty: false }, []);
  return st?.box?.dir === 'column' || st?.box?.raw?.flexDirection === 'column' || st?.box?.hidden === true;
}
const isTexty = (c: unknown): boolean => isPrimitive(c) || isInlineComponent(c) || (isDomEl(c) && (ruleOf(c.props.tag).kind === 'br' || (ruleOf(c.props.tag).kind === 'inline' && !interactive(c.props) && !classBlock(c.props, c.props.tag) && !pseudoBoxed(c) && inlineOnly(c.props.children as ReactNode))));

function transformText(s: string, t: TextStyle['transform']): string {
  if (t === 'uppercase') return s.toUpperCase();
  if (t === 'lowercase') return s.toLowerCase();
  if (t === 'capitalize') return s.replace(/(^|[\s\-(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  return s;
}
const prepText = (s: unknown, t: TextStyle): string => {
  let out = String(s);
  if (t.transform && t.transform !== 'none') out = transformText(out, t.transform);
  if (t.wrap !== 'pre' && t.wrap !== 'none') out = out.replace(/[ \t\r\n]+/g, ' '); // CSS collapses white space
  return out;
};

/** Text style that inherits (colour and font, transform, white-space, alignment), as CSS does. */
function inherit(parent: TextStyle, own: TextStyle): TextStyle {
  const { truncate: _t, maxLines: _m, listMarker: _l, ...carried } = parent;
  return { ...carried, ...own };
}
const textProps = (t: TextStyle): Partial<TextProps> => {
  const { transform: _x, wrap: _w, listMarker: _l, ...rest } = t;
  return rest;
};

/** The element's DOM state for selectors. */
function infoOf(tag: string, p: Readonly<Record<string, unknown>>, slot: Slot | null, ov: ReadonlyMap<string, string | null>): ElementInfo {
  const cls = typeof p.className === 'string' ? p.className.split(/\s+/).filter(Boolean) : [];
  const kids = p.children as ReactNode;
  const empty = kids === undefined || kids === null || kids === false || kids === '' || (Array.isArray(kids) && kids.every((k) => k === null || k === undefined || k === false || k === ''));
  const attrs = attrsOf(p);
  for (const [k, v] of ov) if (v === null) delete attrs[k]; else attrs[k] = v;
  return { tag, classes: cls, attrs, ...(slot?.i !== undefined ? { index: slot.i, count: slot.n } : {}), ...(slot?.prev ? { prev: slot.prev } : {}), empty };
}

/** Fires an event on `own`, then up the chain while nobody stopped it. True when someone prevented the default. */
function bubble(kind: 'onKeyDown' | 'onFocus' | 'onBlur', own: Handler | undefined, chain: readonly Bubble[], make: (target: unknown) => TermEvent, target: unknown): boolean {
  const e = make(target);
  if (own) own(e);
  for (const b of chain) {
    if (e.propagationStopped) break;
    const h = b[kind];
    if (h) { e.currentTarget = b.el; h(e); }
  }
  return e.defaultPrevented || e.propagationStopped;
}
function submitForm(chain: readonly Bubble[], submitter: unknown): void {
  const form = chain.find((b) => b.form);
  if (!form) return;
  announceSubmit(form.formState);
  form.onSubmit?.(submitEvent(form.el, submitter));
}

function setRef(ref: unknown, v: unknown): (() => void) | void {
  if (typeof ref === 'function') {
    const out = (ref as (x: unknown) => unknown)(v);
    return typeof out === 'function' ? (out as () => void) : () => { (ref as (x: unknown) => unknown)(null); };
  }
  if (ref && typeof ref === 'object' && 'current' in ref) {
    (ref as { current: unknown }).current = v;
    return () => { (ref as { current: unknown }).current = null; };
  }
}

/** The TermElement of a compat element, given to its ref (and used as event targets). */
const elementsById = new Map<string, Record<string, unknown>>();
/** The mounted compat element with this DOM id (the last one mounted when ids repeat), or null: what
 *  document.getElementById answers on the web, for the router's #hash scroll. */
export function termElementById(id: string): Record<string, unknown> | null { return elementsById.get(id) ?? null; }
const idWaiters = new Map<string, Set<(el: Record<string, unknown>) => void>>();
/** Calls `fn` with the element of this id when one mounts (now, if one is mounted already) until the returned stop runs. */
export function whenTermElementId(id: string, fn: (el: Record<string, unknown>) => void): () => void {
  const now = elementsById.get(id);
  if (now) { fn(now); return () => {}; }
  let set = idWaiters.get(id);
  if (!set) { set = new Set(); idWaiters.set(id, set); }
  set.add(fn);
  return () => { const w = idWaiters.get(id); if (!w) return; w.delete(fn); if (w.size === 0) idWaiters.delete(id); };
}

/** A terminal part that draws what the web gives a DOM id (a kit section's card) answers a #hash jump to that id as a
 *  compat element does: while mounted, `id` names an element whose scrollIntoView and node are the part's own box. */
export function useTermAnchorId(id: string | undefined, node: () => NodeLike | null): void {
  const live = useRef(node);
  live.current = node;
  useEffect(() => {
    if (!id) return;
    const entry: Record<string, unknown> = {
      scrollIntoView: (o?: { block?: string }) => {
        const n = live.current();
        const align = o?.block === 'start' || o?.block === 'end' ? o.block : 'nearest';
        for (let p = n?.parent ?? null; p; p = p.parent ?? null) if (typeof p.scrollChildIntoView === 'function') { p.scrollChildIntoView(n, { align }); return; }
      },
      __node: () => live.current(),
    };
    elementsById.set(id, entry);
    const waiting = idWaiters.get(id);
    if (waiting) { idWaiters.delete(id); for (const fn of waiting) fn(entry); }
    return () => { if (elementsById.get(id) === entry) elementsById.delete(id); };
  }, [id]);
}

function useTermElement(k: KindProps, host: Omit<ElementHost, 'tag' | 'props' | 'node' | 'parent' | 'overrides' | 'rerender'> & { node?: () => NodeLike | null }): { el: Record<string, unknown>; node: { current: NodeLike | null } } {
  const { tag, p } = k;
  const node = useRef<NodeLike | null>(null);
  const live = useRef({ p, host, parent: null as Record<string, unknown> | null, rerender: () => {} });
  live.current.p = p;
  live.current.host = host;
  const el = useRef<Record<string, unknown> | null>(null);
  el.current ??= createTermElement({
    tag,
    props: () => live.current.p,
    node: () => live.current.host.node?.() ?? node.current,
    get focusable() { return live.current.host.focusable; },
    press: () => live.current.host.press?.(),
    parent: () => live.current.parent,
    overrides: k.tree.overrides,
    rerender: () => live.current.rerender(),
  });
  const parentEl = k.ctx.parentEl;
  live.current.parent = parentEl;
  live.current.rerender = k.tree.rerender;
  k.inner.parentEl = el.current;
  // A generated box (::before / ::after) is no child of its element in the DOM: it is not in `children`.
  const generated = p.__pseudo !== undefined;
  useLayoutEffect(() => (generated ? undefined : adopt(parentEl, el.current!)), [parentEl, generated]);
  const ref = p.__ref as Ref<unknown> | undefined;
  useLayoutEffect(() => (ref ? setRef(ref, el.current) : undefined), [ref]);
  const id = typeof p.id === 'string' ? p.id : '';
  // Every element with an id, for a #hash navigation (termElementById; the router's anchor scroll, app/router.tsx).
  useEffect(() => {
    if (!id) return;
    const entry = el.current!;
    elementsById.set(id, entry);
    const waiting = idWaiters.get(id);
    if (waiting) { idWaiters.delete(id); for (const fn of waiting) fn(entry); }
    return () => { if (elementsById.get(id) === entry) elementsById.delete(id); };
  }, [id]);
  useEffect(() => {
    if (!id || !host.focusable) return;
    const entry = { focus: () => live.current.host.focusable?.focus(), press: () => live.current.host.press?.() };
    fieldsById.set(id, entry);
    return () => { if (fieldsById.get(id) === entry) fieldsById.delete(id); };
  }, [id, !!host.focusable]);
  const own = useRef(k.own);
  own.current = k.own;
  // A layout effect, as the buttons' registration: a button drawn after the form, naming it, finds it at once.
  useLayoutEffect(() => {
    if (tag !== 'form' || !id || !k.own.formState) return;
    const st = k.own.formState;
    const entry = { submit: (submitter: unknown) => { announceSubmit(st); own.current.onSubmit?.(submitEvent(el.current, submitter)); }, state: st };
    formsById.set(id, entry);
    return () => { if (formsById.get(id) === entry) formsById.delete(id); };
  }, [tag, id]);
  return { el: el.current, node };
}

/** onFocus / onBlur (bubbling) for a focusable's onFocusChange. */
const focusChange = (own: Readonly<Record<string, unknown>>, chain: readonly Bubble[], el: unknown) => (focused: boolean): void => {
  bubble(focused ? 'onFocus' : 'onBlur', (focused ? own.onFocus : own.onBlur) as Handler | undefined, chain, (t) => focusEvent(focused ? 'focus' : 'blur', t), el);
};

/** An element that only focus() reaches (see `target` in DomBox): registered in the focus scope outside the Tab order. */
function FocusTarget(o: { box: BoxProps; sem: ReturnType<typeof semOfDom>; boxNode: { current: NodeLike | null }; handle: { current: Focusable | null }; onFocusChange: (focused: boolean) => void; body: (focused: boolean) => ReactElement }): ReactElement {
  const f = useFocusable({ tabStop: false });
  o.handle.current = f;
  useFocusChange(f.focused, o.onFocusChange);
  const { boxNode } = o;
  // Its own semantics record, so a reader of the tree sees which element has the focus.
  const semRef = useSem(o.sem ?? undefined, { focus: f });
  const ref = useMemo(() => (n: unknown) => { boxNode.current = n as NodeLike | null; (f.ref as { current: unknown }).current = n; semRef(n); }, [boxNode, f.ref, semRef]);
  // Focused, its words take the focus ink and fill (`body` sets it for bare words and for the elements inside), the
  // extent of the words only, as a focused link: the box is not filled. A heading is a block as wide as its pane, and a
  // filled row under a button reads as a selected row or a second button.
  return createElement(Box, { ...o.box, boxRef: ref as never, children: o.body(f.focused) });
}

// ---- the element ---------------------------------------------------------------------------------------------------

export function Dom(props0: DomProps): ReactNode {
  let props = props0;
  const inText = useInText();
  const ctx = useContext(DomCtx);
  const ctxSlot = useContext(SlotCtx);
  const flatLine = useFlatLine();
  const resolve = useStyleResolver();
  // Attribute writes through a ref (setAttribute & co) live here so selectors see them; writing re-renders.
  const overrides = useRef<Map<string, string | null>>(null as never);
  const formState = useRef<FormState>(null as never);
  formState.current ??= { submitters: new Map(), submitted: new Set() };
  overrides.current ??= new Map();
  const [, rerender] = useState(0);
  // :empty decided after render (contentUnknown): null = not drawn yet, else whether the box drew any child.
  const [drewChildren, setDrewChildren] = useState<boolean | null>(null);
  const { tag } = props;
  const rule = TAGS[tag] ?? (ledger.unknownTags.set(tag, (ledger.unknownTags.get(tag) ?? 0) + 1), UNKNOWN_TAG);
  if (props.hidden === true) return null;
  if (rule.kind === 'nothing') {
    // An image or icon with a name keeps its meaning in the semantics tree (it still draws nothing).
    const sem = tag === 'img' || tag === 'svg' ? semOfDom(tag, props) : undefined;
    return sem?.role || sem?.name ? createElement(SemOnly, { sem }) : null;
  }
  if (props.dangerouslySetInnerHTML !== undefined) { ledger.refusedHtml++; return null; }
  for (const k in props) {
    if (k.length > 2 && k.startsWith('on') && k[2]! >= 'A' && k[2]! <= 'Z' && typeof props[k] === 'function' && !SUPPORTED_EVENTS.has(k)) {
      const id = tag + '.' + k;
      ledger.unsupported.set(id, (ledger.unsupported.get(id) ?? 0) + 1);
    }
  }
  if (rule.kind === 'br') return inText ? createElement(Br) : null;
  // A generated box (::before / ::after of the parent): its style is the rule's, it has no classes, no place among the
  // parent's element children and no generated box of its own.
  const generated = props.__pseudo as PseudoStyle | undefined;
  const slot = generated ? ((props.__slot as Slot | undefined) ?? null) : (props.__slot as Slot | undefined) ?? ctxSlot;
  const info = infoOf(tag, props, slot, overrides.current);
  // CSS :empty on children whose output is unknown until they render (a component that may draw nothing, as the web's
  // `.footNote:empty { display: none }` around a banner that renders null): the style is first resolved as not empty;
  // if it asked about :empty, the drawn box is watched (DomBox watchEmpty) and the element re-resolves as empty while
  // it has drawn no child. Hidden that way, it stays mounted (hidden box) so a child that starts drawing shows it.
  const unknownKids = !info.empty && contentUnknown(props.children as ReactNode);
  let askedEmpty = false;
  if (unknownKids) {
    const guess = drewChildren === false;
    Object.defineProperty(info, 'empty', { get: () => { askedEmpty = true; return guess; }, enumerable: true, configurable: true });
  }
  const st0: TermStyle = generated ? generated.style : (resolve ? resolve(info, ctx.frames) : undefined) ?? {};
  if (unknownKids) Object.defineProperty(info, 'empty', { value: drewChildren === false, enumerable: true, configurable: true, writable: true });
  const watchEmpty = unknownKids && askedEmpty ? setDrewChildren : undefined;
  // An inline tag with no layout of its own holding a block child (`<span><span class=title/><span class=body/></span>`
  // with display: block children): CSS breaks the line around each block, so its children stack (schedules chooser
  // drew "Command Run a command…" on one line).
  const st1: TermStyle = rule.kind === 'inline' && st0.box?.dir === undefined && st0.box?.raw?.flexDirection === undefined && !st0.grid && !inText
    && flatChildren(props.children as ReactNode).some(blockish) ? { ...st0, box: { ...st0.box, dir: 'column' } } : st0;
  // Under a FlatLine (a card's stacked title drawn as a one-row list name): a column of lines lies on one line, with
  // " · " between the lines, as the page's own one-line variant reads ("atlas · Home base").
  const flatAll = flatLine && !inText && !st1.grid && (rule.kind === 'block' || rule.kind === 'inline') && columnOf(st1, rule.kind) ? flatChildren(props.children as ReactNode).filter((c) => !blankStr(c) && c !== null && c !== undefined && typeof c !== 'boolean') : null;
  // Only a stack of lines: a flex column (each child is a line there), or blocks one under the other; words and inline
  // parts keep their own flow.
  const flexColumn = st1.box?.dir === 'column' || st1.box?.raw?.flexDirection === 'column';
  const flatKids = flatAll && flatAll.length > 1 && (flexColumn || flatAll.every(blockish)) ? flatAll : null;
  const st: TermStyle = flatKids ? { ...st1, box: { ...st1.box, dir: 'row', gap: 1, wrap: false, raw: { ...st1.box?.raw, flexDirection: 'row', flexWrap: 'no-wrap', rowGap: 0, columnGap: 1 } } } : st1;
  if (flatKids) props = { ...props, children: flatKids.flatMap((c, i) => (i === 0 ? [c] : [createElement(Text, { key: `flat${i}`, colour: 'faint' }, '\u00b7'), c])) };
  // Hidden only because it drew nothing (:empty): kept mounted and watched; hidden for any other reason: not drawn.
  const hiddenEmpty = st.box?.hidden === true && watchEmpty !== undefined && info.empty
    && resolve?.({ ...info, empty: false }, ctx.frames)?.box?.hidden !== true;
  // A file input hidden by its page (the web's picker is opened by a button calling its click()) stays mounted: it draws
  // nothing, but its element answers click() with the terminal's path field (DomField).
  const filePicker = tag === 'input' && typeof props.type === 'string' && props.type.toLowerCase() === 'file';
  if (st.box?.hidden && !hiddenEmpty && !filePicker) return null;
  const own0 = inherit(ctx.text, { ...rule.text, ...st.text });
  const text: TextStyle = ctx.ink ? { ...own0, ...ctx.ink, ...(own0.dim ? { dim: false } : {}) } : own0;
  const own: Bubble = {
    el: null,
    ...(typeof props.onKeyDown === 'function' ? { onKeyDown: props.onKeyDown as Handler } : {}),
    ...(typeof props.onFocus === 'function' ? { onFocus: props.onFocus as Handler } : {}),
    ...(typeof props.onBlur === 'function' ? { onBlur: props.onBlur as Handler } : {}),
    ...(tag === 'form' ? { form: true, formState: formState.current, ...(typeof props.onSubmit === 'function' ? { onSubmit: props.onSubmit as Handler } : {}) } : {}),
  };
  const bubbles = own.onKeyDown || own.onFocus || own.onBlur || own.form;
  const rawDir = st.box?.raw?.flexDirection;
  const myDir: 'row' | 'column' = rawDir === 'row' || rawDir === 'row-reverse' || (rawDir === undefined && (st.box?.dir === 'row' || (st.box?.dir === undefined && (rule.kind === 'row' || rule.kind === 'inline')))) ? 'row' : 'column';
  const inner: DomCtxValue = { frames: [{ info, childRules: st.childRules ?? [] }, ...ctx.frames], text, chain: bubbles ? [own, ...ctx.chain] : ctx.chain, parentEl: ctx.parentEl, dir: myDir, ...(ctx.ink ? { ink: ctx.ink } : {}) };
  const tree: TreeLink = { overrides: overrides.current, rerender: () => rerender((n) => n + 1) };
  // ::before / ::after: first and last among the children (a replaced element, a field or select, has none).
  const gen = rule.kind === 'field' || rule.kind === 'select' || rule.kind === 'rule' ? undefined : st.pseudo;
  const args: KindProps = { p: props, tag, rule, st, text, ctx, inner, own, slot, resolve, tree, ...(gen ? { gen } : {}), ...(watchEmpty ? { watchEmpty, hiddenEmpty } : {}) };
  if (inText) return createElement(DomSpan, args);
  if (rule.kind === 'rule') return createElement(Box, { border: ['top'], borderColour: 'line', height: 1 });
  if (rule.kind === 'field') return createElement(DomField, args);
  if (rule.kind === 'select') return createElement(DomSelect, args);
  if (st.contents) return createElement(DomCtx.Provider, { value: inner }, ...layoutChildren(args, false).nodes);
  return createElement(hasVh(st) ? DomVh : DomBox, args);
}

/**
 * A height on the viewport (`100dvh`, `calc(100vh - 2rem)`): the translator writes `<vh>vh±<rows>` and it is resolved
 * here against the height of the region the page is mounted in (the nearest pane: the shell's content pane, a drawer
 * body), never against the content, so a frame sized to the screen stays the screen's size as messages arrive.
 */
const VH_LENGTH = /^(-?\d+(?:\.\d+)?)vh([+-]\d+)$/;
const VH_KEYS = ['height', 'minHeight', 'maxHeight'] as const;
function hasVh(st: TermStyle): boolean {
  const r = st.box?.raw as Record<string, unknown> | undefined;
  return !!r && VH_KEYS.some((k) => typeof r[k] === 'string' && VH_LENGTH.test(r[k] as string));
}
/** Rows of `<vh>vh±<rows>` in a region `regionRows` tall (never below 0); other values unchanged. */
export function resolveVh(v: unknown, regionRows: number): unknown {
  const m = typeof v === 'string' ? VH_LENGTH.exec(v) : null;
  return m ? Math.max(0, Math.floor((Number(m[1]) * regionRows) / 100) + Number(m[2])) : v;
}
function DomVh(k: KindProps): ReactNode {
  const { rows } = usePaneSize();
  const raw = { ...(k.st.box!.raw as Record<string, unknown>) };
  for (const key of VH_KEYS) if (raw[key] !== undefined) raw[key] = resolveVh(raw[key], rows);
  return createElement(DomBox, { ...k, st: { ...k.st, box: { ...k.st.box, raw } } });
}

interface KindProps {
  p: DomProps; tag: string; rule: TagRule; st: TermStyle; text: TextStyle;
  /** The context this element sits in, and the one it gives its children. */
  ctx: DomCtxValue; inner: DomCtxValue; own: Bubble; slot: Slot | null;
  resolve: StyleResolver | null;
  tree: TreeLink;
  /** ::before / ::after boxes to draw around the children (withGenerated). */
  gen?: NonNullable<TermStyle['pseudo']>;
  /** Its :empty depends on what its children draw: told after each frame whether the box drew any child. */
  watchEmpty?: (drew: boolean) => void;
  /** Hidden by :empty (drew nothing): drawn as a hidden box, children mounted. */
  hiddenEmpty?: boolean;
}
interface TreeLink { overrides: Map<string, string | null>; rerender(): void }

/** An inline element inside a text run: a span. Box styles it cannot have become spaces (padding, margin, min-width). */
function DomSpan({ p, st, text, inner, gen }: KindProps): ReactNode {
  const raw = (st.box?.raw ?? {}) as Record<string, unknown>;
  const cells = (k: string): number => (typeof raw[k] === 'number' ? Math.max(0, Math.min(8, raw[k] as number)) : 0);
  const before = cells('paddingLeft') + cells('marginLeft');
  const after = cells('paddingRight') + cells('marginRight');
  let kids: ReactNode[] = joinInline(withGenerated(flatChildren(p.children as ReactNode).filter((c) => !isNothing(c)), gen).map((c) => (isPrimitive(c) ? prepText(c, text) : c)), spanFlow(st));
  // An empty labelled image (an unread dot drawn by CSS alone) would draw nothing: one cell stands for it.
  const sid = typeof p.id === 'string' ? p.id : '';
  const plain = sid ? flatText(p.children as ReactNode) : '';
  useEffect(() => (sid && plain ? registerInlineIdText(sid, plain) : undefined), [sid, plain]);
  if (kids.length === 0 && p.role === 'img' && typeof p['aria-label'] === 'string' && p['aria-label']) kids = [prepText('\u2022', text)];
  const min = typeof raw.minWidth === 'number' ? raw.minWidth : 0;
  if (min > 0 && kids.every((k) => typeof k === 'string')) kids = [(kids as string[]).join('').padEnd(min - after, ' ')];
  if (before) kids.unshift(' '.repeat(before));
  if (after) kids.push(' '.repeat(after));
  const link = p.tag === 'a' ? safeLinkUrl(p.href) : null;
  return createElement(DomCtx.Provider, { value: inner }, createElement(Text, { ...textProps(text), ...(link?.kind === 'web' ? { href: link.url } : {}) }, ...kids));
}

/**
 * How a container drawn inside a text run separates its children (it cannot be a box there): a flex row or grid puts
 * one space between items, a flex column a line break; plain inline flow keeps them touching (the web does too).
 */
function spanFlow(st: TermStyle): 'row' | 'column' | 'inline' {
  const d = st.box?.raw?.flexDirection ?? st.box?.dir ?? (st.grid ? st.grid.axis : undefined);
  if (d === 'row' || d === 'row-reverse') return 'row';
  if (d === 'column' || d === 'column-reverse') return 'column';
  return 'inline';
}
/** A child that is a line of its own on the web: a block or para tag, or an inline tag whose class makes it a block. */
/** True when an element with this style stacks its children (its main axis is the column). */
function columnOf(st: TermStyle, kind: string): boolean {
  const raw = st.box?.raw?.flexDirection;
  if (raw !== undefined) return raw === 'column' || raw === 'column-reverse';
  return st.box?.dir === 'column' || (st.box?.dir === undefined && kind === 'block');
}
function blockish(c: unknown): boolean {
  if (!isDomEl(c)) return false;
  const k = ruleOf(c.props.tag).kind;
  return k === 'block' || k === 'para' || k === 'row' || (k === 'inline' && classBlock(c.props, c.props.tag));
}
const blankStr = (c: unknown): boolean => typeof c === 'string' && c.trim() === '';
/**
 * Separators between the children of an element drawn inside a text run (seen drawn: "Failed40 times", "New BotAssistants",
 * "Personal3 computersShowing"): what the web's layout put between them, as text. A line break before and after a
 * block child (never at the start or end); in a flex row / grid one space between items (white-space-only text is no
 * item, as in CSS), in a flex column a line break.
 */
function joinInline(kids: ReactNode[], flow: 'row' | 'column' | 'inline'): ReactNode[] {
  const items = flow === 'inline' ? kids : kids.filter((c) => !blankStr(c));
  const out: ReactNode[] = [];
  let prev: ReactNode | undefined;
  items.forEach((c, k) => {
    if (prev !== undefined) {
      const brk = flow === 'column' || blockish(prev) || blockish(c);
      const space = !brk && flow === 'row' && !(typeof prev === 'string' && /\s$/.test(prev)) && !(typeof c === 'string' && /^\s/.test(c));
      if (brk) out.push(createElement(Br, { key: 'sep' + k }));
      else if (space) out.push(' ');
    }
    out.push(isValidElement(c) && c.key === null ? cloneElement(c, { key: 'k' + k }) : c);
    if (!(flow === 'inline' && blankStr(c))) prev = c;
  });
  // A break next to white space: the space would start or end a line.
  return out.filter((c, k) => !(blankStr(c) && (isBr(out[k - 1]) || isBr(out[k + 1]))));
}
const isBr = (c: unknown): boolean => isValidElement(c) && c.type === Br;

// Raw elements a kit component put straight into a Text: a block child gets its own line there too (nothing else changes).
setTextChildrenJoin((c) => {
  const kids = flatChildren(c);
  return kids.some(blockish) ? joinInline(kids, 'inline') : c;
});

/** Lays out children: text runs, items, list markers, grid tracks and chunks. */
function layoutChildren({ p, rule, st, text, resolve, inner, gen }: KindProps, forcedItems: boolean): { nodes: ReactNode[]; chunked: boolean; wrap?: boolean } {
  const all = withGenerated(flatChildren(p.children as ReactNode).filter((c) => !isNothing(c)), gen);
  // A one-line ellipsis box that is not a flex row (`display: block; white-space: nowrap; text-overflow: ellipsis`) is
  // one line box: its inline children (`<span class=ellipsis><bdi>…</bdi></span>`) are one text run, cut at its end
  // with "…", as CSS does. A block child still gets a line of its own. (Flex and grid children are items in CSS too.)
  const oneLine = text.truncate === true && text.wrap === 'none' && st.grid === undefined && st.box?.dir !== 'row'
    && st.box?.raw?.flexDirection !== 'row' && st.box?.raw?.flexDirection !== 'row-reverse' && rule.kind !== 'row';
  const items = forcedItems || (!oneLine && (st.box?.dir !== undefined || st.grid !== undefined || rule.kind === 'row'));
  // A component between pieces of text (`Hello <Name/>!`) belongs to that line whatever it renders.
  // Except one that says it is a block (hxBlock): it takes lines of its own under the text (Guide Build's steps drew
  // the step's words and its CodeBlock on one row, over each other).
  const glue = all.map((c, k) => !items && isComponentEl(c) && !isInlineComponent(c) && !isBlockComponent(c) && [all[k - 1], all[k + 1]].some((n) => n !== undefined && isTexty(n) && !(typeof n === 'string' && n.trim() === '')));
  // Runs: in items mode only bare text runs merge; elsewhere text and inline tags merge into one Text.
  const parts: ReactNode[] = [];
  let run: ReactNode[] = [];
  let comps = false;
  const rowAlready = rule.kind === 'inline' || rule.kind === 'row' || st.box?.raw?.flexDirection === 'row' || st.box?.raw?.flexDirection === 'row-reverse';
  const flush = (): void => {
    if (comps) {
      // A line of text and components: one row (clipped at its end, like a truncated line); each stretch of text one Text, each component as it is.
      const kids: ReactNode[] = [];
      let seg: ReactNode[] = [];
      const cut = (): void => { if (seg.length) kids.push(createElement(Text, { key: 'x' + kids.length, ...textProps(text) }, ...seg)); seg = []; };
      for (const r of run) { if (isComponentEl(r) && !isInlineComponent(r)) { cut(); kids.push(r); } else seg.push(r); }
      cut();
      // Already a row: the pieces go in place (they shrink as before); in a column they need a row of their own.
      if (rowAlready) parts.push(...kids);
      else parts.push(createElement(Box, { key: 'l' + parts.length, dir: 'row', shrink: 1, clip: true }, ...kids));
    } else if (run.length && run.some((r) => typeof r !== 'string' || r.trim() !== '')) parts.push(createElement(Text, { key: 't' + parts.length, ...textProps(text) }, ...run));
    run = [];
    comps = false;
  };
  all.forEach((c, k) => {
    if (glue[k]) { run.push(c); comps = true; }
    else if (isTexty(c) && !(items && isDomEl(c) && ruleOf(c.props.tag).kind !== 'br')) run.push(isPrimitive(c) ? prepText(c, text) : c);
    else { flush(); parts.push(c); }
  });
  flush();
  // In a grid, a `display: contents` child is no item: its children are (Guide's key table: `<dl>` of
  // `<div class=keyRow>` each holding a dt and a dd; the rows themselves took the two tracks, so two rows sat on a line
  // and the second's label was cut).
  if (st.grid !== undefined) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const c = parts[k];
      if (!isDomEl(c) || typeof c.props.className !== 'string') continue;
      const own = resolve?.({ tag: c.props.tag, classes: c.props.className.split(/\s+/).filter(Boolean), attrs: {}, empty: false }, inner.frames);
      if (own?.contents !== true) continue;
      const kids = flatChildren(c.props.children as ReactNode).filter((x) => !isNothing(x)).map((x, j) => (isValidElement(x) ? cloneElement(x, { key: `${c.key ?? k}:${x.key ?? j}` }) : x));
      parts.splice(k, 1, ...kids);
    }
  }
  // Places among element siblings (text runs do not count for :nth-child), list markers, grid tracks.
  const elements = parts.filter((c) => isValidElement(c) && c.type !== Text && !pseudoOf(c));
  const n = elements.length;
  // A list with no class numbers or bullets by its tag. A list with a class shows a marker only when its CSS asks for
  // one (`list-style: decimal` on Guide's ol.steps): base.css resets every list to none, as the web page has it.
  const classed = typeof p.className === 'string' && p.className.trim() !== '';
  const asked = st.text?.listMarker === 'decimal' ? 'ol' : st.text?.listMarker === 'bullet' ? 'ul' : undefined;
  const list = rule.list ? (classed ? asked : rule.list) : undefined;
  const grid = st.grid;
  const tracks = grid?.tracks ?? 0;
  // More items than tracks wraps into more grid rows, unless the container is a fixed few rows tall (a table row): a
  // second row would be cut off there, so the extra items stay on the line (readable beats exact).
  const fixedRows = typeof st.box?.raw?.height === 'number' && grid?.axis === 'row' && (st.box.raw.height as number) < 2;
  // An item spanning every track (`grid-column: 1 / -1`, gridItem.spanAll) is a row of its own, as wide as the grid,
  // and takes no track: also when the grid has no more items than tracks (Referrals: one code row in a 3-track list took
  // the first track's 18 cells). The tracks of the other items count around it, as CSS auto-placement does.
  // An item that is display: none takes no track and is no grid item (Guide Connect: a hidden narrow-width select made
  // 3 items for 2 tracks, so the panel wrapped into the 22-cell rail track).
  const itemStyle = parts.map((raw) => grid !== undefined && isDomEl(raw) && typeof raw.props.className === 'string'
    ? resolve?.({ tag: raw.props.tag, classes: raw.props.className.split(/\s+/).filter(Boolean), attrs: {}, empty: false }, inner.frames) : undefined);
  const hiddenAt = itemStyle.map((x) => x?.box?.hidden === true);
  const spansAt = itemStyle.map((x, k) => !hiddenAt[k] && x?.spanAll === true);
  const anySpans = spansAt.some(Boolean);
  const gridItems = parts.length - hiddenAt.filter(Boolean).length;
  const chunk = grid !== undefined && grid.fallback === 'chunk' && (gridItems > tracks || anySpans) && !fixedRows;
  // Each item's track: its place among the items that do not span, counted from the last spanning item (a spanning
  // item ends a grid row); a hidden item has none.
  const col: number[] = [];
  { let c = 0; spansAt.forEach((sp, k) => { if (hiddenAt[k]) col[k] = -1; else if (sp) { col[k] = -1; c = 0; } else col[k] = c++; }); }
  // A content-sized track (auto / max-content) of a grid drawn as several rows is one column on the web, as wide as its
  // widest item; each row box would size it alone (Scripts "Your script so far": values at different x). When every
  // item in that track is plain text, the track gets the widest text's width in every row.
  const autoW = new Map<number, number>();
  if (chunk && grid) {
    grid.childStyles.forEach((t, j) => {
      if (t.flexGrow !== 0 || t.width !== undefined || t.maxWidth !== undefined || t.flexBasis !== undefined) return;
      const texts: string[] = [];
      let plain = true;
      parts.forEach((c, k) => {
        if (col[k]! < 0 || col[k]! % tracks !== j) return;
        if (typeof c === 'string' || typeof c === 'number') { texts.push(String(c)); return; }
        const kids = isValidElement(c) ? (c.props as { children?: ReactNode }).children : undefined;
        const flat = (n: ReactNode): boolean => n === null || n === undefined || typeof n === 'boolean' || typeof n === 'string' || typeof n === 'number' || (Array.isArray(n) && n.every(flat));
        if (!isDomEl(c) || !flat(kids)) { plain = false; return; }
        texts.push(flatText(kids));
      });
      if (plain && texts.length > 1 && texts.every((x) => !/\n/.test(x))) autoW.set(j, widestCells(texts));
    });
  }
  let i = 0;
  let li = 0;
  // CSS `+`: each element's previous element sibling, as far as it is known here. Text runs are no element and are
  // skipped; a component's output is unknown, so the element after it has no `prev` (a `+` rule does not apply).
  let prevInfo: ElementInfo | undefined;
  const NO_OVERRIDES: ReadonlyMap<string, string | null> = new Map();
  const placed = parts.map((c, k) => {
    // In a wrapping row (auto-fit) an item spanning every track is the row's whole width, so it takes a line of its own
    // (Home "Your realms": the All realms row had no track, shrank to its icon and shared the first realm's line).
    const base = grid && col[k]! >= 0 ? (col[k]! >= tracks && fixedRows ? { flexShrink: 1, minWidth: 0 } : grid.childStyles[col[k]! % tracks])
      : grid && grid.fallback === 'wrap' && spansAt[k] ? SPAN_RAW : undefined;
    const w = base && !fixedRows ? autoW.get(col[k]! % tracks) : undefined;
    const track = base && w !== undefined ? { ...base, width: w } : base;
    if (!isValidElement(c) || c.type === Text) return track ? createElement(Box, { key: 'g' + k, raw: track }, c) : c;
    // A generated box is a flex / grid item (it takes its track) and is no sibling: no index, no list number, and it is
    // nobody's previous sibling (`.a + .b`).
    if (pseudoOf(c)) return track && (grid!.fallback !== 'column' || gridItems <= tracks) ? cloneElement(c, { __slot: { grid: track } } as never) : c;
    const s: Slot = { i: i++, n, ...(prevInfo ? { prev: prevInfo } : {}) };
    prevInfo = isDomEl(c) ? infoOf(c.props.tag, c.props, s, NO_OVERRIDES) : undefined;
    if (track && (grid!.fallback !== 'column' || gridItems <= tracks)) s.grid = track;
    if (list && isDomEl(c) && c.props.tag === 'li') s.marker = list === 'ol' ? `${++li}.` : '•';
    if (isDomEl(c)) return cloneElement(c, { __slot: s } as never);
    // A component's item: the track goes on a box around it, once. The element it renders gets its place but not the
    // track again: inside that (column) box a track's `flexBasis: 0` would be its HEIGHT (Home's tiles drew 0 rows).
    if (!s.grid) {
      const item = componentItemRaw(resolve?.({ tag: '', classes: [], attrs: {}, index: s.i, count: n, empty: false, ...(s.prev ? { prev: s.prev } : {}) }, inner.frames));
      if (item) return createElement(ItemBox, { key: c.key ?? 's' + k, item, place: s }, c);
      return createElement(SlotCtx.Provider, { key: c.key ?? 's' + k, value: s }, c);
    }
    const { grid: track0, ...place } = s;
    return createElement(TrackBox, { key: c.key ?? 's' + k, track: track0, place }, c);
  });
  // A component's item may turn out to span every track (TrackBox): its row wraps so that item takes a line of its own.
  const compItems = grid !== undefined && grid.fallback === 'chunk' && parts.some((c) => isValidElement(c) && c.type !== Text && !isDomEl(c));
  if (!chunk) return { nodes: placed, chunked: false, ...(compItems ? { wrap: true } : {}) };
  // More items than tracks: rows of `tracks` items; an item spanning every track takes a row of its own.
  const rows: ReactNode[][] = [];
  const spanRows = new Set<number>();
  let cur: ReactNode[] = [];
  let inRow = 0;
  placed.forEach((c, k) => {
    if (spansAt[k]) { if (cur.length) rows.push(cur); spanRows.add(rows.length); rows.push([c]); cur = []; inRow = 0; return; }
    cur.push(c);
    if (hiddenAt[k]) return; // drawn as nothing; it does not fill a track
    if (++inRow === tracks) { rows.push(cur); cur = []; inRow = 0; }
  });
  if (cur.length) rows.push(cur);
  const gap = st.box?.raw?.columnGap as number | undefined;
  // A spanning item's row is a column box, so the item stretches to the grid's whole width.
  return { nodes: rows.map((r, k) => createElement(Box, { key: 'r' + k, dir: grid!.axis === 'row' && !spanRows.has(k) ? 'row' : 'column', gap: gap ?? 1, alignSelf: 'stretch', ...(compItems ? { wrap: true } : {}) }, ...r)), chunked: true };
}

let nextDomId = 1;
/** Plain text of a subtree (strings and numbers, through elements' children): an inline id's accessible text. */
function flatText(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(flatText).join('');
  if (isValidElement(n)) return flatText((n.props as { children?: ReactNode }).children);
  return '';
}
const domIds = new WeakMap<object, number>();
/** Box props of a container element. */
function boxOf(k: KindProps, chunked: boolean, pageRoot = false): BoxProps {
  const { tag, rule, st, slot, p } = k;
  const box: BoxProps = { dir: rule.kind === 'inline' || rule.kind === 'row' ? 'row' : 'column' };
  if (slot?.grid) box.raw = { ...slot.grid };
  if (st.box) {
    const { raw, ...rest } = st.box;
    Object.assign(box, rest);
    if (raw) box.raw = { ...box.raw, ...raw };
  }
  if (chunked) box.raw = { ...box.raw, flexDirection: 'column', flexWrap: 'no-wrap', alignItems: 'stretch' };
  const dir = chunked ? 'column' : box.raw?.flexDirection === 'row' || box.raw?.flexDirection === 'row-reverse' ? 'row' : box.dir;
  // A row with nothing between its items: one column, so words never glue ("Failed40 times").
  if (dir === 'row' && !box.gap && !box.raw?.columnGap && !box.raw?.gap) box.raw = { ...box.raw, columnGap: 1 };
  if (rule.kind === 'cell' && box.grow === undefined && box.width === undefined && box.raw?.width === undefined && box.raw?.flexGrow === undefined) Object.assign(box, { grow: 1, basis: 0, clip: true });
  // The tag's own indent stands for the browser's default margin (dd, blockquote: margin-inline-start 40px); a rule
  // that sets that margin replaces it (`.sum dd { margin: 0 }`: the indent ate 2 of an auto track's 3 cells, "$69" drew
  // one character per line).
  if (rule.indent && box.raw?.marginLeft === undefined) box.pad = { left: rule.indent };
  if (st.border) {
    // A pressable laid out as a column is a card (Connect tiles); a pressable row is a button whose frame would add two rows.
    const pressCard = dir !== 'row' && isPressable(tag, p as Record<string, unknown>);
    const sides = drawnSides(tag, attrsOf(p), st.border, pressCard);
    if (sides) Object.assign(box, { border: sides, borderColour: st.border.colour ?? 'line' });
  }
  // A readable engine id (`div.planGrid@12`) so layout checks and the semantics tree can name the element.
  const cls = typeof p.className === 'string' ? p.className.split(/\s+/).filter(Boolean).map((c) => c.slice(c.lastIndexOf('#') + 1)).join('.') : '';
  let n = domIds.get(k.own as object);
  if (n === undefined) { n = nextDomId++; domIds.set(k.own as object, n); }
  box.raw = { ...box.raw, id: `${tag}${cls ? '.' + cls : ''}@${n}` };
  // A percentage height (height, min-height, max-height, block-size) whose containing block has an indefinite height
  // computes to auto (CSS 2.1 10.5): Yoga resolved it against whatever it found and a row ran 57200 rows tall (Home
  // .realmRow). Dropped here unless the parent's height is definite; this box's own height is definite only when
  // it is a number of cells, or a kept percentage.
  {
    const pct = (v: unknown): boolean => typeof v === 'string' && /%\s*$/.test(v);
    // A compat root under a scrolling page owner (PageFlowRoot: PageBody, the outlet) sits in the scroll's content,
    // whose height is auto (it grows with what it holds), never the pane's: `.listWrap { height: 100% }` there is auto
    // on the web. Resolved against the viewport it stood a page tall under its toolbar, so the body overflowed by the
    // toolbar's rows and drew a near-full scrollbar beside a 7-row list (support).
    const parentDef = k.ctx.hDef !== false && !(pageRoot && k.ctx.parentEl === null);
    const r = { ...(box.raw as Record<string, unknown>) };
    const bx = box as Record<string, unknown>;
    let dropped = false;
    // min/max-height percentages are never given to Yoga: it resolves them against the wrong box (a minHeight 100%
    // inside a 6-row parent took the whole screen, measured), so they act as auto.
    for (const key of ['height', 'minHeight', 'maxHeight'] as const) {
      const drop = key !== 'height' || !parentDef;
      if (drop && pct(r[key])) { delete r[key]; dropped = true; }
      if (drop && pct(bx[key])) { delete bx[key]; dropped = true; }
    }
    if (dropped) box.raw = r;
    const h = r.height ?? bx.height;
    // A flex item sized by a definite container is definite too: one that grows in a column, or one stretched across a row.
    const grows = typeof r.flexGrow === 'number' && r.flexGrow > 0;
    const stretched = r.alignSelf === undefined || r.alignSelf === 'stretch';
    k.inner.hDef = typeof h === 'number' || (pct(h) && parentDef) || (parentDef && ((k.ctx.dir === 'column' && grows) || (k.ctx.dir === 'row' && stretched)));
  }
  // CSS never shrinks a block (or a column flex item: min-height auto) below its content; Yoga's min is 0, so a column
  // squeezed for room crushed its children to one row each and they painted over one another. Emulate min-height
  // auto: in a compat column, a child with no height of its own and no overflow clip of its own does not shrink.
  // A page's root box straight under the shell's scrolling outlet (PageFlowRoot): on the web its parent is the main
  // area, a block scroll container, where flex shrink and basis do not apply, so the root is as tall as its content and
  // the area scrolls. Here its parent is a flex column the viewport's height, and `flex: 1; min-height: 0` pinned the
  // page to the viewport (nothing scrolled). Same emulation as below: no shrinking, basis auto; growing still fills.
  // A root with its own height or overflow box keeps its own rules (it scrolls or clips itself).
  if (pageRoot && k.ctx.parentEl === null && box.raw) {
    const r = box.raw as Record<string, unknown>;
    const ov = r.overflow;
    if (r.height === undefined && r.maxHeight === undefined && ov !== 'hidden' && ov !== 'scroll' && ov !== 'auto') {
      const { minHeight: _min, ...rest } = r;
      void _min;
      box.raw = { ...rest, flexShrink: 0, ...(r.flexBasis !== undefined && r.flexBasis !== 'auto' ? { flexBasis: 'auto' } : {}) };
    }
  }
  // The same in a row sized by its content (`.cardHead { flex: 0 0 auto }` in a wrapping row, holding an
  // `h2 { flex: 1 }`): CSS gives that row its max-content width, where a `flex: 1` child counts at its content; Yoga sums
  // the children's bases, so a basis 0 made the row 0-1 cells wide and the heading vanished (billing GitHub bonus).
  if (k.ctx.dir === 'row' && k.ctx.wContent === true && box.raw) {
    const r = box.raw as Record<string, unknown>;
    if (r.flexBasis === 0 || (typeof r.flexBasis === 'string' && r.flexBasis !== 'auto')) box.raw = { ...r, flexBasis: 'auto' };
  }
  {
    // This box as a parent: a row with no width of its own that does not grow, laid out in a row (its main axis is
    // its width there) or in a column that does not stretch it.
    const r = (box.raw ?? {}) as Record<string, unknown>;
    const bx = box as Record<string, unknown>;
    const isRow = (box.dir ?? r.flexDirection) === 'row';
    const noW = r.width === undefined && bx.width === undefined && r.flexBasis !== 0 && typeof r.flexBasis !== 'number';
    const noGrow = !(typeof r.flexGrow === 'number' && r.flexGrow > 0) && !(typeof bx.grow === 'number' && (bx.grow as number) > 0);
    k.inner.wContent = isRow && noW && noGrow && k.ctx.dir === 'row';
  }
  if (k.ctx.dir === 'column' && box.raw) {
    const r = box.raw as Record<string, unknown>;
    const ov = (st.box?.raw as Record<string, unknown> | undefined)?.overflow;
    // `min-height` set in CSS (0 included) is the page opting into shrinking; an explicit size or overflow box too.
    // `flex: 1 1 0` (basis 0) would still collapse to nothing in a column of auto height: CSS sizes it by its content
    // there, so the basis becomes auto (growing still fills a taller parent).
    if (r.height === undefined && r.maxHeight === undefined && r.minHeight === undefined && ov !== 'hidden' && ov !== 'scroll' && ov !== 'auto') {
      box.raw = { ...r, flexShrink: 0, ...(r.flexBasis === 0 || typeof r.flexBasis === 'string' && r.flexBasis !== 'auto' ? { flexBasis: 'auto' } : {}) };
    } else if (k.ctx.hDef === false && (r.flexBasis === 0 || (typeof r.flexBasis === 'string' && r.flexBasis !== 'auto' && !/%\s*$/.test(r.flexBasis)))) {
      // The basis is decided by the column's definiteness, not by min-height: in a column of indefinite height CSS
      // counts a `flex: 1` item at its content (its max-content contribution), `min-height: 0` or an overflow clip
      // included, so a 0 basis there drew it at no height (Files phone pane `.folder`). Shrinking keeps the rule above.
      box.raw = { ...r, flexBasis: 'auto' };
    }
  }
  if (box.raw) {
    const raw: Record<string, unknown> = { ...box.raw };
    // The engine takes no 'scroll' overflow on a plain box: clip (the page scrolls through its own Scroll).
    if (raw.overflow === 'scroll') raw.overflow = 'hidden';
    // Borders are decided above, never by raw keys.
    delete raw.border;
    // position: sticky is run-time behaviour (DomBox, sticky.ts), never an engine key.
    delete raw.sticky;
    box.raw = raw;
  }
  return box;
}

/** A block, inline box, paragraph, row, cell or pressable. */
function DomBox(k: KindProps): ReactNode {
  const { p, tag, rule, inner, own, slot, text } = k;
  const [open, setOpen] = useState(p.open === true);
  const details = useContext(DetailsCtx);
  // The focus ink this element is already inside (a focused Pressable around it): passed on unchanged while this
  // element is not the focused one.
  const outerInk = useContext(FocusInkCtx);
  const press = useRef<Focusable | null>(null);
  const onClick = typeof p.onClick === 'function' ? (p.onClick as Handler) : undefined;
  const link = tag === 'a' ? safeLinkUrl(p.href) : null;
  const tabIndex = typeof p.tabIndex === 'number' ? p.tabIndex : undefined;
  const role = typeof p.role === 'string' ? p.role : '';
  const disabled = p.disabled === true || truthyAttr(p['aria-disabled']);
  const pressable = rule.kind === 'press' || !!onClick || (link?.kind === 'route' && !!navigate) || role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'option'
    || (tabIndex !== undefined && tabIndex >= 0) || (typeof p.htmlFor === 'string' && p.htmlFor !== '');
  // A numeric tabIndex on an element nothing presses (the web's `tabIndex={-1}` heading a view change focuses): focus()
  // can target it, Tab never stops on it, and it takes no press and no role of its own.
  const target = !pressable && tabIndex !== undefined;
  const submitsForm = tag === 'button' && (p.type === 'submit' || p.type === undefined);
  const liveOff = useRef(disabled);
  liveOff.current = disabled || truthyAttr(p['aria-busy']);
  useRawFormSubmitter(() => liveOff.current, typeof p.form === 'string' && p.form ? p.form : undefined, submitsForm);
  const doPress = (at?: { x: number; y: number }): void => {
    if (disabled) return;
    if (typeof p.htmlFor === 'string') { const f = fieldsById.get(p.htmlFor); f?.focus(); f?.press?.(); }
    const e = pressEvent(el, at ? { mouse: at } : {});
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (tag === 'summary' && details) details.toggle();
    else if (tag === 'a' && link?.kind === 'route' && !onClick) navigate?.(link.path);
    else if (tag === 'button' && (p.type === 'submit' || p.type === undefined) && typeof p.form === 'string' && p.form) submitRawForm(p.form, el);
    else if (tag === 'button' && (p.type === 'submit' || p.type === undefined) && inner.chain.some((b) => b.form)) submitForm(inner.chain, el);
  };
  const boxNode = useRef<NodeLike | null>(null);
  const stickyNode = useCallback(() => (pressable ? press.current?.ref.current ?? null : boxNode.current), [pressable]);
  const { el } = useTermElement(k, { node: () => (pressable ? (press.current?.ref.current as NodeLike | null | undefined) ?? null : boxNode.current), focusable: pressable || target ? { focus: () => press.current?.focus(), blur: () => press.current?.blur(), focused: () => press.current?.focused === true } : undefined, press: () => doPress() });
  own.el = el;

  // details: the summary toggles the rest.
  const kids = tag === 'details' ? { ...k, p: { ...p, children: Children.toArray(p.children as ReactNode).filter((c) => open || (isDomEl(c) && c.props.tag === 'summary')) } as DomProps } : k;
  const laid = layoutChildren(kids, false);
  const box = boxOf(k, laid.chunked, useContext(PageFlowRoot));
  if (laid.wrap) box.raw = { ...box.raw, flexWrap: 'wrap' };
  // As a component's grid item (TrackBox): say whether this element spans every track.
  const onSpan = slot?.onSpan;
  const spans = k.st.spanAll === true;
  useLayoutEffect(() => { onSpan?.(spans); }, [onSpan, spans]);
  // As a component's flex item (ItemBox): this element's item style (margins, flex) goes on the box, which is the item.
  const onClaim = slot?.onClaim;
  let claim: Record<string, unknown> | undefined;
  if (onClaim) { const { item, rest } = splitItem(box.raw); claim = item; box.raw = rest; }
  const claimKey = claim ? ITEM_KEYS.map((key) => String(claim![key] ?? '')).join('|') : '';
  useLayoutEffect(() => { if (claim) onClaim?.(claim); }, [onClaim, claimKey]);
  // position: sticky (css-translate keeps the insets): offset each frame inside the nearest scroll box.
  const sticky = (k.st.box?.raw as { sticky?: StickySpec } | undefined)?.sticky;
  useSticky(stickyNode, sticky);
  // A sticky box paints over the content scrolling under it: in a terminal it needs an opaque ground (cells left blank
  // would show the words beneath), so it takes the page background unless it has a fill of its own.
  if (sticky && box.bg === undefined) box.bg = 'bg';
  if (k.hiddenEmpty) box.hidden = true;
  // overflow auto/scroll: a box with a bounded height scrolls its content (and follows focus); an unbounded
  // one grows with it, as on the web, and clips.
  const r0 = k.st.box?.raw;
  const scrolls = !pressable && r0?.overflow === 'scroll' && (r0.height !== undefined || r0.maxHeight !== undefined || r0.flexGrow !== undefined);
  // :empty on a scrolling box watches the scroll's CONTENT: the outer box always holds the scroll itself, so it never read
  // as empty (the AI pane's empty `.stopResult:empty` drew a 15-row blank scroll under the foot).
  const scrollContent = useRef<NodeLike | null>(null);
  const scrollRef = useCallback((sb: { content?: NodeLike } | null) => { scrollContent.current = sb?.content ?? null; }, []);
  useDrawnChildren(boxNode, pressable ? undefined : k.watchEmpty, scrolls ? scrollContent : undefined);
  // align-items: center in a row rounds toward the top (centre.ts): an odd remainder puts the half row below the item.
  {
    const r = (box.raw ?? {}) as Record<string, unknown>;
    const bx = box as Record<string, unknown>;
    const row = (box.dir ?? r.flexDirection) === 'row' && (r.alignItems === 'center' || bx.align === 'center');
    const n = (...v: unknown[]): number => { for (const x of v) if (typeof x === 'number') return x; return 0; };
    const sides = box.border === true ? ['top', 'bottom'] : Array.isArray(box.border) ? box.border : [];
    const pad = bx.pad as { top?: number; bottom?: number } | undefined;
    const padTop = n(r.paddingTop, r.paddingY, r.padding, pad?.top, bx.padY) + (sides.includes('top') ? 1 : 0);
    const padBottom = n(r.paddingBottom, r.paddingY, r.padding, pad?.bottom, bx.padY) + (sides.includes('bottom') ? 1 : 0);
    useCentreUp(stickyNode, row && !scrolls, padTop, padBottom);
  }
  let body: ReactNode[] = laid.nodes;
  // An icon-only control (its children draw nothing): its accessible name is its text.
  if (pressable && body.length === 0) {
    const name = typeof p['aria-label'] === 'string' ? p['aria-label'] : typeof p.title === 'string' ? p.title : '';
    if (name) body = [createElement(Text, { key: 'name', ...textProps(text) }, name)];
  }
  if (slot?.marker) {
    body = [createElement(Text, { key: 'm', ...textProps(text) }, slot.marker + ' '), createElement(Box, { key: 'b', dir: 'column', grow: 1, shrink: 1 }, ...body)];
    box.dir = 'row';
    if (box.raw) box.raw = { ...box.raw, flexDirection: 'row' };
  }
  // Focused: the DomCtx ink reaches descendant ELEMENTS; bare strings were already made Texts, which read FocusInkCtx, so the
  // same ink goes there too.
  // The SAME two providers focused or not (only their values change): a wrapper present only while focused changed the
  // element type at this position, so React remounted everything inside on every focus and blur (state inside a raw
  // focusable was reset; a held secret was dropped by its field's unmount: the keys "shown once" panel lost the key).
  const wrapped = (focused: boolean): ReactElement => {
    const ctx = createElement(DomCtx.Provider, { value: focused ? { ...inner, text: { ...inner.text, ...focusInk(true) }, ink: focusInk(true) as TextStyle } : inner }, ...body);
    return createElement(FocusInkCtx.Provider, { value: focused ? focusInk(true) : outerInk }, ctx);
  };
  const withDetails = (n: ReactElement): ReactElement => (tag === 'details' ? createElement(DetailsCtx.Provider, { value: { open, toggle: () => setOpen((o) => !o) } }, n) : n);
  const sem = semOfDom(tag, p);
  if (scrolls) {
    const { raw: braw, ...outer } = box;
    const { flexDirection, columnGap, rowGap, gap, alignItems, justifyContent, flexWrap, paddingTop, paddingRight, paddingBottom, paddingLeft, ...outerRaw } = (braw ?? {}) as Record<string, unknown>;
    void columnGap; void rowGap; void alignItems; void justifyContent; void flexWrap;
    // The web draws an overflow box's bar at its padding edge (content | padding | bar) and scrolls the padding with the
    // content: the padding goes on one box inside the scroll, never on the outer box (that put the bar right against
    // the content, the padding cells outside it: AI Details Usage).
    const pad = Object.fromEntries(Object.entries({ paddingTop, paddingRight, paddingBottom, paddingLeft }).filter(([, v]) => v !== undefined && v !== 0));
    const dir = flexDirection === 'row' ? 'row' : 'column';
    const content = Object.keys(pad).length
      ? createElement(Box, { dir, ...(dir === 'column' ? { shrink: 0 } : {}), ...(typeof gap === 'number' ? { gap } : {}), raw: pad }, wrapped(false))
      : wrapped(false);
    return withDetails(createElement(Box, { ...outer, dir: 'column', raw: { ...outerRaw, overflow: 'hidden' }, ...(sem ? { sem } : {}), boxRef: boxNode as never },
      createElement(Scroll, { grow: 1, followFocus: true, ...(k.watchEmpty ? { scrollRef } : {}), dir, ...(typeof gap === 'number' && !Object.keys(pad).length ? { gap } : {}) } as never, content)));
  }
  if (target) return withDetails(createElement(FocusTarget, { box, sem, boxNode, handle: press, onFocusChange: focusChange(p, k.ctx.chain, el), body: wrapped }));
  if (!pressable) return withDetails(createElement(Box, { ...box, ...(sem ? { sem } : {}), boxRef: boxNode as never, children: wrapped(false) }));
  return withDetails(createElement(Pressable, {
    ...box, handle: press, disabled, tabStop: tabIndex === undefined || tabIndex >= 0, ...(sem ? { sem } : {}),
    onPress: (at) => doPress(at), onFocusChange: focusChange(p, k.ctx.chain, el), focusFill: true,
    onKey: (key: Key) => bubble('onKeyDown', own.onKeyDown, k.ctx.chain, (t) => keyEvent('keydown', key, t), el),
    children: ({ focused }: { focused: boolean }) => wrapped(focused),
  }));
}

// ---- fields --------------------------------------------------------------------------------------------------------

function DomField(k: KindProps): ReactNode {
  const { p, tag, ctx, own } = k;
  const type = typeof p.type === 'string' ? p.type.toLowerCase() : 'text';
  const field = useRef<FieldHandle | null>(null);
  const check = useRef<Focusable | null>(null);
  const box = useRef<NodeLike | null>(null);
  const [focused, setFocused] = useState(false);
  const controlled = typeof p.value === 'string' || typeof p.value === 'number';
  const [mine, setMine] = useState(typeof p.defaultValue === 'string' ? p.defaultValue : '');
  const [checkedMine, setCheckedMine] = useState(p.defaultChecked === true);
  const value = controlled ? String(p.value) : mine;
  const isCheck = type === 'checkbox' || type === 'radio';
  const checked = typeof p.checked === 'boolean' ? p.checked : checkedMine;
  const disabled = p.disabled === true;
  const change = (now: { value?: string; checked?: boolean }): void => {
    if (now.value !== undefined && !controlled) setMine(now.value);
    if (now.checked !== undefined && typeof p.checked !== 'boolean') setCheckedMine(now.checked);
    (p.onInput as Handler | undefined)?.(changeEvent('input', el, now));
    (p.onChange as Handler | undefined)?.(changeEvent('change', el, now));
  };
  const toggle = (): void => { if (!disabled && p.readOnly !== true) change({ checked: type === 'radio' ? true : !checked, value: typeof p.value === 'string' ? p.value : 'on' }); };
  // A file input has no picker here: its click() (the page's button) opens a field for local paths (filePick.ts), and
  // the files that pass reach onChange as `target.files`, as the web's picker hands them on.
  const [picking, setPicking] = useState(false);
  const pick = (): void => { if (!disabled) setPicking(true); };
  const picked = (files: File[]): void => {
    const target = { files, value: '', type: 'file', name: typeof p.name === 'string' ? p.name : '' } as Record<string, unknown>;
    (p.onInput as Handler | undefined)?.(changeEvent('input', target, {}));
    (p.onChange as Handler | undefined)?.(changeEvent('change', target, {}));
  };
  const focusable = type === 'hidden' || type === 'file' ? undefined : isCheck
    ? { focus: () => check.current?.focus(), blur: () => check.current?.blur(), focused: () => check.current?.focused === true }
    : { focus: () => field.current?.focus(), blur: () => {}, focused: () => focused };
  const { el } = useTermElement(k, { node: () => (isCheck ? (check.current?.ref.current as NodeLike | null | undefined) ?? null : box.current), focusable, ...(isCheck ? { press: toggle } : type === 'file' ? { press: pick } : {}) });
  own.el = el;
  const onFocusChange = (f: boolean): void => { setFocused(f); focusChange(p, ctx.chain, el)(f); };
  const keyDown = (key: Key): boolean => bubble('onKeyDown', own.onKeyDown, ctx.chain, (t) => keyEvent('keydown', key, t), el);
  const sem = semOfDom(tag, p);
  if (type === 'file') return picking ? createElement(FilePicker, { multiple: p.multiple === true, onFiles: picked, onClose: () => setPicking(false) }) : null;
  if (type === 'hidden') return null;
  if (isCheck) {
    return createElement(Pressable, { dir: 'row', disabled, handle: check, onPress: toggle, onKey: keyDown, onFocusChange, ...(sem ? { sem } : {}),
      children: ({ focused: f }: { focused: boolean }) => createElement(Text, focusInk(f), type === 'radio' ? (checked ? '(•)' : '( )') : checked ? '[x]' : '[ ]') });
  }
  const multi = tag === 'textarea';
  const rows = typeof p.rows === 'number' ? p.rows : multi ? 3 : 1;
  return createElement(Box, { dir: 'row', grow: 1, shrink: 1, boxRef: box as never },
    type === 'password'
      ? createElement(SecretInput, {
        value, onChange: (v: string) => change({ value: v }), onSubmit: () => implicitSubmit(ctx.chain),
        ...(typeof p.placeholder === 'string' ? { placeholder: p.placeholder } : {}),
        disabled, readOnly: p.readOnly === true, keepOnUnmount: controlled,
        ...(typeof p.maxLength === 'number' ? { maxLength: p.maxLength } : {}),
        autoFocus: p.autoFocus === true, onKey: keyDown, onFocusChange, handle: field, grow: 1, ...(sem ? { sem } : {}),
      })
      : createElement(FieldInput, {
      value, onChange: (v: string) => change({ value: v }),
      onSubmit: () => { if (!multi) implicitSubmit(ctx.chain); },
      ...(typeof p.placeholder === 'string' ? { placeholder: p.placeholder } : {}),
      disabled, readOnly: p.readOnly === true, mask: type === 'password', lines: multi ? Math.max(2, rows) : 1,
      ...(typeof p.maxLength === 'number' ? { maxLength: p.maxLength } : {}),
      autoFocus: p.autoFocus === true, onKey: keyDown, onFocusChange, handle: field, grow: 1, ...(sem ? { sem } : {}),
    }));
}

/** A select: the chosen option's text; Enter / Space / a click steps to the next enabled option. */
function DomSelect(k: KindProps): ReactNode {
  const { p, tag, ctx, own } = k;
  const opts: { value: string; label: string; disabled: boolean }[] = [];
  const walk = (n: ReactNode): void => Children.forEach(n, (c) => {
    if (!isDomEl(c)) return;
    if (c.props.tag === 'optgroup') { walk(c.props.children as ReactNode); return; }
    if (c.props.tag !== 'option') return;
    const label = Children.toArray(c.props.children as ReactNode).filter(isPrimitive).join('');
    opts.push({ value: typeof c.props.value === 'string' ? c.props.value : label, label, disabled: c.props.disabled === true });
  });
  walk(p.children as ReactNode);
  const [mine, setMine] = useState(typeof p.defaultValue === 'string' ? p.defaultValue : opts[0]?.value ?? '');
  const value = typeof p.value === 'string' ? p.value : mine;
  const handle = useRef<Focusable | null>(null);
  const step = (): void => {
    if (p.disabled === true || opts.length === 0) return;
    const at = opts.findIndex((o) => o.value === value);
    for (let d = 1; d <= opts.length; d++) {
      const o = opts[(at + d + opts.length) % opts.length]!;
      if (o.disabled) continue;
      if (typeof p.value !== 'string') setMine(o.value);
      (p.onChange as Handler | undefined)?.(changeEvent('change', el, { value: o.value }));
      return;
    }
  };
  const { el } = useTermElement(k, { node: () => (handle.current?.ref.current as NodeLike | null | undefined) ?? null, focusable: { focus: () => handle.current?.focus(), blur: () => handle.current?.blur(), focused: () => handle.current?.focused === true }, press: step });
  own.el = el;
  const label = opts.find((o) => o.value === value)?.label ?? '';
  const sem = semOfDom(tag, p);
  return createElement(Pressable, { dir: 'row', handle, disabled: p.disabled === true, onPress: () => step(), onFocusChange: focusChange(p, ctx.chain, el), ...(sem ? { sem: { ...sem, value: label } } : {}),
    onKey: (key: Key) => bubble('onKeyDown', own.onKeyDown, ctx.chain, (t) => keyEvent('keydown', key, t), el),
    children: ({ focused }: { focused: boolean }) => createElement(Text, focusInk(focused), `${label} ▾`) });
}

