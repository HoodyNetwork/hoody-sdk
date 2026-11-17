// What the terminal graph says: each module's class, each kit export's status, each page's blockers, the ordered
// work-list of sibling files, and the surprises (barrel side effects, pure helpers trapped in web-only files, ...).
import fs from 'node:fs';
import path from 'node:path';
import { deriveHandoffs, type Handoffs } from './handoffs';
import type { Reason } from './scan';
import type { Identity, ModuleGraph } from './build';

export type ModClass = 'shared-clean' | 'shared-with-debt' | 'web-only' | 'has-sibling' | 'handoff';
export type NameStatus = 'shared' | 'needs-sibling' | 'ported' | 'handoff' | 'type';
export type NameKind = 'component' | 'hook' | 'value' | 'type';

export interface AnalyseOptions {
  /** CSS modules count as translatable (css-translate), not web-only. Plain .css stays web-only. */
  cssModulesOk?: boolean;
  barrel: string;
  pagesDir: string;
  shellEntries: string[];
  termEntries: string[];
  /** Web build entries for reachedByWeb() (default src/app/main.tsx and the one-file Hub's src/standalone/entry.tsx);
   *  shell entries and page modules are added. */
  webEntries?: string[];
  /** Extra hand-off names (synthetic tests only). The real list is DERIVED (graph/handoffs.ts): a kit name whose terminal
   *  sibling's own declaration draws <Handoff>. */
  handoffNames: string[];
  handoffFiles: string[];
  /** Host seams (seams.json): their global / DOM-member sites do not make them web-only. */
  seams: string[];
  /** Consumer code a closure passes through even when web-only (its sibling keeps the same imports): pages, shell. */
  passThrough: string[];
  /** KIT_IMPURE from vite.config.mts (paths relative to src/), or null. */
  kitImpure: string[] | null;
  /** contract.names.gen.ts lists, or null. */
  contract: { components: string[]; hooks: string[]; values: string[] } | null;
}

export interface ReasonOut { kind: Reason['kind']; detail: string; lines: number[]; moduleScope: boolean }

export interface ModOut {
  class: ModClass;
  sibling?: string;
  isSibling?: boolean;
  base?: string;
  lines: number;
  folder: string;
  reasons: ReasonOut[];
  raw: number;
  rawTags: Record<string, number>;
  globalSites: number;
  cssOnly?: boolean;
  /** seams.json: these global / DOM sites are run-time seams, not web-only reasons. */
  seamSites?: ReasonOut[];
  /** Every reason is `window.setTimeout`-style: a runtime global spelled through window. Fix in place, no sibling. */
  fixInPlace?: boolean;
}

export interface FrontierResult { visited: Set<string>; frontier: Set<string>; handoffs: Set<string>; excluded: Set<string> }

export function folderOf(id: string): string {
  const p = id.split('/');
  if (p[0] !== 'src') return p[0] ?? id;
  if (p[1] === 'pages' && p.length > 3) return 'src/pages/' + p[2];
  if (p[1] === 'kit') return p.length > 3 ? 'src/kit/' + p[2] : 'src/kit';
  if (p[1] === 'term' && p.length > 3) return 'src/term/' + p[2];
  return 'src/' + (p.length > 2 ? p[1] : '(root)');
}

export function groupOf(id: string, own: string): string {
  if (id.startsWith(own)) return 'own';
  if (id.startsWith('src/kit/')) return 'kit';
  if (id.startsWith('src/pages/')) return 'page:' + id.split('/')[2];
  const p = id.split('/');
  return p[1] ?? 'other';
}

function compactReasons(rs: readonly Reason[]): ReasonOut[] {
  const by = new Map<string, ReasonOut>();
  for (const r of rs) {
    const k = r.kind + '|' + r.detail;
    const o = by.get(k) ?? { kind: r.kind, detail: r.detail, lines: [], moduleScope: false };
    if (!o.lines.includes(r.line)) o.lines.push(r.line);
    o.moduleScope ||= r.moduleScope && (r.kind === 'global' || r.kind === 'dom-member' || r.kind === 'canvas');
    by.set(k, o);
  }
  return [...by.values()];
}

/** Classification and closures under one notion of web-only (CSS modules web-only or translatable). */
export class Classifier {
  private readonly fmemo = new Map<string, FrontierResult>();
  readonly handoffIds: Set<string>;
  readonly handoffModules = new Set<string>();

  constructor(readonly g: ModuleGraph, readonly o: AnalyseOptions, handoffIdentities: ReadonlySet<string>) {
    this.handoffIds = new Set(handoffIdentities);
    for (const f of o.handoffFiles) this.handoffModules.add(f);
    for (const m of g.mods.values()) {
      if (!m.facts || m.isSibling) continue;
      const vals = m.facts.locals.filter((l) => !l.type);
      if (vals.length > 0 && vals.every((l) => this.handoffIds.has(m.id + '#' + l.name))) this.handoffModules.add(m.id);
    }
  }

  reasons(id: string): Reason[] {
    const f = this.g.mods.get(id)?.facts;
    if (!f) return [];
    const seam = this.o.seams.includes(id);
    // Terminal-only code (siblings, src/term/**, termOnly()): its refs are OpenTUI renderables (scrollTop, focus() are theirs too).
    const termCode = this.g.mods.get(id)?.isSibling || id.startsWith('src/term/') || this.termOnly(id);
    return f.reasons.filter((r) => !(this.o.cssModulesOk && r.kind === 'css-module') && !(seam && isSeamKind(r)) && !(termCode && r.kind === 'dom-member'));
  }

  private webReach: Set<string> | null = null;
  private termList: Set<string> | null = null;

  /** TERMINAL_ONLY_MODULES of src/app/conformance/termFiles.ts (one `'path': 'why',` entry per line, paths under src/):
   *  a file is forgiven only when it is an explicit entry there. No file = nothing forgiven. */
  listedTerminalOnly(): Set<string> {
    if (!this.termList) {
      let text = '';
      try { text = fs.readFileSync(path.join(this.g.hub, 'src/app/conformance/termFiles.ts'), 'utf8'); } catch { /* none */ }
      const block = /TERMINAL_ONLY_MODULES[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/.exec(text)?.[1] ?? '';
      this.termList = new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map((x) => 'src/' + x[1]));
    }
    return this.termList;
  }

  /** Every module the WEB build can load: a walk over web-mode runtime edges (dynamic imports and globs included) from
   *  the web entries, the shell entries and every non-sibling page module (over-approximated on purpose: more reach
   *  keeps more files flagged). */
  reachedByWeb(id: string): boolean {
    if (!this.webReach) {
      const seen = new Set<string>();
      const pages = this.o.pagesDir + '/';
      const roots = [...(this.o.webEntries ?? ['src/app/main.tsx', 'src/standalone/entry.tsx']), ...this.o.shellEntries];
      for (const m of this.g.mods.values()) if (m.id.startsWith(pages) && !m.isSibling && !m.excluded) roots.push(m.id);
      const queue = roots.filter((r) => this.g.mods.has(r));
      while (queue.length) {
        const x = queue.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        const m = this.g.mods.get(x);
        if (!m || m.excluded || m.isSibling) continue;
        for (const ed of this.g.edges('web', x).edges) if (!seen.has(ed.to)) queue.push(ed.to);
        // `import { type X } from 'y'` stays `import {} from 'y'` under verbatimModuleSyntax: the web still loads y.
        for (const imp of m.facts?.imports ?? []) {
          if (!imp.emptyKept) continue;
          const t = this.g.resolveSpec('web', imp.spec, x);
          if (t.kind === 'file') for (const w of this.g.whole('web', t.file)) if (!seen.has(w)) queue.push(w);
        }
      }
      this.webReach = seen;
    }
    return this.webReach.has(id);
  }

  /** A non-sibling module outside src/term/ that is terminal code all the same: it is listed in TERMINAL_ONLY_MODULES,
   *  imports src/term/prim at RUN time (a type-only import does not count) and no web entry reaches it. Its DOM-named members are OpenTUI renderables'
   *  (kit/layouts/termScroll.tsx: .scrollTop / .scrollBy on a ScrollBox). Only dom-member reasons are dropped for it. */
  termOnly(id: string): boolean {
    const m = this.g.mods.get(id);
    if (!m?.facts || m.excluded || m.isSibling || id.startsWith('src/term/')) return false;
    if (!this.listedTerminalOnly().has(id)) return false;
    if (!this.g.edges('term', id).edges.some((e) => e.to.startsWith('src/term/prim/'))) return false;
    return !this.reachedByWeb(id);
  }

  seamSites(id: string): Reason[] {
    const f = this.g.mods.get(id)?.facts;
    return f && this.o.seams.includes(id) ? f.reasons.filter(isSeamKind) : [];
  }

  passes(id: string): boolean { return this.o.passThrough.some((p) => id.startsWith(p)); }

  webOnly(id: string): boolean { return this.reasons(id).length > 0; }
  isHandoff(id: string): boolean { return this.handoffModules.has(id); }
  /** A terminal node the closure cannot pass: web-only and not a handoff. */
  blocked(id: string): boolean { return this.webOnly(id) && !this.isHandoff(id); }

  classOf(id: string): ModClass {
    const m = this.g.mods.get(id)!;
    if (m.sibling) return 'has-sibling';
    if (this.isHandoff(id)) return 'handoff';
    if (this.webOnly(id)) return 'web-only';
    return (m.facts?.rawTotal ?? 0) > 0 ? 'shared-with-debt' : 'shared-clean';
  }

  /** Terminal-graph BFS from `starts` (terminal nodes), stopping at blocked and handoff modules. A blocked module of
   *  consumer code (passThrough) is on the frontier but the walk goes on through it. */
  frontier(starts: readonly string[], skipGlob = true): FrontierResult {
    const key = starts.length === 1 ? starts[0]! : '';
    if (key && skipGlob) {
      const hit = this.fmemo.get(key);
      if (hit) return hit;
    }
    const r: FrontierResult = { visited: new Set(), frontier: new Set(), handoffs: new Set(), excluded: new Set() };
    const queue = [...starts];
    while (queue.length) {
      const id = queue.pop()!;
      if (r.visited.has(id)) continue;
      r.visited.add(id);
      const m = this.g.mods.get(id);
      if (!m || m.excluded) { r.excluded.add(id); continue; }
      if (this.isHandoff(id)) { r.handoffs.add(id); continue; }
      if (this.blocked(id)) { r.frontier.add(id); if (!this.passes(id)) continue; }
      const e = this.g.edges('term', id);
      for (const h of e.handoffUses) r.handoffs.add(h.identity.file + '#' + h.identity.name);
      for (const x of e.excludedTargets) r.excluded.add(x.to);
      for (const ed of e.edges) if (!(skipGlob && ed.glob) && !r.visited.has(ed.to)) queue.push(ed.to);
    }
    if (key && skipGlob) this.fmemo.set(key, r);
    return r;
  }

  frontierOfMods(mods: readonly string[]): Set<string> {
    const out = new Set<string>();
    for (const m of mods) for (const f of this.frontier([m]).frontier) out.add(f);
    return out;
  }
}

export interface KitName {
  name: string;
  kind: NameKind;
  file: string;
  status: NameStatus;
  /** needs-sibling: the nearest web-only modules on its closure (where siblings go). */
  needs: string[];
  /** Names this one rides along with in the same defining file. */
  importers: number;
  note?: string;
  /** Pure helper: no web-only site, JSX or web binding in its own declaration, imports terminal-safe. */
  pure?: boolean;
}

export interface Site { file: string; spec: string; name: string; line: number; identity?: string; blockers: Set<string> }

export interface EntryOut {
  entry: string[];
  reachable: number;
  reachableOwn: number;
  status: 'native-ready' | 'blocked';
  blockers: { file: string; group: string; refs: number; lines: number; reasons: string[] }[];
  blockersByGroup: Record<string, number>;
  blockersIfCssModulesTranslate: number;
  handoffs: string[];
  rawDebt: number;
  globalSites: number;
  excludedReached: string[];
}

export interface WorkItem {
  rank: number;
  file: string;
  folder: string;
  lines: number;
  reasons: ReasonOut[];
  cssOnly: boolean;
  fixInPlace: boolean;
  /** A sibling already exists: the runtime names of its base it does not export yet (complete it). */
  missing?: string[];
  exports: string[];
  kitNames: { name: string; kind: NameKind; importers: number }[];
  demand: number;
  importerFiles: number;
  unblocksNow: number;
  cumulative: number;
  pagesCompleted: string[];
  pagesHelped: string[];
  split?: { pure: string[]; demand: number; suggestion: string };
}

export interface Analysis {
  modules: Record<string, ModOut>;
  kit: KitName[];
  /** Kit names terminal-safe (shared or ported) if CSS modules translate (resolve.ts already maps them to class tables). */
  kitSafeIfCssModulesTranslate: Record<string, number>;
  pages: Record<string, EntryOut>;
  shell: EntryOut;
  termEntry: EntryOut;
  worklist: WorkItem[];
  sites: number;
  blockedSites: number;
  barrel: {
    file: string;
    localCode: string[];
    kitImpure: { listed: number; reached: string[]; blocked: string[]; blockedIfCssModulesTranslate: number } | null;
    withoutKitPure: { modules: number; withLoadEffects: string[]; blocked: number };
  };
  trapped: { file: string; pure: string[]; demand: number; suggestion: string }[];
  moduleScope: { file: string; sites: string[] }[];
  cssOnly: string[];
  /** Web-only only through `window.setTimeout`-style spellings of globals the terminal has. */
  fixInPlace: string[];
  emptyKept: { file: string; line: number; spec: string; target: string; harm: string }[];
  excludedEdges: { file: string; to: string; line: number }[];
  unresolved: { file: string; spec: string; line: number }[];
  unresolvedNames: { file: string; spec: string; name: string; line: number }[];
  typeofGuards: { file: string; name: string; line: number }[];
  webOnlySiblings: string[];
  contractDrift: { notInContract: string[]; notInBarrel: string[] };
  /** Derived hand-offs (handoffs.ts): kit names, the modules that draw <Handoff>, whole pages (page.ts `handoff`). */
  handoffs: Handoffs;
  /** Hand-off problems (R6): an empty, missing or empty-text reason. */
  handoffCheck: string[];
}

/** `window.X` / `self.X` where X is a global the terminal really has (strict-globals.ts keeps timers, URL, crypto...). */
const RUNTIME_GLOBAL = /^(window|self|globalThis)\.(setTimeout|clearTimeout|setInterval|clearInterval|queueMicrotask|structuredClone|crypto|performance|console|fetch|URL|URLSearchParams|TextEncoder|TextDecoder|AbortController|AbortSignal|atob|btoa|encodeURIComponent|decodeURIComponent|Promise|Date|Math|JSON|Intl|isFinite|isNaN|parseInt|parseFloat|Event|EventTarget|CustomEvent|DOMException|MessageChannel|Blob|WebSocket)$/;
export const isFixInPlace = (r: Reason) => r.kind === 'global' && RUNTIME_GLOBAL.test(r.detail);
const isSeamKind = (r: Reason) => r.kind === 'global' || r.kind === 'dom-member' || r.kind === 'canvas';

const RANK_GROUP = (g: string) => (g === 'kit' ? 0 : g === 'own' ? 1 : 2);

export function analyse(g: ModuleGraph, o: AnalyseOptions): Analysis {
  const barrel = o.barrel;
  const barrelExports = g.exportsOf('web', barrel);
  // Given names (synthetic tests) apply BEFORE any terminal name is resolved (resolveName memoizes).
  for (const n of o.handoffNames) {
    const r = g.resolveName('web', barrel, n);
    if (barrelExports.has(n) && r.identity) g.handoff.add(r.identity.file + '#' + r.identity.name);
  }
  // Hand-offs are derived from the code (handoffs.ts), never a hand list.
  const handoffs = deriveHandoffs(g, barrel, o.pagesDir);
  const handoffCheck = handoffs.problems;
  const handoffNames = [...new Set([...handoffs.names, ...o.handoffNames])].sort();
  // handoff identities (web definer file + local name)
  const handoffIdent = new Set<string>();
  for (const n of handoffNames) {
    const r = g.resolveName('web', barrel, n);
    if (barrelExports.has(n) && r.identity) handoffIdent.add(r.identity.file + '#' + r.identity.name);
  }
  // The graph applies handoff when it resolves a terminal name (no edge, a handoff use instead).
  for (const h of handoffIdent) g.handoff.add(h);
  const C = new Classifier(g, o, handoffIdent);
  const Ccss = new Classifier(g, { ...o, cssModulesOk: true }, handoffIdent);

  // ---- modules ----
  const modules: Record<string, ModOut> = {};
  const runtime = g.runtimeIds().sort();
  for (const id of runtime) {
    const m = g.mods.get(id)!;
    const f = m.facts!;
    const rs = C.reasons(id);
    modules[id] = {
      class: m.isSibling ? (C.webOnly(id) ? 'web-only' : f.rawTotal > 0 ? 'shared-with-debt' : 'shared-clean') : C.classOf(id),
      ...(m.sibling ? { sibling: m.sibling } : {}),
      ...(m.isSibling ? { isSibling: true, ...(m.base ? { base: m.base } : {}) } : {}),
      lines: f.lines,
      folder: folderOf(id),
      reasons: compactReasons(rs),
      raw: f.rawTotal,
      rawTags: f.raw,
      globalSites: f.globalSites,
      ...(rs.length > 0 && rs.every((r) => r.kind === 'css-module') ? { cssOnly: true } : {}),
      ...(C.seamSites(id).length ? { seamSites: compactReasons(C.seamSites(id)) } : {}),
      ...(rs.length > 0 && rs.every(isFixInPlace) ? { fixInPlace: true } : {}),
    };
  }

  // ---- import sites of page and shell files ----
  const isConsumer = (id: string) => id.startsWith(o.pagesDir + '/') || id.startsWith('src/shell/');
  const sites: Site[] = [];
  for (const id of runtime) {
    if (!isConsumer(id) || g.mods.get(id)!.isSibling) continue;
    for (const imp of g.mods.get(id)!.facts!.imports) {
      if (imp.kind === 'glob') continue;
      if (imp.kind === 'named' && imp.names.length === 0) continue;
      const tw = g.resolveSpec('web', imp.spec, id);
      const tt = g.resolveSpec('term', imp.spec, id);
      if (tw.kind !== 'file' || tt.kind !== 'file') continue;
      if (imp.kind === 'named') {
        for (const n of imp.names) {
          const rw = g.resolveName('web', tw.file, n);
          const rt = g.resolveName('term', tt.file, n);
          const ident = rw.identity ? rw.identity.file + '#' + rw.identity.name : undefined;
          const blockers = rt.handoff ? new Set<string>() : C.frontierOfMods(rt.mods);
          // A name the sibling does not export yet: the sibling is where the work is.
          if (rt.unresolved) for (const m of rt.mods) if (g.mods.get(m)?.isSibling) blockers.add(m);
          sites.push({ file: id, spec: imp.spec, name: n, line: imp.line, ...(ident ? { identity: ident } : {}), blockers });
        }
      } else {
        const mods = imp.kind === 'side' ? [tt.file] : g.whole('term', tt.file);
        sites.push({ file: id, spec: imp.spec, name: '*', line: imp.line, blockers: C.frontierOfMods(mods) });
      }
    }
  }
  const importersOf = new Map<string, Set<string>>();
  for (const s of sites) if (s.identity) { let x = importersOf.get(s.identity); if (!x) importersOf.set(s.identity, (x = new Set())); x.add(s.file); }

  // ---- kit names ----
  const contractKind = new Map<string, NameKind>();
  if (o.contract) {
    for (const n of o.contract.components) contractKind.set(n, 'component');
    for (const n of o.contract.hooks) contractKind.set(n, 'hook');
    for (const n of o.contract.values) contractKind.set(n, 'value');
  }
  const termBarrel = g.termOf(barrel);
  const kit: KitName[] = [];
  const kitByFile = new Map<string, KitName[]>();
  for (const [name, k] of [...barrelExports].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rw = g.resolveName('web', barrel, name);
    const file = rw.identity?.file ?? (rw.pkg ? 'pkg:' + rw.pkg : barrel);
    if (k === 'type') { kit.push({ name, kind: 'type', file, status: 'type', needs: [], importers: 0 }); continue; }
    const local = g.mods.get(file)?.facts?.locals.find((l) => l.name === rw.identity?.name);
    let kind: NameKind = contractKind.get(name) ?? (/^use[A-Z0-9]/.test(name) ? 'hook' : /^[A-Z]/.test(name) && (local?.jsx || local?.fn) && !/^[A-Z0-9_]+$/.test(name) ? 'component' : 'value');
    if (kind === 'type') kind = 'value';
    const ident = rw.identity ? rw.identity.file + '#' + rw.identity.name : '';
    const importers = importersOf.get(ident)?.size ?? 0;
    const item: KitName = { name, kind, file, status: 'shared', needs: [], importers };
    if (handoffNames.includes(name)) item.status = 'handoff';
    else if (rw.pkg) {
      item.status = g.isWebPackage(rw.pkg) ? 'needs-sibling' : 'shared';
      item.note = 'from package ' + rw.pkg;
    } else {
      const rt = g.resolveName('term', termBarrel, name);
      const needs = [...C.frontierOfMods(rt.mods)].sort();
      if (rt.unresolved) { item.status = 'needs-sibling'; item.note = 'the terminal side does not export it'; item.needs = [g.termOf(file)]; }
      else if (needs.length > 0) { item.status = 'needs-sibling'; item.needs = needs; }
      else item.status = g.mods.get(file)?.sibling ? 'ported' : 'shared';
    }
    if (local && !local.type) item.pure = local.pure && importsSafe(g, C, file, local.importRefs);
    kit.push(item);
    let arr = kitByFile.get(file);
    if (!arr) kitByFile.set(file, (arr = []));
    arr.push(item);
  }

  const kitSafeIfCssModulesTranslate: Record<string, number> = { component: 0, hook: 0, value: 0 };
  for (const n of kit) {
    if (n.kind === 'type' || n.status === 'handoff' || n.note?.startsWith('from package')) continue;
    const rt = g.resolveName('term', termBarrel, n.name);
    if (!rt.unresolved && Ccss.frontierOfMods(rt.mods).size === 0) kitSafeIfCssModulesTranslate[n.kind] = (kitSafeIfCssModulesTranslate[n.kind] ?? 0) + 1;
  }
  for (const n of kit) if (n.note?.startsWith('from package') && n.status === 'shared') kitSafeIfCssModulesTranslate[n.kind] = (kitSafeIfCssModulesTranslate[n.kind] ?? 0) + 1;

  // ---- entries: pages, shell, terminal entry ----
  const entryOut = (entries: string[], own: string): EntryOut => {
    const starts = [...new Set(entries.flatMap((e) => g.whole('term', g.termOf(e))))];
    const r = C.frontier(starts);
    const rc = Ccss.frontier(starts);
    const refs = new Map<string, number>();
    for (const v of r.visited) {
      if ((r.frontier.has(v) && !C.passes(v)) || !g.mods.get(v)?.facts) continue;
      const seen = new Set<string>();
      for (const e of g.edges('term', v).edges) if (r.frontier.has(e.to) && !seen.has(e.to)) { seen.add(e.to); refs.set(e.to, (refs.get(e.to) ?? 0) + 1); }
    }
    const blockers = [...r.frontier].map((f) => ({
      file: f, group: groupOf(f, own), refs: refs.get(f) ?? 0, lines: g.mods.get(f)?.facts?.lines ?? 0,
      reasons: [...new Set(C.reasons(f).map((x) => x.kind === 'global' || x.kind === 'dom-member' || x.kind === 'package' ? x.detail : x.kind))],
    })).sort((a, b) => RANK_GROUP(a.group) - RANK_GROUP(b.group) || b.refs - a.refs || a.file.localeCompare(b.file));
    const byGroup: Record<string, number> = {};
    for (const b of blockers) byGroup[b.group] = (byGroup[b.group] ?? 0) + 1;
    let raw = 0, glob = 0, ownN = 0;
    for (const v of r.visited) {
      const f = g.mods.get(v)?.facts;
      if (!f) continue;
      raw += f.rawTotal;
      glob += f.globalSites;
      if (v.startsWith(own)) ownN++;
    }
    return {
      entry: entries.map((e) => g.termOf(e)), reachable: [...r.visited].filter((v) => g.mods.get(v)?.facts).length, reachableOwn: ownN,
      status: r.frontier.size === 0 ? 'native-ready' : 'blocked', blockers, blockersByGroup: byGroup,
      blockersIfCssModulesTranslate: rc.frontier.size, handoffs: [...r.handoffs].sort(), rawDebt: raw, globalSites: glob,
      excludedReached: [...r.excluded].sort(),
    };
  };
  const pages: Record<string, EntryOut> = {};
  const pageNames = [...new Set(runtime.filter((id) => new RegExp('^' + o.pagesDir + '/[^/]+/page\\.ts$').test(id)).map((id) => id.split('/')[2]!))].sort();
  for (const p of pageNames) pages[p] = entryOut([`${o.pagesDir}/${p}/page.ts`], `${o.pagesDir}/${p}/`);
  const shell = entryOut(o.shellEntries.filter((e) => g.mods.has(e)), 'src/shell/');
  const termEntry = entryOut(o.termEntries.filter((e) => g.mods.has(e)), 'src/term/');

  // ---- work-list: greedy cover of blocked import sites ----
  const blockedSites = sites.filter((s) => s.blockers.size > 0);
  const fileElems = new Map<string, number[]>();
  const rem = blockedSites.map((s) => new Set(s.blockers));
  blockedSites.forEach((s, i) => { for (const b of s.blockers) { let a = fileElems.get(b); if (!a) fileElems.set(b, (a = [])); a.push(i); } });
  const score = new Map<string, number>();
  const now = new Map<string, number>();
  for (const [f, es] of fileElems) {
    score.set(f, es.reduce((acc, i) => acc + 1 / rem[i]!.size, 0));
    now.set(f, es.filter((i) => rem[i]!.size === 1).length);
  }
  const pageRem = new Map<string, Set<string>>();
  for (const [p, e] of Object.entries(pages)) pageRem.set('page:' + p, new Set(e.blockers.map((b) => b.file)));
  pageRem.set('shell', new Set(shell.blockers.map((b) => b.file)));
  const helped = new Map<string, string[]>();
  for (const [p, s] of pageRem) for (const f of s) { let a = helped.get(f); if (!a) helped.set(f, (a = [])); a.push(p); }
  const worklist: WorkItem[] = [];
  const picked = new Set<string>();
  let cumulative = 0;
  const lineCount = (f: string) => g.mods.get(f)?.facts?.lines ?? 0;
  while (picked.size < fileElems.size) {
    let best = '', bs = -1, bn = -1;
    for (const [f, sc] of score) {
      if (picked.has(f)) continue;
      const n = now.get(f) ?? 0;
      if (sc > bs + 1e-9 || (Math.abs(sc - bs) <= 1e-9 && (n > bn || (n === bn && (lineCount(f) < lineCount(best) || (lineCount(f) === lineCount(best) && f < best)))))) { best = f; bs = sc; bn = n; }
    }
    if (!best) break;
    picked.add(best);
    let completed = 0;
    for (const i of fileElems.get(best) ?? []) {
      const r = rem[i]!;
      if (!r.has(best)) continue;
      const k = r.size;
      for (const x of r) { score.set(x, (score.get(x) ?? 0) - 1 / k); if (k === 1) now.set(x, (now.get(x) ?? 0) - 1); }
      r.delete(best);
      const k2 = r.size;
      if (k2 === 0) completed++;
      else for (const x of r) { score.set(x, (score.get(x) ?? 0) + 1 / k2); if (k2 === 1) now.set(x, (now.get(x) ?? 0) + 1); }
    }
    cumulative += completed;
    const pagesCompleted: string[] = [];
    for (const [p, s] of pageRem) if (s.delete(best) && s.size === 0) pagesCompleted.push(p);
    const facts = g.mods.get(best)?.facts;
    const es = fileElems.get(best) ?? [];
    const names = kitByFile.get(best) ?? [];
    const item: WorkItem = {
      rank: worklist.length + 1, file: best, folder: folderOf(best), lines: facts?.lines ?? 0,
      reasons: compactReasons(C.reasons(best)), cssOnly: modules[best]?.cssOnly === true, fixInPlace: modules[best]?.fixInPlace === true,
      exports: (facts?.locals ?? []).filter((l) => !l.type).map((l) => l.name),
      kitNames: names.filter((n) => n.kind !== 'type').map((n) => ({ name: n.name, kind: n.kind, importers: n.importers })),
      demand: es.length, importerFiles: new Set(es.map((i) => blockedSites[i]!.file)).size,
      unblocksNow: completed, cumulative, pagesCompleted, pagesHelped: (helped.get(best) ?? []).sort(),
    };
    const bm = g.mods.get(best);
    if (bm?.isSibling && bm.base) {
      const have = new Set([...g.exportsOf('term', best)].filter(([, k]) => k === 'value').map(([n]) => n));
      item.missing = [...g.exportsOf('web', bm.base)].filter(([n, k]) => k === 'value' && !have.has(n)).map(([n]) => n).sort();
    }
    const split = splitHint(g, C, best, sites);
    if (split) item.split = split;
    worklist.push(item);
  }

  // ---- surprises ----
  const barrelFacts = g.mods.get(barrel)?.facts;
  const localCode = (barrelFacts?.locals ?? []).filter((l) => !l.type).map((l) => l.name);
  // modules the barrel re-exports (its whole name set, web view)
  const reexported = new Set<string>();
  for (const [n, k] of barrelExports) if (k === 'value') for (const m of g.resolveName('term', termBarrel, n).mods) reexported.add(m);
  let kitImpure: Analysis['barrel']['kitImpure'] = null;
  if (o.kitImpure) {
    const listed = o.kitImpure.map((p) => 'src/' + p);
    const reached = listed.filter((p) => reexported.has(g.termOf(p)) || reexported.has(p));
    const fr = C.frontierOfMods(reached.map((p) => g.termOf(p)));
    const frc = Ccss.frontierOfMods(reached.map((p) => g.termOf(p)));
    kitImpure = { listed: listed.length, reached: reached.sort(), blocked: [...fr].sort(), blockedIfCssModulesTranslate: frc.size };
  }
  const withLoad = [...reexported].filter((m) => {
    const f = g.mods.get(m)?.facts;
    return !!f && (f.reasons.some((r) => r.kind === 'css' || r.kind === 'css-module' || r.kind === 'package' || r.moduleScope) || f.sideEffectStatements > 0);
  }).sort();
  const withoutKitPure = { modules: reexported.size, withLoadEffects: withLoad, blocked: C.frontierOfMods(withLoad).size };

  const trapped: Analysis['trapped'] = [];
  for (const id of runtime) {
    if (!C.blocked(id) || g.mods.get(id)!.isSibling || g.mods.get(id)!.sibling) continue;
    const s = splitHint(g, C, id, sites);
    if (s && s.demand > 0) trapped.push({ file: id, ...s });
  }
  trapped.sort((a, b) => b.demand - a.demand || a.file.localeCompare(b.file));

  const moduleScope: Analysis['moduleScope'] = [];
  for (const id of runtime) {
    const rs = C.reasons(id).filter((r) => r.moduleScope && (r.kind === 'global' || r.kind === 'dom-member' || r.kind === 'canvas'));
    if (rs.length) moduleScope.push({ file: id, sites: [...new Set(rs.map((r) => `${r.detail}:${r.line}`))] });
  }

  const emptyKept: Analysis['emptyKept'] = [];
  const excludedEdges: Analysis['excludedEdges'] = [];
  const unresolved: Analysis['unresolved'] = [];
  const unresolvedNames: Analysis['unresolvedNames'] = [];
  const typeofGuards: Analysis['typeofGuards'] = [];
  for (const id of runtime) {
    const f = g.mods.get(id)!.facts!;
    for (const imp of f.imports) {
      if (!imp.emptyKept) continue;
      const t = g.resolveSpec('term', imp.spec, id);
      let harm = '';
      let target = imp.spec;
      if (t.kind === 'package') { target = t.name; if (g.isWebPackage(t.name)) harm = 'web-only package evaluated'; }
      else if (t.kind === 'file') {
        target = t.file;
        const fx = g.mods.get(t.file)?.facts;
        if (fx && (fx.reasons.some((r) => r.kind === 'css' || r.kind === 'css-module' || r.moduleScope))) harm = 'module with load-time web-only effects evaluated';
      }
      emptyKept.push({ file: id, line: imp.line, spec: imp.spec, target, harm });
    }
    const e = g.edges('web', id);
    for (const x of e.excludedTargets) if (!x.glob) excludedEdges.push({ file: id, to: x.to, line: x.line });
    for (const x of e.unresolved) unresolved.push({ file: id, spec: x.spec, line: x.line });
    for (const x of e.unresolvedNames) unresolvedNames.push({ file: id, ...x });
    for (const t of f.typeofGuards) typeofGuards.push({ file: id, ...t });
  }
  const webOnlySiblings = runtime.filter((id) => g.mods.get(id)!.isSibling && C.webOnly(id));
  const valueNames = [...barrelExports].filter(([, k]) => k === 'value').map(([n]) => n);
  const contractDrift = o.contract
    ? { notInContract: valueNames.filter((n) => !contractKind.has(n)).sort(), notInBarrel: [...contractKind.keys()].filter((n) => !barrelExports.has(n)).sort() }
    : { notInContract: [], notInBarrel: [] };

  return {
    modules, kit, kitSafeIfCssModulesTranslate, pages, shell, termEntry, worklist, sites: sites.length, blockedSites: blockedSites.length,
    barrel: { file: barrel, localCode, kitImpure, withoutKitPure },
    trapped, moduleScope, cssOnly: runtime.filter((id) => modules[id]?.cssOnly && !g.mods.get(id)!.sibling),
    fixInPlace: runtime.filter((id) => modules[id]?.fixInPlace && !g.mods.get(id)!.sibling),
    emptyKept, excludedEdges, unresolved, unresolvedNames, typeofGuards, webOnlySiblings, contractDrift, handoffs, handoffCheck,
  };
}

/** Every import binding a declaration uses resolves to a terminal-safe closure. */
function importsSafe(g: ModuleGraph, C: Classifier, file: string, bindings: readonly string[]): boolean {
  const f = g.mods.get(file)?.facts;
  if (!f) return false;
  for (const b of bindings) {
    const src = f.bindings[b];
    if (!src) continue;
    const t = g.resolveSpec('term', src.spec, file);
    if (t.kind === 'package') { if (g.isWebPackage(t.name)) return false; continue; }
    if (t.kind === 'asset') { if (t.css) return false; continue; }
    if (t.kind !== 'file') continue;
    const mods = src.imported === '*' ? g.whole('term', t.file) : g.resolveName('term', t.file, src.imported).mods;
    if (C.frontierOfMods(mods).size > 0) return false;
  }
  return true;
}

const siteCounts = new WeakMap<readonly Site[], Map<string, number>>();
function siteCount(sites: readonly Site[]): Map<string, number> {
  let m = siteCounts.get(sites);
  if (!m) {
    m = new Map();
    for (const s of sites) if (s.identity) m.set(s.identity, (m.get(s.identity) ?? 0) + 1);
    siteCounts.set(sites, m);
  }
  return m;
}

/** Pure exports of a web-only file that consumers import: what a split would make shared. */
function splitHint(g: ModuleGraph, C: Classifier, file: string, sites: readonly Site[]): { pure: string[]; demand: number; suggestion: string } | undefined {
  const f = g.mods.get(file)?.facts;
  if (!f || !C.blocked(file)) return undefined;
  const values = f.locals.filter((l) => !l.type);
  const pureSet = new Set(values.filter((l) => l.pure && !l.jsx && l.name !== 'default' && importsSafe(g, C, file, l.importRefs)).map((l) => l.name));
  const pure = [...pureSet];
  if (pure.length === 0) return undefined;
  const impure = [...new Set(values.filter((l) => !pureSet.has(l.name)).map((l) => l.name))];
  const demand = pure.reduce((acc, n) => acc + (siteCount(sites).get(file + '#' + n) ?? 0), 0);
  const base = file.replace(/\.(tsx?|jsx?)$/, '');
  const leaf = base.split('/').pop()!;
  const ext = /x$/.test(file) ? '.tsx' : '.ts';
  const suggestion = impure.length === 0
    ? `every runtime export is pure: the web-only sites sit in unexported code; move that code out and ${leaf} is shared`
    : impure.length <= pure.length
      ? `move ${impure.join(', ')} (the web-only part) to ${base}.web${ext} and give THAT file the sibling; ${leaf} (${pure.length} pure exports) is then shared`
      : `move ${pure.join(', ')} to ${base}.logic.ts (pure, shared); ${leaf} re-exports them, its sibling too`;
  return { pure, demand, suggestion };
}

export type { Identity };
