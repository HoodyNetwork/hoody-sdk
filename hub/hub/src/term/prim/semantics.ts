// The semantics tree: what each thing on a terminal screen IS (role, name, value, states, actions), independent of how
// it is drawn. It serves three readers with one model:
//   - tests: getByRole / within / act (src/term/scenario/), the same queries as the web's testing-library;
//   - the behaviour contract: one scenario file per kit component runs against this tree and against the web DOM;
//   - AI agents: `semText(tree)` is a compact, stable text an agent reads and acts on (format: src/term/scenario/README.md).
//
// Sources: every prim registers through `useSem(sem, implicit)` (a Pressable is a button, a TextInput a textbox, ...);
// raw HTML in shared code maps role / aria-* / alt / title / <label> through `semOfDom` (semdom.ts).
//
// Secrets: a node with `secret` never carries its value, and no text is collected beneath it. The live value stays in
// the registry record (setValue needs its length) and is never copied into a SemNode.
//
// Actions go through the SAME path a person uses: keys and mouse are written to the renderer's input stream (what the
// terminal would send), focus is moved by the same call a click makes. Nothing calls a component's callback directly.
import { isValidElement, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import type { Focusable } from './focus';

export type Role =
  | 'button' | 'link' | 'textbox' | 'searchbox' | 'checkbox' | 'switch' | 'radio' | 'radiogroup' | 'combobox' | 'listbox'
  | 'option' | 'menu' | 'menubar' | 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'tab' | 'tablist' | 'tabpanel'
  | 'table' | 'grid' | 'rowgroup' | 'row' | 'cell' | 'gridcell' | 'columnheader' | 'rowheader' | 'dialog' | 'alertdialog'
  | 'status' | 'alert' | 'log' | 'progressbar' | 'meter' | 'slider' | 'spinbutton' | 'heading' | 'region' | 'group'
  | 'list' | 'listitem' | 'img' | 'navigation' | 'main' | 'banner' | 'contentinfo' | 'complementary' | 'form' | 'search'
  | 'toolbar' | 'tooltip' | 'separator' | 'tree' | 'treeitem' | 'article' | 'figure' | 'note' | 'term' | 'definition'
  | 'paragraph' | 'code' | 'presentation' | 'none' | 'generic' | 'text';

/** What a component says about itself. All optional; `implicit` (from the primitive) fills the gaps. */
export interface Sem {
  role?: Role;
  /** Stable id: what an agent or a test addresses it by (`#id` in the text form). Also the target of relations. */
  id?: string;
  /** Accessible name. Absent: from `labelledBy`, a <label>, or (for roles named by content) the text inside. */
  name?: string;
  labelledBy?: string;
  description?: string;
  describedBy?: string;
  value?: string;
  /** Heading level 1-6. */
  level?: number;
  disabled?: boolean;
  /** Why it is disabled (the web's disabled reason / tooltip). Shown in the tree, never only on hover. */
  disabledReason?: string;
  readonly?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** The error text when invalid. */
  errorText?: string;
  busy?: boolean;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  pressed?: boolean | 'mixed';
  current?: boolean | string;
  hidden?: boolean;
  modal?: boolean;
  multiline?: boolean;
  /** Never put the value, or any text beneath, into the tree. */
  secret?: boolean;
  /** Id of the element this one controls (a tab its panel, a button its menu). */
  controls?: string;
  /** Kind of popup it opens, or the id of the popup it owns. */
  popup?: string;
  /** Compat <label>: the id it labels, or '*' for the control inside it. */
  labelFor?: string;
}

/** What the primitive knows (role default, live state, its focus handle). */
export interface SemImplicit {
  role?: Role;
  disabled?: boolean;
  readonly?: boolean;
  focus?: Focusable;
  value?: string;
  secret?: boolean;
  multiline?: boolean;
}

export type SemAction = 'focus' | 'press' | 'click' | 'type' | 'setValue' | 'clear' | 'scroll' | 'dismiss';

export interface SemStates {
  disabled?: true; readonly?: true; required?: true; invalid?: true; busy?: true; focused?: true; hidden?: true;
  checked?: boolean | 'mixed'; selected?: boolean; expanded?: boolean; pressed?: boolean | 'mixed'; current?: true | string;
  modal?: true; multiline?: true; secret?: true;
}

/** One node of the tree (JSON-serialisable; internals live in a WeakMap). */
export interface SemNode {
  /** Address: `#id` when it has an id, else `role "name"` plus `~n` for the n-th of the same role and name. */
  ref: string;
  role: Role;
  name: string;
  id?: string;
  description?: string;
  /** Absent for a secret (and for an editor we cannot read). */
  value?: string;
  /** For a secret: whether something is typed (never what or how much). */
  filled?: boolean;
  level?: number;
  states: SemStates;
  actions: SemAction[];
  controls?: string;
  popup?: string;
  /** Cells on screen (x, y, width, height). */
  box: [number, number, number, number];
  children: SemNode[];
}

// ---------------------------------------------------------------------------------------------------------------
// Registry

interface Rec { sem: Sem | undefined; imp: SemImplicit; node: object | null }
/** Several prims may attach to one renderable (a Pressable draws through a Box): each keeps its own record and the
 *  most specific one describes the node (an explicit role, then any sem, then an implicit role). */
const REG = new WeakMap<object, Rec[]>();
const weight = (r: Rec): number => (r.sem?.role ? 4 : 0) + (r.sem ? 2 : 0) + (r.imp.role ? 1 : 0);
function recOf(node: object): Rec | null {
  const list = REG.get(node);
  if (!list?.length) return null;
  let best = list[0]!;
  for (const r of list) if (weight(r) > weight(best)) best = r;
  if (weight(best) === 0) return null;
  // An outer prim's explicit sem refines the inner prim's implicit facts (focus, value, disabled).
  const imp = list.find((r) => r.imp.role || r.imp.focus)?.imp ?? best.imp;
  const sem = list.filter((r) => r.sem).reduce<Sem | undefined>((a, r) => ({ ...r.sem, ...a }), undefined);
  return { sem, imp, node };
}
function attach(r: Rec, node: object | null): void {
  if (r.node) { const l = REG.get(r.node); if (l) { const i = l.indexOf(r); if (i >= 0) l.splice(i, 1); } }
  r.node = node;
  if (node) { const l = REG.get(node); if (l) { if (!l.includes(r)) l.push(r); } else REG.set(node, [r]); }
}

/** Registers semantics for the renderable the returned (stable) ref is attached to. Always call it (hooks rule). */
export function useSem(sem: Sem | undefined, implicit: SemImplicit): (node: unknown) => void {
  const rec = useRef<Rec | null>(null);
  if (rec.current === null) rec.current = { sem, imp: implicit, node: null };
  rec.current.sem = sem;
  rec.current.imp = implicit;
  const cb = useRef<((node: unknown) => void) | null>(null);
  if (cb.current === null) {
    const r = rec.current;
    cb.current = (node: unknown) => attach(r, node && typeof node === 'object' ? node : null);
  }
  return cb.current;
}

/** The plain text of a React label (strings and numbers inside elements, in order): a sibling that draws decoration
 *  around its label (`[Save]`, `… Saving`) passes `sem={{ name: textOf(children) }}` so the name is the label alone. */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** Combines refs (RefObject or callback; undefined skipped) into one callback ref. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (node: T | null) => void {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === 'function') r(node);
      else (r as RefObject<T | null>).current = node;
    }
  };
}

/** Registers semantics on a renderable directly (for code that builds renderables without React). */
export function registerSem(node: object, sem: Sem | undefined, implicit: SemImplicit = {}): void {
  attach({ sem, imp: implicit, node: null }, node);
}

// ---------------------------------------------------------------------------------------------------------------
// Building the tree

/** Roles whose name comes from the text inside them (ARIA "name from content"). */
const NAME_FROM_CONTENT = new Set<Role>(['button', 'link', 'checkbox', 'switch', 'radio', 'option', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'tab', 'cell', 'gridcell', 'columnheader', 'rowheader', 'row', 'heading', 'tooltip', 'treeitem', 'listitem', 'status', 'alert', 'paragraph', 'code', 'term', 'definition']);
/** Of those, roles whose inner text is ONLY its name (no text children emitted). */
const LEAF_NAMED = new Set<Role>(['button', 'link', 'checkbox', 'switch', 'radio', 'option', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'tab', 'heading', 'tooltip', 'paragraph', 'code', 'columnheader', 'rowheader']);
const PRESSABLE = new Set<Role>(['button', 'link', 'checkbox', 'switch', 'radio', 'option', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'tab', 'treeitem', 'row', 'gridcell', 'combobox', 'listitem', 'cell']);
const EDITABLE = new Set<Role>(['textbox', 'searchbox', 'combobox', 'spinbutton']);

interface RNode {
  visible?: boolean; x?: number; y?: number; width?: number; height?: number;
  getChildren?: () => unknown[]; plainText?: string; editBuffer?: unknown; isDestroyed?: boolean;
}
interface Live { rec: Rec | null; r: RNode; input: InputSink | null; label?: { forId: string; text: string; used?: boolean } }
const LIVE = new WeakMap<SemNode, Live>();

/** Where actions write their bytes: the renderer's input stream (what a terminal sends). */
export interface InputSink { emit(event: 'data', chunk: Buffer): unknown }
export interface SemRoot { root: unknown; stdin?: InputSink }

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const isText = (r: RNode): boolean => typeof r.plainText === 'string' && r.editBuffer === undefined;
const isEditor = (r: RNode): boolean => r.editBuffer !== undefined;

function effective(rec: Rec): Sem & SemImplicit {
  const s = rec.sem ?? {};
  const i = rec.imp;
  return {
    ...s,
    role: s.role ?? i.role,
    disabled: s.disabled ?? i.disabled,
    readonly: s.readonly ?? i.readonly,
    secret: s.secret === true || i.secret === true,
    multiline: s.multiline ?? i.multiline,
    value: s.value ?? i.value,
    focus: i.focus,
  };
}

interface Acc { text: string[]; secret: boolean }

function children(r: RNode): RNode[] {
  try { return (r.getChildren?.() ?? []) as RNode[]; } catch { return []; }
}

function walk(r: RNode, out: SemNode[], acc: Acc, input: InputSink | null): void {
  if (!r || r.isDestroyed || r.visible === false) return;
  const rec = recOf(r as object);
  const e = rec ? effective(rec) : null;
  if (e?.hidden) return;
  const box: [number, number, number, number] = [r.x ?? 0, r.y ?? 0, r.width ?? 0, r.height ?? 0];

  if (e && e.labelFor !== undefined && (!e.role || e.role === 'generic')) {
    // A <label>: its text names a control; the label itself is transparent.
    const inner: SemNode[] = [];
    const lacc: Acc = { text: [], secret: acc.secret };
    for (const c of children(r)) walk(c, inner, lacc, input);
    const text = clean(lacc.text.join(' '));
    const marker: SemNode = { ref: '', role: 'generic', name: '', states: {}, actions: [], box, children: inner };
    LIVE.set(marker, { rec, r, input, label: { forId: e.labelFor, text } });
    out.push(marker);
    acc.text.push(text);
    return;
  }

  const role = e?.role && e.role !== 'presentation' && e.role !== 'none' && e.role !== 'generic' ? e.role : null;
  if (!role) {
    if (e?.name && !e.role) {
      // A name with no role (SrOnly text, an icon's label): it reads as text.
      if (!acc.secret) { out.push(textNode(e.name, box, r, input)); acc.text.push(e.name); }
    }
    if (isText(r)) {
      const t = acc.secret ? '' : clean(r.plainText!);
      if (t) { out.push(textNode(t, box, r, input)); acc.text.push(t); }
      return;
    }
    if (isEditor(r) && !rec) {
      // An engine editor nobody described: a textbox whose value we do not read (it might be a secret).
      out.push(mk({ ref: '', role: 'textbox', name: '', states: {}, actions: [], box, children: [] }, null, r, input));
      return;
    }
    if (e?.id) {
      // A roleless element with an id (a raw <span id>) still names or describes what points at it by id.
      const sub: Acc = { text: [], secret: acc.secret };
      if (isText(r)) { const t0 = acc.secret ? '' : clean(r.plainText!); if (t0) { out.push(textNode(t0, box, r, input)); sub.text.push(t0); } }
      else for (const c of children(r)) walk(c, out, sub, input);
      const t = clean(sub.text.join(' '));
      if (t && !ROLELESS_ID_TEXT.has(e.id)) ROLELESS_ID_TEXT.set(e.id, t);
      acc.text.push(...sub.text);
      return;
    }
    for (const c of children(r)) walk(c, out, acc, input);
    return;
  }

  const secret = e!.secret === true;
  const inner: SemNode[] = [];
  const iacc: Acc = { text: [], secret: acc.secret || secret };
  if (!isText(r)) for (const c of children(r)) walk(c, inner, iacc, input);
  else if (!iacc.secret) iacc.text.push(clean(r.plainText!));
  const content = clean(iacc.text.join(' '));
  const states: SemStates = {};
  if (e!.disabled) states.disabled = true;
  if (e!.readonly) states.readonly = true;
  if (e!.required) states.required = true;
  if (e!.invalid) states.invalid = true;
  if (e!.busy) states.busy = true;
  if (e!.focus?.focused) states.focused = true;
  if (e!.checked !== undefined) states.checked = e!.checked;
  if (e!.selected !== undefined) states.selected = e!.selected;
  if (e!.expanded !== undefined) states.expanded = e!.expanded;
  if (e!.pressed !== undefined) states.pressed = e!.pressed;
  if (e!.current !== undefined && e!.current !== false) states.current = e!.current === true ? true : e!.current;
  if (e!.modal) states.modal = true;
  if (e!.multiline) states.multiline = true;
  if (secret) states.secret = true;

  const node: SemNode = {
    ref: '', role, name: e!.name !== undefined ? clean(e!.name) : NAME_FROM_CONTENT.has(role) ? content : '',
    states, actions: [], box, children: (LEAF_NAMED.has(role) && e!.name === undefined) || EDITABLE.has(role) ? inner.filter((n) => n.role !== 'text') : inner,
  };
  if (e!.id) node.id = e!.id;
  const desc = [e!.description, e!.disabled ? e!.disabledReason : undefined, e!.invalid ? e!.errorText : undefined].filter((x): x is string => !!x);
  if (desc.length) node.description = clean(desc.join(' · '));
  if (e!.level !== undefined) node.level = e!.level;
  if (e!.controls) node.controls = e!.controls;
  if (e!.popup) node.popup = e!.popup;
  // Live editor buffer first (newer than any declared value), else the declared value: a revealed SecretField group
  // declares only '•' or '' (never the secret). `value` itself is never written out for a secret.
  if (secret) node.filled = (rec!.imp.value ?? e!.value ?? '').length > 0;
  else if (e!.value !== undefined) node.value = e!.value;
  node.actions = actionsOf(role, e!, rec!.imp.disabled === true);
  out.push(mk(node, rec, r, input));
  if (!acc.secret && !secret) acc.text.push(node.name || content);
}

function actionsOf(role: Role, e: Sem & SemImplicit, focusOff: boolean): SemAction[] {
  const a: SemAction[] = [];
  const off = e.disabled === true;
  // Focus follows the focus machinery, not the disabled state: a soft-disabled control (aria-disabled, the web's
  // disabled-with-reason) stays reachable so its reason can be read.
  if (e.focus && !focusOff) a.push('focus');
  if (!off && e.focus && (PRESSABLE.has(role) && !EDITABLE.has(role))) a.push('press', 'click');
  if (!off && !e.readonly && EDITABLE.has(role) && e.focus) a.push('type', 'setValue', 'clear');
  if (role === 'dialog' || role === 'alertdialog') a.push('dismiss');
  return a;
}

function textNode(t: string, box: SemNode['box'], r: RNode, input: InputSink | null): SemNode {
  return mk({ ref: '', role: 'text', name: t, states: {}, actions: [], box, children: [] }, null, r, input);
}
function mk(n: SemNode, rec: Rec | null, r: RNode, input: InputSink | null): SemNode {
  LIVE.set(n, { rec, r, input });
  return n;
}

/** Text of roleless elements carrying an id, filled by the current walk (read by finish for labelledBy/describedBy). */
const ROLELESS_ID_TEXT = new Map<string, string>();
/** Text of inline elements with an id drawn inside a text run (no renderable of their own): the compat runtime's
 *  `<span id>`. Registered while drawn. */
const INLINE_ID_TEXT = new Map<string, { text: string }>();
export function registerInlineIdText(id: string, text: string): () => void {
  const entry = { text };
  INLINE_ID_TEXT.set(id, entry);
  return () => { if (INLINE_ID_TEXT.get(id) === entry) INLINE_ID_TEXT.delete(id); };
}

/** Resolves labels, labelledBy / describedBy, drops label markers, assigns refs. */
function finish(nodes: SemNode[]): SemNode[] {
  const byId = new Map<string, SemNode>();
  const all: SemNode[] = [];
  const visit = (ns: SemNode[]) => { for (const n of ns) { all.push(n); if (n.id) byId.set(n.id, n); visit(n.children); } };
  visit(nodes);
  const labelled = (n: SemNode): boolean => n.name !== '';
  const textOf = (n: SemNode): string => n.name || clean(n.children.map(textOf).join(' '));
  for (const n of all) {
    const lab = LIVE.get(n)?.label;
    if (!lab || !lab.text) continue;
    let target: SemNode | undefined;
    if (lab.forId !== '*') target = byId.get(lab.forId);
    else {
      const find = (ns: SemNode[]): SemNode | undefined => { for (const c of ns) { if (c.role !== 'text' && c.role !== 'generic') return c; const d = find(c.children); if (d) return d; } return undefined; };
      target = find(n.children);
    }
    if (target && !labelled(target)) { target.name = lab.text; lab.used = true; }
  }
  for (const n of all) {
    const s = LIVE.get(n)?.rec?.sem;
    if (!s) continue;
    const idText = (id: string): string => { const x = byId.get(id); return x ? textOf(x) : ROLELESS_ID_TEXT.get(id) ?? INLINE_ID_TEXT.get(id)?.text ?? ''; };
    if (s.labelledBy && s.name === undefined) { const t = clean(s.labelledBy.split(/\s+/).map(idText).join(' ')); if (t) n.name = t; }
    if (s.describedBy) { const t = clean(s.describedBy.split(/\s+/).map(idText).join(' ')); if (t) n.description = n.description ? `${n.description} · ${t}` : t; }
  }
  // Label markers are transparent: their children take their place; their text goes once it named a control.
  const flat = (ns: SemNode[]): SemNode[] => ns.flatMap((n) => {
    n.children = flat(n.children);
    const lab = LIVE.get(n)?.label;
    if (!lab) return [n];
    return lab.used ? n.children.filter((c) => c.role !== 'text') : n.children;
  });
  const out = flat(nodes);
  const seen = new Map<string, number>();
  const assign = (ns: SemNode[]) => {
    for (const n of ns) {
      if (n.id) n.ref = '#' + n.id;
      else {
        const k = `${n.role} ${JSON.stringify(n.name)}`;
        const c = (seen.get(k) ?? 0) + 1;
        seen.set(k, c);
        n.ref = c > 1 ? `${k}~${c}` : k;
      }
      assign(n.children);
    }
  };
  assign(out);
  return out;
}

/** The tree of a renderer (a test renderer, or the live CliRenderer): its root's children, in document order. */
export function semanticsOf(renderer: SemRoot): SemNode[] {
  const acc: Acc = { text: [], secret: false };
  const out: SemNode[] = [];
  ROLELESS_ID_TEXT.clear();
  walk(renderer.root as RNode, out, acc, renderer.stdin ?? null);
  return finish(out);
}

/** The renderable a node of semanticsOf was read from (the gate's hit test asks whether the cell a click goes to is the
 *  target's own); undefined for a node this module did not make. */
export const renderableOf = (n: SemNode): unknown => LIVE.get(n)?.r;

/** The tree as JSON (no internals). */
export const semJson = (tree: SemNode[]): unknown => JSON.parse(JSON.stringify(tree));

// ---------------------------------------------------------------------------------------------------------------
// Text form (documented in docs/semantics.md)

const q = (s: string): string => JSON.stringify(s);
/** One line per node: `role[level] "name" #id =value (description) flags actions`. Text runs: `text "..."`. */
export function semText(tree: SemNode[], o: { actions?: boolean; boxes?: boolean } = {}): string {
  const lines: string[] = [];
  const line = (n: SemNode, d: number) => {
    const p: string[] = [n.role + (n.level !== undefined ? `[${n.level}]` : '')];
    if (n.name || n.role !== 'text') p.push(n.name ? q(n.name) : '""');
    if (n.id) p.push('#' + n.id);
    else { const m = /~(\d+)$/.exec(n.ref); if (m) p.push('~' + m[1]); }
    if (n.value !== undefined) p.push('=' + q(n.value));
    if (n.filled !== undefined) p.push(n.filled ? '=<secret>' : '=<empty secret>');
    for (const [k, v] of Object.entries(n.states)) {
      if (k === 'secret') continue;
      if (v === true) p.push(k);
      else if (v === false) p.push(k === 'checked' ? 'unchecked' : k === 'expanded' ? 'collapsed' : `not-${k}`);
      else p.push(`${k}=${v}`);
    }
    if (n.controls) p.push(`controls=#${n.controls}`);
    if (n.popup) p.push(`popup=${n.popup}`);
    if (n.description) p.push(`(${n.description})`);
    if (o.actions && n.actions.length) p.push('{' + n.actions.join(',') + '}');
    if (o.boxes) p.push(`@${n.box.join(',')}`);
    lines.push('  '.repeat(d) + p.join(' '));
    for (const c of n.children) line(c, d + 1);
  };
  for (const n of tree) line(n, 0);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Queries (testing-library shaped)

export interface RoleQuery {
  name?: string | RegExp;
  /** Default true: name must equal (string) after whitespace collapse. false = substring, case-insensitive. */
  exact?: boolean;
  checked?: boolean | 'mixed'; selected?: boolean; expanded?: boolean; pressed?: boolean | 'mixed'; disabled?: boolean;
  level?: number; id?: string;
}

const matchName = (n: string, want: string | RegExp | undefined, exact = true): boolean =>
  want === undefined || (want instanceof RegExp ? want.test(n) : exact ? n === clean(want) : n.toLowerCase().includes(want.toLowerCase()));

function all(tree: SemNode[]): SemNode[] {
  const out: SemNode[] = [];
  const v = (ns: SemNode[]) => { for (const n of ns) { out.push(n); v(n.children); } };
  v(tree);
  return out;
}

export function queryAllByRole(tree: SemNode[], role: Role, o: RoleQuery = {}): SemNode[] {
  return all(tree).filter((n) => n.role === role && matchName(n.name, o.name, o.exact)
    && (o.checked === undefined || (n.states.checked ?? false) === o.checked)
    && (o.selected === undefined || (n.states.selected ?? false) === o.selected)
    && (o.expanded === undefined || (n.states.expanded ?? false) === o.expanded)
    && (o.pressed === undefined || (n.states.pressed ?? false) === o.pressed)
    && (o.disabled === undefined || (n.states.disabled === true) === o.disabled)
    && (o.level === undefined || n.level === o.level)
    && (o.id === undefined || n.id === o.id));
}

export class SemQueryError extends Error {}

function one(found: SemNode[], what: string, tree: SemNode[]): SemNode {
  if (found.length === 1) return found[0]!;
  const dump = semText(tree).split('\n').slice(0, 60).join('\n');
  throw new SemQueryError(`${found.length === 0 ? 'No' : `${found.length}`} node${found.length === 1 ? '' : 's'} for ${what}${found.length > 1 ? ' (expected one)' : ''}. Tree:\n${dump}`);
}

const describe = (role: string, o: RoleQuery): string => `role ${role}${o.name !== undefined ? ` name ${o.name instanceof RegExp ? o.name : q(o.name)}` : ''}`;
export const getByRole = (tree: SemNode[], role: Role, o: RoleQuery = {}): SemNode => one(queryAllByRole(tree, role, o), describe(role, o), tree);
export const queryByRole = (tree: SemNode[], role: Role, o: RoleQuery = {}): SemNode | null => { const f = queryAllByRole(tree, role, o); if (f.length > 1) one(f, describe(role, o), tree); return f[0] ?? null; };
export const getAllByRole = (tree: SemNode[], role: Role, o: RoleQuery = {}): SemNode[] => { const f = queryAllByRole(tree, role, o); if (!f.length) one(f, describe(role, o), tree); return f; };
export const queryAllByText = (tree: SemNode[], text: string | RegExp, exact = false): SemNode[] =>
  all(tree).filter((n) => (n.role === 'text' || LEAF_NAMED.has(n.role)) && matchName(n.name, text, exact));
export const getByText = (tree: SemNode[], text: string | RegExp, exact = false): SemNode => one(queryAllByText(tree, text, exact), `text ${text}`, tree);
/** A node by its ref (`#id`, `button "Save"`, `button "Save"~2`). */
export const getByRef = (tree: SemNode[], ref: string): SemNode => one(all(tree).filter((n) => n.ref === ref.trim()), `ref ${ref}`, tree);
/** Queries limited to a node's subtree. */
export const within = (node: SemNode): SemNode[] => node.children;
/** The focused node (the deepest one with `focused`), or null. */
export const focusedNode = (tree: SemNode[]): SemNode | null => all(tree).filter((n) => n.states.focused).pop() ?? null;

// ---------------------------------------------------------------------------------------------------------------
// Actions: the same bytes a terminal sends, into the renderer's input.

const KEY: Readonly<Record<string, string>> = {
  enter: '\r', return: '\r', space: ' ', tab: '\t', 'shift+tab': '\x1b[Z', escape: '\x1b', backspace: '\x7f', delete: '\x1b[3~',
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', home: '\x1b[H', end: '\x1b[F', pageup: '\x1b[5~', pagedown: '\x1b[6~',
};
/** Bytes of a named key (`enter`, `shift+tab`, `ctrl+a`, a single character). */
export function keyBytes(k: string): string {
  const name = k.toLowerCase();
  if (KEY[name]) return KEY[name]!;
  const ctrl = /^ctrl\+([a-z])$/.exec(name);
  if (ctrl) return String.fromCharCode(ctrl[1]!.charCodeAt(0) - 96);
  if ([...k].length === 1) return k;
  throw new Error(`keyBytes: unknown key ${k}`);
}

export class SemActionError extends Error {}

function sink(n: SemNode): { live: Live; input: InputSink } {
  const live = LIVE.get(n);
  if (!live) throw new SemActionError(`act: ${n.ref} is not a node of a semantics snapshot`);
  if (!live.input) throw new SemActionError('act: the snapshot was taken without an input stream (pass { root, stdin })');
  return { live, input: live.input };
}
const send = (input: InputSink, s: string): void => { input.emit('data', Buffer.from(s)); };
const mouse = (input: InputSink, code: number, x: number, y: number, up: boolean): void => send(input, `\x1b[<${code};${x + 1};${y + 1}${up ? 'm' : 'M'}`);

/** Press keys into the renderer (whatever has the focus gets them). */
export function sendKeys(root: SemRoot, ...keys: string[]): void {
  if (!root.stdin) throw new SemActionError('sendKeys: no input stream');
  for (const k of keys) send(root.stdin, keyBytes(k));
}

/** Types text as keystrokes (each character its own key event, as a person types). */
export function sendText(root: SemRoot, text: string): void {
  if (!root.stdin) throw new SemActionError('sendText: no input stream');
  for (const ch of text) send(root.stdin, ch);
}

/**
 * Acts on a node the way a person would. The caller lets the renderer settle afterwards.
 *  focus     the focus call a click makes
 *  press     focus, then the key a keyboard user presses: Space for checkbox/switch/radio, Enter otherwise
 *  click     primary button down + up at the middle of its box (the mouse path)
 *  type      focus, then the text as keystrokes (appends)
 *  clear     focus, End, then one Backspace per character of the live value
 *  setValue  clear, then type
 *  scroll    wheel at its middle: arg 'down' (default) or 'up'
 *  dismiss   Escape
 * Refuses (SemActionError) an action the node does not list, so a test cannot press a disabled control by accident;
 * use `force: true` to send the input anyway and prove it is inert.
 */
export function act(n: SemNode, action: SemAction, arg?: string, o: { force?: boolean } = {}): void {
  const { live, input } = sink(n);
  if (!o.force && !n.actions.includes(action) && !(action === 'scroll')) {
    throw new SemActionError(`act: ${n.ref} does not offer ${action} (offers ${n.actions.join(', ') || 'nothing'}${n.states.disabled ? '; it is disabled' : ''})`);
  }
  const [x, y, w, h] = n.box;
  const cx = x + Math.max(0, Math.floor((w - 1) / 2));
  const cy = y + Math.max(0, Math.floor((h - 1) / 2));
  // Focus by the call a click makes; a node that offers no focus (disabled) is clicked instead, as a person would try.
  const focus = () => { if (n.actions.includes('focus')) live.rec?.imp.focus?.focus(); else { mouse(input, 0, cx, cy, false); mouse(input, 0, cx, cy, true); } };
  switch (action) {
    case 'focus': focus(); return;
    case 'press': if (n.actions.includes('focus')) focus(); send(input, n.role === 'checkbox' || n.role === 'switch' || n.role === 'radio' || n.role === 'menuitemcheckbox' || n.role === 'menuitemradio' ? ' ' : '\r'); return;
    case 'click': mouse(input, 0, cx, cy, false); mouse(input, 0, cx, cy, true); return;
    case 'type': focus(); for (const ch of arg ?? '') send(input, ch); return;
    case 'clear': case 'setValue': {
      focus();
      const len = [...(live.rec?.imp.value ?? live.rec?.sem?.value ?? '')].length;
      send(input, KEY.end!);
      for (let i = 0; i < len; i++) send(input, KEY.backspace!);
      if (action === 'setValue') for (const ch of arg ?? '') send(input, ch);
      return;
    }
    case 'scroll': mouse(input, arg === 'up' ? 64 : 65, cx, cy, false); return;
    case 'dismiss': send(input, KEY.escape!); return;
  }
}
