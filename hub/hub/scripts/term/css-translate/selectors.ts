// SELECTOR POLICY. Every selector of a module rule becomes exactly one plan:
//
//   base      `.a`                                      → the declarations style class a itself.
//   variant   `.a.b`, `.a[data-x='y']`, `.a:disabled`,  → a conditional delta stored on the SUBJECT class (the last
//             `.a:first-child`, `.a:not(.b)`, `li.a`,     module class of the last compound), with a `when` the runtime
//             `.p .a`, `.p > .a`, `.p[data-k] .a`,        evaluates from what it has: the element's own classes, props
//             `[data-density='compact'] .a`               (data-*, aria-*, disabled), tag and child index, and the
//                                                         classes/props of its ancestors. Unknown condition = not applied.
//   child-rule `.a > li`, `.a > *`, `.a > :first-child`,  → the subject has no module class, so styleOf is never asked
//             `.a p`, `.a[data-x] > span`                 for it: stored on the context class (the compound right
//                                                         before the subject) as a rule for its children (`>`) or
//                                                         descendants that match the subject's tag/attrs/pseudo.
//   root      `:root` (custom properties only)          → global custom properties.
//   dropped   with a reason, attributed to the subject (or the nearest context class) for the report:
//             interaction   :hover :active :focus :focus-visible :focus-within :visited :target (a terminal has no
//                           hover; focus paint belongs to the runtime's focus ring)
//             pseudo-element ::placeholder ::selection ::marker ::-webkit-* and a ::before/::after that does not end
//                           the selector's subject
//   A `::before` / `::after` (or the legacy one-colon form) that ENDS the subject compound is not a drop: it is cut off,
//   the rest is planned as above (base, variant or child-rule) and the plan carries `pseudo`: the declarations style the
//   generated box of that class (module.ts PseudoRule), never the class itself.
//             has           :has() (relational, needs the subtree)
//             sibling       the `~` combinator (`+` is kept: the compound before it becomes a `prev` condition on the
//                           compound after it, `.a + .b` → b when its previous element sibling is an a)
//             light-theme   rules for the light theme, accent sets, performance mode (dark is the default)
//             rtl / lang    :dir(rtl), :lang() (LTR, English)
//             no-class-subject a subject without a module class whose context is not one class compound directly
//                           anywhere before it (`ul li`). With one, the nearest is the context and the compounds
//                           between are the child rule's `path` (`.a ul li`, `.t tbody tr`, `.c li > svg`)
//             global-subject the subject class is :global (not a module class)
//             is-list       :is()/:where() with a combinator inside an alternative (a list of simple alternatives is
//                           kept: `any`, one of them must hold)
//             unknown-pseudo anything else
//
// Theme context `:root[data-hx-theme='dark'] .a` is stripped (dark is the default). A bare `:root` / `*` context is
// stripped (always true).
import selectorParser from 'postcss-selector-parser';
import type { AttrCond, Conditions, When } from './types';

export type DropReason =
  | 'interaction'
  | 'pseudo-element'
  | 'has'
  | 'sibling'
  | 'light-theme'
  | 'rtl'
  | 'lang'
  | 'no-class-subject'
  | 'global-subject'
  | 'is-list'
  | 'unknown-pseudo'
  | 'nested';

/** `pseudo`: the selector's subject ended in ::before / ::after; the plan is about that generated box. */
export type PseudoSide = 'before' | 'after';
export type Plan =
  | { kind: 'base'; cls: string; specificity: Spec; pseudo?: PseudoSide }
  | { kind: 'variant'; cls: string; when: When; specificity: Spec; policy: VariantPolicy; pseudo?: PseudoSide }
  | { kind: 'child-rule'; cls: string; direct: boolean; match: Conditions; path?: Array<Conditions & { direct?: boolean }>; when: When; specificity: Spec; pseudo?: PseudoSide }
  | { kind: 'root' }
  | { kind: 'dropped'; reason: DropReason; detail: string; attributedTo: string[]; specificity: Spec; pseudo?: PseudoSide };

export type VariantPolicy = 'compound' | 'attr' | 'structural' | 'state' | 'descendant' | 'child';
export type Spec = [number, number, number];

const INTERACTION = new Set([
  'hover',
  'active',
  'focus',
  'focus-visible',
  'focus-within',
  'visited',
  'link',
  'any-link',
  'target',
  'target-within',
  'local-link',
]);
const STRUCTURAL = new Set([
  'first-child',
  'last-child',
  'only-child',
  'nth-child',
  'nth-last-child',
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'nth-of-type',
  'nth-last-of-type',
  'empty',
]);
const STATE = new Set([
  'disabled',
  'enabled',
  'checked',
  'indeterminate',
  'read-only',
  'read-write',
  'required',
  'optional',
  'invalid',
  'valid',
  'user-invalid',
  'placeholder-shown',
  'open',
  'popover-open',
  'default',
  'autofill',
  'modal',
]);
const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

interface Compound {
  classes: Array<{ name: string; global: boolean }>;
  attrs: AttrCond[];
  tags: string[];
  pseudos: Array<{ name: string; arg: string; inner?: selectorParser.Pseudo }>;
  root: boolean;
  universal: boolean;
  id: boolean;
  /** Folded in from `X +` before it: the previous element sibling's conditions. */
  prev?: Conditions;
}

type Part = { compound: Compound; combinator: string | null };

class Drop extends Error {
  constructor(
    public reason: DropReason,
    public detail: string,
  ) {
    super(detail);
  }
}

function emptyCompound(): Compound {
  return { classes: [], attrs: [], tags: [], pseudos: [], root: false, universal: false, id: false };
}

/** Flatten a selector into compounds joined by combinators. :global(...) contents are inlined with global classes. */
function compounds(sel: selectorParser.Selector): Part[] {
  const parts: Part[] = [{ compound: emptyCompound(), combinator: null }];
  const visit = (nodes: selectorParser.Node[], global: boolean): void => {
    for (const n of nodes) {
      const cur = parts[parts.length - 1]!.compound;
      switch (n.type) {
        case 'combinator': {
          const c = n.value.trim() === '' ? ' ' : n.value.trim();
          parts.push({ compound: emptyCompound(), combinator: c });
          break;
        }
        case 'class':
          cur.classes.push({ name: n.value, global });
          break;
        case 'attribute':
          cur.attrs.push({
            name: n.attribute,
            ...(n.operator ? { op: n.operator as AttrCond['op'] } : {}),
            ...(n.value !== undefined ? { value: n.value } : {}),
            ...(n.insensitive ? { insensitive: true } : {}),
          });
          break;
        case 'tag':
          cur.tags.push(n.value.toLowerCase());
          break;
        case 'universal':
          cur.universal = true;
          break;
        case 'id':
          cur.id = true;
          break;
        case 'nesting':
          throw new Drop('nested', '& nesting');
        case 'pseudo': {
          const name = n.value.replace(/^::?/, '').toLowerCase();
          if (name === 'global') {
            // :global(.x) or :global(:root[...]) — inline the single selector it holds.
            if (n.nodes.length !== 1) throw new Drop('is-list', ':global() with a list');
            visit(n.nodes[0]!.nodes, true);
            break;
          }
          if (name === 'local') {
            if (n.nodes.length !== 1) throw new Drop('is-list', ':local() with a list');
            visit(n.nodes[0]!.nodes, false);
            break;
          }
          if (name === 'root') {
            cur.root = true;
            break;
          }
          cur.pseudos.push({ name: n.value.startsWith('::') ? `::${name}` : name, arg: n.nodes.map(String).join(','), inner: n });
          break;
        }
        default:
          break;
      }
    }
  };
  visit(sel.nodes, false);
  return parts;
}

function specificity(sel: selectorParser.Selector): Spec {
  const s: Spec = [0, 0, 0];
  const walk = (nodes: selectorParser.Node[]): void => {
    for (const n of nodes) {
      if (n.type === 'id') s[0]++;
      else if (n.type === 'class' || n.type === 'attribute') s[1]++;
      else if (n.type === 'tag') s[2]++;
      else if (n.type === 'pseudo') {
        const name = n.value.replace(/^::?/, '').toLowerCase();
        if (name === 'global' || name === 'local' || name === 'is' || name === 'not' || name === 'has' || name === 'matches') {
          // The argument's specificity (the most specific alternative).
          let best: Spec = [0, 0, 0];
          for (const alt of n.nodes) {
            const a = specificity(alt);
            if (a[0] > best[0] || (a[0] === best[0] && (a[1] > best[1] || (a[1] === best[1] && a[2] > best[2])))) best = a;
          }
          s[0] += best[0];
          s[1] += best[1];
          s[2] += best[2];
        } else if (name === 'where') {
          // zero
        } else if (n.value.startsWith('::') || LEGACY_ELEMENTS.has(name)) s[2]++;
        else s[1]++;
      }
    }
  };
  walk(sel.nodes);
  return s;
}

const isThemeAttr = (a: AttrCond): boolean => a.name === 'data-hx-theme' || a.name === 'data-hx-hl' || a.name === 'data-hx-perf';

/** Validate and turn one compound into conditions. `subject` → classes beyond the subject class go to self.classes. */
function conditionsOf(c: Compound, idOf: (name: string, global: boolean) => string): Conditions | null {
  // Theme attributes (on :root or anywhere): dark is the default.
  for (const a of c.attrs.filter(isThemeAttr)) {
    if (a.name === 'data-hx-theme' && a.value === 'dark') continue;
    if (a.name === 'data-hx-theme') throw new Drop('light-theme', `[data-hx-theme=${a.value}]`);
    if (a.name === 'data-hx-hl') throw new Drop('light-theme', `accent set [data-hx-hl${a.value ? '=' + a.value : ''}]`);
    throw new Drop('light-theme', 'performance mode [data-hx-perf]');
  }
  const out: Conditions = {};
  const attrs = c.attrs.filter((a) => !isThemeAttr(a));
  if (attrs.length > 0) out.attrs = attrs;
  if (c.tags.length > 0) out.tags = c.tags;
  if (c.classes.length > 0) out.classes = c.classes.map((k) => idOf(k.name, k.global));
  const pseudo: string[] = [];
  const not: Conditions[] = [];
  const any: Conditions[][] = [];
  for (const p of c.pseudos) {
    const name = p.name;
    if (name.startsWith('::') || LEGACY_ELEMENTS.has(name)) throw new Drop('pseudo-element', `${name.startsWith('::') ? '' : ':'}${name}`);
    if (INTERACTION.has(name)) throw new Drop('interaction', `:${name}`);
    if (name === 'has') throw new Drop('has', ':has()');
    if (name === 'lang') throw new Drop('lang', `:lang(${p.arg})`);
    if (name === 'dir') {
      if (/rtl/.test(p.arg)) throw new Drop('rtl', ':dir(rtl)');
      continue;
    }
    if (name === 'not' || name === 'is' || name === 'where' || name === 'matches') {
      const alts = p.inner?.nodes ?? [];
      const altConds = alts.map((alt) => {
        const parts = compounds(alt);
        if (parts.length !== 1) throw new Drop('is-list', `:${name}() with a combinator`);
        if (parts[0]!.compound.root) throw new Drop('light-theme', `:${name}(:root …)`);
        const inner = conditionsOf(parts[0]!.compound, idOf);
        return inner ?? {};
      });
      if (name === 'not') {
        // :not(a, b) = not a and not b.
        not.push(...altConds);
        continue;
      }
      if (altConds.length !== 1) {
        // A list: one alternative must hold. An empty list matches nothing (CSS), so does `any: [[]]`.
        any.push(altConds);
        continue;
      }
      const one = altConds[0]!;
      if (one.classes) out.classes = [...(out.classes ?? []), ...one.classes];
      if (one.attrs) out.attrs = [...(out.attrs ?? []), ...one.attrs];
      if (one.tags) out.tags = [...(out.tags ?? []), ...one.tags];
      if (one.pseudo) pseudo.push(...one.pseudo);
      if (one.not) not.push(...one.not);
      if (one.any) any.push(...one.any);
      continue;
    }
    if (STRUCTURAL.has(name) || STATE.has(name)) {
      pseudo.push(p.arg ? `${name}(${p.arg})` : name);
      continue;
    }
    throw new Drop('unknown-pseudo', `:${name}`);
  }
  if (pseudo.length > 0) out.pseudo = pseudo;
  if (not.length > 0) out.not = not;
  if (c.prev) out.prev = c.prev;
  if (any.length > 0) out.any = any;
  return Object.keys(out).length > 0 ? out : null;
}

/** `X + Y`: X and Y share a parent, so X is no ancestor; it becomes Y's `prev` condition and Y takes X's combinator
 *  (`.p > .a + *` → `.p > *` whose previous sibling is an `.a`). A chain `.a + .b + .c` nests (prev of prev). */
function foldAdjacent(parts: Part[], idOf: (name: string, global: boolean) => string): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    if (p.combinator !== '+' || out.length === 0) { out.push(p); continue; }
    const before = out.pop()!;
    if (before.compound.root) throw new Drop('light-theme', ':root before +');
    out.push({ compound: { ...p.compound, prev: conditionsOf(before.compound, idOf) ?? {} }, combinator: before.combinator });
  }
  return out;
}

/** Plan one selector of a rule in module `modulePath` (relative to hub/src). */
export function planSelector(selector: string, modulePath: string): Plan {
  const idOf = (name: string, global: boolean): string => (global ? `global:${name}` : `${modulePath}#${name}`);
  let sel: selectorParser.Selector | undefined;
  selectorParser((root) => {
    sel = root.nodes[0];
  }).processSync(selector);
  if (!sel) return { kind: 'dropped', reason: 'unknown-pseudo', detail: 'unparsable', attributedTo: [], specificity: [0, 0, 0] };
  const spec = specificity(sel);
  let parts: Part[];
  try {
    parts = compounds(sel);
    if (!parts.some((p) => p.combinator === '~')) parts = foldAdjacent(parts, idOf);
  } catch (e) {
    if (e instanceof Drop) return { kind: 'dropped', reason: e.reason, detail: e.detail, attributedTo: [], specificity: spec };
    throw e;
  }
  const subject = parts[parts.length - 1]!.compound;
  // `.a::before`: the generated box of the subject. Cut it off; what is left names the element it belongs to.
  let side: PseudoSide | undefined;
  {
    const last = subject.pseudos[subject.pseudos.length - 1];
    const m = last ? /^(?:::)?(before|after)$/.exec(last.name) : null;
    if (m && last!.arg === '') {
      side = m[1] as PseudoSide;
      subject.pseudos.pop();
    }
  }
  const tag = <P extends Plan>(p: P): P => (side && p.kind !== 'root' ? { ...p, pseudo: side } : p);
  const moduleClasses = (c: Compound): string[] => c.classes.filter((k) => !k.global).map((k) => idOf(k.name, false));
  const attributed = ((): string[] => {
    const own = moduleClasses(subject);
    if (own.length > 0) return [own[own.length - 1]!];
    for (let i = parts.length - 2; i >= 0; i--) {
      const m = moduleClasses(parts[i]!.compound);
      if (m.length > 0) return [m[m.length - 1]!];
    }
    return [];
  })();
  const drop = (reason: DropReason, detail: string): Plan => tag({ kind: 'dropped', reason, detail, attributedTo: attributed, specificity: spec });

  // Whole-selector checks first, so the most telling reason is reported.
  for (const p of parts) {
    if (p.combinator === '~') return drop('sibling', `'~' combinator`);
  }
  for (const p of parts) {
    for (const ps of p.compound.pseudos) {
      if (ps.name.startsWith('::') || LEGACY_ELEMENTS.has(ps.name)) return drop('pseudo-element', ps.name);
    }
  }
  for (const p of parts) for (const ps of p.compound.pseudos) if (INTERACTION.has(ps.name)) return drop('interaction', `:${ps.name}`);

  if (parts.length === 1 && subject.root && subject.classes.length === 0 && subject.attrs.length === 0 && subject.pseudos.length === 0 && !side)
    return { kind: 'root' };

  const subjectModule = subject.classes.filter((k) => !k.global);
  if (subjectModule.length === 0) {
    if (subject.classes.length > 0) return drop('global-subject', `:global(.${subject.classes[0]!.name})`);
    // A child rule on the context: the nearest compound before the subject that holds a module class. The compounds
    // between the two are the rule's path.
    let ctxIdx = parts.length - 2;
    while (ctxIdx >= 0 && !parts[ctxIdx]!.compound.classes.some((k) => !k.global)) ctxIdx--;
    if (ctxIdx < 0) return drop('no-class-subject', 'the subject has no module class and no compound before it has one');
    const ctx = parts[ctxIdx]!.compound;
    const ctxModule = ctx.classes.filter((k) => !k.global);
    try {
      if (subject.root) throw new Drop('light-theme', ':root as subject');
      const match = conditionsOf(subject, idOf) ?? {};
      const path: Array<Conditions & { direct?: boolean }> = [];
      for (let i = parts.length - 2; i > ctxIdx; i--) {
        if (parts[i]!.compound.root) throw new Drop('light-theme', ':root inside a selector');
        const cond = conditionsOf(parts[i]!.compound, idOf) ?? {};
        path.push(parts[i + 1]!.combinator === '>' ? { ...cond, direct: true } : cond);
      }
      const ctxCls = ctxModule[ctxModule.length - 1]!.name;
      const self = conditionsOf({ ...ctx, classes: ctx.classes.filter((k) => !(k.name === ctxCls && !k.global)) }, idOf);
      const ancestors: NonNullable<When['ancestors']> = [];
      for (let i = ctxIdx - 1; i >= 0; i--) {
        const cond = conditionsOf(parts[i]!.compound, idOf);
        if (!cond) continue;
        ancestors.push(parts[i + 1]!.combinator === '>' ? { ...cond, direct: true } : cond);
      }
      const when: When = {};
      if (self) when.self = self;
      if (ancestors.length > 0) when.ancestors = ancestors;
      return tag({ kind: 'child-rule', cls: ctxCls, direct: parts[ctxIdx + 1]!.combinator === '>', match, ...(path.length > 0 ? { path } : {}), when, specificity: spec });
    } catch (e) {
      if (e instanceof Drop) return drop(e.reason, e.detail);
      throw e;
    }
  }
  const cls = subjectModule[subjectModule.length - 1]!.name;
  try {
    const selfC: Compound = { ...subject, classes: subject.classes.filter((k) => !(k.name === cls && !k.global)) };
    if (selfC.root) throw new Drop('light-theme', ':root as subject with a class');
    const self = conditionsOf(selfC, idOf);
    const ancestors: NonNullable<When['ancestors']> = [];
    for (let i = parts.length - 2; i >= 0; i--) {
      const c = parts[i]!.compound;
      const cond = conditionsOf(c, idOf);
      const direct = parts[i + 1]!.combinator === '>';
      if (!cond) {
        // `:root`, `*` or a stripped theme context: always true. Keep a `>` link visible only when it constrains.
        continue;
      }
      ancestors.push(direct ? { ...cond, direct: true } : cond);
    }
    if (!self && ancestors.length === 0) return tag({ kind: 'base', cls, specificity: spec });
    const when: When = {};
    if (self) when.self = self;
    if (ancestors.length > 0) when.ancestors = ancestors;
    let policy: VariantPolicy;
    if (ancestors.length > 0) policy = parts.some((p) => p.combinator === '>') ? 'child' : 'descendant';
    else if (self?.prev || self?.pseudo?.some((p) => STRUCTURAL.has(p.replace(/\(.*$/, '')))) policy = 'structural';
    else if (self?.pseudo) policy = 'state';
    else if (self?.attrs) policy = 'attr';
    else policy = 'compound';
    return tag({ kind: 'variant', cls, when, specificity: spec, policy });
  } catch (e) {
    if (e instanceof Drop) return drop(e.reason, e.detail);
    throw e;
  }
}
