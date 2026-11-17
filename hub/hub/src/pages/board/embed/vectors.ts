// The tile URL parity vectors: inputs only (test data, imported by tests alone). embed.sync.test.ts asks the SDK's
// buildEmbedUrl for each one and stores the answers in vectors.json; embed.parity.test.ts checks the port against
// them. Inputs come from the catalogue and each tile kit's test/embeds/cases.json, never from the port.
import type { CatParam, Catalog } from './catalog';
import type { EmbedValue } from './build';

export interface VectorInput {
  readonly id: string;
  readonly kit: string;
  readonly view?: string;
  readonly index?: number;
  readonly params?: Record<string, EmbedValue>;
  readonly query?: Record<string, string | number | boolean | string[]>;
  readonly target?: { id: string; project_id: string; server_name: string };
  readonly domain?: string;
}

export interface KitCase { readonly view: string; readonly param: string | null }

export const VECTOR_TARGET = { id: 'c0ffee', project_id: 'p1a2b3', server_name: 'sg-sin-1' };
export const VECTOR_DOMAIN = 'computers.hoody.com';
const HEX24A = '0123456789abcdef01234567', HEX24B = 'fedcba9876543210fedcba98';

/** A valid value for a param, chosen from its own rules (enum, bounds, pattern, encoder). */
export function sampleValue(p: CatParam, id: string): EmbedValue {
  if (p.serialize === 'json') return { background: 'black', foreground: 'yellow' };
  if (p.enum && p.enum.length) return p.enum[p.enum.length - 1] as EmbedValue;
  if (p.type === 'boolean') return true;
  if (p.type === 'integer' || p.type === 'number') {
    if (p.min !== undefined && p.max !== undefined) return Math.floor((p.min + p.max) / 2);
    if (p.min !== undefined) return p.min + 3;
    return p.max !== undefined ? p.max - 1 : 7;
  }
  if (p.encoder === 'path-segments') return '/home/user/my project/ünï & %20?#';
  if (p.format === 'uri' || p.pattern === '^https?://') return 'https://example.com/docs?a=1&b=two words#x';
  if (p.pattern === '^/') return '/home/user/proj x';
  if (p.pattern && /\[a-z\]\{2\}/.test(p.pattern)) return 'fr-FR';
  if (p.pattern && /\\\./.test(p.pattern)) return 'ms-python.python';
  if (/width|height/i.test(id)) return '420px';
  if (/color/i.test(id)) return 'navy';
  return 'Fira Code <mono> & ü=?';
}

/** Values the param must refuse, by its rules. */
function badValues(p: CatParam): EmbedValue[] {
  const out: EmbedValue[] = [];
  if (p.serialize === 'json') return ['{"a":1}', ['x']];
  if (p.in === 'path') return p.encoder === 'path-segments' ? ['relative/path', '/a/../b', '', '/a\u0000b', '/a\ud800'] : ['', 'a\u0000'];
  switch (p.type) {
    case 'integer':
      out.push(1.5, '8');
      if (p.min !== undefined) out.push(p.min - 1);
      if (p.max !== undefined) out.push(p.max + 1);
      break;
    case 'number':
      out.push('1', Number.POSITIVE_INFINITY);
      break;
    case 'boolean':
      out.push('true', 1);
      if (p.enum) out.push(true);
      break;
    default:
      out.push(5, 'a\u0000b', 'lone \udc00');
      if (p.enum) out.push('zzz-not-listed');
      if (p.pattern) out.push('nope nope');
      if (p.maxLength !== undefined) out.push('x'.repeat(p.maxLength + 1));
  }
  return out;
}

/** Required params of a view (other than `skip`), each with its sample, split into params and query. */
function companions(cat: Catalog, vid: string, skip: string | null): { params: Record<string, EmbedValue>; query: Record<string, string | number | boolean> } {
  const v = cat.views[vid];
  const params: Record<string, EmbedValue> = {}, query: Record<string, string | number | boolean> = {};
  if (!v) return { params, query };
  for (const r of v.required) {
    const p = v.params[r];
    if (!p || r === skip) continue;
    if (p.class === 'typed') params[r] = sampleValue(p, r);
    else query[p.wire] = sampleValue(p, r) as string;
  }
  return { params, query };
}

function withParam(cat: Catalog, vid: string, pid: string, value: EmbedValue): Pick<VectorInput, 'params' | 'query'> {
  const v = cat.views[vid];
  const c = companions(cat, vid, pid);
  const p = v?.params[pid];
  if (p && p.class !== 'typed') return { params: c.params, query: { ...c.query, [p.wire]: value as string } };
  return { params: { ...c.params, [pid]: value }, query: c.query };
}

/** Every vector input: the kit cases, every option, refusals, indexes, targets and domains. */
export function vectorInputs(cat: Catalog, cases: readonly KitCase[]): VectorInput[] {
  const out: VectorInput[] = [];
  const seen = new Set<string>();
  const push = (v: VectorInput) => { if (!seen.has(v.id)) { seen.add(v.id); out.push(v); } };
  const viewName = (vid: string) => vid.slice(vid.indexOf('.') + 1);

  for (const c of cases) {
    const v = cat.views[c.view];
    if (!v) continue;
    if (c.param === null) push({ id: 'case:' + c.view, kit: v.kit, view: viewName(c.view), ...companions(cat, c.view, null) });
    else if (v.params[c.param]) push({ id: 'case:' + c.view + ':' + c.param, kit: v.kit, view: viewName(c.view), ...withParam(cat, c.view, c.param, sampleValue(v.params[c.param] as CatParam, c.param)) });
  }
  for (const [vid, v] of Object.entries(cat.views)) {
    const name = viewName(vid);
    push({ id: 'case:' + vid, kit: v.kit, view: name, ...companions(cat, vid, null) });
    for (const [pid, p] of Object.entries(v.params)) {
      push({ id: 'case:' + vid + ':' + pid, kit: v.kit, view: name, ...withParam(cat, vid, pid, sampleValue(p, pid)) });
      badValues(p).forEach((bad, i) => push({ id: 'bad:' + vid + ':' + pid + ':' + i, kit: v.kit, view: name, ...withParam(cat, vid, pid, bad) }));
      // The other channel: a typed param in query, a passthrough one in params.
      const c = companions(cat, vid, pid);
      push(p.class === 'typed'
        ? { id: 'chan:' + vid + ':' + pid, kit: v.kit, view: name, params: c.params, query: { ...c.query, [p.wire]: String(sampleValue(p, pid)) } }
        : { id: 'chan:' + vid + ':' + pid, kit: v.kit, view: name, params: { ...c.params, [pid]: sampleValue(p, pid) }, query: c.query });
      if (p.class === 'typed' && p.in === 'query') push({ id: 'dup:' + vid + ':' + pid, kit: v.kit, view: name, params: { ...c.params, [pid]: sampleValue(p, pid) }, query: { ...c.query, [p.wire]: 'x' } });
    }
    // Every option at once: typed in params (given in reverse), passthrough in query in reverse view order, so the
    // query order rule (const, flags, typed in view order, passthrough in caller order) shows.
    const all = Object.entries(v.params).reverse();
    push({ id: 'all:' + vid, kit: v.kit, view: name,
      params: Object.fromEntries(all.filter(([, p]) => p.class === 'typed').map(([pid, p]) => [pid, sampleValue(p, pid)])),
      query: Object.fromEntries(all.filter(([, p]) => p.class !== 'typed').map(([pid, p]) => [p.wire, sampleValue(p, pid) as string])) });
    for (const k of Object.keys(v.const)) push({ id: 'const:' + vid + ':' + k, kit: v.kit, view: name, params: { [k]: 'x' } });
    for (const k of Object.keys(v.const)) push({ id: 'constq:' + vid + ':' + k, kit: v.kit, view: name, query: { [k]: 'x' } });
    for (const f of v.flags) push({ id: 'flag:' + vid + ':' + f, kit: v.kit, view: name, ...companions(cat, vid, null), query: { [f]: '1' } });
    for (const r of v.required) push({ id: 'req:' + vid + ':' + r, kit: v.kit, view: name, ...companions(cat, vid, r) });
    // Params of the kit's other views.
    for (const other of cat.kits[v.kit]?.views ?? []) {
      for (const pid of Object.keys(cat.views[other]?.params ?? {})) {
        if (!(pid in v.params)) push({ id: 'notonview:' + vid + ':' + pid, kit: v.kit, view: name, ...companions(cat, vid, null), params: { ...companions(cat, vid, null).params, [pid]: 'x' } });
      }
    }
    push({ id: 'unknown:' + vid, kit: v.kit, view: name, ...companions(cat, vid, null), params: { ...companions(cat, vid, null).params, zz_unknown: 'x' } });
    push({ id: 'unknownq:' + vid, kit: v.kit, view: name, ...companions(cat, vid, null), query: { zz_unknown: 'x' } });
  }
  for (const [kit, k] of Object.entries(cat.kits)) {
    const svc = cat.services[cat.views[k.defaultView ?? '']?.service ?? ''];
    const max = svc?.index?.max ?? 1;
    const base = companions(cat, k.defaultView ?? '', null);
    for (const [label, index] of [['2', 2], ['max', max], ['over', max + 1], ['zero', 0], ['frac', 2.5]] as const) push({ id: 'index:' + kit + ':' + label, kit, index, ...base });
    push({ id: 'index:' + kit + ':long', kit, index: Math.min(max, 10000), ...base, target: { id: HEX24A, project_id: HEX24B, server_name: 'sg-sin-1' } });
    push({ id: 'index:' + kit + ':9999', kit, index: Math.min(max, 9999), ...base, target: { id: HEX24A, project_id: HEX24B, server_name: 'sg-sin-1' } });
    push({ id: 'view:' + kit + ':unknown', kit, view: 'zz-nope' });
    for (const name of Object.keys(k.refused)) {
      push({ id: 'refused:' + kit + ':' + name, kit, ...base, params: { ...base.params, [name]: 'x' } });
      push({ id: 'refusedq:' + kit + ':' + name, kit, ...base, query: { [name]: 'x' } });
    }
  }
  const t = VECTOR_TARGET;
  const targets: Array<[string, VectorInput['target']]> = [
    ['upper', { ...t, id: 'C0FFEE' }], ['server-path', { ...t, server_name: 'evil.test/' }], ['server-at', { ...t, server_name: 'u@evil' }],
    ['no-project', { ...t, project_id: '' }], ['dash-end', { ...t, id: 'c0ffee-' }], ['dot-id', { ...t, id: 'c0.ffee' }],
  ];
  for (const [label, target] of targets) push({ id: 'target:' + label, kit: 'terminal', target: target as VectorInput['target'] });
  for (const [label, domain] of [['port', 'computers.hoody.com:8080'], ['ip', '127.0.0.1'], ['underscore', 'bad_label.run'], ['trailing-dot', 'computers.hoody.com.'], ['upper', 'Computers.Example.TEST'], ['numeric', 'containers.123']] as const) {
    push({ id: 'domain:' + label, kit: 'terminal', domain });
  }
  push({ id: 'kit:unknown', kit: 'zz-kit' });
  return out;
}

// vectors.json cannot hold a lone surrogate (the JSON loader refuses its escape), so such a string is stored as
// {"$units": [UTF-16 code units]} and decoded back for the test.
function mapStrings(v: unknown, f: (s: string) => unknown, g: (o: Record<string, unknown>) => unknown): unknown {
  if (typeof v === 'string') return f(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f, g));
  if (v && typeof v === 'object') {
    const hit = g(v as Record<string, unknown>);
    if (hit !== undefined) return hit;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f, g)]));
  }
  return v;
}
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
export function encodeVector<T>(v: T): T {
  return mapStrings(v, (s) => (LONE.test(s) ? { $units: Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)) } : s), () => undefined) as T;
}
export function decodeVector<T>(v: T): T {
  return mapStrings(v, (s) => s, (o) => (Array.isArray(o.$units) && Object.keys(o).length === 1 ? String.fromCharCode(...(o.$units as number[])) : undefined)) as T;
}
