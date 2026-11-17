// @vitest-environment node
// term/env/preinstall.ts is the first import of the term entry: its whole static import closure must evaluate without
// core's index, so the terminal env is installed before any core module makes a store, lock or vault call.
//
// The closure is read from source, not evaluated: under vitest each module import is awaited, so core/host-env.ts's
// load-window microtask can close between two modules of one graph, which the term bundle (one synchronous chunk)
// never does. The runtime install is tested through installTermEnv (session.term.test.ts).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const ENTRY = join(HERE, 'preinstall.ts');

/** Static and side-effect imports plus re-exports; type-only imports and exports are skipped (erased at build). */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) if (!m[2]) out.push(m[3]!);
  if (/\bimport\s*\(/.test(text)) out.push('<dynamic import>');
  return out;
}

function resolveSpec(from: string, spec: string): string {
  if (spec.startsWith('@core/')) spec = join(SRC, 'core', spec.slice(6));
  else if (spec === '@core') spec = join(SRC, 'core/index');
  else if (spec.startsWith('.')) spec = resolve(dirname(from), spec);
  else return '<package ' + spec + '>';
  for (const c of [spec, spec + '.ts', spec + '.tsx', join(spec, 'index.ts')]) if (existsSync(c) && !c.endsWith('/')) {
    if (c === spec && !/\.(ts|tsx)$/.test(c)) continue;
    return c;
  }
  return '<unresolved ' + spec + '>';
}

function closure(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (f.startsWith('<')) return;
    for (const s of importsOf(f)) walk(s === '<dynamic import>' ? s : resolveSpec(f, s));
  };
  walk(entry);
  return [...seen].map((f) => (f.startsWith('<') ? f : relative(SRC, f))).sort();
}

describe('preinstall', () => {
  it('is only the install call: one import of the env and one call', () => {
    const code = readFileSync(ENTRY, 'utf8').replace(/^\s*\/\/.*$/gm, '').trim();
    expect(code).toBe("import { installTermEnv } from './session';\n\ninstallTermEnv();");
  });

  it('its import closure is the term env, core/host-env and what host-env needs, and nothing else', () => {
    expect(closure(ENTRY)).toEqual([
      'core/crypt/memory-vault.ts',
      'core/crypt/vault.ts',
      'core/host-env.ts',
      'core/host-locks-memory.ts',
      'term/env/preinstall.ts',
      'term/env/session.ts',
      // The host services' checks (copy text, link address): import-free.
      'term/prim/safe.ts',
    ]);
  });

  it('the closure never reaches core/index, a package or a dynamic import', () => {
    const c = closure(ENTRY);
    expect(c).not.toContain('core/index.ts');
    expect(c.filter((f) => f.startsWith('<'))).toEqual([]);
  });
});
