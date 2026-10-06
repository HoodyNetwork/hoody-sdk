/**
 * Embed URL runtime: builds the URL of any Hoody kit UI view from the generated embeds table.
 *
 * Every rule here is data in the table (the same object the public construction catalog publishes): the
 * view path, which params a view accepts and how each is validated and serialized, the index bounds, the
 * alias class. This module only interprets it. It is browser-safe: no Node APIs.
 *
 * Refusals are never silent. A param the table marks forced, excluded, non-UI or unsupported is refused
 * with a code; an index outside the published bounds is refused rather than clamped; `local: true` is
 * refused because several kit UIs only work at the host root.
 */
import { ValidationError } from '../../generated/errors.js';
import { EMBEDS_CATALOG } from '../../generated/embeds.generated.js';

export type EmbedErrorCode =
  | 'KIT_UNKNOWN'
  | 'KIT_NOT_BUILDABLE'
  | 'VIEW_UNKNOWN'
  | 'LOCAL_REFUSED'
  | 'INDEX_OUT_OF_RANGE'
  | 'INDEX_NOT_SUPPORTED'
  | 'PORT_INVALID'
  | 'TARGET_INVALID'
  | 'ALIAS_URL_MISSING'
  | 'ALIAS_MISMATCH'
  | 'ALIAS_VIEW_UNSUPPORTED'
  | 'ALIAS_TARGET_PATH_CONFLICT'
  | 'PARAM_UNKNOWN'
  | 'PARAM_FORCED'
  | 'PARAM_EXCLUDED'
  | 'PARAM_NON_UI'
  | 'PARAM_DEAD'
  | 'PARAM_NOT_ON_VIEW'
  | 'PARAM_NOT_TYPED'
  | 'QUERY_NOT_PASSTHROUGH'
  | 'DUPLICATE_KEY'
  | 'CONST_OVERRIDE'
  | 'REQUIRED_MISSING'
  | 'VALUE_INVALID'
  | 'PATH_INVALID'
  | 'HOST_LABEL_TOO_LONG';

export class EmbedValidationError extends ValidationError {
  readonly code: EmbedErrorCode;
  constructor(code: EmbedErrorCode, message: string, field?: string) {
    super(`${code}: ${message}`, field);
    this.name = 'EmbedValidationError';
    this.code = code;
  }
}

type Scalar = string | number | boolean;
export type EmbedParamValue = Scalar | ReadonlyArray<string | number> | Record<string, unknown>;
export type EmbedQuery = Record<string, Scalar | ReadonlyArray<string>>;

/**
 * A container as hoody-api returns it, or hand-built. The server name is `server_name`, else `server`: a string
 * when hand-built, the server-details object (`{ name, country, … }`) in a `containers.list` item.
 */
export interface EmbedContainerTarget {
  id: string;
  project_id: string;
  server_name?: string | null;
  server?: string | { name?: string | null } | null;
}

/** A ProxyAlias as hoody-api returns it. The alias `url` is the origin; hoody-api computes it. */
export interface EmbedAliasTarget {
  alias: string;
  program: string;
  index: number;
  url: string | null;
  target_path?: string | null;
}

export type EmbedTarget = EmbedContainerTarget | EmbedAliasTarget;

export interface EmbedBuildOptions {
  /** View name within the kit (`session`), or omitted for the kit's default view. */
  view?: string;
  /** Service index, 1 or more. Defaults to 1. */
  index?: number;
  /** Port, for the http and https user-content kits. */
  port?: number;
  /** Typed params (path params included), by param id. */
  params?: Record<string, EmbedParamValue | undefined>;
  /** Passthrough params by wire name, in the order they should appear; any key on a user-content view. */
  query?: EmbedQuery;
  /** Refused: see the module comment. */
  local?: boolean;
}

export interface EmbedBuildContext {
  /** The containers domain. When omitted it is derived from `baseUrl` (see deriveContainersDomain). */
  containersDomain?: string;
  /** The API base URL the containers domain is derived from. */
  baseUrl?: string;
  /**
   * The SDK's `getKitUrl`. When given, the host of a container target comes from it, so a client's own
   * domain configuration applies. It returns a bare origin, `scheme://host[:port]` (http or https, a trailing / is
   * allowed); a user name or password, a path, a query or a fragment is refused (TARGET_INVALID).
   */
  getKitUrl?: (kit: string, container: EmbedContainerTarget, opts: { serviceIndex?: number; port?: number }) => string;
}

type CatalogT = typeof EMBEDS_CATALOG;
interface RtParam {
  wire: string;
  in: 'query' | 'path';
  type: string;
  class: string;
  enum?: ReadonlyArray<Scalar>;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
  wirePattern?: string;
  format?: string;
  repeat?: string;
  serialize?: string;
  encoder?: string;
}
interface RtView {
  kit: string;
  view: string;
  service: string;
  program: string;
  default: boolean;
  path: string;
  params: Record<string, RtParam>;
  required: ReadonlyArray<string>;
  const: Record<string, Scalar>;
  flags: ReadonlyArray<string>;
  freeQuery: boolean;
  alias: string;
  aliasSelector?: string;
}
interface RtService {
  segment: string;
  segmentAtDefault?: string;
  index?: { min: number; max: number; default: number };
  port?: { min: number; max: number };
}
interface RtKit {
  ui: string;
  defaultView?: string;
  views: ReadonlyArray<string>;
  refused: Record<string, { class: string; reasonCode: string; replacement?: string }>;
}
interface RtCatalog {
  domain: { fallback: string };
  services: Record<string, RtService>;
  kits: Record<string, RtKit>;
  views: Record<string, RtView>;
}

const CATALOG = EMBEDS_CATALOG as unknown as RtCatalog;

/** A deep copy of the construction catalog. */
export function getEmbedCatalog(): CatalogT {
  return JSON.parse(JSON.stringify(EMBEDS_CATALOG)) as CatalogT;
}

/**
 * The containers domain for an API base URL, by the same ordered branches as the SDK client: IPv4, IPv6,
 * `localhost` and `*.localhost` hosts are kept; `containers.*` is kept; a 24-hex realm label before `.api.`
 * is replaced; `api.` becomes `containers.`; the first `.api.` becomes `.containers.`; otherwise
 * `containers.` is prepended. No or an unparseable base URL gives `containers.hoody.com`.
 */
export function deriveContainersDomain(baseUrl?: string): string {
  const fallback = 'containers.hoody.com';
  if (baseUrl === undefined || baseUrl === '') return fallback;
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return fallback;
  }
  if (!host) return fallback;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || host === 'localhost' || host.endsWith('.localhost')) return host;
  if (host.startsWith('containers.')) return host;
  const realm = /^[a-f0-9]{24}\.api\./i;
  if (realm.test(host)) return host.replace(realm, 'containers.');
  if (host.startsWith('api.')) return `containers.${host.slice(4)}`;
  const replaced = host.replace('.api.', '.containers.');
  if (replaced !== host) return replaced;
  return `containers.${host}`;
}

function fail(code: EmbedErrorCode, message: string, field?: string): never {
  throw new EmbedValidationError(code, message, field);
}

/** One DNS label: letters, digits and inner hyphens. A container's project_id, id and server name are each one. */
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/**
 * True when no subdomain can be put in front of the domain: a bracketed IPv6 literal, or a last label the URL parser
 * reads as an IPv4 number (decimal or 0x), so `…sg-sin-1.127.0.0.1` is parsed as an address and refused. A domain
 * with ':' outside brackets never gets here: a given one is refused first, a parsed hostname has none.
 */
function isIpDomain(domain: string): boolean {
  if (domain.startsWith('[')) return true;
  const labels = domain.split('.');
  if (labels.length > 1 && labels[labels.length - 1] === '') labels.pop();
  return /^(?:\d+|0x[0-9a-f]*)$/i.test(labels[labels.length - 1]!);
}

/**
 * For a clearer refusal only: the host of a URL that did not parse, when that host is or ends in an IP address. It
 * never names a host that a user name or password could be part of: with an '@' anywhere in the URL, or a ':' left
 * once a numeric port and a bracketed IPv6 literal are set aside, the caller falls back to the generic refusal.
 */
function unparsedIpHost(url: string): string | undefined {
  // A special scheme ends the authority at a backslash too.
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/\\?#]*)/i.exec(url)?.[1];
  if (authority === undefined || url.includes('@')) return undefined;
  const bracketed = /^((?:[^:@[\]]*\.)?\[[^\]]*\])(?::\d*)?$/.exec(authority);
  if (bracketed !== null) return bracketed[1];
  const bare = authority.replace(/:\d*$/, '');
  if (bare.includes(':') || bare.includes('[')) return undefined;
  return isIpDomain(bare) ? bare : undefined;
}

function ipHostMessage(host: string): string {
  return `the kit host ${host} is an IP address, or ends in one; a kit host needs a DNS name`;
}

function isAliasTarget(t: EmbedTarget): t is EmbedAliasTarget {
  return typeof t === 'object' && t !== null && 'alias' in t && 'program' in t;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Whether `s` holds a lone surrogate, on which encodeURIComponent throws a URIError. One pass over `s`. */
function hasLoneSurrogate(s: string): boolean {
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

function checkScalar(p: RtParam, key: string, v: unknown): string {
  if (p.serialize === 'json') {
    if (!isPlainObject(v)) fail('VALUE_INVALID', `${key} must be a plain object`, key);
    return JSON.stringify(v);
  }
  let s: string;
  switch (p.type) {
    case 'integer':
      if (typeof v !== 'number' || !Number.isInteger(v)) fail('VALUE_INVALID', `${key} must be an integer`, key);
      s = String(v);
      break;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) fail('VALUE_INVALID', `${key} must be a finite number`, key);
      s = String(v);
      break;
    case 'boolean':
      if (typeof v !== 'boolean') fail('VALUE_INVALID', `${key} must be a boolean`, key);
      s = v ? 'true' : 'false';
      break;
    default:
      if (typeof v !== 'string') fail('VALUE_INVALID', `${key} must be a string`, key);
      s = v;
  }
  if (typeof v === 'number') {
    if (p.min !== undefined && v < p.min) fail('VALUE_INVALID', `${key} must be at least ${p.min}`, key);
    if (p.max !== undefined && v > p.max) fail('VALUE_INVALID', `${key} must be at most ${p.max}`, key);
  }
  if (s.includes('\u0000')) fail('VALUE_INVALID', `${key} must not contain NUL`, key);
  if (hasLoneSurrogate(s)) fail('VALUE_INVALID', `${key} must not contain a lone surrogate`, key);
  if (p.enum !== undefined && !p.enum.some((e) => e === v)) fail('VALUE_INVALID', `${key} must be one of ${p.enum.map((e) => JSON.stringify(e)).join(', ')}`, key);
  if (p.maxLength !== undefined && s.length > p.maxLength) fail('VALUE_INVALID', `${key} must be at most ${p.maxLength} characters`, key);
  if (p.pattern !== undefined && !new RegExp(p.pattern).test(s)) fail('VALUE_INVALID', `${key} must match ${p.pattern}`, key);
  if (p.wirePattern !== undefined && !new RegExp(p.wirePattern).test(s)) fail('VALUE_INVALID', `${key} must match ${p.wirePattern}`, key);
  if (p.format === 'uri') {
    try {
      new URL(s);
    } catch {
      fail('VALUE_INVALID', `${key} must be an absolute URL`, key);
    }
  }
  return s;
}

function queryValues(p: RtParam, key: string, v: unknown): string[] {
  if (p.repeat === 'ordered') {
    if (!Array.isArray(v)) fail('VALUE_INVALID', `${key} must be an array`, key);
    return v.map((item: unknown) => checkScalar({ ...p, type: typeof item === 'number' ? 'number' : 'string' }, key, item));
  }
  return [checkScalar(p, key, v)];
}

function encodePathValue(p: RtParam, key: string, v: unknown): { text: string; absolute: boolean } {
  if (typeof v !== 'string' || v === '') fail('PATH_INVALID', `${key} must be a non-empty string`, key);
  if (v.includes('\u0000')) fail('PATH_INVALID', `${key} must not contain NUL`, key);
  if (hasLoneSurrogate(v)) fail('PATH_INVALID', `${key} must not contain a lone surrogate`, key);
  if (p.maxLength !== undefined && v.length > p.maxLength) fail('PATH_INVALID', `${key} must be at most ${p.maxLength} characters`, key);
  switch (p.encoder) {
    case 'path-segments': {
      if (!v.startsWith('/')) fail('PATH_INVALID', `${key} must be an absolute path starting with /`, key);
      const segs = v.slice(1).split('/');
      if (segs.some((s) => s === '.' || s === '..')) fail('PATH_INVALID', `${key} must not contain . or .. segments`, key);
      return { text: segs.map((s) => encodeURIComponent(s)).join('/'), absolute: true };
    }
    case 'pipe-path': {
      for (const re of [p.pattern, p.wirePattern]) if (re !== undefined && !new RegExp(re).test(v)) fail('PATH_INVALID', `${key} must match ${re}`, key);
      // Each segment is percent-encoded so any path the kit accepts can be expressed (a space, %, ? or #).
      const text = v.split('/').map((s) => encodeURIComponent(s)).join('/');
      if (text.length > 1023) fail('PATH_INVALID', `${key} is longer than 1023 characters once encoded`, key);
      return { text, absolute: false };
    }
    default:
      for (const re of [p.pattern, p.wirePattern]) if (re !== undefined && !new RegExp(re).test(v)) fail('VALUE_INVALID', `${key} must match ${re}`, key);
      if (p.enum !== undefined && !p.enum.some((e) => e === v)) fail('VALUE_INVALID', `${key} must be one of ${p.enum.map((e) => JSON.stringify(e)).join(', ')}`, key);
      return { text: encodeURIComponent(v), absolute: false };
  }
}

function refusedOf(view: RtView): RtKit['refused'] {
  return CATALOG.kits[view.kit]?.refused ?? {};
}

function refuse(view: RtView, key: string, field: string): never {
  const r = refusedOf(view)[key];
  if (r === undefined) fail('PARAM_UNKNOWN', `${key} is not a parameter of ${view.kit}.${view.view}`, field);
  switch (r.class) {
    case 'forced':
      fail('PARAM_FORCED', `${key} is set by the platform from the host${r.replacement !== undefined ? `; use ${r.replacement}` : ''}`, field);
    case 'excluded':
      fail('PARAM_EXCLUDED', `${key} cannot be set in an embed URL (${r.reasonCode})`, field);
    case 'nonUi':
      fail('PARAM_NON_UI', `${key} switches the operation away from its UI`, field);
    default:
      fail('PARAM_DEAD', `${key} is not supported (${r.reasonCode})`, field);
  }
}

function otherViewHas(view: RtView, id: string): boolean {
  const kit = CATALOG.kits[view.kit];
  if (kit === undefined) return false;
  return kit.views.some((vid) => {
    const other = CATALOG.views[vid];
    return other !== undefined && (id in other.params || id in other.const || other.flags.includes(id));
  });
}

function wireToId(view: RtView): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, p] of Object.entries(view.params)) m.set(p.wire, id);
  return m;
}

function resolveView(kit: string, name: string | undefined): RtView {
  const k = CATALOG.kits[kit];
  if (k === undefined) fail('KIT_UNKNOWN', `unknown kit ${JSON.stringify(kit)}`, 'kit');
  if (k.views.length === 0) fail('KIT_NOT_BUILDABLE', `${kit} has no embeddable view (${k.ui})`, 'kit');
  const id = name === undefined ? k.defaultView : `${kit}.${name}`;
  const v = id === undefined ? undefined : CATALOG.views[id];
  if (v === undefined || v.kit !== kit) fail('VIEW_UNKNOWN', `unknown view ${JSON.stringify(name)} for ${kit}`, 'view');
  return v;
}

/**
 * Build the URL of one kit UI view.
 *
 * @param kit    kit slug, e.g. `terminal`, `files`, `notifications`
 * @param target a container (`id`, `project_id`, `server_name`) or a ProxyAlias
 * @param opts   view, index, typed params and passthrough query
 * @param ctx    containers domain, API base URL, or the SDK's getKitUrl
 */
export function buildEmbedUrl(kit: string, target: EmbedTarget, opts: EmbedBuildOptions = {}, ctx: EmbedBuildContext = {}): string {
  const view = resolveView(kit, opts.view);
  if (opts.local === true) fail('LOCAL_REFUSED', 'local URLs are refused for embeds: several kit UIs only work at the host root', 'local');
  const svc = CATALOG.services[view.service];
  if (svc === undefined) fail('KIT_NOT_BUILDABLE', `${kit} has no host rule`, 'kit');

  // Index or port.
  let index = 1;
  let port: number | undefined;
  if (svc.port !== undefined) {
    if (opts.index !== undefined) fail('INDEX_NOT_SUPPORTED', `${kit} takes a port, not an index`, 'index');
    if (typeof opts.port !== 'number' || !Number.isInteger(opts.port) || opts.port < svc.port.min || opts.port > svc.port.max) {
      fail('PORT_INVALID', `port must be an integer ${svc.port.min}-${svc.port.max}`, 'port');
    }
    port = opts.port;
  } else {
    if (opts.port !== undefined) fail('PORT_INVALID', `${kit} takes an index, not a port`, 'port');
    const bounds = svc.index ?? { min: 1, max: 1, default: 1 };
    const alias = isAliasTarget(target) ? target : undefined;
    const requested = opts.index ?? (alias !== undefined ? alias.index : bounds.default);
    if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < bounds.min || requested > bounds.max) {
      fail('INDEX_OUT_OF_RANGE', `${view.service} index must be ${bounds.min}-${bounds.max}`, 'index');
    }
    index = requested;
  }

  // Typed params.
  const given = opts.params ?? {};
  const query = opts.query ?? {};
  const values = new Map<string, string[]>();
  const pathValues = new Map<string, { text: string; absolute: boolean }>();
  for (const [id, raw] of Object.entries(given)) {
    if (raw === undefined) continue;
    if (id in view.const || view.flags.includes(id)) fail('CONST_OVERRIDE', `${id} is fixed by the ${view.kit}.${view.view} view`, id);
    const p = view.params[id];
    if (p === undefined) {
      if (id in refusedOf(view)) refuse(view, id, id);
      if (otherViewHas(view, id)) fail('PARAM_NOT_ON_VIEW', `${id} is not valid on ${view.kit}.${view.view}`, id);
      fail('PARAM_UNKNOWN', `${id} is not a parameter of ${view.kit}.${view.view}`, id);
    }
    if (p.class !== 'typed') fail('PARAM_NOT_TYPED', `${id} is a query parameter; pass it in query`, id);
    if (p.wire in query) fail('DUPLICATE_KEY', `${p.wire} is given both as a param and in query`, id);
    if (p.in === 'path') pathValues.set(id, encodePathValue(p, id, raw));
    else values.set(id, queryValues(p, id, raw));
  }

  // Passthrough query.
  const wires = wireToId(view);
  const extra: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(query)) {
    if (key in view.const || view.flags.includes(key)) fail('CONST_OVERRIDE', `${key} is fixed by the ${view.kit}.${view.view} view`, key);
    const id = wires.get(key);
    if (id !== undefined) {
      const p = view.params[id]!;
      if (p.class !== 'passthrough') fail('QUERY_NOT_PASSTHROUGH', `${key} is a typed param; pass it in params`, key);
      for (const s of queryValues(p, key, raw)) extra.push([key, s]);
      continue;
    }
    if (key in refusedOf(view)) refuse(view, key, key);
    if (view.freeQuery) {
      // The key is the caller's own text here, so it is encoded as given and must be encodable.
      if (hasLoneSurrogate(key)) fail('VALUE_INVALID', 'a query key must not contain a lone surrogate', 'query');
      const list = Array.isArray(raw) ? raw : [raw];
      for (const item of list) {
        const s = typeof item === 'string' ? item : String(item);
        if (s.includes('\u0000')) fail('VALUE_INVALID', `${key} must not contain NUL`, key);
        if (hasLoneSurrogate(s)) fail('VALUE_INVALID', `${key} must not contain a lone surrogate`, key);
        extra.push([key, s]);
      }
      continue;
    }
    if (otherViewHas(view, key)) fail('PARAM_NOT_ON_VIEW', `${key} is not valid on ${view.kit}.${view.view}`, key);
    fail('PARAM_UNKNOWN', `${key} is not a parameter of ${view.kit}.${view.view}`, key);
  }

  // Target and host.
  let origin: string;
  let builtHost: string | undefined;
  let fromHook = false;
  if (isAliasTarget(target)) {
    if (target.url === null || target.url === undefined || target.url === '') fail('ALIAS_URL_MISSING', 'the alias has no url', 'target');
    // Refused first: a port kit has no index, so comparing the alias index to it would misreport the failure.
    if (view.alias === 'refused') fail('ALIAS_VIEW_UNSUPPORTED', `${view.kit}.${view.view} cannot be opened through an alias`, 'target');
    if (target.program !== view.program) fail('ALIAS_MISMATCH', `alias program ${target.program} does not serve ${view.kit}.${view.view}`, 'target');
    if (target.index !== index) fail('ALIAS_MISMATCH', `alias index ${target.index} differs from requested index ${index}`, 'target');
    if (target.target_path !== null && target.target_path !== undefined && view.path === '/') {
      fail('ALIAS_TARGET_PATH_CONFLICT', 'the alias has a target path, which replaces the root path of this view', 'target');
    }
    let aliasUrl: URL;
    try {
      aliasUrl = new URL(target.url);
    } catch {
      const ip = unparsedIpHost(target.url);
      fail('TARGET_INVALID', ip !== undefined ? ipHostMessage(ip) : 'the alias url is not a valid URL', 'target');
    }
    // A javascript:, data: or other non-http origin serializes as the string "null". The scheme is not repeated: in a
    // scheme-less 'bob:hunter2@h.test' the parser reads the user name as one.
    if (aliasUrl.protocol !== 'http:' && aliasUrl.protocol !== 'https:') fail('TARGET_INVALID', 'the alias url must be http or https', 'target');
    origin = aliasUrl.origin;
    if (view.alias === 'selector' && view.aliasSelector !== undefined && !values.has(view.aliasSelector)) {
      values.set(view.aliasSelector, [String(index)]);
    }
  } else {
    const c = target as EmbedContainerTarget;
    const given = c?.server_name ?? c?.server;
    const server = typeof given === 'object' && given !== null ? given.name : given;
    if (!c || typeof c.id !== 'string' || c.id === '' || typeof c.project_id !== 'string' || c.project_id === '' || typeof server !== 'string' || server === '') {
      fail('TARGET_INVALID', 'a container target needs id, project_id and server_name', 'target');
    }
    // Each is interpolated into the host, so each must be exactly one DNS label: 'evil.test/' or 'u@evil.test/' in
    // server_name would otherwise move the host.
    if (!DNS_LABEL.test(c.project_id)) fail('TARGET_INVALID', 'project_id must be one DNS label: letters, digits and inner hyphens', 'project_id');
    if (!DNS_LABEL.test(c.id)) fail('TARGET_INVALID', 'id must be one DNS label: letters, digits and inner hyphens', 'id');
    if (!DNS_LABEL.test(server)) fail('TARGET_INVALID', 'server_name must be one DNS label: letters, digits and inner hyphens', 'server_name');
    if (ctx.getKitUrl !== undefined) {
      const kitUrlOpts = port !== undefined ? { port } : { serviceIndex: index };
      // The hook gets the resolved name as server_name: a client that reads server_name ?? server as a string would
      // otherwise put a server-details object in the host.
      const hookTarget = c.server_name === server ? c : { ...c, server_name: server };
      origin = ctx.getKitUrl(view.service, hookTarget, kitUrlOpts).replace(/\/+$/, '');
      fromHook = true;
    } else {
      const given = ctx.containersDomain;
      // ':' outside brackets is a port or garbage, never an IP address, and so is anything but ':port' after a bracketed
      // literal. A port on good labels says so; on bad ones the message says both. None repeats the value.
      const stray = given === undefined ? false : given.startsWith('[') ? given.replace(/^\[[^\]]*\](?::\d+)?/, '') !== '' : given.includes(':');
      if (given !== undefined && stray) {
        const beforePort = /^([^:]+):\d+$/.exec(given)?.[1];
        const labels = beforePort !== undefined && beforePort.split('.').every((l) => DNS_LABEL.test(l));
        fail('TARGET_INVALID', labels ? 'containersDomain must not include a port'
          : beforePort !== undefined ? 'containersDomain must be DNS labels joined by dots, with no port'
          : 'containersDomain must be DNS labels joined by dots', 'containersDomain');
      }
      const domain = given ?? deriveContainersDomain(ctx.baseUrl);
      if (isIpDomain(domain)) {
        if (given !== undefined) {
          // Repeated only when it is plainly a host: a value with '@' or other punctuation may hold a user name or
          // password ('bob@10.0.0.1').
          const shown = /^[a-z0-9.-]+$/i.test(given) || /^\[[0-9a-f:.]*\]$/i.test(given) ? `containersDomain ${given}` : 'containersDomain';
          fail('TARGET_INVALID', `${shown} is not a DNS name (it ends in an IP address or a numeric label)`, 'containersDomain');
        }
        fail('TARGET_INVALID', 'an IP-address base URL has no containers domain; pass containersDomain', 'target');
      }
      // Given or derived, the domain is labels: a derived one comes from a parsed hostname, which may still hold '_'
      // or end in a dot.
      if (!domain.split('.').every((l) => DNS_LABEL.test(l))) {
        if (ctx.containersDomain !== undefined) fail('TARGET_INVALID', 'containersDomain must be DNS labels joined by dots', 'containersDomain');
        fail('TARGET_INVALID', `the containers domain ${domain} derived from baseUrl must be DNS labels joined by dots`, 'target');
      }
      let segment: string;
      if (port !== undefined) segment = svc.segment.replace('{port}', String(port));
      else if (svc.segmentAtDefault !== undefined && index === 1) segment = svc.segmentAtDefault;
      else segment = svc.segment.replace('{index}', String(index));
      builtHost = `${c.project_id}-${c.id}-${segment}.${server}.${domain}`;
      origin = `https://${builtHost}`;
    }
  }
  // Whatever made it, the origin must parse as an http(s) URL: a browser would resolve '//host' or a bad port its
  // own way, or not at all.
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    const ip = unparsedIpHost(origin);
    fail('TARGET_INVALID', ip !== undefined ? ipHostMessage(ip) : 'the kit url is not a valid URL', 'target');
  }
  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') fail('TARGET_INVALID', 'the kit url must be http or https', 'target');
  // A hook returns an origin. Anything past it would be emitted in front of the view path, so it is refused.
  if (fromHook) {
    if (originUrl.username !== '' || originUrl.password !== '') fail('TARGET_INVALID', 'the kit url must not carry a user name or password', 'target');
    if (originUrl.pathname !== '/' || originUrl.search !== '' || originUrl.hash !== '') fail('TARGET_INVALID', 'the kit url must be an origin: no path, query or fragment', 'target');
  }
  const host = originUrl.hostname;
  // Backstop for the host built here: it must parse back to itself.
  if (builtHost !== undefined && host !== builtHost.toLowerCase()) fail('TARGET_INVALID', `the host ${builtHost} parses as ${host}`, 'target');
  // Every source (template, hook, alias) meets the same rules on the host the browser will use.
  if (isIpDomain(host)) fail('TARGET_INVALID', ipHostMessage(host), 'target');
  // A DNS label is at most 63 octets (RFC 1035 2.3.4), whoever made the host: a 24-hex project and container id
  // with terminal index 10000 or more make a 64-character label that no resolver or certificate can carry. It is
  // measured on the hostname the browser resolves, as the reference interpreter does: userinfo is not the host, an
  // IDN label counts in punycode, a percent-escape counts decoded.
  const longLabel = host.split('.').find((l) => l.length > 63);
  if (longLabel !== undefined) fail('HOST_LABEL_TOO_LONG', `the host label ${longLabel} is ${longLabel.length} characters; a DNS label holds at most 63`, 'target');
  if (!host.split('.').every((l) => DNS_LABEL.test(l))) {
    fail('TARGET_INVALID', `the kit host ${host} is not a DNS name: each label is letters, digits and inner hyphens, with no empty label or trailing dot`, 'target');
  }

  // Required.
  for (const r of view.required) {
    if (!(r in view.const) && !values.has(r) && !pathValues.has(r)) fail('REQUIRED_MISSING', `${r} is required on ${view.kit}.${view.view}`, r);
  }

  // Path.
  let path = view.path;
  for (const m of view.path.matchAll(/\{([^}]+)\}/g)) {
    const name = m[1]!;
    const id = Object.entries(view.params).find(([pid, p]) => p.in === 'path' && (p.wire === name || pid === name))?.[0];
    const val = id !== undefined ? pathValues.get(id) : undefined;
    const token = `{${name}}`;
    if (val === undefined) {
      // An absent optional path param collapses its segment: '/{path}' becomes '/'.
      if (id !== undefined && !view.required.includes(id) && path.includes(`/${token}`)) {
        path = path.replace(`/${token}`, '/');
        continue;
      }
      fail('REQUIRED_MISSING', `${name} is required on ${view.kit}.${view.view}`, name);
    }
    path = val.absolute ? path.replace(`/${token}`, `/${val.text}`) : path.replace(token, val.text);
  }

  // Query: const, flags, typed params in view order, passthrough in caller order.
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(view.const)) pairs.push([k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)]);
  for (const f of view.flags) pairs.push([f, '']);
  for (const [id, p] of Object.entries(view.params)) {
    const vals = values.get(id);
    if (vals !== undefined) for (const s of vals) pairs.push([p.wire, s]);
  }
  pairs.push(...extra);
  const qs = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${originUrl.origin}${path}${qs === '' ? '' : `?${qs}`}`;
}

/** The view ids of a kit, default first. */
export function listEmbedViews(kit: string): string[] {
  const k = CATALOG.kits[kit];
  if (k === undefined) return [];
  const ids = [...k.views];
  return k.defaultView !== undefined ? [k.defaultView, ...ids.filter((v) => v !== k.defaultView)] : ids;
}
