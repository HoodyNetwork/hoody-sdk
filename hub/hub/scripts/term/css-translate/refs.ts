// How often TS/TSX code references each CSS-module class (`s.row`, `s['row']`), for ranking in the report.
// Regex-level: `import X from '….module.css'` bindings, then `X.name` / `X['name']` / `X["name"]` in the same file;
// `X[expr]` counts as dynamic. Test, spec, story, fixture and gallery files are skipped. Given the set of files the
// terminal loads (reached.ts), references from those are also counted on their own (`term`).
import fs from 'node:fs';
import path from 'node:path';

export interface Refs {
  /** class id → references from src/pages/** files. */
  pages: Map<string, number>;
  /** class id → references from any runtime file. */
  all: Map<string, number>;
  /** class id → references from files the terminal build loads (reached.ts); null when no reached set was given. A
   *  class with none is never asked of the style table: its component has a `.term` sibling, or nothing loads it. */
  term: Map<string, number> | null;
  dynamic: number;
}

const ALIASES: Record<string, string> = { '@kit/': 'kit/', '@core/': 'core/', '@app/': 'app/' };
const SKIP_FILE = /\.(test|spec|test-d|stories)\.(ts|tsx)$|(^|\/)(fixtures?|shots)\.(ts|tsx)$|Fixtures\.(ts|tsx)$/;
const SKIP_DIR = /^(node_modules|gallery|e2e-search|__snapshots__|dist)$/;

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(e.name)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !SKIP_FILE.test(e.name)) out.push(p);
  }
}

export function scanRefs(src: string, reached?: ReadonlySet<string>): Refs {
  const files: string[] = [];
  walk(src, files);
  const pages = new Map<string, number>();
  const all = new Map<string, number>();
  const term = reached ? new Map<string, number>() : null;
  let dynamic = 0;
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    if (!code.includes('.module.css')) continue;
    const rel = path.relative(src, f).split(path.sep).join('/');
    const isPage = rel.startsWith('pages/');
    const isTerm = reached?.has(rel) === true;
    for (const m of code.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)) {
      const binding = m[1]!;
      const spec = m[2]!;
      let target: string;
      const alias = Object.keys(ALIASES).find((a) => spec.startsWith(a));
      if (alias) target = ALIASES[alias]! + spec.slice(alias.length);
      else target = path.relative(src, path.resolve(path.dirname(f), spec)).split(path.sep).join('/');
      const esc = binding.replace(/\$/g, '\\$');
      const re = new RegExp(`(?<![\\w$.])${esc}(?:\\.([A-Za-z_$][\\w$-]*)|\\[\\s*(['"])([^'"]+)\\2\\s*\\]|\\[)`, 'g');
      for (const r of code.matchAll(re)) {
        const name = r[1] ?? r[3];
        if (!name) {
          dynamic++;
          continue;
        }
        const id = `${target}#${name}`;
        all.set(id, (all.get(id) ?? 0) + 1);
        if (isPage) pages.set(id, (pages.get(id) ?? 0) + 1);
        if (isTerm) term!.set(id, (term!.get(id) ?? 0) + 1);
      }
    }
  }
  return { pages, all, term, dynamic };
}
