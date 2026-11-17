// The module graph of hub/src, twice: the web build's (`web`) and the terminal build's (`term`, where a `.term` sibling
// replaces its base). Edges follow NAMES, the way the bundler tree-shakes: `import { A } from '@kit'` is an edge to the
// module that defines A (found through re-export chains and `export *`), never to the barrel's every module. A module
// counts with all its own imports once one of its own exports, a namespace, a dynamic import or a side-effect import
// reaches it; its re-exports are followed only for the names asked. Type-only imports and exports are no edges.
import fs from 'node:fs';
import path from 'node:path';
import { ModuleResolver, type Target } from './modres';
import { scanFile, webPackageTest, type FileFacts, type ScanConfig } from './scan';

export type Mode = 'web' | 'term';

export interface Mod {
  id: string;
  abs: string;
  /** Not analysed: tests, specs, shots, fixtures (INVENTORY's exclusion) and .d.ts. */
  excluded: boolean;
  facts: FileFacts | null;
  /** This file is an `X.term.tsx` / `X.term.ts`. */
  isSibling: boolean;
  /** For a base file: its sibling id. For a sibling: its base id (if one exists). */
  sibling?: string;
  base?: string;
}

export interface Identity { file: string; name: string }

export interface NameRes {
  mods: string[];
  identity?: Identity;
  type?: boolean;
  pkg?: string;
  unresolved?: boolean;
  handoff?: Identity;
}

export interface Edge {
  to: string;
  line: number;
  names: string[];
  glob?: boolean;
}

export interface ModEdges {
  edges: Edge[];
  packages: { name: string; line: number }[];
  assets: { file: string; css: boolean; line: number }[];
  unresolved: { spec: string; line: number }[];
  unresolvedNames: { spec: string; name: string; line: number }[];
  handoffUses: { identity: Identity; line: number }[];
  excludedTargets: { to: string; line: number; glob?: boolean }[];
}

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;

/** Same exclusion as INVENTORY (its isTestish) plus the bundle rules' test dirs and .d.ts. */
export function isExcluded(rel: string): boolean {
  const f = '/' + rel;
  return /\.d\.ts$/.test(f)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /\.test-d\.ts$/.test(f)
    || /\/(shots|fixtures|world|fake-kit|conformance\.allow|fixtures\.[a-z]+)\.[cm]?[jt]sx?$/.test(f)
    || /\/(__fixtures__|__tests__|__mocks__|test|tests|e2e-search|gallery|fixtures)\//.test(f)
    || /\.(shots|fixtures)\.[cm]?[jt]sx?$/.test(f)
    || /([a-z]Fixtures|-fixtures|fixtureRules|\/harness|\/testWaits|\/testing)\.[cm]?[jt]sx?$/.test(f)
    || /\.term\.test\.[cm]?[jt]sx?$/.test(f)
    || /\/test-setup\.[cm]?[jt]sx?$/.test(f);
}

/** Every file under `dir`. A symlink to a FILE is listed (the loader and bundler follow it; the resolver normalises it
 *  to its real path); a symlink to a directory is not walked (no cycles). */
export function walk(dir: string, out: string[]): void {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
    else if (e.isSymbolicLink()) { try { if (fs.statSync(p).isFile()) out.push(p); } catch { /* dangling */ } }
  }
}

function globRegex(absPattern: string): RegExp {
  let re = '';
  for (let i = 0; i < absPattern.length; i++) {
    const c = absPattern[i]!;
    if (c === '*' && absPattern[i + 1] === '*') { re += '.*'; i++; if (absPattern[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

export interface GraphOptions {
  hub: string;
  scan: ScanConfig;
  /** Web identities ("file#name") the terminal hands off with no sibling (synthetic tests only; the real list is derived, handoffs.ts). */
  handoff: ReadonlySet<string>;
  /** Facts already scanned (scanAll), keyed by absolute path; anything missing is scanned here. */
  prescanned?: ReadonlyMap<string, FileFacts>;
}

/** The code files under `hub/src` and which of them are analysed. */
export function listSources(hub: string): { all: string[]; runtime: string[] } {
  const all: string[] = [];
  walk(path.join(path.resolve(hub), 'src'), all);
  const runtime = all.filter((a) => CODE.test(a) && !isExcluded(path.relative(path.resolve(hub), a).split(path.sep).join('/')));
  return { all, runtime };
}

/** Scans `files` on `workers` Bun workers (the parse is the cost of a run). Falls back to this thread on any failure. */
export async function scanAll(files: string[], cfg: ScanConfig, workers: number): Promise<Map<string, FileFacts>> {
  const out = new Map<string, FileFacts>();
  if (workers <= 1 || files.length < 200) {
    for (const f of files) out.set(f, scanFile(f, fs.readFileSync(f, 'utf8'), cfg));
    return out;
  }
  // Big files first, dealt round-robin, so the slices finish together.
  const sized = files.map((f) => ({ f, n: fs.statSync(f).size })).sort((a, b) => b.n - a.n);
  const slices: string[][] = Array.from({ length: workers }, () => []);
  sized.forEach((x, i) => slices[i % workers]!.push(x.f));
  const url = new URL('./scan-worker.ts', import.meta.url);
  try {
    const parts = await Promise.all(slices.map((slice) => new Promise<[string, FileFacts][]>((resolve, reject) => {
      const w = new Worker(url);
      w.onmessage = (ev: MessageEvent<[string, FileFacts][]>) => { resolve(ev.data); w.terminate(); };
      w.onerror = (e) => { reject(e); w.terminate(); };
      w.postMessage({ files: slice, globals: [...cfg.globals], ...(cfg.webPackages ? { webPackages: [...cfg.webPackages] } : {}) });
    })));
    for (const p of parts) for (const [f, facts] of p) out.set(f, facts);
  } catch {
    for (const f of files) if (!out.has(f)) out.set(f, scanFile(f, fs.readFileSync(f, 'utf8'), cfg));
  }
  return out;
}

export class ModuleGraph {
  readonly hub: string;
  readonly src: string;
  readonly mods = new Map<string, Mod>();
  readonly res: ModuleResolver;
  /** Web identities ("file#name") the terminal hands off (filled by analyse() before any terminal resolution). */
  readonly handoff: Set<string>;
  private readonly nameMemo = new Map<string, NameRes>();
  private readonly allMemo = new Map<string, Map<string, 'value' | 'type'>>();
  private readonly edgeMemo = new Map<string, ModEdges>();
  private readonly codeIds: string[] = [];
  /** The terminal resolver's web-only package test. */
  readonly isWebPackage: (spec: string) => boolean;

  constructor(o: GraphOptions) {
    this.hub = path.resolve(o.hub);
    this.src = path.join(this.hub, 'src');
    this.handoff = new Set(o.handoff);
    this.isWebPackage = webPackageTest(o.scan.webPackages);
    const all: string[] = [];
    walk(this.src, all);
    this.res = new ModuleResolver(this.hub, new Set(all));
    for (const abs of all) {
      if (!CODE.test(abs)) continue;
      const id = this.id(abs);
      const excluded = isExcluded(id);
      const isSibling = /\.term\.(ts|tsx)$/.test(abs) && !excluded;
      const facts = excluded ? null : (o.prescanned?.get(abs) ?? scanFile(abs, fs.readFileSync(abs, 'utf8'), o.scan));
      this.mods.set(id, { id, abs, excluded, facts, isSibling });
      this.codeIds.push(id);
    }
    for (const m of this.mods.values()) {
      if (m.excluded) continue;
      if (m.isSibling) {
        const b = ModuleResolver.baseCandidates(m.abs).map((a) => this.id(a)).find((c) => this.mods.has(c));
        if (b) m.base = b;
      } else {
        const s = this.res.siblingOf(m.abs);
        if (s && this.mods.get(this.id(s))?.excluded === false) m.sibling = this.id(s);
      }
    }
  }

  id(abs: string): string { return path.relative(this.hub, abs).split(path.sep).join('/'); }
  abs(id: string): string { return path.join(this.hub, id); }

  /** The module that runs in the terminal in place of `id`. */
  termOf(id: string): string { return this.mods.get(id)?.sibling ?? id; }

  runtimeIds(): string[] { return [...this.mods.values()].filter((m) => !m.excluded).map((m) => m.id); }

  resolveSpec(mode: Mode, spec: string, from: string): Target {
    const abs = this.abs(from);
    const t = mode === 'web' ? this.res.resolve(spec, abs) : this.res.resolveTerm(spec, abs);
    if (t.kind === 'file' || t.kind === 'asset' || t.kind === 'external') return { ...t, file: this.id(t.file) } as Target;
    return t;
  }

  /** Every runtime (value) and type export name of a module, through re-exports and `export *`. */
  exportsOf(mode: Mode, id: string, stack: Set<string> = new Set()): Map<string, 'value' | 'type'> {
    const key = mode + '|' + id;
    const hit = this.allMemo.get(key);
    if (hit) return hit;
    const out = new Map<string, 'value' | 'type'>();
    const m = this.mods.get(id);
    if (!m?.facts || stack.has(id)) return out;
    stack.add(id);
    for (const l of m.facts.locals) out.set(l.name, l.type ? 'type' : 'value');
    for (const r of m.facts.reexports) {
      if (r.type) { out.set(r.name, 'type'); continue; }
      if (r.imported === '*') { out.set(r.name, 'value'); continue; }
      const t = this.resolveSpec(mode, r.spec, id);
      if (t.kind === 'file') {
        const k = this.exportsOf(mode, t.file, stack).get(r.imported);
        out.set(r.name, k ?? 'value');
      } else out.set(r.name, 'value');
    }
    for (const s of m.facts.stars) {
      const t = this.resolveSpec(mode, s.spec, id);
      if (t.kind !== 'file') continue;
      for (const [n, k] of this.exportsOf(mode, t.file, stack)) if (n !== 'default' && !out.has(n)) out.set(n, k);
    }
    stack.delete(id);
    this.allMemo.set(key, out);
    return out;
  }

  /** Where a runtime name asked of module `id` is defined: the modules whose own code it needs. */
  resolveName(mode: Mode, id: string, name: string, stack: Set<string> = new Set()): NameRes {
    const key = mode + '|' + id + '|' + name;
    const hit = this.nameMemo.get(key);
    if (hit) return hit;
    const m = this.mods.get(id);
    let r: NameRes;
    if (!m?.facts) r = { mods: [id] };
    else if (stack.has(key)) return { mods: [], unresolved: true };
    else {
      stack.add(key);
      r = this.resolveNameIn(mode, m, name, stack);
      stack.delete(key);
    }
    if (mode === 'term' && r.identity && !this.mods.get(r.identity.file)?.isSibling && this.handoff.has(r.identity.file + '#' + r.identity.name)) {
      r = { mods: [], handoff: r.identity, identity: r.identity };
    }
    this.nameMemo.set(key, r);
    return r;
  }

  private resolveNameIn(mode: Mode, m: Mod, name: string, stack: Set<string>): NameRes {
    const f = m.facts!;
    const local = f.locals.find((l) => l.name === name);
    if (local) return local.type ? { mods: [], type: true } : { mods: [m.id], identity: { file: m.id, name } };
    const re = f.reexports.find((r) => r.name === name);
    if (re) {
      if (re.type) return { mods: [], type: true };
      const t = this.resolveSpec(mode, re.spec, m.id);
      if (t.kind === 'package') return { mods: [], pkg: t.name, identity: { file: 'pkg:' + t.name, name: re.imported } };
      if (t.kind !== 'file') return { mods: [], unresolved: t.kind === 'unresolved' };
      if (re.imported === '*') return { mods: this.whole(mode, t.file) };
      return this.resolveName(mode, t.file, re.imported, stack);
    }
    if (name !== 'default') {
      for (const s of f.stars) {
        const t = this.resolveSpec(mode, s.spec, m.id);
        if (t.kind === 'file' && this.exportsOf(mode, t.file).has(name)) return this.resolveName(mode, t.file, name, stack);
      }
    }
    return { mods: [m.id], unresolved: true };
  }

  /** A whole module (namespace, dynamic import): its own code and every name it exports. */
  whole(mode: Mode, id: string): string[] {
    const out = new Set<string>([id]);
    for (const [n, k] of this.exportsOf(mode, id)) {
      if (k === 'type') continue;
      for (const x of this.resolveName(mode, id, n).mods) out.add(x);
    }
    return [...out];
  }

  edges(mode: Mode, id: string): ModEdges {
    const key = mode + '|' + id;
    const hit = this.edgeMemo.get(key);
    if (hit) return hit;
    const out: ModEdges = { edges: [], packages: [], assets: [], unresolved: [], unresolvedNames: [], handoffUses: [], excludedTargets: [] };
    this.edgeMemo.set(key, out);
    const m = this.mods.get(id);
    if (!m?.facts) return out;
    const push = (to: string, line: number, names: string[], glob?: boolean) => {
      if (this.mods.get(to)?.excluded) { out.excludedTargets.push({ to, line }); return; }
      out.edges.push({ to, line, names, ...(glob ? { glob } : {}) });
    };
    for (const imp of m.facts.imports) {
      if (imp.kind === 'glob') {
        const dir = path.dirname(m.abs);
        const pos = (imp.patterns ?? []).filter((p) => !p.startsWith('!')).map((p) => globRegex(path.resolve(dir, p)));
        const neg = (imp.patterns ?? []).filter((p) => p.startsWith('!')).map((p) => globRegex(path.resolve(dir, p.slice(1))));
        for (const cid of this.codeIds) {
          const a = this.abs(cid);
          if (pos.some((r) => r.test(a)) && !neg.some((r) => r.test(a))) {
            const tid = mode === 'term' ? this.termOf(cid) : cid;
            if (this.mods.get(tid)?.excluded) { out.excludedTargets.push({ to: tid, line: imp.line, glob: true }); continue; }
            for (const w of this.whole(mode, tid)) push(w, imp.line, ['*'], true);
          }
        }
        continue;
      }
      const runtime = imp.kind !== 'named' || imp.names.length > 0;
      if (!runtime) continue;
      const t = this.resolveSpec(mode, imp.spec, id);
      if (t.kind === 'package') { out.packages.push({ name: t.name, line: imp.line }); continue; }
      if (t.kind === 'asset') { out.assets.push({ file: t.file, css: t.css, line: imp.line }); continue; }
      if (t.kind === 'external') continue;
      if (t.kind === 'unresolved') { out.unresolved.push({ spec: imp.spec, line: imp.line }); continue; }
      if (imp.kind === 'side') { push(t.file, imp.line, []); continue; }
      if (imp.kind === 'named') {
        for (const n of imp.names) {
          const r = this.resolveName(mode, t.file, n);
          if (r.handoff) out.handoffUses.push({ identity: r.handoff, line: imp.line });
          if (r.unresolved) out.unresolvedNames.push({ spec: imp.spec, name: n, line: imp.line });
          for (const x of r.mods) push(x, imp.line, [n]);
        }
        continue;
      }
      for (const x of this.whole(mode, t.file)) push(x, imp.line, ['*']);
    }
    return out;
  }
}
