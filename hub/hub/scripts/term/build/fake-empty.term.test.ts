// fake-empty.ts: the ship gate's empty account is what the API would answer. Each body is checked against the API's own
// response schema of its route (the SDK's public spec generated/openapi.public.json, the Hoody API's `api_` operations,
// GET 200), and each path is a GET route the Hub declares with defineRoute, so a renamed route or a changed API shape
// fails here, not in a frame. The spec sits next to the hub package (hoody-sdk/generated; scripts/ops-gen.ts reads the
// same file): no fixed root.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { EMPTY_ACCOUNT, emptyAnswer } from './fake-empty';
import { fakeClient, type FakeCall } from './measure';

/** hub/scripts/term/build -> the hub app -> its package -> the SDK root's generated/ (ops-gen.ts: `../../../generated`). */
const SPEC = path.join(import.meta.dir, '..', '..', '..', '..', '..', 'generated', 'openapi.public.json');
/** The public spec holds every Hoody service; the Hoody API's own operations are the ones whose id starts with this. */
const API_ID_PREFIX = 'api_';
type Schema = { $ref?: string; type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; pattern?: string; nullable?: boolean; additionalProperties?: boolean | Schema; anyOf?: Schema[]; oneOf?: Schema[]; allOf?: Schema[] };
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8')) as { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema: Schema }> }> }>>; components: { schemas: Record<string, Schema> } };

type Op = { operationId?: string; responses: Record<string, { content?: Record<string, { schema: Schema }> }> };
/** The Hoody API's GET operation at a Hub path (`/api/v1` + path, with or without a trailing slash); another service's
 *  operation at the same path is not the API's answer. */
function apiGet(hubPath: string): Op | undefined {
  for (const p of [`/api/v1${hubPath}`, `/api/v1${hubPath}/`]) {
    const op = spec.paths[p]?.get as Op | undefined;
    if (op?.operationId?.startsWith(API_ID_PREFIX)) return op;
  }
  return undefined;
}

/** Problems of `v` against `s` (the subset of JSON Schema the API's response schemas use). */
function check(v: unknown, s: Schema, at: string): string[] {
  if (s.$ref) return check(v, spec.components.schemas[s.$ref.split('/').pop()!]!, at);
  if (s.allOf) return s.allOf.flatMap((x) => check(v, x, at));
  if (s.anyOf || s.oneOf) { const alts = (s.anyOf ?? s.oneOf)!; return alts.some((x) => check(v, x, at).length === 0) ? [] : [`${at}: matches no alternative`]; }
  // OpenAPI 3.1 (the public spec) writes a nullable value as a type list (`[string, null]`), 3.0 as `nullable: true`.
  if (Array.isArray(s.type)) {
    const types = s.type.filter((t) => t !== 'null');
    if (v === null) return s.type.includes('null') ? [] : [`${at}: null where ${types.join(' or ')} is required`];
    const each = types.map((t) => check(v, { ...s, type: t }, at));
    return each.some((e) => e.length === 0) ? [] : (each[0] ?? []);
  }
  if (v === null) return s.nullable ? [] : [`${at}: null where ${s.type ?? 'a value'} is required`];
  const out: string[] = [];
  if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} not in ${JSON.stringify(s.enum)}`);
  switch (s.type) {
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) return [`${at}: not an object`];
      const o = v as Record<string, unknown>;
      for (const r of s.required ?? []) if (!(r in o)) out.push(`${at}.${r}: required`);
      for (const [k, x] of Object.entries(o)) {
        const ps = s.properties?.[k];
        if (ps) out.push(...check(x, ps, `${at}.${k}`));
        else if (s.additionalProperties === false) out.push(`${at}.${k}: not in the schema`);
      }
      return out;
    }
    case 'array': return Array.isArray(v) ? [...out, ...v.flatMap((x, i) => (s.items ? check(x, s.items, `${at}[${i}]`) : []))] : [`${at}: not an array`];
    case 'string': if (typeof v !== 'string') return [`${at}: not a string`]; if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${v} does not match ${s.pattern}`); return out;
    case 'integer': return Number.isInteger(v) ? out : [`${at}: not an integer`];
    case 'number': return typeof v === 'number' ? out : [`${at}: not a number`];
    case 'boolean': return typeof v === 'boolean' ? out : [`${at}: not a boolean`];
    default: return out;
  }
}

/** Every GET path the Hub declares (defineRoute({ method: 'GET', path: '...' }) in hub/src, tests excluded). */
function declaredGets(): Set<string> {
  const out = new Set<string>();
  const src = path.join(import.meta.dir, '../../../src');
  for (const f of new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: src })) {
    if (/\.(test|spec)\.tsx?$/.test(f)) continue;
    const t = fs.readFileSync(path.join(src, f), 'utf8');
    for (const m of t.matchAll(/defineRoute(?:<[^(]*?>)?\(\s*\{\s*method:\s*["']GET["'],\s*path:\s*["']([^"']+)["']/g)) out.add(m[1]!);
  }
  return out;
}

describe('the empty account', () => {
  const gets = declaredGets();
  for (const a of EMPTY_ACCOUNT) {
    test(`${a.path}: a declared Hub GET route, and the API's 200 schema accepts the body`, () => {
      expect(gets.has(a.path)).toBe(true);
      expect(a.match.test(a.path)).toBe(true);
      const op = apiGet(a.path);
      expect(op).toBeDefined();
      const schema = op!.responses['200']?.content?.['application/json']?.schema;
      expect(schema).toBeDefined();
      expect(check(a.body, schema!, a.path)).toEqual([]);
    });
  }
  test('the spec is the SDK public spec beside the hub package, read as the Hoody API\'s `api_` operations', () => {
    expect(SPEC.endsWith(path.join('generated', 'openapi.public.json'))).toBe(true);
    for (const a of EMPTY_ACCOUNT) expect(apiGet(a.path)?.operationId?.startsWith(API_ID_PREFIX)).toBe(true);
  });
  test('the checker reads 3.1 type lists: null only where the list names it', () => {
    expect(check(null, { type: ['string', 'null'] }, 'x')).toEqual([]);
    expect(check('a', { type: ['string', 'null'] }, 'x')).toEqual([]);
    expect(check(null, { type: ['string'] }, 'x')).toEqual(['x: null where string is required']);
    expect(check(1, { type: ['string', 'null'] }, 'x')).toEqual(['x: not a string']);
  });
  test('the checker refuses a wrong body (it is not a pass-through)', () => {
    const s = apiGet('/wallet/balances')!.responses['200']!.content!['application/json']!.schema;
    expect(check({ statusCode: 200, message: 'OK', data: { general_balance: 0, ai_usage_status: 'maybe' } }, s, 'x').length).toBe(2);
  });
  test('fakeClient: mode error refuses a page read, mode empty answers it; boot reads and other methods unchanged', async () => {
    const calls: FakeCall[] = [];
    const err = fakeClient(calls);
    const empty = fakeClient(calls, 'empty');
    await expect(err.request('GET', '/wallet/balances')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(await empty.request('GET', '/wallet/balances')).toEqual(emptyAnswer('GET', '/wallet/balances')!);
    expect(await empty.request('GET', '/subserver-plans?locale=en')).toEqual(expect.objectContaining({ data: { requested_locale: 'en', plans: [] } }));
    await expect(empty.request('POST', '/auth/tokens')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    await expect(empty.request('GET', '/auth/tokens/other')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(await empty.request('GET', '/users/auth/me')).toEqual(await err.request('GET', '/users/auth/me'));
    // The empty account's /computers (declared shape) wins over the boot fake's bare list.
    expect(await empty.request('GET', '/computers?page=1&limit=100')).toEqual(emptyAnswer('GET', '/computers')!);
    expect(await err.request('GET', '/computers?page=1&limit=100')).toEqual(expect.objectContaining({ data: [] }));
  });
});
