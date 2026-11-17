// buildCatalog: the API page's catalog from its four sources. Pure: no I/O, no clock. The
// generator (hub/scripts/api-catalog-gen.ts) and the sync test read the files and pass them in; the hermetic tests
// pass a fixture slice and their own text fixes.
//
// Rules:
//   1. Inventory: every operation of `paths` and `x-additional-paths` once, by operationId. A method alias (an
//      operation whose x-original-operation-id names a base on the same path, the `_patch` twins) folds into its base
//      as `also`, as the docs do. Any other x-original-operation-id stays its own
//      row (exec's POST /{path} is a different request from GET /exec/{path}).
//   2. Auth: an account operation sends `Bearer $HOODY_TOKEN`, except PUBLIC_OPS, which send none. One with no declared
//      security still sends it, marked authUndeclared (the snippet says so).
//   3. Notes: its own kind; the snippet takes its header from the notes identity scheme, never the account token.
//   4. Host: an operation's own or its path's server template; one with neither takes its service siblings' host when
//      they all agree, else none (the page shows "See the docs"). Every declared template is judged whole and raw, a
//      folded operation's too, before anything of it is dropped: one server, no "container" before the SDK's fix
//      rewrites it, and after the fix exactly a program host under computers.<public domain>.
//      The root server is judged the same way, raw and before any fix. A `servers` that is not a list of objects with a
//      url fails the build: it never falls back to a sibling's host.
//   5. Docs: the page route only (no anchors), from the docs mapping as the docs resolve it. An operation with no page
//      must be on NO_DOCS_OPS or be one the docs drop by name (the mapping's global excludeOperationIds: their own
//      decision that it has no page), and one on NO_DOCS_OPS must have no page.
//   6. Examples: an operation gets an example only if the build can show it is complete; otherwise that tab is left out
//      (logic.ts falls back to a tab that is complete, or to none, and the row says "See the docs"). So: a parameter that
//      names the program's instance (path, query or a required body field, in the order the SDK reads them) is instanceBy
//      and gets no plain HTTP; a body with alternative required inputs, in its schema or in its fields' own words, is
//      `other`; a CLI line needs one command declaration that takes every required input. `note` hears each CLI line left out.
//   9. Text: every string taken from an input passes canonicalizeComputerHosts then replaceDevDomains; every string in
//      the output then passes the public-text gate (no development domain, no internal host, no "container"). Any problem fails
//      the build with the whole list.
import { serviceOfId, type AuthKind, type BodyType, type Catalog, type CatalogBody, type CatalogHost, type CatalogOp, type CatalogSdk, type CatalogService } from './catalog';

/** The two SDK text fixes (scripts/dev-domain-replace.ts), bound to the public domain by the caller. */
export interface TextFixes {
  readonly canonicalizeComputerHosts: (s: string) => string;
  readonly replaceDevDomains: (s: string) => string;
}

export interface CatalogInputs {
  readonly spec: unknown;
  readonly sdkMappings: unknown;
  readonly cliMappings: unknown;
  /** The generated CLI's commands, by cli-mappings key (parseCliCommands on cli/commands/*.ts): what a command really
   *  requires. A mapping with none here gets no CLI line. */
  readonly cliCommands: Readonly<Record<string, CliCommand>>;
  /** The SDK's SERVICE_INDEX_PARAMS: which path or query parameter names a program's instance (lib/service-index-params.ts). */
  readonly indexParams: Readonly<Record<string, readonly string[]>>;
  /** The SDK's SERVICE_INDEX_BODY_PARAMS: which body field does. */
  readonly indexBodyParams: Readonly<Record<string, readonly string[]>>;
  /** Hears each CLI line left out and why (the generator's --counts). */
  readonly note?: (id: string, reason: string) => void;
  /** The domain the text fixes rewrite to (`hoody.com`). */
  readonly publicDomain: string;
  /** The docs site's API page mapping, parsed. */
  readonly docsMapping: unknown;
  readonly sources: Catalog['sources'];
}

/** Account operations that need no token (rule 2). The account API has no openapi, docs or health operation: those
 *  are kit operations, which never carry the account token anyway. */
export const PUBLIC_OPS: readonly string[] = ['api_waitlistJoin', 'api_waitlistEnrich'];

/** Operations with no docs page (rule 5): the docs leave the waitlist out (excludeTags). Listed all the same: the
 *  page is an index of everything. An operation the docs drop by name (the mapping's global excludeOperationIds, as
 *  the browser-only operations of the challenge check page and the OAuth waiting page) needs no entry here: the
 *  mapping itself says it has no page, and the build reads that. */
export const NO_DOCS_OPS: readonly string[] = ['api_waitlistJoin', 'api_waitlistEnrich'];

/** Operations the docs mapping does not list yet, shown with the page of a sibling operation (id -> sibling id). */
export const DOCS_SAME_PAGE: Readonly<Record<string, string>> = { agent_getSessionImage: 'agent_getSessionTranscript' };

/** The account API's service id (operationId prefix). */
export const ACCOUNT_SERVICE = 'api';
export const NOTES_SERVICE = 'notes';
const NOTES_SCHEME = 'notesIdentityBearer';

/** Words no emitted string may hold. */
const GATE: ReadonlyArray<readonly [string, RegExp]> = [
  // Any site of the product's name but the public one.
  ['development domain', /(?<![a-z0-9-])hoody\.(?!com(?![a-z0-9-]))[a-z]{2,}(?![a-z0-9-])/i],
  ['container', /container/i],
  ['internal host', /\blocalhost\b|\b127\.\d+\.\d+\.\d+\b|\b10\.\d+\.\d+\.\d+\b|\b192\.168\.\d+\.\d+\b|\b172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+\b|\.internal\b|\.local\b/i],
];

/** One generated CLI command: its required arguments (`<id>`) and required options (`--alias <alias>`, `--enabled`);
 *  the inputs it takes, by request name (null: the line above already carries it; else the optional option that gives
 *  it); and whether it refuses to run with no body field given while none of its required inputs is one. */
export interface CliCommand {
  readonly args: readonly string[];
  readonly flags: readonly string[];
  readonly inputs: Readonly<Record<string, string | null>>;
  readonly needsBody: boolean;
  /** A required input of the line is a body field, so every run of it sends at least one. */
  readonly bodyOnLine?: boolean;
}

export class CatalogBuildError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`api catalog: ${problems.length} problem(s)\n  ${problems.slice(0, 50).join('\n  ')}`);
  }
}

const HTTP_KEYS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
// x-additional-paths carry WebDAV and kit verbs too (MKCOL, COPY, PROPFIND, CHECKAUTH, ...): any key that holds an
// operation object is a method there.
const NOT_METHOD = new Set(['servers', 'parameters', 'summary', 'description', '$ref']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface RawOp {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly op: Obj;
  readonly pathItem: Obj;
  readonly extra: boolean;
}

/** A `servers` declaration as written, judged before anything rewrites it: a list of objects with a url, none in the
 *  retired family. Null: it is not, and the problem is recorded. Absent is an empty list. */
function rawServers(v: unknown, where: string, problems: string[]): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => isObj(x) && typeof x.url === 'string')) { problems.push(`${where}: server declaration not understood`); return null; }
  const urls = v.map((x) => (x as { url: string }).url);
  // Raw: the SDK's fix rewrites a retired host to a good one, and would hide it.
  const retired = urls.find((u) => /container/i.test(u));
  if (retired !== undefined) { problems.push(`${where}: host in the retired containers family: ${retired}`); return null; }
  return urls;
}

const KIT_HOST = /^https:\/\/\{projectId\}-\{computerId\}-([a-z0-9]+(?:-[a-z0-9]+)*?)(-\{serviceIndex\})?\.\{server\}\.([a-z0-9.-]+)$/;

export function buildCatalog(inp: CatalogInputs, fixes: TextFixes): Catalog {
  const problems: string[] = [];
  const fix = (s: string) => fixes.replaceDevDomains(fixes.canonicalizeComputerHosts(s));
  const spec = isObj(inp.spec) ? inp.spec : {};
  const components = isObj(spec.components) ? spec.components : {};
  const schemas = isObj(components.schemas) ? components.schemas : {};
  const schemes = isObj(components.securitySchemes) ? components.securitySchemes : {};

  // 1. Inventory.
  const raw = new Map<string, RawOp>();
  for (const [extra, paths] of [[false, spec.paths], [true, spec['x-additional-paths']]] as const) {
    if (!isObj(paths)) { if (!extra) problems.push('spec has no paths'); continue; }
    for (const [path, item] of Object.entries(paths)) {
      if (!isObj(item)) continue;
      for (const [key, op] of Object.entries(item)) {
        if (NOT_METHOD.has(key) || key.startsWith('x-') || !isObj(op)) continue;
        if (!extra && !HTTP_KEYS.has(key)) { problems.push(`${path}: unknown method ${key}`); continue; }
        const id = str(op.operationId);
        if (!id) { problems.push(`${key.toUpperCase()} ${path}: no operationId`); continue; }
        if (raw.has(id)) { problems.push(`${id}: operationId twice`); continue; }
        raw.set(id, { id, method: key.toUpperCase(), path, op, pathItem: item, extra });
      }
    }
  }
  const also = new Map<string, string[]>();
  const folded = new Set<string>();
  for (const r of raw.values()) {
    const base = str(r.op['x-original-operation-id']);
    const b = base ? raw.get(base) : undefined;
    if (!b || b.id === r.id || b.path !== r.path) continue;
    folded.add(r.id);
    also.set(b.id, [...(also.get(b.id) ?? []), r.method]);
  }

  // SDK and CLI, by operationId.
  const sdk = sdkIndex(inp.sdkMappings, problems);
  const cli = cliIndex(inp.cliMappings, inp.cliCommands, problems);
  const docs = docsIndex(inp.docsMapping, raw, folded, problems);
  // Rule 5: what the docs drop by name has no page by their own decision.
  const docsDropped = new Set(isObj(inp.docsMapping) ? arr(inp.docsMapping.excludeOperationIds).map(str) : []);

  // Hosts: per service, the distinct kit hosts its operations declare.
  const declared = new Map<string, CatalogHost | null>();
  const hostsOf = new Map<string, CatalogHost[]>();
  const serviceOf = serviceOfId;
  const kitDomain = `computers.${inp.publicDomain}`;
  for (const r of raw.values()) {
    const service = serviceOf(r.id);
    // Both declarations are judged, the one the operation's overrides too.
    const own = rawServers(r.op.servers, r.id, problems);
    const onPath = rawServers(r.pathItem.servers, r.id, problems);
    if (!own || !onPath) { declared.set(r.id, null); continue; }
    const servers = own.length ? own : onPath;
    if (servers.length === 0) { if (!folded.has(r.id)) declared.set(r.id, null); continue; }
    const url = servers.length === 1 ? servers[0]! : null;
    if (!url) { problems.push(`${r.id}: server declaration not understood`); declared.set(r.id, null); continue; }
    if (service === ACCOUNT_SERVICE) { problems.push(`${r.id}: an account operation with its own server: ${fix(url)}`); continue; }
    const m = KIT_HOST.exec(fix(url));
    if (!m || m[3] !== kitDomain) { problems.push(`${r.id}: host template not understood: ${fix(url)}`); declared.set(r.id, null); continue; }
    if (folded.has(r.id)) continue; // judged; its row is its base's
    const h: CatalogHost = { seg: m[1]!, indexed: !!m[2] };
    declared.set(r.id, h);
    const list = hostsOf.get(service) ?? [];
    if (!list.some((x) => sameHost(x, h))) list.push(h);
    hostsOf.set(service, list);
  }

  const notesScheme = schemes[NOTES_SCHEME];
  const notesAuth = isObj(notesScheme) && notesScheme.type === 'http' && str(notesScheme.scheme)?.toLowerCase() === 'bearer'
    ? { name: 'Authorization', prefix: 'Bearer' } : null;

  const services = new Map<string, CatalogService>();
  const ops: CatalogOp[] = [];
  const tagPrefixes = new Set<string>();
  for (const t of arr(spec.tags)) { const n = isObj(t) ? str(t.name) : null; if (n?.includes(':')) tagPrefixes.add(n.slice(0, n.indexOf(':'))); }

  for (const r of raw.values()) {
    if (folded.has(r.id)) continue;
    const o = r.op;
    const service = serviceOf(r.id);
    if (!service) { problems.push(`${r.id}: no service prefix`); continue; }
    const tags = arr(o.tags).map(str).filter((t): t is string => !!t);
    for (const t of tags) {
      const p = t.includes(':') ? t.slice(0, t.indexOf(':')) : '';
      if (p !== service) problems.push(`${r.id}: tag ${t} is not of service ${service}`);
    }
    if (tags.length === 0 && !tagPrefixes.has(service)) problems.push(`${r.id}: untagged, and ${service} has no tag`);
    const tag = tags[0] ? fix(tags[0].slice(tags[0].indexOf(':') + 1)) : null;

    // Host (rule 4).
    let host: number | null = null;
    if (service !== ACCOUNT_SERVICE) {
      const list = hostsOf.get(service) ?? [];
      const own = declared.get(r.id);
      host = own ? list.findIndex((x) => sameHost(x, own)) : list.length === 1 ? 0 : null;
    }
    if (!services.has(service)) services.set(service, { id: service, hosts: service === ACCOUNT_SERVICE ? [] : hostsOf.get(service) ?? [] });

    // Parameters: the path item's, then the operation's (an operation's wins by name and place).
    const params = new Map<string, Obj>();
    for (const p of [...arr(r.pathItem.parameters), ...arr(o.parameters)]) {
      if (!isObj(p)) continue;
      if ('$ref' in p) { problems.push(`${r.id}: parameter $ref not supported`); continue; }
      const n = str(p.name), at = str(p.in);
      if (n && at) params.set(at + ':' + n, p);
    }
    const named = (at: string, required: boolean) => [...params.values()].filter((p) => p.in === at && (!required || p.required === true)).map((p) => fix(String(p.name)));
    const pathParams = [...r.path.matchAll(/\{([^}]+)\}/g)].map((m) => fix(m[1]!));

    // Auth (rules 2 and 3).
    let auth: AuthKind = 'kit';
    let authUndeclared = false;
    if (service === ACCOUNT_SERVICE) {
      const sec = o.security;
      if (PUBLIC_OPS.includes(r.id)) auth = 'public';
      else {
        auth = 'account';
        authUndeclared = !Array.isArray(sec) || !sec.some((s) => isObj(s) && 'bearerAuth' in s);
      }
    } else if (service === NOTES_SERVICE) {
      auth = 'notes';
      if (!notesAuth) problems.push(`${r.id}: the notes identity scheme (${NOTES_SCHEME}) is missing or not a bearer`);
    }

    const s = sdk.get(r.id) ?? null;
    const body = bodyOf(o.requestBody, schemas, r.id, problems, fix);
    const docRoute = docs.get(r.id) ?? (DOCS_SAME_PAGE[r.id] ? docs.get(DOCS_SAME_PAGE[r.id]!) : undefined) ?? null;
    if (!docRoute && !NO_DOCS_OPS.includes(r.id) && !docsDropped.has(r.id)) problems.push(`${r.id}: no docs page, and not on NO_DOCS_OPS`);
    if (docRoute && NO_DOCS_OPS.includes(r.id)) problems.push(`${r.id}: on NO_DOCS_OPS but the docs map it to ${docRoute}`);
    const original = str(o['x-original-path']);
    // The order the SDK and the CLI read them (findRequestServiceIndex): path, query, body.
    const instanceBy = [...pathParams, ...named('query', true)].find((n) => inp.indexParams[service]?.includes(n))
      ?? body?.required.find((n) => inp.indexBodyParams[service]?.includes(n)) ?? null;
    const required = [...pathParams, ...named('query', true), ...named('header', true).filter((h) => h.toLowerCase() !== 'authorization'), ...(body?.required ?? [])];
    const cliLine = wholeLine(r.id, cli.get(r.id) ?? null, required, body, inp.note);
    const summary = str(o.summary)?.trim() || null;

    ops.push({
      id: r.id,
      service,
      tag,
      method: r.method,
      path: fix(r.path),
      originalPath: original && original !== r.path ? fix(original) : null,
      also: also.get(r.id) ?? null,
      summary: summary ? fix(summary) : null,
      pathParams,
      query: named('query', true),
      headers: named('header', true),
      body,
      auth,
      authUndeclared,
      host,
      instanceBy,
      sdk: s ? { call: fix(s.call), args: s.args.map(fix) } : null,
      cli: cliLine,
      deprecated: o.deprecated === true,
      docs: docRoute,
    });
  }

  for (const id of PUBLIC_OPS) if (!raw.has(id)) problems.push(`PUBLIC_OPS names ${id}, which the spec does not have`);
  for (const id of NO_DOCS_OPS) if (!raw.has(id)) problems.push(`NO_DOCS_OPS names ${id}, which the spec does not have`);

  const roots = rawServers(spec.servers, 'root server', problems) ?? [];
  if (spec.servers !== undefined && roots.length > 1) problems.push(`root server: ${roots.length} declared, one expected`);
  const accountBase = fix(roots[0] ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(accountBase)) problems.push(`account base not understood: ${accountBase || '(none)'}`);

  ops.sort((a, b) => a.service.localeCompare(b.service) || (a.tag ?? '').localeCompare(b.tag ?? '') || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const out: Catalog = {
    v: 1,
    sources: inp.sources,
    accountBase,
    notesAuth: notesAuth ?? { name: 'Authorization', prefix: 'Bearer' },
    counts: { ops: ops.length, folded: folded.size, noSdk: ops.filter((o) => !o.sdk).length },
    services: [...services.values()].sort((a, b) => a.id.localeCompare(b.id)),
    ops,
  };
  gate(out, problems);
  if (problems.length) throw new CatalogBuildError(problems);
  return out;
}

const sameHost = (a: CatalogHost, b: CatalogHost) => a.seg === b.seg && a.indexed === b.indexed;

/** Every string in the output, keys included, against the public-text words. */
function gate(value: unknown, problems: string[], at = '$'): void {
  if (typeof value === 'string') {
    for (const [what, re] of GATE) if (re.test(value)) problems.push(`${at}: ${what} in "${value}"`);
  } else if (Array.isArray(value)) value.forEach((v, i) => gate(v, problems, `${at}[${i}]`));
  else if (isObj(value)) for (const [k, v] of Object.entries(value)) { gate(k, problems, `${at} key`); gate(v, problems, `${at}.${k}`); }
}

function bodyType(ct: string): BodyType {
  const c = ct.toLowerCase();
  if (c === 'application/json' || c.endsWith('+json')) return 'json';
  if (c.startsWith('multipart/')) return 'multipart';
  if (c === 'application/x-www-form-urlencoded') return 'form';
  if (c.startsWith('text/')) return 'text';
  if (c === 'application/octet-stream' || c === '*/*' || c.startsWith('image/') || c.startsWith('video/') || c.startsWith('audio/')) return 'binary';
  return 'other';
}

function bodyOf(rb: unknown, schemas: Obj, id: string, problems: string[], fix: (s: string) => string): CatalogBody | null {
  if (isObj(rb) && '$ref' in rb) { problems.push(`${id}: requestBody $ref not supported`); return null; }
  if (!isObj(rb) || !isObj(rb.content)) return null;
  const entries = Object.entries(rb.content);
  if (!entries.length) return null;
  const json = entries.find(([ct]) => bodyType(ct) === 'json');
  const [ct, media] = json ?? entries[0]!;
  const optional = rb.required !== true;
  if (bodyType(ct) !== 'json') return { type: bodyType(ct), required: [], optional };
  const shape = shapeOf(isObj(media) ? media.schema : undefined, schemas, id, problems, 0);
  // A body that is one of several shapes, or not an object, is not a list of fields: the page says "See the docs".
  // A body that must hold some field its required list does not name (minProperties) is as unknown to it: no example yet.
  const schema = isObj(media) ? media.schema : undefined;
  if (shape.choice || saysAlternatives(schema, shape, schemas, id)) return { type: 'other', required: [], optional };
  if (mustHoldAField(schema, schemas, id, 0)) {
    const held: CatalogBody = { type: 'other', required: [], optional };
    MUST_HOLD.add(held);
    return held;
  }
  const bare = shape.required.filter((f) => !isTextField(shape.props[f], schemas, id, problems));
  return { type: 'json', required: shape.required.map(fix), ...(bare.length ? { bare: bare.map(fix) } : {}), optional };
}

/** The schema can leave required alternatives to its words ("Mutually exclusive with `key`"): no list of required
 *  fields says what such a body must hold, so this page cannot write it. */
const ALTERNATIVES = /mutually\s+exclusive|exactly\s+one\s+of|at\s+least\s+one\s+field/i;
/** The body's own words may also say it this way ("every field is optional, at least one is required"); on a field the same
 *  words are about that field's own entries (a list that needs one), which its placeholder already stands for. */
const BODY_ALTERNATIVES = /at\s+least\s+one\s+is\s+required/i;
/** A field that calls itself optional (a guard such as expected_absent) may be left out with its rival: no alternative is required. */
const CALLS_ITSELF_OPTIONAL = /^\s*optional\b/i;
function saysAlternatives(schema: unknown, shape: BodyShape, schemas: Obj, id: string): boolean {
  // Already judged by shapeOf, or by isTextField if required: a bad reference is not reported twice.
  // The body's own words and each top-level field's own words. The schema a field names speaks for the request only when
  // the field is required: a rule inside an optional object ("send at least one field") binds a request that sends it.
  const own = resolved(schema, schemas, id, [])?.description;
  if (typeof own === 'string' && BODY_ALTERNATIVES.test(own)) return true;
  const words = [
    own,
    ...Object.entries(shape.props).flatMap(([name, p]) => (isObj(p) ? [p.description, shape.required.includes(name) ? resolved(p, schemas, id, [])?.description : undefined] : [])),
  ];
  return words.some((w) => typeof w === 'string' && ALTERNATIVES.test(w) && !CALLS_ITSELF_OPTIONAL.test(w));
}

/** Bodies that are `other` only for minProperties: a CLI line that always sends a body field (bodyOnLine) still meets it. */
const MUST_HOLD = new WeakSet<CatalogBody>();

/** minProperties of 1 or more on the body, or on an object it requires (and down that object's required fields): the
 *  body must hold a field its required list does not name, so no example written from that list can be whole. */
function mustHoldAField(schema: unknown, schemas: Obj, id: string, depth: number): boolean {
  const o = depth > 4 ? null : resolved(schema, schemas, id, []);
  if (!o) return false;
  if (typeof o.minProperties === 'number' && o.minProperties >= 1) return true;
  if (arr(o.allOf).some((p) => mustHoldAField(p, schemas, id, depth + 1))) return true;
  const props = isObj(o.properties) ? o.properties : {};
  return arr(o.required).some((f) => typeof f === 'string' && mustHoldAField(props[f], schemas, id, depth + 1));
}

interface BodyShape {
  readonly required: string[];
  readonly props: Obj;
  readonly choice: boolean;
}

function resolved(schema: unknown, schemas: Obj, id: string, problems: string[]): Obj | null {
  let at = schema;
  for (let hop = 0; isObj(at) && str(at.$ref); hop++) {
    const ref = str(at.$ref)!;
    const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
    if (hop > 8 || !m || !isObj(schemas[m[1]!])) { problems.push(`${id}: body $ref ${ref} not understood`); return null; }
    at = schemas[m[1]!];
  }
  return isObj(at) ? at : null;
}

function shapeOf(schema: unknown, schemas: Obj, id: string, problems: string[], depth: number): BodyShape {
  const none: BodyShape = { required: [], props: {}, choice: false };
  if (depth > 4) { problems.push(`${id}: body schema nested too deep`); return none; }
  const o = resolved(schema, schemas, id, problems);
  if (!o) return none;
  if ('oneOf' in o || 'anyOf' in o || (o.type !== undefined && o.type !== 'object')) return { ...none, choice: true };
  const parts = arr(o.allOf).map((p) => shapeOf(p, schemas, id, problems, depth + 1));
  const own = arr(o.required).map(str).filter((f): f is string => !!f);
  return {
    required: [...new Set([...parts.flatMap((p) => p.required), ...own])],
    props: Object.assign({}, ...parts.map((p) => p.props), isObj(o.properties) ? o.properties : {}) as Obj,
    choice: parts.some((p) => p.choice),
  };
}

/** Whether a required field takes a string, so its placeholder can sit in quotes. */
function isTextField(schema: unknown, schemas: Obj, id: string, problems: string[]): boolean {
  const t = resolved(schema, schemas, id, problems)?.type;
  return t === 'string' || (Array.isArray(t) && t.includes('string'));
}

/** The SDK call per operationId: the first plain method, as `<accessor without client.>.<method>`. */
function sdkIndex(m: unknown, problems: string[]): Map<string, CatalogSdk> {
  const out = new Map<string, CatalogSdk>();
  const ns = isObj(m) && isObj(m.namespaces) ? m.namespaces : null;
  if (!ns) { problems.push('sdk-mappings has no namespaces'); return out; }
  for (const n of Object.values(ns)) {
    if (!isObj(n) || !isObj(n.services)) continue;
    for (const svc of Object.values(n.services)) {
      if (!isObj(svc) || !isObj(svc.methods)) continue;
      const acc = str(svc.accessor)?.replace(/^client\./, '');
      if (!acc) continue;
      for (const [name, meth] of Object.entries(svc.methods)) {
        // A facade (`hooks.enableAll`) pins or forbids fields of its operation and refuses them from the caller; the
        // required fields this page writes would be refused. Its operation falls back to the next method, or to fetch.
        if (!isObj(meth) || meth.isPaginationHelper || meth.facade) continue;
        const id = str(meth.operationId);
        if (!id || out.has(id)) continue;
        out.set(id, { call: acc + '.' + name, args: signatureArgs(str(meth.signature) ?? '') });
      }
    }
  }
  return out;
}

/** `copy(id: string, data: object)` → ['id', 'data']; an optional one keeps its `?` (`options?`). */
export function signatureArgs(sig: string): string[] {
  const open = sig.indexOf('(');
  const close = sig.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  const inner = sig.slice(open + 1, close);
  const args: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i <= inner.length; i++) {
    const c = inner[i];
    if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
    else if (c === '}' || c === ')' || c === ']' || c === '>') depth--;
    else if ((c === ',' && depth === 0) || i === inner.length) {
      const part = inner.slice(from, i).trim();
      const m = /^([A-Za-z_$][\w$]*)(\?)?\s*:/.exec(part) ?? /^([A-Za-z_$][\w$]*)(\?)?$/.exec(part);
      if (m) args.push(m[1]! + (m[2] ?? ''));
      from = i + 1;
    }
  }
  return args;
}

/** The commands of one generated cli/commands/<group>.ts, by the name in the comment above each (its cli-mappings key).
 *  A comment's block can hold commands with no comment of their own after it, so only the one declaration that runs
 *  that operation is read; a block with no such declaration, or more than one, gives no command. */
export function parseCliCommands(text: string): Record<string, CliCommand> {
  const out: Record<string, CliCommand> = {};
  for (const m of text.matchAll(/\n[ \t]*\/\/ ([A-Za-z_]\w*): [^\n]*\n([\s\S]*?)(?=\n[ \t]*\/\/ [A-Za-z_]\w*: |$(?![\s\S]))/g)) {
    const key = m[1]!;
    const mine = m[2]!.split(/(?=\.command\(')/).filter((d) => d.startsWith('.command(') && d.includes(`operationId: '${key}'`));
    if (mine.length !== 1) continue;
    const [head, ...rest] = mine[0]!.split('.action(');
    const run = rest.join('.action(');
    const args = [...new Set([...head!.matchAll(/\.argument\('(<[^>']+>)'/g)].map((a) => a[1]!))];
    const flags = [...head!.matchAll(/\.requiredOption\('(--[a-z0-9-]+(?: <[^>']+>)?)/g)].map((f) => f[1]!);
    const options = new Map([...head!.matchAll(/\.option\('(--[a-z0-9-]+)( <[^>']+>)?/g)].map((o) => [o[1]!, o[1]! + (o[2] ?? '')]));
    const inputs: Record<string, string | null> = {};
    let bodyOnLine = false;
    for (const p of run.slice(run.indexOf('parameters:') + 1).split(/(?=\bname: ')/).slice(1)) {
      const name = /^name: '([^']+)'/.exec(p)?.[1];
      if (!name) continue;
      if (/\brequired: true/.test(p)) {
        inputs[name] = null;
        if (/\bisBodyParam: true/.test(p)) bodyOnLine = true;
      } else {
        const option = options.get(/\bflag: '(--[a-z0-9-]+)'/.exec(p)?.[1] ?? '');
        if (option) inputs[name] = option;
      }
    }
    out[key] = { args, flags, inputs, needsBody: /\bjsonBodyRequired: true/.test(run) && !bodyOnLine, ...(bodyOnLine ? { bodyOnLine } : {}) };
  }
  return out;
}

const shellWord = (w: string) => (/[<>]/.test(w) ? `'${w}'` : w);

/** The CLI command per operationId: `hoody <group> <path...> <command>`, its required arguments and its required
 *  options, as the generated command declares them; placeholders are quoted, a bare `<id>` being a shell redirect. A
 *  command another operation shares through a variant flag, with a namespace or command type of its own, or that the
 *  generated CLI does not show, gets none: the page shows only a command it can print whole. */
function cliIndex(m: unknown, commands: Readonly<Record<string, CliCommand>>, problems: string[]): Map<string, { line: string; command: CliCommand }> {
  const out = new Map<string, { line: string; command: CliCommand }>();
  const ops = isObj(m) && isObj(m.operations) ? m.operations : null;
  if (!ops) { problems.push('cli-mappings has no operations'); return out; }
  const excluded = isObj(m) && isObj((m as Obj).excluded_operations) ? new Set(Object.keys((m as Obj).excluded_operations as Obj)) : new Set<string>();
  for (const [key, c] of Object.entries(ops)) {
    if (!isObj(c)) continue;
    const id = str(c.sdkOperationId), group = str(c.group), cmd = str(c.command), generated = commands[key];
    if (!id || !group || !cmd || !generated || excluded.has(id)) continue;
    if (Object.keys(c).some((k) => k.startsWith('variant_') || k === 'namespace' || k === 'command_type')) continue;
    const words = ['hoody', group, ...arr(c.path).map(str).filter((s): s is string => !!s), cmd, ...generated.args.map(shellWord)];
    for (const f of generated.flags) { const [name, value] = f.split(' '); words.push(value ? `${name} ${shellWord(value)}` : name!); }
    if (!out.has(id)) out.set(id, { line: words.join(' '), command: generated });
  }
  return out;
}

const shellOption = (o: string) => o.split(' ').map(shellWord).join(' ');

/** The CLI line, when the command takes every required input of the request; an input it takes only as an option is
 *  added. Null otherwise: a line that cannot run whole is no example. */
function wholeLine(id: string, c: { line: string; command: CliCommand } | null, required: readonly string[], body: CatalogBody | null, note: CatalogInputs['note']): string | null {
  const out = (reason: string) => { note?.(id, reason); return null; };
  if (!c) return null;
  if (body?.type === 'other' && !(MUST_HOLD.has(body) && c.command.bodyOnLine)) return out('alternative or unmodelled body');
  if (required.some((n) => !(n in c.command.inputs))) return out('a required input the command does not take');
  if (c.command.needsBody && !body?.required.length) return out('a command that needs a body field, none of them required');
  const added = [...new Set(required.map((n) => c.command.inputs[n]).filter((o): o is string => !!o))];
  return [c.line, ...added.map(shellOption)].join(' ');
}

/** The docs page route per operation, resolved as the docs site's build does: global excludeOperationIds drop
 *  first; a page claims its tags' and operationIds' operations less its own excludeOperationIds; the first page wins. A
 *  page assigning by `services` or a `parameterGroup` is not modelled and fails the build (none does today). */
function docsIndex(m: unknown, raw: Map<string, RawOp>, folded: Set<string>, problems: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!isObj(m) || !Array.isArray(m.pages)) { problems.push('docs mapping has no pages'); return out; }
  const dropped = new Set(arr(m.excludeOperationIds).map(str));
  const byTag = new Map<string, string[]>();
  for (const r of raw.values()) {
    if (folded.has(r.id) || dropped.has(r.id)) continue;
    for (const t of arr(r.op.tags)) if (typeof t === 'string') byTag.set(t, [...(byTag.get(t) ?? []), r.id]);
  }
  for (const p of m.pages) {
    if (!isObj(p)) continue;
    const route = str(p.route);
    if (p.services || p.parameterGroup) { problems.push(`docs page ${route}: services or parameterGroup assignment is not modelled`); continue; }
    if (!route || !/^\/[a-z0-9/-]*\/$/.test(route)) { problems.push(`docs page route not understood: ${String(route)}`); continue; }
    const claim = new Set<string>();
    for (const t of arr(p.tags)) for (const id of byTag.get(String(t)) ?? []) claim.add(id);
    for (const id of arr(p.operationIds)) if (typeof id === 'string' && raw.has(id) && !dropped.has(id) && !folded.has(id)) claim.add(id);
    for (const id of arr(p.excludeOperationIds)) claim.delete(String(id));
    for (const id of claim) if (!out.has(id)) out.set(id, route);
  }
  return out;
}
