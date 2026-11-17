// COVERAGE.md: the human view of the analysis (graph.ts --md). The JSON (--json) carries everything; this keeps the
// totals, the head of the work-list, the per-page table and the surprises.
import type { Analysis, EntryOut, NameKind, NameStatus, ReasonOut } from './analyse';
import type { Finding } from './rules';

export interface ReportMeta { generatedAt: string; hub: string; ms: number; runtime: number; excluded: number; siblings: number; command: string; top: number }

const KINDS: NameKind[] = ['component', 'hook', 'value', 'type'];
const STATUSES: NameStatus[] = ['shared', 'ported', 'needs-sibling', 'handoff', 'type'];

export function kitSummary(a: Analysis): Record<NameKind, Record<NameStatus, number>> {
  const out = {} as Record<NameKind, Record<NameStatus, number>>;
  for (const k of KINDS) out[k] = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<NameStatus, number>;
  for (const n of a.kit) out[n.kind][n.status]++;
  return out;
}

const short = (f: string) => f.replace(/^src\//, '');
const reasonText = (rs: readonly ReasonOut[], max = 4) => {
  const parts = rs.map((r) => (r.kind === 'css' || r.kind === 'css-module' ? `${r.kind}:${r.lines[0]}` : `${r.detail}:${r.lines.slice(0, 3).join(',')}${r.lines.length > 3 ? '…' : ''}`));
  return parts.slice(0, max).join('; ') + (parts.length > max ? ` (+${parts.length - max})` : '');
};
const esc = (s: string) => s.replace(/\|/g, '\\|');

export function renderMd(a: Analysis, meta: ReportMeta, findings: Finding[] | null): string {
  const L: string[] = [];
  const classes: Record<string, number> = {};
  for (const m of Object.values(a.modules)) if (!m.isSibling) classes[m.class] = (classes[m.class] ?? 0) + 1;
  const ks = kitSummary(a);
  const tot = (k: NameKind) => Object.values(ks[k]).reduce((x, y) => x + y, 0);
  L.push(`# Hub terminal coverage (generated ${meta.generatedAt})`, '');
  L.push(`Tool: \`${meta.command}\` (hub/scripts/term/graph.ts, ${meta.ms} ms). Hub: ${meta.hub}. ${meta.runtime} runtime modules (${meta.excluded} test/spec/shots/fixture files excluded), ${meta.siblings} \`.term\` siblings.`);
  L.push('', 'Model: edges follow imported NAMES through re-exports (the bundler\'s tree-shaken view); type-only imports are no edges; a `.term` sibling replaces its base; a closure stops at the first web-only module (the place a sibling goes). Web-only = imports CSS (module or plain), a web-only package (scripts/term/resolve.ts WEB_ONLY_PACKAGES: react-dom, react-aria*, @react-aria/*, @react-stately/*, @tanstack/react-virtual, ...), or touches a strict-globals.ts global, window/self members, DOM element members (any receiver for unambiguous ones like getBoundingClientRect/scrollTop/querySelector; ref/event-target receivers for focus/blur/contains/...), or canvas. Raw intrinsic JSX is debt only.', '');

  const seams = Object.entries(a.modules).filter(([, m]) => m.seamSites).map(([f]) => short(f));
  if (seams.length) L.push(`Host seams (scripts/term/graph/seams.json): ${seams.length} modules already in the terminal bundle whose browser-global sites sit on web paths the terminal env replaces; listed, not counted as web-only (proof: the strict-globals ledger): ${seams.join(', ')}.`, '');
  L.push('## Totals', '');
  L.push(`Modules (base files): ${Object.entries(classes).sort().map(([k, v]) => `${k} ${v}`).join(', ')}. Of the web-only ones, ${a.cssOnly.length} are web-only ONLY because of a CSS-module import (shared once css-translate maps them).`, '');
  L.push('| kind | total | shared | ported | needs-sibling | handoff |', '|---|---|---|---|---|---|');
  for (const k of KINDS) {
    if (k === 'type') { L.push(`| type | ${tot('type')} | (erased: cost nothing) | | | |`); continue; }
    L.push(`| ${k} | ${tot(k)} | ${ks[k].shared} | ${ks[k].ported} | ${ks[k]['needs-sibling']} | ${ks[k].handoff} |`);
  }
  L.push('', `**Free today:** ${ks.hook.shared}/${tot('hook')} hooks and ${ks.value.shared}/${tot('value')} values are \`shared\` (their whole terminal closure is terminal-safe), and ${ks.component.shared}/${tot('component')} components.`);
  const kc = a.kitSafeIfCssModulesTranslate;
  L.push(`If CSS modules translate (scripts/term/resolve.ts already serves a \`.module.css\` import as a class table for css-translate), terminal-safe names (shared + ported) rise to ${kc.component ?? 0} components, ${kc.hook ?? 0} hooks, ${kc.value ?? 0} values (rerun with --css-modules-ok for that whole view).`);
  L.push(`Import sites in page/shell files: ${a.sites}; ${a.blockedSites} reach a web-only module. Work-list: ${a.worklist.length} sibling files cover all of them.`, '');
  const gate = a.barrel.kitImpure;
  if (gate) L.push(`**Barrel gate:** \`@kit\` is one barrel on both sides. The web build marks kit modules side-effect free except the ${gate.listed} in vite.config.mts KIT_IMPURE; the barrel reaches ${gate.reached.length} of them, and they run whenever anything imports \`@kit\`. Their terminal closures stop at **${gate.blocked.length} web-only modules** (${gate.blockedIfCssModulesTranslate} if CSS modules translate): until each has a sibling (or leaves KIT_IMPURE), NO page bundles in the terminal, whatever its own status says. Without that plugin in the terminal build it is worse: ${a.barrel.withoutKitPure.withLoadEffects.length} of the ${a.barrel.withoutKitPure.modules} re-exported modules have load-time effects (${a.barrel.withoutKitPure.blocked} web-only modules on their frontier). The per-page numbers below assume the terminal build keeps the kit-pure treatment.`, '');

  L.push(`## Work-list (top ${meta.top} of ${a.worklist.length})`, '');
  L.push('Greedy cover of the blocked page/shell import sites: each step takes the file with the most fractional credit (an import site blocked by k remaining files gives 1/k to each), so a step either completes imports or is the cheapest progress. `now` = import sites fully unblocked by this file given the files above it; `cum` = running total; `sites` = sites it is on the path of. Full list with exports per file: COVERAGE.json `worklist`.', '');
  L.push('| # | file | lines | why web-only | kit names (importers) | sites | now | cum | completes |', '|---|---|---|---|---|---|---|---|---|');
  for (const w of a.worklist.slice(0, meta.top)) {
    const names = w.kitNames.sort((x, y) => y.importers - x.importers);
    const nm = names.slice(0, 6).map((n) => `${n.name} ${n.importers}`).join(', ') + (names.length > 6 ? ` +${names.length - 6}` : '') || (w.exports.slice(0, 4).join(', ') || '-');
    const why = w.missing && w.reasons.length === 0
      ? `sibling lacks ${w.missing.slice(0, 5).join(', ')}${w.missing.length > 5 ? ` +${w.missing.length - 5}` : ''}`
      : w.cssOnly ? 'css-module only' : reasonText(w.reasons);
    L.push(`| ${w.rank} | ${short(w.file)}${w.split ? ' [split]' : ''}${w.fixInPlace ? ' [fix in place]' : ''}${w.missing ? ` [complete: ${w.missing.length} missing]` : ''} | ${w.lines} | ${esc(why)} | ${esc(nm)} | ${w.demand} | ${w.unblocksNow} | ${w.cumulative} | ${w.pagesCompleted.join(', ') || '-'} |`);
  }
  L.push('', '[split] = the file also holds pure exports that pages import (see "Pure helpers trapped" below): split first and the sibling gets smaller, or is not needed. [fix in place] = every reason is a runtime global spelled through window (window.setTimeout...): write `setTimeout`, no sibling.', '');

  L.push('## Pages and shell', '');
  L.push('Entry: `page.ts` (its `load: () => import(\'./view\')` and other dynamic imports followed); shell: ' + a.shell.entry.map(short).join(' + ') + '; terminal entry: ' + a.termEntry.entry.map(short).join(', ') + '. `blockers` = web-only modules on the terminal frontier (kit / own folder / other); `if css` = blockers if CSS modules translate. Debt and global sites summed over every reachable module.', '');
  L.push('| entry | status | reachable (own) | blockers kit/own/other | if css | handoffs | raw debt | global sites | top blockers |', '|---|---|---|---|---|---|---|---|---|');
  const row = (name: string, e: EntryOut) => {
    const kitN = e.blockersByGroup.kit ?? 0, ownN = e.blockersByGroup.own ?? 0;
    const other = e.blockers.length - kitN - ownN;
    const top = e.blockers.slice(0, 4).map((b) => `${short(b.file)} (${b.refs})`).join(', ');
    L.push(`| ${name} | ${e.status} | ${e.reachable} (${e.reachableOwn}) | ${e.blockers.length}: ${kitN}/${ownN}/${other} | ${e.blockersIfCssModulesTranslate} | ${e.handoffs.length} | ${e.rawDebt} | ${e.globalSites} | ${esc(top)} |`);
  };
  for (const [p, e] of Object.entries(a.pages).sort((x, y) => x[1].blockers.length - y[1].blockers.length)) row(p, e);
  row('**shell**', a.shell);
  row('**term entry**', a.termEntry);
  L.push('');

  L.push('## Surprises', '');
  L.push(`1. **Barrel side effects.** See "Barrel gate" above. The barrel itself is not a pure re-export file: it defines ${a.barrel.localCode.join(', ') || 'nothing'} locally (a dynamic import of a fixture catalogue behind __HUB_FIXTURES__).` + (gate ? ` Web-only modules the KIT_IMPURE set drags in: ${gate.blocked.slice(0, 25).map(short).join(', ')}${gate.blocked.length > 25 ? ` … (${gate.blocked.length})` : ''}.` : ''));
  const tr = a.trapped.slice(0, 20);
  L.push('', `2. **Pure helpers trapped in web-only files** (${a.trapped.length} files). Their exports below have no web-only site, no JSX, no web binding and only terminal-safe imports, and page/shell files import them; split them into a sibling-free module and they become \`shared\` today:`, '');
  L.push('| file | pure exports imported by pages | import sites | suggestion |', '|---|---|---|---|');
  for (const t of tr) L.push(`| ${short(t.file)} | ${esc(t.pure.slice(0, 8).join(', '))}${t.pure.length > 8 ? ` +${t.pure.length - 8}` : ''} | ${t.demand} | ${esc(t.suggestion)} |`);
  L.push('', `3. **Load-time web-only code** (${a.moduleScope.length} modules touch a browser global or DOM member at module scope: importing them throws under strict globals even if nothing calls them): ${a.moduleScope.slice(0, 20).map((m) => `${short(m.file)} [${m.sites.slice(0, 3).join(' ')}]`).join('; ')}${a.moduleScope.length > 20 ? ' …' : ''}.`);
  L.push('', `4. **\`typeof window\` guards still throw** in the terminal (strict-globals.ts traps the getter, and typeof reads it): ${a.typeofGuards.length} sites, e.g. ${a.typeofGuards.slice(0, 8).map((t) => `${short(t.file)}:${t.line}`).join(', ')}.`);
  const harmful = a.emptyKept.filter((e) => e.harm);
  L.push('', `5. **Inline-type-only imports are not erased.** \`import { type X } from 'y'\` becomes \`import {} from 'y'\` under verbatimModuleSyntax, so the bundle still evaluates y. Counted as no edge here (as the rules require), but ${a.emptyKept.length} such imports exist, ${harmful.length} of them load a web-only package or a module with load-time CSS/DOM: ${harmful.slice(0, 10).map((e) => `${short(e.file)}:${e.line} → ${short(e.target)}`).join(', ')}${harmful.length > 10 ? ' …' : ''}. Fix: \`import type { X }\`.`);
  L.push('', `5b. **Fix in place, no sibling:** ${a.fixInPlace.length} modules are web-only only because they spell a runtime global through window (\`window.setTimeout\`, \`window.clearTimeout\`...; strict-globals.ts traps every window member but origin): ${a.fixInPlace.map(short).join(', ') || '-'}. Write the bare global.`);
  L.push('', `6. **CSS-only web-only:** ${a.cssOnly.length} modules (${a.cssOnly.filter((f) => f.startsWith('src/kit/')).length} in the kit) are web-only only through a CSS-module import; the "if css" column shows what css-translate alone would buy per page.`);
  if (a.excludedEdges.length) L.push('', `7. **Runtime imports of excluded (test/fixture) files:** ${a.excludedEdges.length}: ${[...new Set(a.excludedEdges.map((e) => `${short(e.file)} → ${short(e.to)}`))].slice(0, 12).join(', ')}${a.excludedEdges.length > 12 ? ' …' : ''}. Not followed; the bundle rules refuse fixture modules outside core.`);
  if (a.unresolved.length || a.unresolvedNames.length) L.push('', `8. **Unresolved:** ${a.unresolved.map((u) => `${short(u.file)}:${u.line} '${u.spec}'`).join(', ') || 'no specifiers'}; names: ${a.unresolvedNames.map((u) => `${short(u.file)}:${u.line} ${u.name} from '${u.spec}'`).join(', ') || 'none'}.`);
  if (a.webOnlySiblings.length) L.push('', `9. **Siblings that are themselves web-only:** ${a.webOnlySiblings.map(short).join(', ')}.`);
  if (a.contractDrift.notInContract.length || a.contractDrift.notInBarrel.length) L.push('', `10. **Kind source drift** (kinds come from term/kit/contract.names.gen.ts; regenerate it): barrel values not in it: ${a.contractDrift.notInContract.join(', ') || '-'}; listed but not exported: ${a.contractDrift.notInBarrel.join(', ') || '-'}.`);
  // Derived from the code (graph/handoffs.ts), never a hand list.
  const h = a.handoffs;
  L.push('', `11. Hand-offs (derived: a sibling that draws <Handoff>): names ${h.names.join(', ') || 'none'}; pages ${h.pages.join(', ') || 'none'}; ${h.sites.length} modules draw it.`);
  if (a.handoffCheck.length) L.push(`    **Hand-off problems:** ${a.handoffCheck.join('; ')}.`);
  L.push('');

  if (findings) {
    L.push('## Check', '');
    const by = (s: string) => findings.filter((f) => f.severity === s).length;
    L.push(`${by('error')} errors, ${by('warn')} warnings, ${by('info')} notes.`, '');
    for (const f of findings.slice(0, 60)) L.push(`- ${f.severity.toUpperCase()} ${f.rule}: ${f.message}`);
    if (findings.length > 60) L.push(`- … ${findings.length - 60} more (JSON \`check\`).`);
    L.push('');
  }
  L.push('## Commands', '');
  L.push('```', 'bun hub/scripts/term/graph.ts --json <out-dir>/COVERAGE.json --md <out-dir>/COVERAGE.md', 'bun hub/scripts/term/graph.ts --check                 # R1-R5; exit 1 on an error', 'bun hub/scripts/term/graph.ts --check --rules R2,R5    # some rules only (or --no-R3 ...)', 'bun hub/scripts/term/graph.ts --update-baseline       # record R3/R4 counts in graph/baseline.json', 'bun hub/scripts/term/graph.ts --css-modules-ok ...    # treat .module.css as translatable', '(cd hub/scripts/term/graph && bun test)                # the tool\'s own tests', '```', '');
  return L.join('\n');
}
