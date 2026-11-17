// CSS-TRANSLATE.md: coverage, unit-model evidence, policy coverage, top untranslated shapes, worst referenced classes.
import type { Build } from '../css-translate';
import { scanRefs } from './refs';
import type { ClassEntry, Outcome, OutcomeKind } from './types';
import { spaceCells, UNIT, UNIT_MODEL_DOC } from './units';
import { parseLength, resolveVars, topParts } from './values';

const KINDS: OutcomeKind[] = ['translated', 'lossy', 'paint', 'unexpressible', 'dropped', 'not-applied', 'overridden', 'meta'];

function areaOf(id: string): string {
  const p = id.split('#')[0]!;
  const top = p.split('/')[0]!;
  return top === 'pages' || top === 'shell' || top === 'kit' || top === 'app' || top === 'ask' ? top : 'other';
}

const pct = (n: number, d: number): string => (d === 0 ? '-' : `${((100 * n) / d).toFixed(1)}%`);

function allOutcomes(e: ClassEntry): Outcome[] {
  return [...e.outcomes, ...(e.variants ?? []).flatMap((v) => v.outcomes), ...(e.childRules ?? []).flatMap((c) => c.outcomes), ...(e.pseudo ?? []).flatMap((p) => p.outcomes)];
}

function shapeOf(o: Outcome): string {
  const [prop, ...rest] = o.decl.split(':');
  let v = rest.join(':').trim();
  v = v.replace(/-?\d*\.?\d+(?=[a-z%]*\b)/gi, 'N').replace(/\s+/g, ' ');
  if (v.length > 70) v = v.slice(0, 67) + '…';
  return `${prop!.trim()}: ${v}`;
}

function md(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/** Dropped rules a terminal-drawn file reaches whose loss is a visible, accepted difference (not a ring or a tint). */
const COMPUTERS = 'pages/computers/parts/parts.module.css';
const MUTED_TO_INK = { web: 'the action buttons of a tile turn from muted to ink while the pointer or the focus is inside the tile.', term: 'they stay muted; the focused button already gets focus ink.' };
export const KNOWN_DIFFERENCES: ReadonlyArray<{ cls: string; selector: string; web: string; term: string }> = [
  { cls: `${COMPUTERS}#stripActions`, selector: '.stripCell:hover .stripActions button', ...MUTED_TO_INK },
  { cls: `${COMPUTERS}#stripActions`, selector: '.stripCell:focus-within .stripActions button', ...MUTED_TO_INK },
  { cls: `${COMPUTERS}#useActions`, selector: '.useCard:hover .useActions button', ...MUTED_TO_INK },
  { cls: `${COMPUTERS}#useActions`, selector: '.useCard:focus-within .useActions button', ...MUTED_TO_INK },
];

/** `reached`: the files the terminal loads (reached.ts), relative to src. With it every count is also given for the
 *  classes those files name ("reached"): a class no such file names is never asked of the style table (its component
 *  is drawn by a `.term` sibling, or nothing in the terminal loads it), so what it loses is lost to nobody. */
export function writeReport(build: Build, src: string, reached?: ReadonlySet<string>): string {
  const { table, results, tokens, globals } = build;
  const entries = Object.values(table.classes);
  const refs = scanRefs(src, reached);
  const termRefs = refs.term;
  const isReached = (e: ClassEntry): boolean => (termRefs?.get(e.id) ?? 0) > 0;
  const L: string[] = [];
  const w = table.widthClass;
  L.push('# CSS module → terminal style translation (css-translate)');
  L.push('');
  L.push(`Generated ${table.generated} by \`bun hub/scripts/term/css-translate.ts\` over ${results.length} CSS modules under hub/src, width class **${w.name}** (${w.cols} x ${w.rows} cells = ${w.cols * UNIT.CELL_W_PX} x ${w.rows * UNIT.CELL_H_PX} px), dark theme. Code: hub/scripts/term/css-translate.ts and css-translate/ (units.ts, selectors.ts, grid.ts, queries.ts, translate.ts, module.ts, lookup.ts).`);
  L.push('');

  // ── 1. Coverage ──
  L.push('## 1. Coverage');
  L.push('');
  L.push('Class status: **full** = every applied declaration translated exactly or paint-only (nothing the terminal needs is lost); **partial** = something lossy or not expressible (in the base, a variant, or a layout declaration under a dropped selector); **untranslatable** = has layout declarations and none came through; **empty** = no declaration of its own (a hook class, or only named inside another selector).');
  L.push('');
  const areas = ['pages', 'shell', 'kit', 'app', 'ask'];
  L.push('| area | modules | classes | full | partial | untranslatable | empty | TSX refs (all runtime files) | refs to full classes |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  const row = (name: string, es: ClassEntry[], mods: number): void => {
    const c = (s: string): number => es.filter((e) => e.status === s).length;
    const r = es.reduce((a, e) => a + (refs.all.get(e.id) ?? 0), 0);
    const rf = es.filter((e) => e.status === 'full').reduce((a, e) => a + (refs.all.get(e.id) ?? 0), 0);
    L.push(`| ${name} | ${mods} | ${es.length} | ${c('full')} (${pct(c('full'), es.length)}) | ${c('partial')} (${pct(c('partial'), es.length)}) | ${c('untranslatable')} | ${c('empty')} | ${r} | ${rf} (${pct(rf, r)}) |`);
  };
  for (const a of areas) row(a, entries.filter((e) => areaOf(e.id) === a), results.filter((r) => areaOf(r.path) === a).length);
  row('**all**', entries, results.length);
  if (termRefs) {
    const re = entries.filter(isReached);
    row('**reached by the terminal**', re, new Set(re.map((e) => e.id.split('#')[0])).size);
  }
  L.push('');
  if (termRefs) {
    L.push(`**Reached by the terminal** = classes named (\`s.name\`) by one of the ${reached!.size} files the terminal build loads: the terminal import graph from src/term/entry.ts and every page.ts, where a \`.term\` sibling replaces its web file (css-translate/reached.ts). Only these classes are ever asked of the style table. The other ${entries.length - entries.filter(isReached).length} belong to components drawn by a hand-written sibling, or to files nothing in the terminal loads; their rows below are CSS the terminal never reads. Static, by name: a class reached only through \`s[expr]\` is not counted, a file loaded and never drawn is.`);
    L.push('');
  }

  // Declarations by outcome.
  L.push('### Declarations by outcome');
  L.push('');
  L.push('Every source declaration once per selector it appears under (a rule with two selectors counts twice), including variant (conditional) and child-rule declarations.');
  L.push('');
  L.push(`| area | ${KINDS.join(' | ')} | total |`);
  L.push(`|---|${KINDS.map(() => '---').join('|')}|---|`);
  const declRow = (name: string, es: ClassEntry[]): void => {
    const c: Record<string, number> = {};
    for (const e of es) for (const o of allOutcomes(e)) c[o.kind] = (c[o.kind] ?? 0) + 1;
    const tot = Object.values(c).reduce((a, b) => a + b, 0);
    L.push(`| ${name} | ${KINDS.map((k) => `${c[k] ?? 0} (${pct(c[k] ?? 0, tot)})`).join(' | ')} | ${tot} |`);
  };
  for (const a of areas) declRow(a, entries.filter((e) => areaOf(e.id) === a));
  declRow('**all**', entries);
  if (termRefs) declRow('**reached by the terminal**', entries.filter(isReached));
  const orphan = results.reduce((a, r) => a + r.stats.orphanDecls, 0);
  L.push('');
  L.push(`Plus ${orphan} declarations under dropped selectors that name no module class at all (not attributed to any class).`);
  const applicable = entries.flatMap(allOutcomes).filter((o) => ['translated', 'lossy', 'unexpressible'].includes(o.kind));
  L.push('');
  L.push(`Of the layout-or-text declarations that apply under ${w.name} (translated + lossy + unexpressible = ${applicable.length}): ${pct(applicable.filter((o) => o.kind === 'translated').length, applicable.length)} exact, ${pct(applicable.filter((o) => o.kind === 'lossy').length, applicable.length)} approximate, ${pct(applicable.filter((o) => o.kind === 'unexpressible').length, applicable.length)} not expressible.`);
  L.push('');

  // Declarations under dropped selectors, by reason: all against reached, layout apart from text and paint.
  L.push('### Declarations under dropped selectors, by reason');
  L.push('');
  L.push(`Every declaration under a selector the policy drops (also inside an @media / @container branch that is false for ${w.name}), counted on the class the rule is attributed to (its subject, else the nearest class before it). "layout" = it changes layout; the rest is text or paint (colour, outline, background, generated content).${termRefs ? ' The reached columns are what a terminal frame can be missing; the rest is CSS of sibling-drawn or unloaded components.' : ''}`);
  L.push('');
  interface Lost { rules: Set<string>; decls: number; layout: number; rRules: Set<string>; rDecls: number; rLayout: number }
  const lost = new Map<string, Lost>();
  for (const e of entries)
    for (const o of e.outcomes) {
      if (o.kind !== 'dropped' || !o.detail) continue;
      const layout = o.detail.includes('(layout)');
      const reason = o.detail.split(/[ :]/)[0]!;
      const s = lost.get(reason) ?? { rules: new Set<string>(), decls: 0, layout: 0, rRules: new Set<string>(), rDecls: 0, rLayout: 0 };
      const rule = `${e.id.split('#')[0]} ${o.via ?? ''}`;
      s.rules.add(rule);
      s.decls++;
      if (layout) s.layout++;
      if (isReached(e)) {
        s.rRules.add(rule);
        s.rDecls++;
        if (layout) s.rLayout++;
      }
      lost.set(reason, s);
    }
  L.push(`| reason | rules | declarations | layout |${termRefs ? ' reached rules | reached declarations | reached layout |' : ''}`);
  L.push(`|---|---|---|---|${termRefs ? '---|---|---|' : ''}`);
  const sum = { rules: 0, decls: 0, layout: 0, rRules: 0, rDecls: 0, rLayout: 0 };
  for (const [k, s] of [...lost].sort((a, b) => b[1].decls - a[1].decls)) {
    L.push(`| ${k} | ${s.rules.size} | ${s.decls} | ${s.layout} |${termRefs ? ` ${s.rRules.size} | ${s.rDecls} | ${s.rLayout} |` : ''}`);
    sum.rules += s.rules.size;
    sum.decls += s.decls;
    sum.layout += s.layout;
    sum.rRules += s.rRules.size;
    sum.rDecls += s.rDecls;
    sum.rLayout += s.rLayout;
  }
  L.push(`| **all** | ${sum.rules} | ${sum.decls} | ${sum.layout} |${termRefs ? ` ${sum.rRules} | ${sum.rDecls} | ${sum.rLayout} |` : ''}`);
  L.push('');
  if (termRefs) {
    const rows: string[] = [];
    for (const e of entries.filter(isReached)) {
      const by = new Map<string, { ds: string[]; layout: boolean }>();
      for (const o of e.outcomes) {
        if (o.kind !== 'dropped' || !o.detail) continue;
        const g = by.get(o.via ?? '') ?? { ds: [], layout: false };
        g.ds.push(o.decl);
        if (o.detail.includes('(layout)')) g.layout = true;
        by.set(o.via ?? '', g);
      }
      for (const [via, g] of by) rows.push(`| ${e.id.split('#')[0]} | \`${md(via)}\` | ${g.layout ? 'layout' : 'text/paint'} | ${md(g.ds.join('; ').slice(0, 160))} | ${termRefs.get(e.id)} |`);
    }
    L.push('The reached ones, each rule once:');
    L.push('');
    L.push('| module | selector | kind | declarations | terminal refs of its class |');
    L.push('|---|---|---|---|---|');
    for (const r of rows.sort()) L.push(r);
    L.push('');
    // Reached rules that carry meaning beyond a focus ring or a hover tint, and why they stay dropped.
    // A row is printed only while its rule is still in the stylesheet and still dropped.
    const known = KNOWN_DIFFERENCES.filter((k) => table.classes[k.cls]?.outcomes.some((o) => o.kind === 'dropped' && (o.via ?? '').endsWith(k.selector)));
    if (known.length > 0) {
      L.push('Known cosmetic differences among them (accepted, not built):');
      L.push('');
      for (const k of known) L.push(`- ${k.cls.split('#')[0]} \`${md(k.selector)}\`: ${k.web} In the terminal: ${k.term}`);
      L.push('');
    }
  }

  // ── 2. Unit model ──
  L.push('## 2. Unit model (css-translate/units.ts)');
  L.push('');
  for (const [k, v] of Object.entries(UNIT_MODEL_DOC)) L.push(`- **${k}**: ${v}`);
  L.push('');
  L.push('Evidence: spacing values as used, split by the axis they space. A `gap` in a row box (or `column-gap`) separates inline items side by side; a `gap` in a column box (or `row-gap`) stacks blocks. Counted over applied base declarations of every module, by the class\'s own direction (unknown = the class sets no display; the gap then spaces whatever its kit sibling class decides).');
  L.push('');
  const res = (v: string): string => resolveVars(v, (n) => globals.get(n)).value;
  const gapUse = new Map<string, { px: number; inRow: number; inCol: number; unknown: number }>();
  const padUse = new Map<string, { px: number; inline: number; block: number }>();
  for (const e of entries) {
    const dir = e.grid ? e.grid.axis : e.style.flexDirection;
    for (const o of e.outcomes) {
      if (o.kind !== 'translated' && o.kind !== 'lossy') continue;
      const m = /^(gap|row-gap|column-gap|padding|padding-inline|padding-block|padding-(?:top|bottom|left|right|block-start|block-end|inline-start|inline-end)):\s*(.*)$/.exec(o.decl);
      if (!m) continue;
      const prop = m[1]!;
      const parts = topParts(m[2]!.trim());
      const label = (raw: string): { key: string; px?: number } => {
        const l = parseLength(res(raw));
        const px = l.kind === 'px' ? l.px : l.kind === 'zero' ? 0 : undefined;
        return { key: raw.replace(/^var\((--[\w-]+)\)$/, '$1'), ...(px !== undefined ? { px } : {}) };
      };
      if (prop === 'gap' || prop === 'row-gap' || prop === 'column-gap') {
        const pieces: Array<[string, 'row' | 'col' | 'dir']> =
          prop === 'gap' ? (parts.length === 2 ? [[parts[0]!, 'col'], [parts[1]!, 'row']] : [[parts[0]!, 'dir']]) : [[parts[0]!, prop === 'row-gap' ? 'col' : 'row']];
        // 'row' = spaces items side by side; 'col' = spaces stacked items.
        for (const [raw, axis] of pieces) {
          const { key, px } = label(raw);
          if (px === undefined) continue;
          const u = gapUse.get(key) ?? { px, inRow: 0, inCol: 0, unknown: 0 };
          if (axis === 'row' || (axis === 'dir' && (dir === 'row' || dir === 'row-reverse'))) u.inRow++;
          else if (axis === 'col' || (axis === 'dir' && (dir === 'column' || dir === 'column-reverse'))) u.inCol++;
          else u.unknown++;
          gapUse.set(key, u);
        }
      } else {
        const inline = /inline|left|right/.test(prop);
        const block = /block|top|bottom/.test(prop);
        const list: Array<[string, 'i' | 'b']> =
          prop === 'padding'
            ? parts.length === 1
              ? [[parts[0]!, 'i'], [parts[0]!, 'b']]
              : [[parts[0]!, 'b'], [parts[1]!, 'i']]
            : parts.map((p) => [p, inline ? 'i' : block ? 'b' : 'i'] as [string, 'i' | 'b']);
        for (const [raw, ax] of list) {
          const { key, px } = label(raw);
          if (px === undefined) continue;
          const u = padUse.get(key) ?? { px, inline: 0, block: 0 };
          if (ax === 'i') u.inline++;
          else u.block++;
          padUse.set(key, u);
        }
      }
    }
  }
  L.push('| value | px | gap between side-by-side items | gap between stacked items | gap, direction unknown | → columns | → rows |');
  L.push('|---|---|---|---|---|---|---|');
  for (const [k, u] of [...gapUse].sort((a, b) => b[1].inRow + b[1].inCol + b[1].unknown - (a[1].inRow + a[1].inCol + a[1].unknown)).slice(0, 14))
    L.push(`| \`${k}\` | ${u.px} | ${u.inRow} | ${u.inCol} | ${u.unknown} | ${spaceCells(u.px, 'h')} | ${spaceCells(u.px, 'v')} |`);
  L.push('');
  L.push('| padding value | px | inline (left/right) uses | block (top/bottom) uses | → columns | → rows |');
  L.push('|---|---|---|---|---|---|');
  for (const [k, u] of [...padUse].sort((a, b) => b[1].inline + b[1].block - (a[1].inline + a[1].block)).slice(0, 12))
    L.push(`| \`${k}\` | ${u.px} | ${u.inline} | ${u.block} | ${spaceCells(u.px, 'h')} | ${spaceCells(u.px, 'v')} |`);
  L.push('');
  const sp2 = gapUse.get('--sp-2');
  const sp3 = gapUse.get('--sp-3');
  L.push('Why these steps:');
  L.push('');
  L.push(`- Side by side, every non-zero gap must be at least one column, or adjacent words fuse. --sp-1 (4px) and --sp-2 (8px) both give 1 column; ${sp2 ? `--sp-2 alone spaces ${sp2.inRow} side-by-side groups` : ''}. Rounding 4px down to 0 (px/8) would glue every icon to its label; rounding 12px up to 2 would make the commonest row gap (--sp-3${sp3 ? `, ${sp3.inRow} uses side by side` : ''}) twice --sp-2 for a 4px difference.`);
  L.push(`- Stacked, ${sp2 ? `--sp-2 is the gap of ${sp2.inCol} column boxes` : '--sp-2 is the common column gap'}${sp3 ? ` and --sp-3 of ${sp3.inCol}` : ''}. A 20px web line is one terminal row, so an 8px gap is 0.4 of a line: one blank row for it would double every list and form. 12px (--sp-3 = --gap-block) and up keeps one blank row, so blocks still read as separate; 24px (--gap-between-sections) and up gives two.`);
  L.push('- These steps are `src/term/prim/tokens.ts` `SPACE`: units.ts calls the runtime\'s own `spaceCells`, and units.term.test.ts pins the --sp-0..--sp-8 values, so a page wrapper translated here and a kit Stack/Row with the same token draw the same spacing.');
  L.push(`- Sizes are linear (px/8, px/16, half down) because a fixed width is content (a 72ch measure, a 148px column of status pills), not rhythm. Heights under ${UNIT.SIZE_ONE_ROW_BELOW_PX}px are one row: they are control and row heights (32/36/40/44/48px) whose chrome the terminal does not draw.`);
  L.push('');

  // ── 3. Selector policy ──
  L.push('## 3. Selector policy and what it covers');
  L.push('');
  L.push('Policy (css-translate/selectors.ts): `.a` → base. A rule whose subject is a module class with extra conditions becomes a **variant** on that class: `compound` (`.a.b`), `attr` (`.a[data-x]`, `[aria-*]`), `structural` (`:first-child`, `:last-child`, `:empty`, `:nth-child`), `state` (`:disabled`, `:checked`), `descendant` (`.p .a`), `child` (`.p > .a`). A rule whose subject has no module class but sits right after a class compound (`.a > li`, `.a > *`, `.a > :first-child`, `.a p`) becomes a **child-rule** on that class, applied by the runtime to matching children (`>`) or descendants. The runtime evaluates `when` from the element\'s classes/props/tag/index and its ancestors\' classes/props, and skips any condition it cannot evaluate. Dark-theme contexts are stripped (dark is the default). **Dropped**: interaction states (:hover/:focus/:active/:focus-visible/:focus-within), pseudo-elements, :has(), sibling combinators, light-theme/accent/perf contexts, :dir(rtl)/:lang, subjects without a module class and no class compound right before them (`ul li`, `.a .b svg`), :global subjects, :is()/:where() lists.');
  L.push('');
  const plans: Record<string, { sel: number; decls: number }> = {};
  for (const r of results)
    for (const [k, n] of Object.entries(r.stats.plans)) {
      const p = (plans[k] ??= { sel: 0, decls: 0 });
      p.sel += n;
      p.decls += r.stats.planDecls[k] ?? 0;
    }
  const totSel = Object.values(plans).reduce((a, b) => a + b.sel, 0);
  const totDecl = Object.values(plans).reduce((a, b) => a + b.decls, 0);
  L.push('| plan | selectors | share | declarations | share |');
  L.push('|---|---|---|---|---|');
  for (const [k, v] of Object.entries(plans).sort((a, b) => b[1].decls - a[1].decls)) L.push(`| ${k} | ${v.sel} | ${pct(v.sel, totSel)} | ${v.decls} | ${pct(v.decls, totDecl)} |`);
  L.push(`| total | ${totSel} | | ${totDecl} | |`);
  L.push('');
  const droppedLayout = entries.flatMap((e) => e.outcomes).filter((o) => o.kind === 'dropped' && o.detail?.includes('(layout)'));
  const byReason: Record<string, number> = {};
  for (const o of droppedLayout) {
    const r = o.detail!.split(' (layout)')[0]!;
    byReason[r] = (byReason[r] ?? 0) + 1;
  }
  L.push(`Layout declarations lost to dropped selectors (they change layout in the browser, so the classes are marked partial): ${droppedLayout.length} — ${Object.entries(byReason)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}. The rest of the dropped declarations are paint (hover tints, focus rings, pseudo-element decoration).`);
  L.push('');
  const vCount = entries.reduce((a, e) => a + (e.variants?.length ?? 0), 0);
  const cCount = entries.reduce((a, e) => a + (e.childRules?.length ?? 0), 0);
  L.push(`Variants emitted: ${vCount} on ${entries.filter((e) => e.variants).length} classes; child rules: ${cCount} on ${entries.filter((e) => e.childRules).length} classes.`);
  L.push('');

  // ── 4. Queries ──
  // Generated boxes.
  {
    const rules = entries.flatMap((e) => [...(e.pseudo ?? []).map((r) => ({ id: e.id, r, style: r.style })), ...(e.childRules ?? []).filter((c) => c.pseudo).map((c) => ({ id: e.id, r: { ...c.pseudo!, selector: c.selector }, style: c.style }))]);
    const kindOf = (c: unknown, abs: boolean): string => (c === undefined ? 'no content of its own (adds to another rule)' : c === 'none' ? 'content: none (removes the box)'
      : abs ? 'absolute (not drawn: a hit area, bar, dot or mark)' : (c as unknown[]).length > 0 ? 'text in flow (drawn)' : 'empty box in flow (drawn for its size)');
    const count: Record<string, number> = {};
    for (const x of rules) { const k = kindOf(x.r.content, x.style?.position === 'absolute'); count[k] = (count[k] ?? 0) + 1; }
    const undecided = entries.flatMap((e) => e.outcomes).filter((o) => o.kind === 'dropped' && o.detail?.includes('pseudo-content'));
    const other = entries.flatMap((e) => e.outcomes).filter((o) => o.kind === 'dropped' && /^::(before|after) box, /.test(o.detail ?? '') && !o.detail!.includes('pseudo-content'));
    L.push('### Generated boxes (::before / ::after)');
    L.push('');
    L.push(`A \`::before\` / \`::after\` ending a selector's subject is kept as a rule for that class's generated box (${rules.length} rules): ${Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ')}. Their declarations place the box, never the class, so they do not make the class partial. Dropped: ${undecided.length} declarations under content the build cannot decide (attr(), counter(), url()), ${other.length} under a selector dropped for another reason (hover, focus, :has).`);
    L.push('');
    L.push('| class | selector | content |');
    L.push('|---|---|---|');
    for (const x of rules.filter((y) => Array.isArray(y.r.content) && y.r.content.length > 0 && y.style?.position !== 'absolute')) L.push(`| ${x.id} | \`${md(x.r.selector)}\` | \`${md(JSON.stringify(x.r.content))}\` |`);
    L.push('');
  }

  L.push('## 4. @media / @container / @supports under the width class');
  L.push('');
  L.push(`Every width/height condition (viewport or any container, named or not) is evaluated against ${w.cols * UNIT.CELL_W_PX} x ${w.rows * UNIT.CELL_H_PX} px; hover: none, pointer: fine, reduced motion, no forced colours, dark scheme; @supports false. Build another table with \`--width medium|wide|<cols>\` for a wider terminal.`);
  L.push('');
  const qs = new Map<string, { applied: boolean; rules: number; decls: number; unknown: string[] }>();
  for (const r of results)
    for (const q of r.stats.queries) {
      const o = qs.get(q.query) ?? { applied: q.applied, rules: 0, decls: 0, unknown: q.unknown };
      o.rules += q.rules;
      o.decls += q.decls;
      qs.set(q.query, o);
    }
  const appliedQ = [...qs.values()].filter((q) => q.applied);
  const offQ = [...qs.values()].filter((q) => !q.applied);
  L.push(`${qs.size} distinct conditions: ${appliedQ.length} true (${appliedQ.reduce((a, q) => a + q.decls, 0)} declarations applied), ${offQ.length} false (${offQ.reduce((a, q) => a + q.decls, 0)} declarations not applied).`);
  L.push('');
  L.push('| condition | under ' + w.name + ' | rules | declarations |');
  L.push('|---|---|---|---|');
  for (const [k, q] of [...qs].sort((a, b) => b[1].decls - a[1].decls).slice(0, 40)) L.push(`| \`${md(k)}\` | ${q.applied ? 'applied' : 'not applied'}${q.unknown.length ? ` (unknown: ${md(q.unknown.join(', '))})` : ''} | ${q.rules} | ${q.decls} |`);
  if (qs.size > 40) L.push(`| … ${qs.size - 40} more | | | |`);
  L.push('');
  L.push('tokens.css: applied `:root`, `:root[data-hx-theme="dark"]` and true `@media` `:root` blocks. Ignored:');
  for (const i of tokens.ignored) L.push(`- \`${md(i.selector)}\` (${i.count} properties): ${i.why}`);
  L.push('');

  // ── 5. Grid ──
  L.push('## 5. Grid');
  L.push('');
  const gridPatterns: Record<string, number> = {};
  for (const e of entries) {
    if (e.grid) gridPatterns[`${e.grid.pattern}${e.grid.pattern === 'column' ? '' : ` (${e.grid.tracks} tracks)`}`] = (gridPatterns[`${e.grid.pattern}${e.grid.pattern === 'column' ? '' : ` (${e.grid.tracks} tracks)`}`] ?? 0) + 1;
    for (const v of e.variants ?? []) if (v.grid) gridPatterns[`${v.grid.pattern} (variant)`] = (gridPatterns[`${v.grid.pattern} (variant)`] ?? 0) + 1;
  }
  const fails = results.flatMap((r) => r.gridFailures);
  L.push(`Translated grid containers (base, under ${w.name}): ${Object.values(gridPatterns).reduce((a, b) => a + b, 0)}; not translated: ${fails.length}.`);
  L.push('');
  L.push('| translated as | count |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(gridPatterns).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`);
  L.push('');
  const failBy: Record<string, { n: number; ex: string[] }> = {};
  for (const f of fails) {
    const o = (failBy[f.why] ??= { n: 0, ex: [] });
    o.n++;
    if (o.ex.length < 3) o.ex.push(`${f.id} (\`${md(f.shape.slice(0, 80))}\`)`);
  }
  L.push('| not translated because | count | examples |');
  L.push('|---|---|---|');
  for (const [k, v] of Object.entries(failBy).sort((a, b) => b[1].n - a[1].n)) L.push(`| ${md(k)} | ${v.n} | ${v.ex.join('; ')} |`);
  L.push('');
  L.push('A one-column grid is exact. Every multi-track plan is marked lossy because it is exact only while the element has at most `tracks` visible children (a table row of cells: yes; a card grid of N items: no, the runtime falls back to a column). Grid children placed with `grid-column`/`grid-row` are not expressible (spans have no flex form).');
  L.push('');

  // ── 6. Top untranslated shapes ──
  L.push('## 6. Top 30 untranslated declaration shapes');
  L.push('');
  L.push('Not expressible, plus layout declarations under dropped selectors; numbers normalised to N.');
  L.push('');
  const shapes = new Map<string, { n: number; reached: number; kind: string; ex: string[] }>();
  for (const e of entries)
    for (const o of allOutcomes(e)) {
      const isDroppedLayout = o.kind === 'dropped' && o.detail?.includes('(layout)');
      if (o.kind !== 'unexpressible' && !isDroppedLayout) continue;
      const k = `${shapeOf(o)}${isDroppedLayout ? `  [${o.detail!.split(':')[0]}]` : ''}`;
      const s = shapes.get(k) ?? { n: 0, reached: 0, kind: isDroppedLayout ? 'dropped' : 'unexpressible', ex: [] };
      s.n++;
      if (isReached(e)) s.reached++;
      if (s.ex.length < 2 && !s.ex.includes(e.id)) s.ex.push(e.id);
      shapes.set(k, s);
    }
  L.push(`| # | shape | count |${termRefs ? ' reached |' : ''} why | examples |`);
  L.push(`|---|---|---|${termRefs ? '---|' : ''}---|---|`);
  let i = 0;
  for (const [k, s] of [...shapes].sort((a, b) => b[1].n - a[1].n).slice(0, 30)) {
    const why = entries
      .flatMap((e) => allOutcomes(e))
      .find((o) => (o.kind === 'unexpressible' || o.kind === 'dropped') && `${shapeOf(o)}${o.kind === 'dropped' ? `  [${o.detail!.split(':')[0]}]` : ''}` === k)?.detail;
    L.push(`| ${++i} | \`${md(k)}\` | ${s.n} |${termRefs ? ` ${s.reached} |` : ''} ${md((why ?? '').slice(0, 90))} | ${s.ex.map(md).join('<br>')} |`);
  }
  L.push('');

  // ── 7. Worst referenced classes ──
  L.push('## 7. The 20 most page-referenced classes that came out lossy or wrong');
  L.push('');
  L.push(`Ranked by \`s.class\` references from src/pages/** runtime files (refs.ts: regex over imports of .module.css; ${refs.dynamic} dynamic \`s[expr]\` references not attributable).${termRefs ? ' Only classes reached by the terminal are listed.' : ''}`);
  L.push('');
  const worst = entries
    .filter((e) => e.status === 'partial' || e.status === 'untranslatable')
    .map((e) => ({ e, n: refs.pages.get(e.id) ?? 0 }))
    .filter((x) => x.n > 0 && (!termRefs || isReached(x.e)))
    .sort((a, b) => b.n - a.n)
    .slice(0, 20);
  L.push('| # | class | page refs | what is lost | suggestion |');
  L.push('|---|---|---|---|---|');
  i = 0;
  for (const { e, n } of worst) {
    const lost = allOutcomes(e)
      .filter((o) => o.kind === 'unexpressible' || o.kind === 'lossy' || (o.kind === 'dropped' && o.detail?.includes('(layout)')))
      .map((o) => `${o.kind === 'dropped' ? 'dropped ' : o.kind === 'lossy' ? '~' : '✗ '}${o.decl}${o.via && o.kind !== 'dropped' ? ` [${o.via}]` : ''}`);
    const uniq = [...new Set(lost)];
    L.push(`| ${++i} | ${e.id} | ${n} | ${md(uniq.slice(0, 4).join('; ').slice(0, 220))}${uniq.length > 4 ? ` (+${uniq.length - 4})` : ''} | ${md(suggest(e))} |`);
  }
  L.push('');
  const statusRefs = { full: 0, partial: 0, untranslatable: 0, empty: 0 } as Record<string, number>;
  for (const e of entries) statusRefs[e.status] = (statusRefs[e.status] ?? 0) + (refs.pages.get(e.id) ?? 0);
  const totRefs = Object.values(statusRefs).reduce((a, b) => a + b, 0);
  if (termRefs) {
    const tr = { full: 0, partial: 0, untranslatable: 0, empty: 0 } as Record<string, number>;
    for (const e of entries) tr[e.status] = (tr[e.status] ?? 0) + (termRefs.get(e.id) ?? 0);
    const tot = Object.values(tr).reduce((a, b) => a + b, 0);
    L.push(`References from files the terminal loads, by status: full ${tr.full} (${pct(tr.full!, tot)}), partial ${tr.partial} (${pct(tr.partial!, tot)}), untranslatable ${tr.untranslatable}, empty ${tr.empty}.`);
    L.push('');
  }
  L.push(`Page references by status: full ${statusRefs.full} (${pct(statusRefs.full!, totRefs)}), partial ${statusRefs.partial} (${pct(statusRefs.partial!, totRefs)}), untranslatable ${statusRefs.untranslatable}, empty ${statusRefs.empty}; ${[...refs.pages.keys()].filter((k) => !table.classes[k]).length} referenced names have no class in their module (typos or classes from another module).`);
  L.push('');

  // ── 8. Ambiguous decisions ──
  L.push('## 8. Ambiguous decisions made');
  L.push('');
  for (const d of AMBIGUOUS) L.push(`- ${d}`);
  L.push('');

  // ── 9. Integration ──
  L.push('## 9. For the runtime integrator');
  L.push('');
  for (const d of INTEGRATION) L.push(`- ${d}`);
  L.push('');
  return L.join('\n');
}

/** One-line suggestion for a lossy class. */
export function suggest(e: ClassEntry): string {
  const os = allOutcomes(e);
  const has = (re: RegExp, kinds: OutcomeKind[] = ['unexpressible', 'lossy', 'dropped']): boolean =>
    os.some((o) => kinds.includes(o.kind) && (re.test(o.decl) || re.test(o.detail ?? '')) && (o.kind !== 'dropped' || o.detail?.includes('(layout)')));
  if (has(/grid-template-areas|subgrid/)) return 'needs a `.term.tsx` sibling: named areas/subgrid have no flex form';
  if (has(/auto-fit|auto-fill/)) return 'translate better: repeat(auto-fit, minmax(W, 1fr)) → a wrapping row of min-width W children';
  if (has(/fixed/)) return 'needs a `.term.tsx` sibling: viewport-fixed overlay (the runtime has no fixed layer)';
  if (has(/grid placement/)) return 'translate better: a parent-aware pass (span-all is a no-op in the one-column fallback)';
  if (has(/^display: grid/) || has(/tracks → grid/)) return 'runtime: apply grid.childStyles (exact with ≤ tracks children); a row of cells → kit Row with fixed-width cells';
  if (has(/:has|interaction|pseudo-element|sibling|no-class-subject/, ['dropped'])) return 'needs a `.term.tsx` sibling: layout depends on :hover/:has/::before/child selectors';
  if (has(/set at run time/)) return 'runtime: resolve the custom property set from a style attribute, or a `.term.tsx` sibling';
  if (has(/vw unit|vh unit|dvh|cq/)) return 'translate better: map viewport/container units to the terminal size at run time';
  if (has(/sticky/)) return 'accept (sticky → in flow); a `.term.tsx` sibling only if it must stay on screen';
  const layoutOnly = (e.outcomes.every((o) => /^(display|flex|gap|row-gap|column-gap|align-items|justify-content|min-width|min-inline-size|flex-wrap|flex-direction)/.test(o.decl) || o.kind === 'paint' || o.kind === 'meta'));
  if (has(/inline-flex/) && layoutOnly) return `replace wrapper by kit Row (gap ${e.style.columnGap ?? 0} cols): inline-flex has no inline flow`;
  if (has(/inline-flex/)) return 'accept: inline-flex laid out as a flex box (shrink-wrap lost only in a block parent)';
  if (has(/rule: a 1px line/)) return 'runtime: draw the divider as a rule row (or drop it); the border costs a full row';
  if (has(/hairline/)) return 'accept: a 1-2px bar drawn as one cell';
  if (has(/read as a WIDTH/)) return 'accept if the parent is a row; else a `.term.tsx` sibling';
  if (has(/opacity/)) return 'accept: opacity → dim';
  return 'translate better: see the outcomes in the table';
}

const AMBIGUOUS = [
  'Width class: one assumed width for the viewport AND every container (narrow = 56 cols = 448 px, between the 440 and 480 px breakpoints). An inner container (a card, a pane) is narrower than the viewport in reality, so a few small-container branches (`ytiles (width < 300px)`, `(width < 160px)`) are skipped although they might apply.',
  '`(hover: none)` is TRUE (a terminal cannot hover, so always-visible fallbacks apply) while `(pointer: coarse)` is FALSE (no touch-size growth). `pointer: fine` is true.',
  'Spacing vs size scales: gap/padding/margin use the stepped token scale (4px → 1 col, 8px → 0 rows); widths/heights are linear. A 4px padding therefore costs a column while a 4px width is 0.5 → 1 column too (minimum 1 for a positive size).',
  'Spacing scale source: `src/term/prim/tokens.ts` (`SPACE` and `spaceCells`; --sp-0..--sp-8 give columns [0,1,1,1,2,2,3,3,4] and rows [0,0,0,1,1,1,2,2,2]). units.ts uses that same function, so module CSS and primitives space alike, and units.term.test.ts pins those values.',
  'Vertical sizes under 64 px are one row (a control/row height); 64 px and up are px/16. A 56 px two-line row is one row; a 64 px header four rows.',
  '`flex-basis` in px (and `flex: 1 1 220px`) is read as a WIDTH: the parent\'s direction is not known when translating a class. Marked lossy.',
  '`flex-basis: N%` becomes `width: N%` + basis auto (OpenTUI\'s flexBasis takes no percent; in a wrapping row this keeps the "own line" effect).',
  '`inline-flex` / `inline-block` are laid out as boxes (marked lossy): in a block parent CSS shrink-wraps them on a text line; Yoga stretches them across. Most sit in flex rows, where nothing changes.',
  'A numeric width/height without an explicit flex-shrink gets `flexShrink: 1`, because CSS shrinks sized flex items and OpenTUI would set 0 (Renderable.ts: explicit numeric width/height ⇒ shrink 0). CSS also clamps flex items at their content minimum (`min-width: auto`); Yoga\'s minimum is 0. That difference is runtime-wide and not patched per class.',
  'Custom properties a class reads but does not declare are looked up in tokens.css / module `:root` first, then in other rules of the same module (an ancestor element, presumably: Logs `.row` reads `--cols` from `.list`); when several rules of the module declare different values, the first plain `.class` rule wins and the class gets a note.',
  'Borders: a full four-sided frame is translated (a box-drawing frame costs one cell per side); a one-sided rule (`border-block-end: 1px solid`) is marked lossy because the 1 px line becomes a whole row or column. The runtime may drop dividers instead.',
  '`background: transparent/none` emits `bg: "none"` (explicit no fill, so a variant can clear a base fill).',
  'Colours keep the first GLOBAL token of the var() chain (`var(--local)` → `--local: var(--hx-muted)` → `token:--hx-muted`); `color-mix()` and gradients keep their first token and are marked lossy; a name with no CSS value (set at run time, like `--rc`) is kept as a token with a note.',
  '`opacity` 0.06-0.84 → `dim` (lossy); ≤ 0.05 is treated as paint (an element revealed by a dropped hover/focus rule); ≥ 0.85 opaque.',
  '`position: sticky` stays in flow (lossy) and its offsets are not applied; `position: fixed` and its offsets are not expressible; `absolute` is translated (Yoga positions it in its parent, CSS in the nearest positioned ancestor).',
  '`overflow` x and y fold into one OpenTUI `overflow`; auto/scroll on either axis ⇒ `scroll` (the runtime must provide a scroll box).',
  'Structural pseudo-classes (`:first-child`, `:last-child`, `:nth-child`, `:empty`) and states (`:disabled`, `:checked`) are kept as variant conditions rather than dropped, so a runtime that knows child index or props can honour them; one that does not must skip them.',
  'Rules under `:root[data-hx-theme="dark"]` (and `:global(:root[data-hx-theme=dark])`) are applied as base rules with their higher specificity (dark is the default theme).',
  'One-column grids (`grid-template-columns: minmax(0, 1fr)`) are exact; a one-column grid whose track is a fixed width narrower than the box (`minmax(0, 720px)`) is not translated (it would be a max-width, but the box width is unknown).',
  '`env(safe-area-inset-*)` without fallback is 0 (a terminal has no safe area).',
];

const INTEGRATION = [
  'Build: `bun hub/scripts/term/css-translate.ts --out <dir>/css-table.json [--report <file.md>] [--width narrow|medium|wide|<cols>]` (about 7 s for 203 modules).',
  'Runtime import (no node built-ins): `import { createStyleLookup } from \'<hub>/scripts/term/css-translate/lookup\'` and `import type { Table, ClassEntry } from \'<hub>/scripts/term/css-translate/types\'`; `const css = createStyleLookup(table)`; `css.styleOf(classId): ClassEntry | undefined`, `css.stylesOf(className: string | undefined | null): ClassEntry[]` (splits on whitespace, skips unknown tokens), `css.moduleExports(cssPath: string): Record<string, string>`.',
  'Build-time (node): `import { buildTable, styleOf, moduleExports, cssModuleSource, loadTable, useTable } from \'<hub>/scripts/term/css-translate\'`. A Vite `load(id)` hook for `*.module.css` in the terminal build returns `cssModuleSource(id)` = `export default {"row": "pages/logs/parts/Logs.module.css#row", …};` so `cx(s.a, s.b)` produces a className string of class ids.',
  'Class id = `<path relative to hub/src>#<local name>`; `moduleKey()` normalises absolute, `hub/src/…` and `src/…` paths.',
  '`style` keys are OpenTUI LayoutOptions/BoxOptions names in cells (`rowGap`, `columnGap`, `paddingLeft`, `minWidth`, …; edges are always longhands). Merge the entries of a className in order, then variants (already sorted by specificity, then source order).',
  'A box with no `flexDirection` is a block: Yoga\'s default column matches. Do not default boxes to row.',
  '`text` carries fg/bg as `token:--name` (or `literal:`/`none`), bold/italic/underline/strikethrough/dim, plus `transform`, `wrap` (`none` = nowrap), `truncate`, `maxLines`, `align`. It inherits like CSS colour (the host mergeStyle already does this).',
  '`hidden: true` = display none; `contents: true` = render children without a box; `grid` = per-child styles with a column fallback (see lookup.ts header); `border` is optional and costs cells.',
  '`status`/`outcomes`/`notes` are diagnostics: ship them in a dev build only (the table is ~3 MB with them; strip `outcomes` for the bundle).',
];
