// What shared code gets from a ref on a raw tag, and from the event object of a DOM handler, in the terminal.
//
// Element refs: a TermElement per compat element. It answers the members a terminal can answer honestly and throws
// TERM_DOM_MEMBER naming the member for everything else (querySelector, closest, style, ...), so a caller that needs
// more is found and ported (a .term sibling or a hostEnv seam), never silently wrong. The ledger counts each refusal.
//   focus() / blur()                 the element's own focus when it is focusable (button, input, tabIndex >= 0, ...)
//   scrollIntoView()                 the nearest scrolling ancestor scrolls it into view
//   getBoundingClientRect()          its laid-out cells in px: x * 8, y * 16, width * 8, height * 16 (the rule
//                                    useMedia / useContainerNarrow use), plus clientWidth/Height, offsetWidth/Height
//   tagName, id, dataset, getAttribute(), hasAttribute(), hidden, isConnected, contains(), click()
// Events: a press, a key, a change, a focus move. Fields shared code reads: target,
// currentTarget, preventDefault, stopPropagation, defaultPrevented, key, code, shiftKey, ctrlKey, altKey, metaKey,
// repeat, isComposing, button, detail, clientX/Y, pointerType, relatedTarget, nativeEvent, type, timeStamp.
import type { Key } from '../prim/focus';

export const CELL_PX = { w: 8, h: 16 } as const;

/** The engine node a TermElement measures (a renderable: x, y, width, height, parent). */
export interface NodeLike { x: number; y: number; width: number; height: number; parent?: NodeLike | null; isDestroyed?: boolean; scrollChildIntoView?: (n: unknown, o?: unknown) => void }

export interface ElementHost {
  tag: string;
  props(): Readonly<Record<string, unknown>>;
  node(): NodeLike | null;
  /** Focus control when the element can take the focus (else undefined: focus() does nothing, as on the web). */
  focusable?: { focus(): void; blur(): void; focused(): boolean };
  /** A press of the element (click()). */
  press?: () => void;
  /** The compat parent element (null at the top of a compat tree). */
  parent?: () => Record<string, unknown> | null;
  /** Attribute writes (setAttribute & co): held here, merged over the props, the element re-renders. */
  overrides?: Map<string, string | null>;
  rerender?: () => void;
}

/** Child elements by parent, in mount order (each element registers itself with its parent while mounted). */
const kids = new WeakMap<object, Set<Record<string, unknown>>>();
export function adopt(parent: Record<string, unknown> | null, child: Record<string, unknown>): () => void {
  if (!parent) return () => {};
  const raw = (parent as { __raw?: object }).__raw ?? parent;
  let set = kids.get(raw);
  if (!set) kids.set(raw, (set = new Set()));
  set.add(child);
  return () => { set!.delete(child); };
}

const refusals = new Map<string, number>();
/** Element members asked for and refused so far (`div.querySelector`, ...): the work list for siblings. */
export const domRefusals = (): Record<string, number> => Object.fromEntries([...refusals].sort());
export const clearDomRefusals = (): void => refusals.clear();

function refuse(tag: string, member: string): never {
  const k = `${tag}.${member}`;
  refusals.set(k, (refusals.get(k) ?? 0) + 1);
  throw new Error(`TERM_DOM_MEMBER: ${k} is not available in the terminal. Element refs answer: ${SUPPORTED.join(', ')}. Port the caller with a .term sibling or a hostEnv seam.`);
}

function attrString(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null || v === false) return (name.startsWith('aria-') || name.startsWith('data-')) && v === false ? 'false' : undefined;
  if (v === true) return name.startsWith('aria-') || name.startsWith('data-') ? 'true' : '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return String(v);
  return undefined;
}
const PROP_ATTR: Readonly<Record<string, string>> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly' };
const ATTR_PROPS = ['className', 'id', 'role', 'type', 'name', 'value', 'title', 'href', 'disabled', 'checked', 'open', 'hidden', 'required', 'placeholder', 'tabIndex', 'readOnly', 'htmlFor', 'lang', 'dir'];

/** The DOM attributes of a compat element's props (what attribute selectors and getAttribute see). */
export function attrsOf(props: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in props) {
    if (k.startsWith('aria-') || k.startsWith('data-') || ATTR_PROPS.includes(k)) {
      const v = attrString(props[k], k);
      if (v !== undefined) out[PROP_ATTR[k] ?? k.toLowerCase()] = v;
    }
  }
  return out;
}

function rectOf(n: NodeLike | null): { x: number; y: number; width: number; height: number; top: number; left: number; right: number; bottom: number; toJSON(): unknown } {
  const x = (n?.x ?? 0) * CELL_PX.w;
  const y = (n?.y ?? 0) * CELL_PX.h;
  const width = (n?.width ?? 0) * CELL_PX.w;
  const height = (n?.height ?? 0) * CELL_PX.h;
  const r = { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
  return { ...r, toJSON: () => r };
}

const SUPPORTED = ['focus', 'blur', 'scrollIntoView', 'getBoundingClientRect', 'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight',
  'tagName', 'nodeName', 'id', 'className', 'dataset', 'getAttribute', 'hasAttribute', 'setAttribute', 'removeAttribute', 'toggleAttribute', 'hidden',
  'isConnected', 'contains', 'click', 'value', 'checked', 'disabled', 'setSelectionRange', 'select', 'selectionStart', 'selectionEnd', 'parentElement', 'children', 'firstElementChild', 'lastElementChild',
  'nextElementSibling', 'previousElementSibling', 'matches', 'closest', 'querySelector', 'querySelectorAll (simple selectors)'];

/** Members whose absence code tests for: answered with undefined rather than refused (`if (el.showModal)` probes). */
const PROBED = new Set(['then', 'toJSON', '$$typeof', 'nodeType', '__termElement', 'constructor', 'ownerDocument']);

export function createTermElement(host: ElementHost): Record<string, unknown> {
  const impl: Record<string, unknown> = {
    __termElement: true,
    focus: () => host.focusable?.focus(),
    blur: () => host.focusable?.blur(),
    // `{ block: 'start' | 'end' }` aligns as on the web; anything else (no argument included) keeps 'nearest'.
    scrollIntoView: (o?: { block?: string }) => {
      const n = host.node();
      const align = o?.block === 'start' || o?.block === 'end' ? o.block : 'nearest';
      for (let p = n?.parent ?? null; p; p = p.parent ?? null) if (typeof p.scrollChildIntoView === 'function') { p.scrollChildIntoView(n, { align }); return; }
    },
    getBoundingClientRect: () => rectOf(host.node()),
    click: () => host.press?.(),
    getAttribute: (name: string) => attrs()[name.toLowerCase()] ?? null,
    hasAttribute: (name: string) => attrs()[name.toLowerCase()] !== undefined,
    setAttribute: (name: string, v: unknown) => write(name, String(v)),
    removeAttribute: (name: string) => write(name, null),
    toggleAttribute: (name: string, force?: boolean) => { const on = force ?? attrs()[name.toLowerCase()] === undefined; write(name, on ? '' : null); return on; },
    matches: (sel: string) => matchesSelector(proxy, sel),
    closest: (sel: string) => { for (let e: Record<string, unknown> | null = proxy; e; e = parentOf(e)) if (matchesSelector(e, sel)) return e; return null; },
    querySelector: (sel: string) => descendants(proxy).find((e) => matchesSelector(e, sel, proxy)) ?? null,
    querySelectorAll: (sel: string) => descendants(proxy).filter((e) => matchesSelector(e, sel, proxy)),
    contains: (other: unknown) => {
      for (let e = other && typeof other === 'object' && (other as { __termElement?: boolean }).__termElement ? other as Record<string, unknown> : null; e; e = parentOf(e)) if (e === proxy) return true;
      return false;
    },
    __node: () => host.node(),
    __parent: () => host.parent?.() ?? null,
    __attrs: () => attrs(),
    __tag: () => host.tag,
  };
  const attrs = (): Record<string, string> => {
    const a = attrsOf(host.props());
    for (const [k, v] of host.overrides ?? []) if (v === null) delete a[k]; else a[k] = v;
    return a;
  };
  const write = (name: string, v: string | null): void => {
    if (!host.overrides) return refuse(host.tag, 'setAttribute');
    const k = name.toLowerCase();
    if (k === 'class' || k === 'style' || k.startsWith('on')) return refuse(host.tag, `setAttribute('${k}')`);
    host.overrides.set(k, v);
    host.rerender?.();
  };
  const getters: Record<string, () => unknown> = {
    parentElement: () => parentOf(proxy),
    parentNode: () => parentOf(proxy),
    children: () => childrenOf(proxy),
    childElementCount: () => childrenOf(proxy).length,
    firstElementChild: () => childrenOf(proxy)[0] ?? null,
    lastElementChild: () => childrenOf(proxy).at(-1) ?? null,
    nextElementSibling: () => { const p = parentOf(proxy); if (!p) return null; const c = childrenOf(p); return c[c.indexOf(proxy) + 1] ?? null; },
    previousElementSibling: () => { const p = parentOf(proxy); if (!p) return null; const c = childrenOf(p); const i = c.indexOf(proxy); return i > 0 ? c[i - 1]! : null; },
    className: () => (typeof host.props().className === 'string' ? host.props().className : ''),
    tagName: () => host.tag.toUpperCase(),
    nodeName: () => host.tag.toUpperCase(),
    id: () => (typeof host.props().id === 'string' ? host.props().id : ''),
    hidden: () => host.props().hidden === true || attrs().hidden !== undefined,
    isConnected: () => { const n = host.node(); return !!n && n.isDestroyed !== true; },
    clientWidth: () => rectOf(host.node()).width,
    clientHeight: () => rectOf(host.node()).height,
    offsetWidth: () => rectOf(host.node()).width,
    offsetHeight: () => rectOf(host.node()).height,
    value: () => host.props().value ?? host.props().defaultValue ?? '',
    checked: () => host.props().checked === true,
    disabled: () => host.props().disabled === true,
    // Text fields: the caret is the engine's (FieldInput puts it at the end); a selection range is accepted and not
    // drawn (approximation, README "compat runtime"). Asked by schedules' agent step (setSelectionRange after focus).
    setSelectionRange: () => () => undefined,
    select: () => () => undefined,
    selectionStart: () => String(host.props().value ?? host.props().defaultValue ?? '').length,
    selectionEnd: () => String(host.props().value ?? host.props().defaultValue ?? '').length,
    dataset: () => {
      const d: Record<string, string> = {};
      for (const [k, v] of Object.entries(attrs())) if (k.startsWith('data-')) d[k.slice(5).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v;
      return d;
    },
  };
  impl.__raw = impl;
  const proxy: Record<string, unknown> = new Proxy(impl, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in getters) return getters[k]!();
      if (k in t) return t[k];
      if (PROBED.has(k)) return undefined;
      return refuse(host.tag, k);
    },
    set(_t, k) {
      return refuse(host.tag, `${String(k)} =`);
    },
    has: (t, k) => k in t || k in getters,
  });
  return proxy;
}

// ---- events --------------------------------------------------------------------------------------------------------

export interface TermEvent extends Record<string, unknown> {
  defaultPrevented: boolean;
  propagationStopped: boolean;
}

function base(type: string, target: unknown, extra: Record<string, unknown> = {}): TermEvent {
  const e: TermEvent = {
    type, target, currentTarget: target, defaultPrevented: false, propagationStopped: false, timeStamp: Date.now(), isTrusted: true,
    bubbles: true, cancelable: true, nativeEvent: undefined,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    isDefaultPrevented: () => e.defaultPrevented,
    isPropagationStopped: () => e.propagationStopped,
    persist() {},
    ...extra,
  };
  e.nativeEvent = e;
  return e;
}

/** A click / press: from the keyboard (detail 0, as browsers report) or the mouse. */
export function pressEvent(target: unknown, o: { mouse?: { x: number; y: number } } = {}): TermEvent {
  const m = o.mouse;
  return base('click', target, {
    detail: m ? 1 : 0, button: 0, buttons: 0, pointerType: m ? 'mouse' : '',
    clientX: (m?.x ?? 0) * CELL_PX.w, clientY: (m?.y ?? 0) * CELL_PX.h, screenX: (m?.x ?? 0) * CELL_PX.w, screenY: (m?.y ?? 0) * CELL_PX.h,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, key: undefined,
  });
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  return: 'Enter', enter: 'Enter', linefeed: 'Enter', escape: 'Escape', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', space: ' ',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert',
};

/** DOM `key` for an engine key. */
export function domKey(k: Key): string {
  const n = k.name ?? '';
  if (KEY_NAMES[n]) return KEY_NAMES[n]!;
  if (/^f\d{1,2}$/.test(n)) return n.toUpperCase();
  if (n.length === 1) return k.shift && /[a-z]/.test(n) ? n.toUpperCase() : n;
  const seq = (k as { sequence?: string }).sequence;
  return seq && seq.length === 1 && seq >= ' ' ? seq : 'Unidentified';
}
function domCode(key: string): string {
  if (/^[a-z]$/i.test(key)) return 'Key' + key.toUpperCase();
  if (/^\d$/.test(key)) return 'Digit' + key;
  if (key === ' ') return 'Space';
  return key;
}

export function keyEvent(type: 'keydown' | 'keyup', k: Key, target: unknown): TermEvent {
  const key = domKey(k);
  return base(type, target, {
    key, code: domCode(key), shiftKey: k.shift === true, ctrlKey: k.ctrl === true, altKey: k.meta === true || (k as { option?: boolean }).option === true,
    metaKey: (k as { super?: boolean }).super === true, repeat: (k as { repeated?: boolean }).repeated === true, isComposing: false, location: 0,
    getModifierState: (m: string) => (m === 'Shift' ? k.shift === true : m === 'Control' ? k.ctrl === true : false),
  });
}

/** A change / input on a field: target answers value and checked like the DOM element after the change. */
export function changeEvent(type: 'change' | 'input', target: Record<string, unknown>, now: { value?: string; checked?: boolean }): TermEvent {
  const t = new Proxy(target, { get: (o, k) => (k === 'value' && now.value !== undefined ? now.value : k === 'checked' && now.checked !== undefined ? now.checked : Reflect.get(o, k)) });
  return base(type, t, { currentTarget: t });
}

export const focusEvent = (type: 'focus' | 'blur', target: unknown): TermEvent => base(type, target, { relatedTarget: null });
export const submitEvent = (target: unknown, submitter?: unknown): TermEvent => base('submit', target, { submitter: submitter ?? null });

// ---- the compat element tree ---------------------------------------------------------------------------------------

const parentOf = (e: Record<string, unknown>): Record<string, unknown> | null => (e.__parent as () => Record<string, unknown> | null)();
function childrenOf(e: Record<string, unknown>): Record<string, unknown>[] {
  const set = kids.get((e as { __raw?: object }).__raw ?? e);
  if (!set) return [];
  const list = [...set];
  // Mount order, then where each is drawn (reading order) when both are laid out: close to document order.
  const pos = (x: Record<string, unknown>): [number, number] | null => { const n = (x.__node as () => NodeLike | null)(); return n ? [n.y, n.x] : null; };
  return list.map((x, i) => ({ x, i, p: pos(x) })).sort((a, b) => (a.p && b.p ? a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.i - b.i : a.i - b.i)).map((o) => o.x);
}
function descendants(e: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (x: Record<string, unknown>): void => { for (const c of childrenOf(x)) { out.push(c); walk(c); } };
  walk(e);
  return out;
}

// ---- selectors (a subset: tag, #id, .class, [attr], [attr op value], :scope, :not(simple), descendant and child) ----

interface Simple { tag?: string; id?: string; classes: string[]; attrs: { name: string; op?: string; value?: string }[]; scope?: boolean; not: Simple[] }
interface Step { simple: Simple; combinator: ' ' | '>' | null }

function readIdent(s: string, i: number): [string, number] {
  let out = '';
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\\') { out += s[i + 1] ?? ''; i += 2; continue; }
    if (/[\s\[\]>+~,():.]/.test(c) && !(c === '.' && out.includes('#'))) break;
    if (c === '#' && out === '') break;
    out += c;
    i++;
  }
  return [out, i];
}

function parseCompound(s: string, i: number, sel: string): [Simple, number] {
  const simple: Simple = { classes: [], attrs: [], not: [] };
  if (s[i] === '*') i++;
  else if (/[a-zA-Z]/.test(s[i] ?? '')) { const [t, j] = readIdent(s, i); simple.tag = t.toLowerCase(); i = j; }
  for (;;) {
    const c = s[i];
    if (c === '#') { const [v, j] = readIdent(s, i + 1); simple.id = v; i = j; }
    else if (c === '.') {
      // A module class id holds '/', '.' and '#': read up to the next delimiter, keeping it whole when it has '#'.
      const m = /^[^\s\[\]>+~,():]+/.exec(s.slice(i + 1));
      const tok = (m?.[0] ?? '').replace(/\\(.)/g, '$1');
      if (tok.includes('#')) { simple.classes.push(tok); i += 1 + (m?.[0].length ?? 0); }
      else { const [v, j] = readIdent(s, i + 1); simple.classes.push(v); i = j; }
    } else if (c === '[') {
      const end = s.indexOf(']', i);
      if (end < 0) badSelector(sel);
      const m = /^\s*([^\s~|^$*=\]]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]*)))?\s*$/.exec(s.slice(i + 1, end));
      if (!m) badSelector(sel);
      simple.attrs.push({ name: m![1]!.toLowerCase(), ...(m![2] ? { op: m![2], value: m![3] ?? m![4] ?? m![5] ?? '' } : {}) });
      i = end + 1;
    } else if (s.startsWith(':scope', i)) { simple.scope = true; i += 6; }
    else if (s.startsWith(':not(', i)) {
      const end = s.indexOf(')', i);
      const [inner] = parseCompound(s.slice(i + 5, end), 0, sel);
      simple.not.push(inner);
      i = end + 1;
    } else break;
  }
  return [simple, i];
}

const parsed = new Map<string, Step[][]>();
function badSelector(sel: string): never {
  throw new Error(`TERM_DOM_SELECTOR: "${sel}" uses selector syntax the terminal does not evaluate (supported: tag, #id, .class, [attr], [attr=value] and ~= |= ^= $= *=, :scope, :not(simple), descendant and child combinators, comma lists).`);
}
function parse(sel: string): Step[][] {
  let out = parsed.get(sel);
  if (out) return out;
  out = [];
  for (const part of sel.split(',')) {
    const s = part.trim();
    const steps: Step[] = [];
    let i = 0;
    let comb: ' ' | '>' | null = null;
    while (i < s.length) {
      const [simple, j] = parseCompound(s, i, sel);
      if (j === i) badSelector(sel);
      steps.push({ simple, combinator: comb });
      i = j;
      let sawSpace = false;
      while (s[i] === ' ') { i++; sawSpace = true; }
      if (s[i] === '>') { comb = '>'; i++; while (s[i] === ' ') i++; }
      else if (s[i] === '+' || s[i] === '~') badSelector(sel);
      else comb = sawSpace ? ' ' : null;
      if (i < s.length && comb === null) badSelector(sel);
    }
    if (!steps.length) badSelector(sel);
    out.push(steps);
  }
  parsed.set(sel, out);
  return out;
}

function simpleHolds(sm: Simple, e: Record<string, unknown>, scope: Record<string, unknown> | null): boolean {
  if (sm.scope && e !== scope) return false;
  if (sm.tag && (e.__tag as () => string)() !== sm.tag) return false;
  const a = (e.__attrs as () => Record<string, string>)();
  if (sm.id !== undefined && a.id !== sm.id) return false;
  if (sm.classes.length) {
    const cls = (a.class ?? '').split(/\s+/);
    if (!sm.classes.every((c) => cls.includes(c))) return false;
  }
  for (const c of sm.attrs) {
    const v = a[c.name];
    if (v === undefined) return false;
    const w = c.value ?? '';
    if (c.op === '=' && v !== w) return false;
    if (c.op === '~=' && !v.split(/\s+/).includes(w)) return false;
    if (c.op === '|=' && v !== w && !v.startsWith(w + '-')) return false;
    if (c.op === '^=' && !(w && v.startsWith(w))) return false;
    if (c.op === '$=' && !(w && v.endsWith(w))) return false;
    if (c.op === '*=' && !(w && v.includes(w))) return false;
  }
  return !sm.not.some((n) => simpleHolds(n, e, scope));
}

function stepsHold(steps: Step[], k: number, e: Record<string, unknown>, scope: Record<string, unknown> | null): boolean {
  const st = steps[k]!;
  if (!simpleHolds(st.simple, e, scope)) return false;
  if (k === 0) return true;
  if (st.combinator === '>') { const p = parentOf(e); return !!p && stepsHold(steps, k - 1, p, scope); }
  for (let p = parentOf(e); p; p = parentOf(p)) if (stepsHold(steps, k - 1, p, scope)) return true;
  return false;
}

/** True when `e` matches `sel` (scope: the element querySelector was called on, for :scope). */
export function matchesSelector(e: Record<string, unknown>, sel: string, scope: Record<string, unknown> | null = null): boolean {
  return parse(sel).some((steps) => stepsHold(steps, steps.length - 1, e, scope));
}
