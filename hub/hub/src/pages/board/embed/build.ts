// Tile URLs: a port of the SDK's buildEmbedUrl (hoody-sdk lib/embeds/runtime.ts) for container targets.
//
// Contract, in plain words:
//   - buildEmbedUrl(cat, kit, target, opts, ctx) gives the URL the SDK gives for the same input, or the same refusal
//     code the SDK throws, as {refused, field}. embed.parity.test.ts holds the SDK's own answers for every kit
//     case (test/embeds/cases.json of each tile kit) plus refusals, and re-asks the SDK where the tree exists.
//   - Only what a tile needs is ported: container targets ({id, project_id, server_name}) and a given containers
//     domain (the page's proxy domain). Alias targets, ports (user-content kits), the SDK's getKitUrl hook and the
//     base-URL derivation are not: a tile kit never takes them.
//   - Every rule is the catalogue's: views, typed and passthrough params with their type/enum/min/max/maxLength/
//     pattern/format, the refused names (forced, excluded, non-UI, dead), const and flags, required params, path
//     encoders, index bounds and the 63-character host label limit. Query order: const, flags, typed params in the
//     view's order, then passthrough in caller order.
//   - Nothing here adds a credential. An agent tile's sign-in token is added by the live frame only, never kept.
//   - One Board-only step, off unless asked: ctx.hostSegment (core's hostSegment, passed by the Board's tileUrl) names
//     the protocol part of the host label. Core names a terminal whose long label would pass 63 characters `t`, the
//     containers proxy's short alias (`<project>-<computer>-t-<N>`). Without it the result is the SDK's, which
//     refuses such a label (HOST_LABEL_TOO_LONG); the parity tests ask without it.
import type { CatParam, CatView, Catalog, Scalar } from './catalog';

export type EmbedErrorCode =
  | 'KIT_UNKNOWN' | 'KIT_NOT_BUILDABLE' | 'VIEW_UNKNOWN' | 'INDEX_OUT_OF_RANGE' | 'TARGET_INVALID'
  | 'PARAM_UNKNOWN' | 'PARAM_FORCED' | 'PARAM_EXCLUDED' | 'PARAM_NON_UI' | 'PARAM_DEAD' | 'PARAM_NOT_ON_VIEW'
  | 'PARAM_NOT_TYPED' | 'QUERY_NOT_PASSTHROUGH' | 'DUPLICATE_KEY' | 'CONST_OVERRIDE' | 'REQUIRED_MISSING'
  | 'VALUE_INVALID' | 'PATH_INVALID' | 'HOST_LABEL_TOO_LONG';

export type EmbedValue = Scalar | ReadonlyArray<string | number> | Readonly<Record<string, unknown>>;

export interface EmbedTarget { readonly id: string; readonly project_id: string; readonly server_name: string }

export interface EmbedOptions {
  /** View name within the kit ('session'), or omitted for the kit's default view. */
  readonly view?: string;
  /** Service index (the program's session number), 1 or more. Defaults to the service default. */
  readonly index?: number;
  /** Typed params by id. */
  readonly params?: Readonly<Record<string, EmbedValue | undefined>>;
  /** Passthrough params by wire name, in the order they should appear. */
  readonly query?: Readonly<Record<string, Scalar | ReadonlyArray<string>>>;
}

export type EmbedResult = { readonly url: string } | { readonly refused: EmbedErrorCode; readonly field: string };

class Refusal { constructor(readonly code: EmbedErrorCode, readonly field: string) {} }
function fail(code: EmbedErrorCode, field: string): never { throw new Refusal(code, field); }

const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** A lone surrogate has no UTF-8 form (encodeURIComponent throws on it). */
export function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdfff) continue;
    if (c > 0xdbff) return true;
    const next = s.charCodeAt(i + 1);
    if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    i++;
  }
  return false;
}

function isUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

/** One scalar value's wire text, by the param's rules (SDK checkScalar). */
function checkScalar(p: CatParam, key: string, v: unknown): string {
  if (p.serialize === 'json') {
    if (!isPlainObject(v)) fail('VALUE_INVALID', key);
    return JSON.stringify(v);
  }
  let s: string;
  switch (p.type) {
    case 'integer':
      if (typeof v !== 'number' || !Number.isInteger(v)) fail('VALUE_INVALID', key);
      s = String(v);
      break;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) fail('VALUE_INVALID', key);
      s = String(v);
      break;
    case 'boolean':
      if (typeof v !== 'boolean') fail('VALUE_INVALID', key);
      s = v ? 'true' : 'false';
      break;
    default:
      if (typeof v !== 'string') fail('VALUE_INVALID', key);
      s = v;
  }
  if (typeof v === 'number') {
    if (p.min !== undefined && v < p.min) fail('VALUE_INVALID', key);
    if (p.max !== undefined && v > p.max) fail('VALUE_INVALID', key);
  }
  if (s.includes('\u0000') || hasLoneSurrogate(s)) fail('VALUE_INVALID', key);
  if (p.enum !== undefined && !p.enum.some((e) => e === v)) fail('VALUE_INVALID', key);
  if (p.maxLength !== undefined && s.length > p.maxLength) fail('VALUE_INVALID', key);
  if (p.pattern !== undefined && !new RegExp(p.pattern).test(s)) fail('VALUE_INVALID', key);
  if (p.wirePattern !== undefined && !new RegExp(p.wirePattern).test(s)) fail('VALUE_INVALID', key);
  if (p.format === 'uri' && !isUrl(s)) fail('VALUE_INVALID', key);
  return s;
}

function queryValues(p: CatParam, key: string, v: unknown): string[] {
  if (p.repeat === 'ordered') {
    if (!Array.isArray(v)) fail('VALUE_INVALID', key);
    return v.map((item: unknown) => checkScalar({ ...p, type: typeof item === 'number' ? 'number' : 'string' }, key, item));
  }
  return [checkScalar(p, key, v)];
}

function encodePathValue(p: CatParam, key: string, v: unknown): { text: string; absolute: boolean } {
  if (typeof v !== 'string' || v === '' || v.includes('\u0000') || hasLoneSurrogate(v)) fail('PATH_INVALID', key);
  if (p.maxLength !== undefined && v.length > p.maxLength) fail('PATH_INVALID', key);
  switch (p.encoder) {
    case 'path-segments': {
      if (!v.startsWith('/')) fail('PATH_INVALID', key);
      const segs = v.slice(1).split('/');
      if (segs.some((s) => s === '.' || s === '..')) fail('PATH_INVALID', key);
      return { text: segs.map((s) => encodeURIComponent(s)).join('/'), absolute: true };
    }
    case 'pipe-path': {
      for (const re of [p.pattern, p.wirePattern]) if (re !== undefined && !new RegExp(re).test(v)) fail('PATH_INVALID', key);
      const text = v.split('/').map((s) => encodeURIComponent(s)).join('/');
      if (text.length > 1023) fail('PATH_INVALID', key);
      return { text, absolute: false };
    }
    default:
      for (const re of [p.pattern, p.wirePattern]) if (re !== undefined && !new RegExp(re).test(v)) fail('VALUE_INVALID', key);
      if (p.enum !== undefined && !p.enum.some((e) => e === v)) fail('VALUE_INVALID', key);
      return { text: encodeURIComponent(v), absolute: false };
  }
}

/** null when the value is valid for the param, else the refusal code (the same checks the URL build runs). */
export function checkOption(p: CatParam, id: string, value: unknown): EmbedErrorCode | null {
  try {
    if (p.in === 'path') encodePathValue(p, id, value);
    else queryValues(p, id, value);
    return null;
  } catch (e) {
    if (e instanceof Refusal) return e.code;
    throw e;
  }
}

const REFUSAL_CODE: Record<string, EmbedErrorCode> = { forced: 'PARAM_FORCED', excluded: 'PARAM_EXCLUDED', nonUi: 'PARAM_NON_UI' };

function refuse(cat: Catalog, view: CatView, key: string): never {
  const r = cat.kits[view.kit]?.refused[key];
  if (r === undefined) fail('PARAM_UNKNOWN', key);
  fail(REFUSAL_CODE[r.class] ?? 'PARAM_DEAD', key);
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function otherViewHas(cat: Catalog, view: CatView, id: string): boolean {
  const kit = cat.kits[view.kit];
  return !!kit && kit.views.some((vid) => {
    const other = cat.views[vid];
    return other !== undefined && (own(other.params, id) || own(other.const, id) || other.flags.includes(id));
  });
}

/** The view a kit and view name select, or a refusal. */
export function resolveView(cat: Catalog, kit: string, name: string | undefined): CatView {
  const k = own(cat.kits, kit) ? cat.kits[kit] : undefined;
  if (k === undefined) fail('KIT_UNKNOWN', 'kit');
  if (k.views.length === 0) fail('KIT_NOT_BUILDABLE', 'kit');
  const id = name === undefined ? k.defaultView : kit + '.' + name;
  const v = id === undefined || !own(cat.views, id) ? undefined : cat.views[id];
  if (v === undefined || v.kit !== kit) fail('VIEW_UNKNOWN', 'view');
  return v;
}

/** The protocol part of a port's host label (core's hostSegment). */
export type HostSegment = (projectId: string, containerId: string, protocol: string, port: string) => string;

function build(cat: Catalog, kit: string, target: EmbedTarget, opts: EmbedOptions, computersDomain: string, hostSegment?: HostSegment): string {
  const view = resolveView(cat, kit, opts.view);
  const svc = cat.services[view.service];
  if (svc === undefined || svc.port !== undefined) fail('KIT_NOT_BUILDABLE', 'kit');
  const bounds = svc.index ?? { min: 1, max: 1, default: 1 };
  const index = opts.index ?? bounds.default;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < bounds.min || index > bounds.max) fail('INDEX_OUT_OF_RANGE', 'index');

  const given = opts.params ?? {}, query = opts.query ?? {};
  const values = new Map<string, string[]>();
  const pathValues = new Map<string, { text: string; absolute: boolean }>();
  for (const [id, raw] of Object.entries(given)) {
    if (raw === undefined) continue;
    if (own(view.const, id) || view.flags.includes(id)) fail('CONST_OVERRIDE', id);
    const p = own(view.params, id) ? view.params[id] : undefined;
    if (p === undefined) {
      if (own(cat.kits[view.kit]?.refused ?? {}, id)) refuse(cat, view, id);
      if (otherViewHas(cat, view, id)) fail('PARAM_NOT_ON_VIEW', id);
      fail('PARAM_UNKNOWN', id);
    }
    if (p.class !== 'typed') fail('PARAM_NOT_TYPED', id);
    if (own(query, p.wire)) fail('DUPLICATE_KEY', id);
    if (p.in === 'path') pathValues.set(id, encodePathValue(p, id, raw));
    else values.set(id, queryValues(p, id, raw));
  }

  const wires = new Map<string, string>();
  for (const [id, p] of Object.entries(view.params)) wires.set(p.wire, id);
  const extra: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(query)) {
    if (own(view.const, key) || view.flags.includes(key)) fail('CONST_OVERRIDE', key);
    const id = wires.get(key);
    if (id !== undefined) {
      const p = view.params[id] as CatParam;
      if (p.class !== 'passthrough') fail('QUERY_NOT_PASSTHROUGH', key);
      for (const s of queryValues(p, key, raw)) extra.push([key, s]);
      continue;
    }
    if (own(cat.kits[view.kit]?.refused ?? {}, key)) refuse(cat, view, key);
    if (view.freeQuery) {
      if (hasLoneSurrogate(key)) fail('VALUE_INVALID', 'query');
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        const s = typeof item === 'string' ? item : String(item);
        if (s.includes('\u0000') || hasLoneSurrogate(s)) fail('VALUE_INVALID', key);
        extra.push([key, s]);
      }
      continue;
    }
    if (otherViewHas(cat, view, key)) fail('PARAM_NOT_ON_VIEW', key);
    fail('PARAM_UNKNOWN', key);
  }

  // Target and host.
  const c = target;
  const server = c?.server_name;
  if (!c || typeof c.id !== 'string' || c.id === '' || typeof c.project_id !== 'string' || c.project_id === '' || typeof server !== 'string' || server === '') fail('TARGET_INVALID', 'target');
  if (!DNS_LABEL.test(c.project_id)) fail('TARGET_INVALID', 'project_id');
  if (!DNS_LABEL.test(c.id)) fail('TARGET_INVALID', 'id');
  if (!DNS_LABEL.test(server)) fail('TARGET_INVALID', 'server_name');
  const domain = computersDomain;
  if (typeof domain !== 'string' || domain === '' || !domain.split('.').every((l) => DNS_LABEL.test(l)) || /^(?:\d+|0x[0-9a-f]*)$/i.test(domain.split('.').pop() as string)) {
    fail('TARGET_INVALID', 'computersDomain'); // the SDK's refusal field name (vectors.json), renamed with the computer rename
  }
  let segment = svc.segmentAtDefault !== undefined && index === 1 ? svc.segmentAtDefault : svc.segment.replace('{index}', String(index));
  const numbered = /^([a-z]+)-\{index\}$/.exec(svc.segment);
  if (hostSegment && numbered && segment === numbered[1] + '-' + index) segment = hostSegment(c.project_id, c.id, numbered[1] as string, String(index)) + '-' + index;
  const host = (c.project_id + '-' + c.id + '-' + segment + '.' + server + '.' + domain).toLowerCase();
  const longLabel = host.split('.').find((l) => l.length > 63);
  if (longLabel !== undefined) fail('HOST_LABEL_TOO_LONG', 'target');
  if (!host.split('.').every((l) => DNS_LABEL.test(l))) fail('TARGET_INVALID', 'target');

  for (const r of view.required) {
    if (!own(view.const, r) && !values.has(r) && !pathValues.has(r)) fail('REQUIRED_MISSING', r);
  }

  let path = view.path;
  for (const m of view.path.matchAll(/\{([^}]+)\}/g)) {
    const name = m[1] as string;
    const id = Object.entries(view.params).find(([pid, p]) => p.in === 'path' && (p.wire === name || pid === name))?.[0];
    const val = id !== undefined ? pathValues.get(id) : undefined;
    const token = '{' + name + '}';
    if (val === undefined) {
      if (id !== undefined && !view.required.includes(id) && path.includes('/' + token)) {
        path = path.replace('/' + token, '/');
        continue;
      }
      fail('REQUIRED_MISSING', name);
    }
    path = val.absolute ? path.replace('/' + token, '/' + val.text) : path.replace(token, val.text);
  }

  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(view.const)) pairs.push([k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)]);
  for (const f of view.flags) pairs.push([f, '']);
  for (const [id, p] of Object.entries(view.params)) {
    const vals = values.get(id);
    if (vals !== undefined) for (const s of vals) pairs.push([p.wire, s]);
  }
  pairs.push(...extra);
  const qs = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return 'https://' + host + path + (qs === '' ? '' : '?' + qs);
}

/** The URL of one kit view on a container, or the SDK's refusal code (see the contract). */
export function buildEmbedUrl(cat: Catalog, kit: string, target: EmbedTarget, opts: EmbedOptions, ctx: { computersDomain: string; hostSegment?: HostSegment }): EmbedResult {
  try {
    return { url: build(cat, kit, target, opts, ctx.computersDomain, ctx.hostSegment) };
  } catch (e) {
    if (e instanceof Refusal) return { refused: e.code, field: e.field };
    throw e;
  }
}
