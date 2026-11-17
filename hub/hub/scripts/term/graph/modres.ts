// Module resolution of the terminal module graph: an adapter over THE terminal resolver (scripts/term/resolve.ts
// TermResolver), so the graph tool, the runtime loader, the ship bundler and the typecheck cannot disagree
// (scripts/term/resolve.conformance.term.test.ts runs one case table through all of them).
// Only the result shape differs: the graph keeps its Target union. A sibling's VALUE import of its own base resolves to
// the base here (R1 reports it as an error; the loader refuses it with TERM_TWIN_VALUE_IMPORT).
import path from 'node:path';
import ts from 'typescript';
import { TermResolver, isSibling, stemOf, type Resolved } from '../resolve';

export type Target =
  | { kind: 'file'; file: string }
  | { kind: 'asset'; file: string; css: boolean }
  | { kind: 'package'; name: string }
  | { kind: 'external'; file: string }
  | { kind: 'unresolved' };

export class ModuleResolver {
  readonly options: ts.CompilerOptions;
  readonly term: TermResolver;
  private readonly memo = new Map<string, Target>();
  private readonly termMemo = new Map<string, Target>();

  /** `hub`: absolute hub dir (holds tsconfig.json). `files`: absolute paths of every file under src (any extension). */
  constructor(readonly hub: string, private readonly files: ReadonlySet<string>) {
    const srcDir = path.join(hub, 'src') + path.sep;
    this.term = new TermResolver({ hub, fileExists: (f) => this.files.has(f) || (!f.startsWith(srcDir) && ts.sys.fileExists(f)) });
    this.options = this.term.options;
  }

  private toTarget(r: Resolved): Target {
    switch (r.kind) {
      case 'file': return { kind: 'file', file: r.path };
      case 'twin': return { kind: 'file', file: r.base };
      case 'jsx': return { kind: 'file', file: r.path };
      case 'cssModule': return { kind: 'asset', file: r.path, css: true };
      case 'raw': return { kind: 'asset', file: r.path, css: false };
      case 'asset': return r.path ? (this.term.inSrc(r.path) ? { kind: 'asset', file: r.path, css: r.css } : { kind: 'external', file: r.path }) : { kind: 'unresolved' };
      case 'package': return { kind: 'package', name: r.name };
      case 'external': return { kind: 'external', file: r.path };
      case 'missing': return { kind: 'unresolved' };
    }
  }

  /** The web build's resolution of `spec` imported from `from` (absolute). */
  resolve(spec: string, from: string): Target {
    const key = from + '\0' + spec;
    let t = this.memo.get(key);
    if (!t) { t = this.toTarget(this.term.resolveWeb(spec, from)); this.memo.set(key, t); }
    return t;
  }

  /** The `.term` sibling of a file, or null. */
  siblingOf(file: string): string | null { return this.term.siblingOf(file); }

  /** The base file a sibling replaces (it may not exist). */
  static baseCandidates(sibling: string): string[] {
    return isSibling(sibling) ? [stemOf(sibling) + '.tsx', stemOf(sibling) + '.ts'] : [];
  }

  /** The terminal build's resolution: the canonical one (sibling preferred, never the importer itself). */
  resolveTerm(spec: string, from: string): Target {
    const key = from + '\0' + spec;
    let t = this.termMemo.get(key);
    if (!t) {
      // Same answer as the loader, the typecheck and the bundler (resolve.conformance.term.test.ts), JSX runtime included.
      t = this.toTarget(this.term.resolve(spec, from));
      this.termMemo.set(key, t);
    }
    return t;
  }
}
