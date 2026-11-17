// One CSS module → class entries (base + variants + diagnostics), its export map, and statistics for the report.
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { evalContainer, evalMedia, evalSupports, type QueryEnv } from './queries';
import { parseContent } from './pseudo';
import { planSelector, type DropReason, type Plan, type PseudoSide, type VariantPolicy } from './selectors';
import { isLayoutLoss, translateDecls, type Scope, type SrcDecl, type Translation } from './translate';
import { CAPS_VERSION, RUNTIME_STYLE_CAPS } from './caps';
import { termDecl } from './term-decls';
import type { ChildRule, ClassEntry, ClassStatus, Conditions, Outcome, PseudoRule, TermStyle, TermText, Variant, When } from './types';

export interface GlobalVars {
  get(name: string): { value: string; from: string } | undefined;
}

export interface QueryStat {
  query: string;
  applied: boolean;
  rules: number;
  decls: number;
  unknown: string[];
}

export interface ModuleStats {
  rules: number;
  selectors: number;
  plans: Record<string, number>; // base / variant:<policy> / dropped:<reason> / root
  planDecls: Record<string, number>;
  queries: QueryStat[];
  /** Declarations under selectors whose plan attributed them to no class (e.g. `:root:has(.x)`). */
  orphanDecls: number;
}

export interface ModuleResult {
  path: string;
  exports: Record<string, string>;
  entries: ClassEntry[];
  stats: ModuleStats;
  gridFailures: Array<{ id: string; why: string; shape: string }>;
}

const SKIP_AT = new Set(['keyframes', '-webkit-keyframes', 'font-face', 'property', 'page', 'counter-style']);

/** Every module class named in any selector (outside :global), in order of first appearance. */
export function moduleClassNames(css: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule' && SKIP_AT.has((p as postcss.AtRule).name)) return;
    selectorParser((root) => {
      root.walkClasses((c) => {
        for (let p = c.parent; p; p = p.parent) if (p.type === 'pseudo' && /^:global$/i.test(p.value)) return;
        if (!seen.has(c.value)) {
          seen.add(c.value);
          names.push(c.value);
        }
      });
    }).processSync(rule.selector);
  });
  return names;
}

/** `:root` custom properties a module declares (global in CSS). */
export function moduleRootVars(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.trim() !== ':root' || rule.parent?.type !== 'root') return;
    for (const n of rule.nodes) if (n.type === 'decl' && n.prop.startsWith('--')) out.push([n.prop, n.value.trim()]);
  });
  return out;
}

interface VariantAcc {
  when: When;
  selector: string;
  specificity: [number, number, number];
  policy: VariantPolicy;
  decls: SrcDecl[];
}

interface ChildAcc {
  selector: string;
  direct: boolean;
  match: Conditions;
  path?: Array<Conditions & { direct?: boolean }>;
  when: When;
  specificity: [number, number, number];
  decls: SrcDecl[];
  /** `.list li::before`: the generated box of the matched children. */
  pseudo?: PseudoSide;
}

/** `.a::before`, `.a[data-x]::after`: one rule for the generated box of class a (when = {} for the plain form). */
interface PseudoAcc {
  side: PseudoSide;
  selector: string;
  when: When;
  specificity: [number, number, number];
  decls: SrcDecl[];
}

interface ClassAcc {
  base: SrcDecl[];
  variants: Map<string, VariantAcc>;
  children: Map<string, ChildAcc>;
  pseudos: Map<string, PseudoAcc>;
  dropped: Outcome[];
  droppedLayout: number;
  notApplied: Outcome[];
}

const deepEq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function delta<T extends object>(base: T, next: T): { set: Partial<T>; unset: string[] } {
  const set: Partial<T> = {};
  const unset: string[] = [];
  for (const k of Object.keys(next) as Array<keyof T>) if (!deepEq(base[k], next[k])) set[k] = next[k];
  for (const k of Object.keys(base) as Array<keyof T>) if (!(k in next)) unset.push(String(k));
  return { set, unset };
}

/** The cascaded `content` of one rule's declarations (the last one; !important first), or undefined when it sets none. */
function contentOf(decls: readonly SrcDecl[]): SrcDecl | undefined {
  const all = decls.filter((d) => d.prop === 'content');
  return [...all].reverse().find((d) => d.important) ?? all[all.length - 1];
}

/**
 * One ::before / ::after rule as a box for the runtime: its content parts and the translated style of its own
 * declarations. null = the content cannot be decided at build time (counter(), url(), quotes): the caller drops the rule.
 */
function pseudoBox(side: PseudoSide, decls: readonly SrcDecl[], t: Translation): { box: { side: PseudoSide; content?: string[] | 'none' }; style?: TermStyle; text?: TermText; outcomes: Outcome[] } | null {
  const src = contentOf(decls);
  const content = src ? parseContent(src.value) : undefined;
  if (content === null) return null;
  const outcomes = decls.map((d) => {
    const o = t.outcomes.get(d)!;
    if (d !== src) return o;
    return { ...o, kind: 'translated' as const, detail: content === 'none' ? 'no generated box' : content!.length === 0 ? 'an empty generated box' : `generated text ${JSON.stringify(content)}` };
  });
  const style = Object.keys(t.style).length > 0 ? t.style : undefined;
  const text = Object.keys(t.text).length > 0 ? t.text : undefined;
  return { box: { side, ...(content !== undefined ? { content } : {}) }, ...(style ? { style } : {}), ...(text ? { text } : {}), outcomes };
}

const undecidable = (side: PseudoSide, decls: readonly SrcDecl[]): Outcome[] =>
  decls.map((d) => ({ decl: `${d.prop}: ${d.value}`, kind: 'dropped' as const, detail: `::${side} box, pseudo-content: ${contentOf(decls)?.value ?? ''} cannot be decided at build time`, ...(d.via ? { via: d.via } : {}) }));

export function translateModule(path: string, css: string, env: QueryEnv, globals: GlobalVars): ModuleResult {
  const root = postcss.parse(css, { from: path });
  const names = moduleClassNames(css);
  const exports: Record<string, string> = {};
  for (const n of names) exports[n] = `${path}#${n}`;
  const acc = new Map<string, ClassAcc>();
  const accOf = (id: string): ClassAcc => {
    let a = acc.get(id);
    if (!a) {
      a = { base: [], variants: new Map(), children: new Map(), pseudos: new Map(), dropped: [], droppedLayout: 0, notApplied: [] };
      acc.set(id, a);
    }
    return a;
  };
  for (const n of names) accOf(`${path}#${n}`);
  const stats: ModuleStats = { rules: 0, selectors: 0, plans: {}, planDecls: {}, queries: [], orphanDecls: 0 };
  const bump = (k: string, decls: number): void => {
    stats.plans[k] = (stats.plans[k] ?? 0) + 1;
    stats.planDecls[k] = (stats.planDecls[k] ?? 0) + decls;
  };
  const queryStat = new Map<string, QueryStat>();
  // Module custom properties by name (for var() of a class that does not declare it: an ancestor's, presumably).
  const modVars = new Map<string, Array<{ value: string; selector: string; plain: boolean }>>();

  let order = 0;
  const rules: Array<{ rule: postcss.Rule; applies: boolean; via?: string; skip?: string }> = [];
  root.walkRules((rule) => {
    let applies = true;
    const vias: string[] = [];
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'rule') {
        rules.push({ rule, applies: false, skip: 'nested' });
        return;
      }
      if (p.type !== 'atrule') continue;
      const a = p as postcss.AtRule;
      if (SKIP_AT.has(a.name)) return;
      let r: { value: boolean; unknown: string[] } = { value: true, unknown: [] };
      if (a.name === 'media') r = evalMedia(a.params, env);
      else if (a.name === 'container') r = evalContainer(a.params, env);
      else if (a.name === 'supports') r = evalSupports(a.params);
      else if (a.name === 'layer') continue;
      else r = { value: false, unknown: [`@${a.name}`] };
      const q = `@${a.name} ${a.params}`;
      vias.unshift(q);
      applies = applies && r.value;
      const qs = queryStat.get(q) ?? { query: q, applied: r.value, rules: 0, decls: 0, unknown: r.unknown };
      qs.rules++;
      qs.decls += rule.nodes.filter((n) => n.type === 'decl').length;
      queryStat.set(q, qs);
    }
    rules.push({ rule, applies, ...(vias.length > 0 ? { via: vias.join(' ') } : {}) });
  });
  // Pass 1: module custom properties.
  for (const { rule, applies, skip } of rules) {
    if (!applies || skip) continue;
    for (const sel of rule.selectors) {
      const plain = /^\.[A-Za-z_][\w-]*$/.test(sel.trim());
      if (sel.trim() === ':root') continue;
      for (const n of rule.nodes) {
        if (n.type !== 'decl' || !n.prop.startsWith('--')) continue;
        const list = modVars.get(n.prop) ?? [];
        list.push({ value: n.value.trim(), selector: sel.trim(), plain });
        modVars.set(n.prop, list);
      }
    }
  }
  const scope: Scope = {
    global: (name) => globals.get(name),
    module: (name) => {
      const all = modVars.get(name);
      if (!all || all.length === 0) return undefined;
      const plain = all.filter((c) => c.plain);
      const pool = plain.length > 0 ? plain : all;
      const first = pool[0]!;
      const distinct = [...new Set(pool.map((c) => c.value))];
      return {
        value: first.value,
        from: first.selector,
        ...(distinct.length > 1 ? { ambiguous: [...new Set(pool.map((c) => c.selector))] } : {}),
      };
    },
  };

  // Pass 2: plans.
  for (const { rule, applies, via, skip } of rules) {
    stats.rules++;
    const decls = rule.nodes.filter((n): n is postcss.Declaration => n.type === 'decl');
    for (const sel of rule.selectors) {
      stats.selectors++;
      const plan: Plan = skip
        ? { kind: 'dropped', reason: 'nested', detail: 'nested rule', attributedTo: [], specificity: [0, 1, 0] }
        : planSelector(sel, path);
      const mk = (d: postcss.Declaration, extraVia?: string): SrcDecl => ({
        prop: d.prop.toLowerCase().startsWith('--') ? d.prop : d.prop.toLowerCase(),
        value: d.value.trim(),
        important: d.important,
        order: order++,
        spec: plan.kind === 'root' ? [0, 1, 0] : plan.specificity,
        ...(extraVia || via ? { via: [via, extraVia].filter(Boolean).join(' ') } : {}),
        file: path,
        line: d.source?.start?.line ?? 0,
      });
      if (plan.kind === 'root') {
        bump('root', decls.length);
        continue;
      }
      if (plan.kind === 'dropped') {
        bump(`dropped:${plan.reason}`, decls.length);
        if (plan.attributedTo.length === 0) stats.orphanDecls += decls.length;
        for (const id of plan.attributedTo) {
          const a = accOf(id);
          for (const d of decls) {
            // A declaration on a generated box (`.a:hover::after { inset: 0 }`) places that box, never class a itself.
            const layout = !plan.pseudo && isLayoutLoss(d.prop, d.value);
            if (layout && applies) a.droppedLayout++;
            a.dropped.push({ decl: `${d.prop}: ${d.value}`, kind: 'dropped', detail: `${plan.pseudo ? `::${plan.pseudo} box, ` : ''}${plan.reason}${layout ? ' (layout)' : ''}: ${plan.detail}`, via: [via, sel.trim()].filter(Boolean).join(' ') });
          }
        }
        continue;
      }
      const id = `${path}#${plan.cls}`;
      const a = accOf(id);
      if (plan.kind === 'child-rule') {
        bump(plan.pseudo ? 'pseudo:child-rule' : 'child-rule', decls.length);
        if (!applies) {
          for (const d of decls) a.notApplied.push({ decl: `${d.prop}: ${d.value}`, kind: 'not-applied', detail: 'query false for the width class', via: [via, sel.trim()].filter(Boolean).join(' ') });
          continue;
        }
        const ck = JSON.stringify([plan.direct, plan.match, plan.when, plan.pseudo ?? '', plan.path ?? null]);
        let c = a.children.get(ck);
        if (!c) {
          c = { selector: sel.trim(), direct: plan.direct, match: plan.match, ...(plan.path ? { path: plan.path } : {}), when: plan.when, specificity: plan.specificity, decls: [], ...(plan.pseudo ? { pseudo: plan.pseudo } : {}) };
          a.children.set(ck, c);
        }
        for (const d of decls) c.decls.push({ ...mk(d, sel.trim()), own: true });
        continue;
      }
      if (plan.pseudo) {
        bump(plan.kind === 'base' ? 'pseudo:base' : 'pseudo:variant', decls.length);
        if (!applies) {
          for (const d of decls) a.notApplied.push({ decl: `${d.prop}: ${d.value}`, kind: 'not-applied', detail: 'query false for the width class', via: [via, sel.trim()].filter(Boolean).join(' ') });
          continue;
        }
        const when: When = plan.kind === 'variant' ? plan.when : {};
        const pk = JSON.stringify([plan.pseudo, when]);
        let ps = a.pseudos.get(pk);
        if (!ps) {
          ps = { side: plan.pseudo, selector: sel.trim(), when, specificity: plan.specificity, decls: [] };
          a.pseudos.set(pk, ps);
        }
        for (const d of decls) ps.decls.push({ ...mk(d, sel.trim()), own: true });
        continue;
      }
      const key = plan.kind === 'base' ? 'base' : `variant:${plan.policy}`;
      bump(key, decls.length);
      if (!applies) {
        for (const d of decls) a.notApplied.push({ decl: `${d.prop}: ${d.value}`, kind: 'not-applied', detail: 'query false for the width class', via: [via, plan.kind === 'variant' ? sel.trim() : ''].filter(Boolean).join(' ') });
        continue;
      }
      if (plan.kind === 'base') {
        // term-decls.ts: the terminal's value for this class and property, in place of the stylesheet's.
        for (const d of decls) { const m = mk(d); const tv = termDecl(id, m.prop, m.value); a.base.push(tv === undefined ? m : { ...m, value: tv }); }
      } else {
        const vk = JSON.stringify(plan.when);
        let v = a.variants.get(vk);
        if (!v) {
          v = { when: plan.when, selector: sel.trim(), specificity: plan.specificity, policy: plan.policy, decls: [] };
          a.variants.set(vk, v);
        }
        for (const d of decls) v.decls.push({ ...mk(d, sel.trim()), own: true });
      }
    }
  }

  // Pass 3: translate.
  const entries: ClassEntry[] = [];
  const gridFailures: ModuleResult['gridFailures'] = [];
  for (const [id, a] of acc) {
    const baseT = translateDecls(a.base, scope);
    if (baseT.gridFailure) gridFailures.push({ id, ...baseT.gridFailure });
    const baseOutcomes = a.base.map((d) => baseT.outcomes.get(d)!);
    const variants: Variant[] = [];
    const notes = new Set(baseT.notes);
    const sorted = [...a.variants.values()].sort((x, y) => {
      for (let i = 0; i < 3; i++) if (x.specificity[i] !== y.specificity[i]) return x.specificity[i]! - y.specificity[i]!;
      return (x.decls[0]?.order ?? 0) - (y.decls[0]?.order ?? 0);
    });
    for (const v of sorted) {
      const t: Translation = translateDecls([...a.base, ...v.decls], scope);
      if (t.gridFailure && !baseT.gridFailure) gridFailures.push({ id: `${id} when ${v.selector}`, ...t.gridFailure });
      const s = delta<TermStyle>(baseT.style, t.style);
      const tx = delta<TermText>(baseT.text, t.text);
      const out: Variant = {
        when: v.when,
        selector: v.selector,
        specificity: v.specificity,
        outcomes: v.decls.map((d) => t.outcomes.get(d)!),
      };
      if (Object.keys(s.set).length > 0) out.style = s.set;
      if (Object.keys(tx.set).length > 0) out.text = tx.set;
      const unset = [...s.unset, ...tx.unset.map((k) => `text.${k}`)];
      if (!deepEq(baseT.border, t.border)) out.border = t.border ?? null;
      if (!!baseT.hidden !== !!t.hidden) out.hidden = !!t.hidden;
      if (!!baseT.contents !== !!t.contents) out.contents = !!t.contents;
      if (!deepEq(baseT.grid, t.grid)) out.grid = t.grid ?? null;
      if (t.gridItem && !baseT.gridItem) out.gridItem = t.gridItem;
      if (unset.length > 0) out.unset = unset;
      for (const n of t.notes) if (!baseT.notes.includes(n)) notes.add(`[${v.selector}] ${n}`);
      variants.push(out);
    }
    const childRules: ChildRule[] = [];
    for (const c of [...a.children.values()].sort((x, y) => (x.decls[0]?.order ?? 0) - (y.decls[0]?.order ?? 0))) {
      const t = translateDecls(c.decls, scope);
      const box = c.pseudo ? pseudoBox(c.pseudo, c.decls, t) : undefined;
      if (box === null) {
        // Undecidable content: the rule is dropped whole, its declarations recorded on the context class.
        a.dropped.push(...undecidable(c.pseudo!, c.decls));
        continue;
      }
      const r: ChildRule = {
        selector: c.selector,
        direct: c.direct,
        match: c.match,
        ...(c.path ? { path: c.path } : {}),
        ...(c.when.self || c.when.ancestors ? { when: c.when } : {}),
        specificity: c.specificity,
        outcomes: c.decls.map((d) => t.outcomes.get(d)!),
      };
      if (Object.keys(t.style).length > 0) r.style = t.style;
      if (Object.keys(t.text).length > 0) r.text = t.text;
      if (t.border !== undefined) r.border = t.border;
      if (t.hidden) r.hidden = true;
      if (t.contents) r.contents = true;
      if (t.gridItem) r.gridItem = t.gridItem;
      if (box) {
        r.pseudo = box.box;
        r.outcomes = box.outcomes;
        if (box.text) r.text = box.text;
        if (box.style) r.style = box.style; else delete r.style;
      }
      if (t.grid) notes.add(`[${c.selector}] a child rule makes a grid: not applied to children (style only)`);
      for (const n of t.notes) notes.add(`[${c.selector}] ${n}`);
      childRules.push(r);
    }
    const pseudo: PseudoRule[] = [];
    const bySpecThenOrder = (x: PseudoAcc, y: PseudoAcc): number => {
      for (let i = 0; i < 3; i++) if (x.specificity[i] !== y.specificity[i]) return x.specificity[i]! - y.specificity[i]!;
      return (x.decls[0]?.order ?? 0) - (y.decls[0]?.order ?? 0);
    };
    for (const ps of [...a.pseudos.values()].sort(bySpecThenOrder)) {
      const t = translateDecls(ps.decls, scope);
      const box = pseudoBox(ps.side, ps.decls, t);
      if (box === null) {
        a.dropped.push(...undecidable(ps.side, ps.decls));
        continue;
      }
      const r: PseudoRule = { ...box.box, selector: ps.selector, ...(ps.when.self || ps.when.ancestors ? { when: ps.when } : {}), specificity: ps.specificity, outcomes: box.outcomes };
      if (box.style) r.style = box.style;
      if (box.text) r.text = box.text;
      if (t.border !== undefined) r.border = t.border;
      if (t.hidden) r.hidden = true;
      pseudo.push(r);
    }
    // A generated box is not the class: its outcomes are reported (report.ts) and never decide the class's status.
    const ownChildRules = childRules.filter((c) => !c.pseudo);
    const considered = [...baseOutcomes, ...variants.flatMap((v) => v.outcomes), ...ownChildRules.flatMap((c) => c.outcomes)].filter((o) => o.kind !== 'overridden' && o.kind !== 'meta');
    const hasDecls = a.base.length > 0 || variants.some((v) => v.outcomes.length > 0) || ownChildRules.length > 0;
    const bad = considered.some((o) => o.kind === 'lossy' || o.kind === 'unexpressible') || a.droppedLayout > 0;
    const expressed = considered.some((o) => o.kind === 'translated' || o.kind === 'lossy');
    // "translated" means "consumed by the runtime" (caps.ts): a style key outside RUNTIME_STYLE_CAPS makes the class partial.
    const unconsumed = [...new Set([baseT.style, ...variants.map((v) => v.style ?? {}), ...ownChildRules.map((c) => c.style ?? {})].flatMap((x) => Object.keys(x)).filter((k) => !RUNTIME_STYLE_CAPS.has(k)))];
    if (unconsumed.length) notes.add(`style keys the runtime does not consume (caps v${CAPS_VERSION}): ${unconsumed.join(', ')}`);
    let status: ClassStatus;
    if (!hasDecls) status = a.droppedLayout > 0 ? 'untranslatable' : 'empty';
    else if (!bad && unconsumed.length === 0) status = 'full';
    else if (!expressed) status = 'untranslatable';
    else status = 'partial';
    if (a.droppedLayout > 0) notes.add(`${a.droppedLayout} layout declaration(s) under dropped selectors (hover/focus/pseudo-element/:has/...)`);
    const text = baseT.text;
    const entry: ClassEntry = {
      id,
      style: baseT.style,
      ...(Object.keys(text).length > 0 ? { text } : {}),
      ...(baseT.border ? { border: baseT.border } : {}),
      ...(baseT.hidden ? { hidden: true as const } : {}),
      ...(baseT.contents ? { contents: true as const } : {}),
      ...(baseT.grid ? { grid: baseT.grid } : {}),
      ...(baseT.gridItem ? { gridItem: baseT.gridItem } : {}),
      ...(childRules.length > 0 ? { childRules } : {}),
      ...(pseudo.length > 0 ? { pseudo } : {}),
      ...(baseT.container ? { container: baseT.container } : {}),
      ...(variants.length > 0 ? { variants } : {}),
      ...(notes.size > 0 ? { notes: [...notes] } : {}),
      status,
      outcomes: [...baseOutcomes, ...a.notApplied, ...a.dropped],
    };
    entries.push(entry);
  }
  stats.queries = [...queryStat.values()];
  return { path, exports, entries, stats, gridFailures };
}

export type { DropReason };
