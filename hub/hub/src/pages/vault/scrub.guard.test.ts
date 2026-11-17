// Guard: every call in pages/vault that reaches a vault value route (GET or PUT /vault/keys/:key, core's
// vaultKeyRoute and vaultKeyPutRoute) passes a scrub that nulls the value (takeValue or dropValue). Core hands
// an unscrubbed answer to its caller as it came, so a call without a scrub could leave a value in a cache, a
// held change or an error. The scan reads the page's source: each use of the route must sit inside an api(…)
// or defineMutation(…) call whose scrub nulls the value, and no other file may declare the value path again.
// Core's own callers are guarded by core/realm.vault.guard.test.ts.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx', '!./**/*.spec.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Source without comments, so a comment naming a route is not a use. */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The text of the call whose argument list holds `at`: from the callee name to its closing parenthesis. */
function enclosingCall(text: string, at: number): { callee: string; body: string } | null {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = text[i];
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) {
        const callee = /([\w$.]+)(?:<[^()]*>)?\s*$/.exec(text.slice(Math.max(0, i - 200), i))?.[1] ?? '';
        let d = 0;
        for (let j = i; j < text.length; j++) {
          if (text[j] === '(') d++;
          else if (text[j] === ')' && --d === 0) return { callee, body: text.slice(i, j + 1) };
        }
        return { callee, body: text.slice(i) };
      }
      depth--;
    }
  }
  return null;
}

const ROUTE_USE = /\b(?:routes\.(?:read|put)|vaultKeyRoute|vaultKeyPutRoute)\b/g;
/** The scrub nulls the value: it is dropValue, or a function whose body calls takeValue or dropValue. */
const NULLS = /\bscrub\s*:\s*(?:dropValue\b|\([^)]*\)\s*=>\s*\{[^}]*\b(?:takeValue|dropValue)\()/;
// defineQuery is refused outright: a query's input carries no scrub, and a value never belongs in its cache.
const CALLERS = new Set(['api', 'defineMutation']);
/** Files that may name the routes without calling them: the route table and the fake API. */
const DECLARES = new Set(['./routes.ts', './fixtures.ts']);

function unscrubbed(files: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const [file, raw] of Object.entries(files)) {
    if (DECLARES.has(file)) continue;
    const text = stripComments(raw);
    if (/\/vault\/keys\/:/.test(text)) bad.push(`${file}: declares a vault value path (use routes.read / routes.put)`);
    for (const m of text.matchAll(ROUTE_USE)) {
      if (/^\s*import\b/m.test(text.slice(text.lastIndexOf('\n', m.index ?? 0) + 1, (m.index ?? 0) + 1))) continue;
      const call = enclosingCall(text, (m.index ?? 0) - 1);
      const name = call?.callee.split('.').pop() ?? '';
      if (!call || !CALLERS.has(name)) bad.push(`${file}: ${m[0]} used outside api()/defineMutation()`);
      else if (!/\bscrub\s*:/.test(call.body)) bad.push(`${file}: ${name}(${m[0]}, …) passes no scrub`);
      else if (!NULLS.test(call.body)) bad.push(`${file}: ${name}(${m[0]}, …) has a scrub that does not null the value (use takeValue or dropValue)`);
    }
  }
  return bad;
}

describe('vault value routes always pass a scrub', () => {
  it('every caller in pages/vault passes scrub', () => {
    expect(Object.keys(sources)).toContain('./data.ts');
    expect(unscrubbed(sources)).toEqual([]);
  });
  it('the guard catches a caller without scrub, an alias and a redeclared path', () => {
    expect(unscrubbed({ './x.ts': 'await api(routes.read, { params: { key }, ctx });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "defineMutation(routes.put, { input: (v) => ({ body: v }) });" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'const r = routes.read; await api(r, { scrub: drop });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "const r = defineRoute('GET /vault/keys/:key');" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'defineQuery(routes.read, { input: (k) => ({ params: { key: k }, scrub: dropValue }) });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'await api(routes.read, { ctx, scrub: (r) => { raw = valueOf(r); } });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'await api(routes.read, { ctx, scrub: (r: unknown) => { raw = takeValue(r); } });' })).toEqual([]);
    expect(unscrubbed({ './x.ts': 'defineMutation(routes.put, { input: (v) => ({ body: v, scrub: dropValue }) });' })).toEqual([]);
  });
});
