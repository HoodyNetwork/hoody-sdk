// Guard: every core call that reaches a vault value route
// (vaultKeyRoute, vaultKeyPutRoute) passes a scrub. api() hands a success answer to its caller as it came when no
// scrub is given, `secret: true` only rebuilds rejections, and defineQuery takes no scrub at all, so a call without
// one could leave a vault value in a cache or a caller's hands. pages/vault/scrub.guard.test.ts guards the page's
// own callers; this one guards core (realm.ts and any later core file). The scan reads core's source: each use of
// a route must be its declaration, an import or re-export (never renamed), the fixture table, or sit inside an
// api(…) or defineMutation(…) call whose own text names a scrub that is not undefined or null; a vault value path is
// written only in the shared declarations. A tripwire for an omission, not a parser: it reads text, not types.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['./**/*.{ts,tsx,js,mts}', '!./**/*.test.{ts,tsx}', '!./test/**'], {
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

const ROUTE_USE = /\bvaultKey(?:Put)?Route\b/g;
/** Whole import / re-export statements, across lines (a formatter splits long ones). */
const IMPORT_EXPORT = /^\s*(?:import|export)\s*(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gm;
/** The two shared declarations (realm.ts): the only place a vault value path may be written. */
const DECLARATION = /^export const vaultKey(?:Put)?Route\b[^\n]*$/gm;
const CALLERS = new Set(['api', 'defineMutation']);
/** The fake API names the routes to answer them, never to send. The permission table names each declared
 *  route's label to look up the right a shared link needs, never to send: routePerms.test.ts pins every one of its
 *  labels to a declared route, so it can declare no new path. */
const TABLES = new Set(['./fixtures.ts', './routePerms.ts']);

function unscrubbed(files: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const [file, raw] of Object.entries(files)) {
    if (TABLES.has(file)) continue;
    let text = stripComments(raw);
    // A renamed import or re-export hides every later use from this scan.
    for (const st of text.match(IMPORT_EXPORT) ?? []) if (/\bvaultKey(?:Put)?Route\s+as\b/.test(st)) bad.push(`${file}: renames a vault route (${st.trim()})`);
    // Blank the exempt statements in place (same length, so offsets stay put).
    text = text.replace(IMPORT_EXPORT, (st) => st.replace(/[^\n]/g, ' ')).replace(DECLARATION, (st) => st.replace(/[^\n]/g, ' '));
    if (/\/vault\/keys\/:/.test(text)) bad.push(`${file}: declares a vault value path (use vaultKeyRoute / vaultKeyPutRoute)`);
    for (const m of text.matchAll(ROUTE_USE)) {
      const at = m.index ?? 0;
      const call = enclosingCall(text, at - 1);
      const name = call?.callee.split('.').pop() ?? '';
      if (!call || !CALLERS.has(name)) bad.push(`${file}: ${m[0]} used outside api()/defineMutation()`);
      else if (!/\bscrub\s*:|[{,]\s*scrub\s*[,}]/.test(call.body)) bad.push(`${file}: ${name}(${m[0]}, …) passes no scrub`);
      // api() treats a nullish scrub as none.
      else if (/\bscrub\s*:\s*(?:undefined|null)\b/.test(call.body)) bad.push(`${file}: ${name}(${m[0]}, …) passes a nullish scrub`);
    }
  }
  return bad;
}

describe('core callers of the vault value routes always pass a scrub', () => {
  it('every core caller (realm.ts aliases) passes scrub', () => {
    expect(Object.keys(sources)).toContain('./realm.ts');
    expect(stripComments(sources['./realm.ts'] ?? '').match(ROUTE_USE)?.length).toBeGreaterThanOrEqual(4); // 2 declarations + 2 calls
    expect(unscrubbed(sources)).toEqual([]);
  });
  it('the guard catches a call without scrub, a query, an alias, and accepts shorthand and named scrubs', () => {
    expect(unscrubbed({ './x.ts': 'await api(vaultKeyRoute, { params: { key }, ctx });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'defineMutation(vaultKeyPutRoute, { input: (v) => ({ body: v }) });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'defineQuery(vaultKeyRoute, { input: () => ({ scrub: drop }) });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'const r = vaultKeyRoute; await api(r, { scrub: drop });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'await api(vaultKeyRoute, { ctx, scrub });' })).toEqual([]);
    expect(unscrubbed({ './x.ts': 'await api(vaultKeyPutRoute, { body, scrub: dropVaultValue }).then(f);' })).toEqual([]);
    expect(unscrubbed({ './x.ts': "import { vaultKeyRoute } from './realm';\nexport { vaultKeyRoute } from './realm';" })).toEqual([]);
  });
  it('multiline imports, renames, nullish scrubs and redeclared paths', () => {
    // A formatter's multiline import is no use; the caller below it is judged on its own.
    expect(unscrubbed({ './x.ts': "import {\n  api,\n  vaultKeyRoute,\n} from './realm';\napi(vaultKeyRoute, { scrub: drop });" })).toEqual([]);
    expect(unscrubbed({ './x.ts': "import {\n  vaultKeyRoute,\n} from './realm';\napi(vaultKeyRoute, { ctx });" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "import { vaultKeyRoute } from './realm'; api(vaultKeyRoute);" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "import { vaultKeyRoute as v } from './realm';\napi(v, { params: { key } });" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "export { vaultKeyRoute as read } from './realm';" })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'api(vaultKeyRoute, { params: { key }, scrub: undefined });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': 'api(vaultKeyRoute, { params: { key }, scrub: null });' })).toHaveLength(1);
    expect(unscrubbed({ './x.ts': "const r = defineRoute({ method: 'GET', path: '/vault/keys/:key', scope: 'base' });" })).toHaveLength(1);
    expect(unscrubbed({ './x.tsx': 'api(vaultKeyRoute, { ctx });' })).toHaveLength(1);
  });
});
