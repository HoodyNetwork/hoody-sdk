// routes.ts: declared routes. Nothing leaves the Hub except through a route declared here.
//
// Contract:
//   - defineRoute({method, path, scope, ...}) declares one request shape. The path is a template whose
//     `:name` segments are filled from params, each percent-encoded as one segment; a param that is empty,
//     '.' or '..', missing, longer than 256, or holds '/', '\\', '%' or a control character refuses the call
//     unsent (ROUTE_PARAMS): an id never reaches the server as a path of its own ('../x').
//   - A last segment `*name` (kit routes only) is a path of any depth on the computer: its
//     param is a list of names, each kept exactly and percent-encoded as one segment ('%', backslash and control
//     characters included). files-path.ts pathPartsProblem says what refuses it unsent (ROUTE_PARAMS): an empty
//     part, '.' or '..', a '/' or NUL in a part, a first part starting with a backslash, over 4,096 bytes. An empty list
//     adds nothing. On a files-program route whose `*name` follows /api/v1/files directly, an alias name in the
//     first part is written so the program reads it as a folder (files-path.ts encodePathParts).
//   - Only a route object made by defineRoute is accepted by api(): a hand-made or copied object is refused
//     unsent (ROUTE_NOT_DECLARED). Declared routes are frozen.
//   - query: the query keys the route takes (absent: none). body: the top-level body keys it takes (absent:
//     no body). A call with another key is refused unsent (ROUTE_QUERY, ROUTE_BODY). GET and HEAD never
//     carry a body; a DELETE carries one only when its Hoody API route declares the keys (turning 2FA off).
//     reissues: a base change whose answer carries a fresh session pair for the acting account (2FA on/off);
//     api() adopts it (shared.js adoptReissuedSession) and wipes the answer's copies.
//   - scope: 'base' (this page's Hoody API), 'realm' (the captured realm's Hoody API host), 'agent' (the
//     computer's agent at its named URL), 'kit' (a Hoody Kit program on the computer). baseOnly forces the
//     base host whatever the realm (api.ts also keeps the old BASE_ONLY table as the authority).
//   - secret: answers may hold a secret (a scrub is required, rejections are rebuilt from safe fields; on
//     kit/agent routes a list names the secret body keys). codes: the fixed codes a secret rejection may keep.
//   - unknownCodes (change routes, never run or upload): 404 or 409 codes that mean this route's change may still be under way (the server
//     started it and could not confirm it ended): api() rejects pending, like an unknown outcome, never failed,
//     before any 2FA handling (a listed OTP_REQUIRED or INVALID_OTP_CODE opens no prompt and sends nothing more).
//     Error details show these codes as they show `codes`.
//     Per route, never global: the same code on another route may be a refusal made before any effect.
//   - agent routes: realm says which `realm=` the call carries: 'none', 'realm' (a 24-hex id or 'global'),
//     'list' (also 'all'), 'bot' (as 'realm'), 'opt' (optional). Default: the agent table (no realm on
//     /models, /version, /health, /hoody/auth/status|bootstrap; 'list' on GET /bots and POST /bots/resume;
//     'realm' elsewhere). idem: the route requires an idempotency key (newKey()), sent in that header.
//   - kit routes: kit (program name) and index (a number or a predicate) say which program; realm is 'none'.
//   - ifMatch (base/realm changes): the route requires an If-Match header (the server's version of the
//     document, e.g. `file:v3`); the call's ifMatch value, one strong token (printable ASCII, no space, quote or
//     comma, at most 128), is sent on the request and on its retries. A value on any other route, or a missing or
//     malformed one on an ifMatch route, refuses the call unsent (IF_MATCH_INVALID).
//   - etagMatch (base/realm changes): the If-Match header is optional; when the call carries ifMatch it must be
//     one quoted strong ETag exactly as an answer's ETag header gave it (`"…"`, IF_MATCH_ETAG; never `W/` or `*`),
//     sent on the request and its retries. No value: no header (an unconditional write). A malformed value
//     refuses the call unsent (IF_MATCH_INVALID). Exclusive with ifMatch. Instead of ifMatch the call may carry
//     ifNoneMatch '*' (a document read as missing: create it only, If-None-Match: *, sent on the request and its
//     retries; the server refuses with 412 when it exists). Any other value, both at once, or ifNoneMatch on
//     another route refuses the call unsent (IF_MATCH_INVALID).
//   - onEtag (call input, base/realm routes): called once with the answer's ETag (a quoted strong ETag, else
//     null) when a success answer is delivered to the caller; never on a refusal, a lost answer or a dead context.
//   - bodyText (kit POST/PUT/PATCH): the body is one string sent as text/plain (at most MAX_BODY_TEXT
//     characters), never JSON; no body key list. Core treats such a route as secret (the text may hold a
//     credential): its rejections are rebuilt from safe fields. Never idem: a replay compares a digest of the
//     request's variables, which a pending change keeps.
//   - run (kit exec only, kit-io.ts run()): the route admits user-script routes under its path (the path is a
//     prefix, '/' for any); bodies are any JSON (no body key list), caller headers are allowed (checked by the
//     kit), answers of any status come back raw. It is never sent through api().
//   - upload (POST/PUT on kit routes, kit-io.ts upload()): a streaming body, no body keys, never through api().
//   - senderKey (upload routes only): every send carries the caller's sender key; kit-io.ts refuses one without it.
//   - file (PUT on files-program routes, upload.ts sendFile()): the body is one picked file, sent
//     once by the transfer worker; no body keys, never through api() or upload(). timeoutMs is required (a large file
//     takes longer than the 30 s default). The only caller headers are If-None-Match: * or If-Match (one strong ETag),
//     with X-Expected-Length (kit.ts fileHeaders); answers are at most 64 KiB.
//   - Agent routes only (AI tab; the agent's own concurrency, header and refusal contracts):
//     cas: the write's compare-and-swap, declared per route. {via:'etag'}: the call must carry the document's quoted strong
//     ETag (input.ifMatch, from onEtag on the read), sent as If-Match; a missing one refuses unsent (CAS_REQUIRED), a
//     malformed one IF_MATCH_INVALID. {via:'body', keys}: each key (expected_revision, base_gen, expect_hash, a
//     write-intent nonce) must be a declared body key and be present in the call's body, else CAS_REQUIRED unsent.
//     A write with no token never leaves, so no page can send an unconditional one. readsEtag: a GET whose answer's
//     ETag is handed to onEtag (a cas etag route's answer hands its next ETag over too).
//     readsStatus: an agent route whose success answer resolves {status, body}: the 2xx status the agent answered with
//     beside the parsed body (0 when none was read), so a caller that proves something only from one status (a 200) can
//     refuse any other. A route without it resolves the body alone, unchanged.
//     deleteBody: a DELETE may declare body keys (the agent reads them as a body).
//     refuses: codes the agent answers when it refused BEFORE applying anything (revision_conflict, daemon_paused,
//     write_intent_invalid): on any status, a 5xx included, the rejection carries notApplied (a definite refusal, never
//     pending). envelope: the route answers a tool envelope, a 200 {is_error, code}: is_error true with a refuses code is
//     that refusal (notApplied, status 200); with any other code it is a rejection that may have applied (pending).
//     A route of the `vm` kit may list refuses too (never envelope): a code enters a route's list only when the VM
//     program's source shows it answers that code on that route before any effect. Any other kit refuses the key.
//     keepDetails: a change whose answer's details object says what it did (a commit that landed before its push
//     failed or timed out, the steps a sync ran): the pending error and the change's result keep that details object
//     (api.ts keptDetails: at most DETAILS_MAX bytes of JSON, else none and detailsDropped). Agent scope, never secret.
//     cwd: the route takes X-Hoody-Cwd (input.cwd, an absolute path sent as its UTF-8 bytes); X-Hoody-Config-Dir and
//     every other X-Hoody-* header are never sent. tickets: an agent route may declare {journal?, lease?} (each 'required',
//     'optional' or a function of the checked body that says when it is required): the call must then carry core-minted
//     tickets for those kinds in input.tickets (ticket.ts). X-Hoody-Approver-Lease is sent only as the lease ticket's spend
//     value, never a caller's. Process-wide routes (PROCESS_WIDE, /pause): realm 'none' and no cwd.
//   - stream (GET on agent or kit routes, kit-io.ts stream()): an SSE route with frame byte bounds {id, noId}
//     (with and without an `id:` line); maxBytes, the whole stream's budget, is required. Never through api().
//   - ws (GET on agent routes, socket.ts openSocket()): a WebSocket route. No body, idempotency key, headers, tickets, cwd,
//     byte or time bound, and no other leg's flag. build() and buildRequest() refuse it (ROUTE_NOT_ALLOWED), so api(),
//     download, stream, upload, run and sendFile never send one; buildSocketRequest() builds only ws routes, for socket.ts.
//   - bytes (POST on agent routes, kit-io.ts postBytes()): a JSON body whose 2xx answer is bytes of a declared media type
//     (createSpeech's audio). Body keys required; no idempotency key, secret, cas, envelope, readsEtag/readsStatus,
//     keepDetails, cwd, tickets, unknownCodes or other leg's flag. build() refuses it (ROUTE_NOT_ALLOWED), so api() never
//     sends one; download, stream, upload, run and sendFile refuse it by their own method or flag checks.
import type { Ctx, Target } from './ctx';
import { encodePathParts } from './files-path';
import { routeLabel } from './trace-id';
import { declaredTickets, type RouteTickets, type Ticket } from './ticket';

export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Scope = 'base' | 'realm' | 'agent' | 'kit';
export type RealmKind = 'none' | 'realm' | 'bot' | 'list' | 'opt';
export type KitName = 'exec' | 'logs' | 'daemon' | 'run' | 'notes' | 'terminal' | 'display' | 'cron' | 'curl' | 'files' | 'pipe' | 'egress' | 'browser' | 'tunnel' | 'code' | 'vm';
export type IdemHeader = 'Idempotency-Key' | 'X-Idempotency-Key';

/** A write's compare-and-swap (see the contract): the ETag in If-Match, or body keys that must be present. */
export type Cas = { readonly via: 'etag' } | { readonly via: 'body'; readonly keys: readonly string[] };

/** Agent routes of the process-wide class: no realm, no cwd (a realm or cwd answers 400 realm_scope_unsupported). */
const PROCESS_WIDE = /^\/pause$/;

export interface GuardInput {
  readonly method: Method;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly realm: string | undefined;
  readonly idem: string | undefined;
  readonly index: number | undefined;
  readonly guardCtx: unknown;
}

export interface RouteSpec {
  method: Method;
  path: string;
  scope: Scope;
  query?: readonly string[];
  body?: readonly string[];
  baseOnly?: boolean;
  secret?: boolean | readonly string[];
  codes?: readonly string[];
  /** Change routes only: a 404 or 409 with one of these codes means the change may still be under way (pending, like the
   *  still-running codes), never a refusal. Per route: the same code on another route may be a refusal. */
  unknownCodes?: readonly string[];
  realm?: RealmKind;
  idem?: boolean | IdemHeader;
  kit?: KitName;
  index?: number | ((n: number) => boolean);
  maxBytes?: number;
  timeoutMs?: number;
  /** GET routes only: false refuses the read in a framed page too (default: framed GETs go out). */
  framed?: boolean;
  /** Kit GET routes only: this GET changes something (a create-or-get): its outcomes read as a change's (api.ts:
   *  pending when unknown or answered after its context died, open for the sign-out warning). */
  change?: true;
  guard?: (req: GuardInput) => boolean;
  run?: true;
  stream?: { readonly id: number; readonly noId: number };
  /** POST/PUT kit routes only (kit-io.ts upload()): the body is a ReadableStream sent once as it is produced. */
  upload?: true;
  /** Upload routes only: every send carries the caller's sender key (kit-io.ts upload(); a send without one is refused). */
  senderKey?: true;
  /** PUT files-program routes only (upload.ts sendFile): the body is one picked file (see the contract). */
  file?: true;
  /** Base POST/DELETE only: the answer's data carries a fresh session pair to adopt (see the contract). */
  reissues?: true;
  /** Base/realm changes only: the call must carry an If-Match value (see the contract). */
  ifMatch?: true;
  /** Base/realm changes only: the call may carry an If-Match ETag (see the contract). */
  etagMatch?: true;
  /** Kit POST/PUT/PATCH only: the body is one text/plain string (see the contract). */
  bodyText?: true;
  /** Agent changes only: the write's compare-and-swap (see the contract). */
  cas?: Cas;
  /** Agent GET only: the answer's ETag is handed to onEtag (see the contract). */
  readsEtag?: true;
  /** Agent routes only: the call resolves {status, body}, the success answer's HTTP status with its body (see the contract). */
  readsStatus?: true;
  /** Agent DELETE only: the route declares body keys. */
  deleteBody?: true;
  /** Agent routes and routes of the `vm` kit: codes that mean it refused before applying (see the contract). */
  refuses?: readonly string[];
  /** Agent routes: a 200 tool envelope; is_error is a failure (see the contract). */
  envelope?: true;
  /** Agent changes only: the answer's details object reaches the result (see the contract). */
  keepDetails?: true;
  /** Agent routes: the route takes X-Hoody-Cwd. */
  cwd?: true;
  /** Agent routes: the tickets the call must carry (ticket.ts): per kind 'required', 'optional' or a function of the body. */
  tickets?: RouteTickets;
  /** Agent GET only: a WebSocket route, opened by socket.ts alone (see the contract). */
  ws?: true;
  /** Agent POST only: the 2xx answer is bytes, read by kit-io.ts postBytes alone (see the contract). */
  bytes?: true;
}

/** A declared route. `R` is the answer's JSON type, `B` the body's. */
export interface Route<R = unknown, B = unknown> extends Readonly<Omit<RouteSpec, 'query' | 'body' | 'secret' | 'codes' | 'unknownCodes' | 'idem' | 'ifMatch' | 'etagMatch' | 'bodyText' | 'cas' | 'readsEtag' | 'readsStatus' | 'deleteBody' | 'refuses' | 'envelope' | 'keepDetails' | 'cwd' | 'tickets'>> {
  readonly id: string;
  readonly cas: Cas | null;
  readonly readsEtag: boolean;
  readonly readsStatus: boolean;
  readonly deleteBody: boolean;
  readonly refuses: readonly string[] | null;
  readonly envelope: boolean;
  readonly keepDetails: boolean;
  readonly cwd: boolean;
  readonly tickets: RouteTickets | null;
  readonly ifMatch: boolean;
  readonly etagMatch: boolean;
  readonly bodyText: boolean;
  readonly idem?: IdemHeader;
  readonly query: readonly string[];
  readonly body: readonly string[] | null;
  readonly secret: boolean;
  readonly secretKeys: readonly string[];
  readonly codes: readonly string[] | null;
  readonly unknownCodes: readonly string[] | null;
  readonly params: readonly string[];
  /** The `*name` path param (always the last segment), or null. */
  readonly deep: string | null;
  readonly pattern: RegExp;
  /** Type carriers only; never set. */
  readonly __answer?: R;
  readonly __body?: B;
}

/** What a call adds to its route. */
export interface CallInput<B = unknown> {
  params?: Readonly<Record<string, string | number | readonly string[]>>;
  query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  body?: B;
  /** The context the action started under (default: captured now). */
  ctx?: Ctx;
  /** The computer for agent and kit routes (default: the context's). */
  target?: Target | null;
  /** agent routes: the realm to send (default: the context's realm, or the token pin). */
  realm?: string;
  /** agent routes that declare cwd: the folder the request resolves against (X-Hoody-Cwd). */
  cwd?: string;
  /** kit routes: the program's index. */
  index?: number;
  /** Routes with idem: the key (newKey()). Reuse the same key to read a pending change's outcome back. */
  idem?: string;
  /** Routes with ifMatch: the document version the change is made against (the If-Match header). Routes with
   *  etagMatch: an answer's ETag, optional (absent or null: no header). Agent routes with cas {via:'etag'}: the read's
   *  quoted ETag, required. */
  ifMatch?: string | null;
  /** Routes with etagMatch, instead of ifMatch: '*', create only (the If-None-Match header); absent or null: none. */
  ifNoneMatch?: '*' | null;
  /** Base/realm routes: receives the success answer's ETag (null when it carries none or a malformed one). */
  onEtag?: (etag: string | null) => void;
  /** Wipes a secret from every raw success answer, exactly once, before anything else sees it. */
  scrub?: (answer: unknown) => void;
  /** The caller reads a pending outcome back itself: no notice while its context lives. */
  recovers?: boolean;
  /** Agent routes that declare tickets (ticket.ts): the core-minted tickets for this one call, at most one per kind. Wrappers
   *  between a caller and api() pass this through unchanged. */
  tickets?: readonly Ticket[];
  signal?: AbortSignal;
  /** The page is going away: an agent or kit request asks the browser to let it outlive the page (fetch keepalive). */
  keepalive?: boolean;
  /** An opaque value the transport sees on this call's CallMeta and nowhere else (a live terminal's record of one
   *  of its own sends, live-gate.ts). The web never sets it. */
  bind?: object;
  /** The caller's own liveness, read at each point a send may still leave (the first send, the 2FA retry):
   *  false sends nothing more, like an aborted signal. */
  still?: () => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  guardCtx?: unknown;
}

const METHODS: readonly Method[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SCOPES: readonly Scope[] = ['base', 'realm', 'agent', 'kit'];
const KITS: readonly KitName[] = ['exec', 'logs', 'daemon', 'run', 'notes', 'terminal', 'display', 'cron', 'curl', 'files', 'pipe', 'egress', 'browser', 'tunnel', 'code', 'vm'];
const REALM_KINDS: readonly RealmKind[] = ['none', 'realm', 'bot', 'list', 'opt'];
// A literal may end in one custom verb (`/sessions:events`, the agent's multiplexed stream); a `:name` alone is a param.
const SEGMENT = /^(?::[a-z][A-Za-z0-9_]*|\*[a-z][A-Za-z0-9_]*|[A-Za-z0-9._~@-]+(?::[a-z][A-Za-z0-9-]*)?)$/;
const KEY = /^[A-Za-z0-9_.-]{1,64}$/;
// Hoody API codes are upper-case; an agent answers its own in lower case (api_key_refused).
const CODE = /^[A-Za-z_]{1,40}$/;

// Realm-less agent routes and the two that take realm=all (AGENT_NO_REALM, AGENT_REALM_ALL).
const AGENT_NO_REALM = /^\/(?:models|version|health|hoody\/auth\/(?:status|bootstrap))$/;
const AGENT_REALM_ALL: Record<string, true> = { 'GET /bots': true, 'POST /bots/resume': true };

const declared = new WeakSet<object>();
// The labels ("METHOD /template", trace-id.ts routeLabel) and the codes of every route defineRoute declared: written
// here only, by defineRoute, so a label or code another module names is never taken for a declared one (error
// details: routeOf, isDeclaredCode). Bounded by the declarations, which are module constants.
const declaredLabels = new Set<string>();
const declaredCodes = new Set<string>();
/** A bodyText route's largest body, in characters. */
export const MAX_BODY_TEXT = 65536;
/** One strong If-Match token: printable ASCII without space, double quote or comma. */
export const IF_MATCH = /^[\x21\x23-\x2b\x2d-\x7e]{1,128}$/;
/** One strong ETag as an answer's ETag header gives it: a double-quoted opaque tag (no `W/`, no `*`, no list;
 *  no comma inside either, so a value can never read as two). */
export const IF_MATCH_ETAG = /^"[\x21\x23-\x2b\x2d-\x7e]{1,128}"$/;

function invalid(why: string): never {
  const e = new Error('ROUTE_INVALID: ' + why) as Error & { code: string };
  e.code = 'ROUTE_INVALID';
  throw e;
}

/** One copy of a declared array: a fresh plain array filled by index, each element read once (never through the
 *  caller's methods, iterator, constructor or species), so what is validated is what the route keeps. */
function snapshot(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) invalid(what);
  const src = v as unknown[];
  const n = src.length;
  const a: string[] = [];
  for (let i = 0; i < n; i++) a[i] = src[i] as string;
  return a;
}

function keys(v: readonly string[] | undefined, what: string): readonly string[] {
  if (v === undefined) return [];
  const a = snapshot(v, what);
  if (a.some((k) => typeof k !== 'string' || !KEY.test(k)) || new Set(a).size !== a.length) invalid(what);
  return Object.freeze(a);
}

/** Declares a route. A malformed declaration throws ROUTE_INVALID when the module loads. */
export function defineRoute<R = unknown, B = never>(spec: RouteSpec): Route<R, B> {
  if (!spec || typeof spec !== 'object') invalid('spec');
  // Every field is read once, here: validation, the route and its registration all see these values.
  const s: RouteSpec = { ...spec };
  if (!METHODS.includes(s.method)) invalid('method');
  if (!SCOPES.includes(s.scope)) invalid('scope');
  if (typeof s.path !== 'string' || s.path.charAt(0) !== '/' || s.path.includes('?')) invalid('path');
  const segs = s.path === '/' ? [] : s.path.slice(1).split('/');
  if (segs.some((g) => !SEGMENT.test(g) || g === '.' || g === '..')) invalid('path segment');
  const starAt = segs.findIndex((g) => g.charAt(0) === '*');
  // After a fixed prefix: a route of no parts builds '/', which a bare '/*path' pattern would not match.
  if (starAt !== -1 && (starAt === 0 || starAt !== segs.length - 1 || s.scope !== 'kit')) invalid('a *path segment is last, after a fixed prefix, on a kit route');
  const deep = starAt === -1 ? null : segs[starAt]!.slice(1);
  const params = segs.filter((g) => g.charAt(0) === ':' || g.charAt(0) === '*').map((g) => g.slice(1));
  if (new Set(params).size !== params.length) invalid('duplicate param');
  const query = keys(s.query, 'query');
  const body = s.body === undefined ? null : keys(s.body, 'body');
  const agentish = s.scope === 'agent' || s.scope === 'kit';
  if (s.deleteBody !== undefined && (s.deleteBody !== true || s.scope !== 'agent' || s.method !== 'DELETE')) invalid('deleteBody');
  if (body && (s.method === 'GET' || s.method === 'HEAD' || (s.method === 'DELETE' && agentish && s.deleteBody !== true))) invalid('body on ' + s.method);
  if (s.reissues !== undefined && (s.reissues !== true || s.scope !== 'base' || (s.method !== 'POST' && s.method !== 'DELETE'))) invalid('reissues');
  if (s.ifMatch !== undefined && (s.ifMatch !== true || agentish || s.method === 'GET' || s.method === 'HEAD')) invalid('ifMatch');
  if (s.etagMatch !== undefined && (s.etagMatch !== true || s.ifMatch !== undefined || agentish || s.method === 'GET' || s.method === 'HEAD')) invalid('etagMatch');
  // A text body goes through kit.ts's plain leg only: never a run or stream route (their own legs send JSON).
  if (s.bodyText !== undefined && (s.bodyText !== true || s.scope !== 'kit' || body || Array.isArray(s.secret) || s.idem || s.run !== undefined || s.stream !== undefined || (s.method !== 'POST' && s.method !== 'PUT' && s.method !== 'PATCH'))) invalid('bodyText');
  const secretKeys = Array.isArray(s.secret) ? keys(s.secret, 'secret') : [];
  if (Array.isArray(s.secret) && (!agentish || !body || !secretKeys.length || secretKeys.some((k) => !body.includes(k)))) invalid('secret keys');
  if (s.secret !== undefined && typeof s.secret !== 'boolean' && !Array.isArray(s.secret)) invalid('secret');
  const refuses = s.refuses === undefined ? null : Object.freeze(snapshot(s.refuses, 'refuses'));
  if (refuses && ((s.scope !== 'agent' && !(s.scope === 'kit' && s.kit === 'vm')) || !refuses.length || new Set(refuses).size !== refuses.length || refuses.some((c) => typeof c !== 'string' || !CODE.test(c)))) invalid('refuses');
  if (s.envelope !== undefined && (s.envelope !== true || s.scope !== 'agent' || !refuses)) invalid('envelope');
  if (s.keepDetails !== undefined && (s.keepDetails !== true || s.scope !== 'agent' || s.method === 'GET' || s.method === 'HEAD' || s.secret === true || Array.isArray(s.secret))) invalid('keepDetails');
  // A refuses code is a fixed word the route may keep on a secret rejection and errors.ts may show.
  const declCodes = s.codes === undefined ? null : snapshot(s.codes, 'codes');
  if (declCodes && declCodes.some((c) => typeof c !== 'string' || !CODE.test(c))) invalid('codes');
  const codes = declCodes || refuses ? Object.freeze([...new Set([...(declCodes ?? []), ...(refuses ?? [])])]) : null;
  let cas: Cas | null = null;
  if (s.cas !== undefined) {
    const c = s.cas as { via?: unknown; keys?: unknown };
    if (!c || typeof c !== 'object' || s.scope !== 'agent' || s.method === 'GET' || s.method === 'HEAD') invalid('cas');
    if (c.via === 'etag') {
      if (Object.keys(c).length !== 1) invalid('cas');
      cas = Object.freeze({ via: 'etag' as const });
    } else if (c.via === 'body') {
      const ks = keys(c.keys as readonly string[], 'cas keys');
      if (!ks.length || !body || ks.some((k) => !body.includes(k))) invalid('cas keys');
      cas = Object.freeze({ via: 'body' as const, keys: ks });
    } else invalid('cas');
  }
  if (s.readsEtag !== undefined && (s.readsEtag !== true || s.scope !== 'agent' || s.method !== 'GET')) invalid('readsEtag');
  if (s.readsStatus !== undefined && (s.readsStatus !== true || s.scope !== 'agent')) invalid('readsStatus');
  if (s.cwd !== undefined && (s.cwd !== true || s.scope !== 'agent' || PROCESS_WIDE.test(s.path))) invalid('cwd');
  if (s.tickets !== undefined && s.scope !== 'agent') invalid('tickets');
  let tickets: RouteTickets | null;
  try { tickets = declaredTickets(s.tickets); } catch { invalid('tickets'); }
  const unknownCodes = s.unknownCodes === undefined ? null : Object.freeze(snapshot(s.unknownCodes, 'unknownCodes'));
  // run and upload routes answer raw HTTP (kit-io.ts), past api()'s rejection handler: the option could not hold.
  if (unknownCodes && (!unknownCodes.length || s.method === 'GET' || s.method === 'HEAD' || s.run !== undefined || s.upload !== undefined || unknownCodes.some((c) => typeof c !== 'string' || !CODE.test(c)))) invalid('unknownCodes');
  if (s.baseOnly !== undefined && (typeof s.baseOnly !== 'boolean' || agentish)) invalid('baseOnly');
  if (s.idem !== undefined && (!agentish || (s.idem !== false && s.idem !== true && s.idem !== 'Idempotency-Key' && s.idem !== 'X-Idempotency-Key'))) invalid('idem');
  if (s.idem && (s.method === 'GET' || s.method === 'HEAD')) invalid('idem on a read');
  if (s.framed !== undefined && (typeof s.framed !== 'boolean' || s.method !== 'GET')) invalid('framed');
  if (s.change !== undefined && (s.change !== true || s.method !== 'GET' || s.scope !== 'kit' || s.run !== undefined || s.stream !== undefined)) invalid('change');
  if (s.guard !== undefined && typeof s.guard !== 'function') invalid('guard');
  for (const n of ['maxBytes', 'timeoutMs'] as const) {
    const v = s[n];
    if (v !== undefined && (!Number.isInteger(v) || v <= 0)) invalid(n);
    // A browser timer holds at most 2^31-1 ms (about 24.8 days); a longer one would fire at once.
    if (n === 'timeoutMs' && v !== undefined && v > 2_147_483_647) invalid(n);
    if (v !== undefined && !agentish) invalid(n + ' on a Hoody API route');
  }
  let realm: RealmKind | undefined;
  if (s.scope === 'kit') {
    if (!s.kit || !KITS.includes(s.kit)) invalid('kit');
    if (!(typeof s.index === 'function' || (Number.isInteger(s.index) && (s.index as number) >= 0))) invalid('index');
    if (s.realm !== undefined && s.realm !== 'none') invalid('kit realm');
    realm = 'none';
  } else {
    if (s.kit !== undefined || s.index !== undefined) invalid('kit fields on a non-kit route');
    if (s.scope === 'agent') {
      if (s.realm !== undefined && !REALM_KINDS.includes(s.realm)) invalid('realm');
      if (PROCESS_WIDE.test(s.path) && s.realm !== undefined && s.realm !== 'none') invalid('a process-wide route takes no realm');
      realm = s.realm ?? (AGENT_NO_REALM.test(s.path) || PROCESS_WIDE.test(s.path) ? 'none' : AGENT_REALM_ALL[s.method + ' ' + s.path] ? 'list' : 'realm');
    } else if (s.realm !== undefined) invalid('realm on a Hoody API route');
  }
  if (s.scope === 'agent' && s.method === 'PUT' && s.path === '/hoody/realm') invalid('never set the agent realm');
  if (s.run !== undefined && (s.run !== true || s.scope !== 'kit' || s.kit !== 'exec' || body || s.idem || s.secret || s.stream || params.length || query.length)) invalid('run');
  if (s.upload !== undefined && (s.upload !== true || s.scope !== 'kit' || (s.method !== 'POST' && s.method !== 'PUT') || body || s.idem || s.secret || s.stream || s.run)) invalid('upload');
  if (s.senderKey !== undefined && (s.senderKey !== true || s.upload !== true)) invalid('senderKey');
  if (s.file !== undefined && (s.file !== true || s.scope !== 'kit' || s.kit !== 'files' || s.method !== 'PUT' || body || !s.timeoutMs || s.idem || s.secret
    || s.stream || s.run || s.upload || s.bodyText || s.change || unknownCodes)) invalid('file');
  if (s.ws !== undefined && (s.ws !== true || s.scope !== 'agent' || s.method !== 'GET' || body || s.idem || s.secret || s.stream || s.run || s.upload
    || s.file || s.bodyText || s.change || s.cas || s.readsEtag || s.readsStatus || s.refuses || s.envelope || s.keepDetails || s.cwd || s.tickets
    || s.framed !== undefined || s.maxBytes || s.timeoutMs || unknownCodes)) invalid('ws');
  if (s.bytes !== undefined && (s.bytes !== true || s.scope !== 'agent' || s.method !== 'POST' || !body || s.idem || s.secret || s.stream || s.run
    || s.upload || s.file || s.ws || s.bodyText || s.change || s.cas || s.readsEtag || s.readsStatus || s.refuses || s.envelope || s.keepDetails
    || s.cwd || s.tickets || unknownCodes)) invalid('bytes');
  if (s.stream !== undefined) {
    const f = s.stream;
    const pos = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
    if (!f || typeof f !== 'object' || !pos(f.id) || !pos(f.noId) || s.method !== 'GET' || !agentish || !s.maxBytes || s.idem || body) invalid('stream');
  }
  const pattern = new RegExp('^' + segs.map((g) => (g.charAt(0) === '*' ? '(?:/[^/]+)*' : '/' + (g.charAt(0) === ':' ? '[^/]+' : g.replace(/[.]/g, '\\.')))).join('') + (segs.length ? '' : '/') + '$');
  const route = {
    id: s.method + ' ' + s.scope + ' ' + s.path + (s.scope === 'kit' ? ' ' + s.kit : ''),
    method: s.method, path: s.path, scope: s.scope, query, body, baseOnly: s.baseOnly === true,
    secret: s.secret === true || secretKeys.length > 0 || s.bodyText === true, secretKeys,
    ifMatch: s.ifMatch === true, etagMatch: s.etagMatch === true, bodyText: s.bodyText === true, codes, unknownCodes,
    cas, readsEtag: s.readsEtag === true, readsStatus: s.readsStatus === true, deleteBody: s.deleteBody === true, refuses, envelope: s.envelope === true, keepDetails: s.keepDetails === true, cwd: s.cwd === true, tickets,
    realm, idem: s.idem === true ? 'Idempotency-Key' : s.idem || undefined, kit: s.kit, index: s.index,
    maxBytes: s.maxBytes, timeoutMs: s.timeoutMs, framed: s.framed, change: s.change, guard: s.guard, params: Object.freeze(params), deep, pattern,
    run: s.run, upload: s.upload, senderKey: s.senderKey, file: s.file, reissues: s.reissues, stream: s.stream ? Object.freeze({ id: s.stream.id, noId: s.stream.noId }) : undefined,
    ws: s.ws, bytes: s.bytes,
  };
  Object.freeze(route);
  declared.add(route);
  // Registered from the frozen route only, never from the caller's spec.
  declaredLabels.add(routeLabel(route.method, route.path));
  for (const c of route.codes ?? []) declaredCodes.add(c);
  for (const c of route.unknownCodes ?? []) declaredCodes.add(c);
  return route as Route<R, B>;
}

export function isDeclared(r: unknown): r is Route {
  return typeof r === 'object' && r !== null && declared.has(r);
}

/** `v` when it is the label of a route defineRoute declared ("METHOD /template"), else null: what is kept of a
 *  `route` read off any rejection or outcome. A filled path, a query or any other string is never one. */
export function routeOf(v: unknown): string | null {
  return typeof v === 'string' && declaredLabels.has(v) ? v : null;
}

/** True for a "METHOD /…" string whose method is a change (anything but GET and HEAD), declared or not: read before
 *  routeOf drops an undeclared one, so a change whose route is not kept still reads a change still running as
 *  pending (C9). The string itself is never kept. */
export function isChangeRoute(v: unknown): boolean {
  return typeof v === 'string' && /^(?!GET |HEAD )[A-Z]+ \//.test(v);
}

/** True when sending `route` with `method` is a change: any method but GET and HEAD, and a GET the route declares a
 *  change (`change: true`, a create-or-get). The one predicate: api() takes a change's outcomes by it, and the
 *  terminal's send policy asks for a durable record by it. */
export function isChangeCall(route: { readonly change?: boolean }, method: string): boolean {
  const m = String(method).toUpperCase();
  return (m !== 'GET' && m !== 'HEAD') || route.change === true;
}

/** Whether a declared route asks its calls for a lease ticket (any rule: required, optional or one of the body). */
export function declaresLease(route: Route): boolean {
  return !!route.tickets?.lease;
}

/** True for a code a declared route lists in `codes`. */
export function isDeclaredCode(v: unknown): boolean {
  return typeof v === 'string' && declaredCodes.has(v);
}

export interface Built {
  /** The path with params filled, then the query: what the server sees. */
  readonly url: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** The `:name` segments exactly as the path was filled (decoded): what a ticket's bind is judged against, never a second read of the caller's params. */
  readonly ids?: Readonly<Record<string, string>>;
}

/** The request a call makes, or {refused: CODE}. Nothing is sent here. */
export function build(route: Route, input: CallInput): Built | { refused: string } {
  if (isDeclared(route) && (route.run || route.stream || route.upload || route.file || route.ws || route.bytes)) return { refused: 'ROUTE_NOT_ALLOWED' };
  return buildRequest(route, input);
}

/** kit-io.ts: build() for any declared route, stream routes included; never a ws route. */
export function buildRequest(route: Route, input: CallInput): Built | { refused: string } {
  if (isDeclared(route) && route.ws) return { refused: 'ROUTE_NOT_ALLOWED' };
  return buildAny(route, input);
}

/** socket.ts: the request of a ws route only. */
export function buildSocketRequest(route: Route, input: CallInput): Built | { refused: string } {
  if (isDeclared(route) && !route.ws) return { refused: 'ROUTE_NOT_ALLOWED' };
  return buildAny(route, input);
}

function buildAny(route: Route, input: CallInput): Built | { refused: string } {
  if (!isDeclared(route)) return { refused: 'ROUTE_NOT_DECLARED' };
  const params = input.params || {};
  if (typeof params !== 'object') return { refused: 'ROUTE_PARAMS' };
  for (const k of Object.keys(params)) if (!route.params.includes(k)) return { refused: 'ROUTE_PARAMS' };
  let path = '';
  const ids: Record<string, string> = {};
  for (const g of route.path === '/' ? [] : route.path.slice(1).split('/')) {
    if (g.charAt(0) === '*') {
      const parts = Object.prototype.hasOwnProperty.call(params, g.slice(1)) ? params[g.slice(1)] : undefined;
      const enc = Array.isArray(parts) ? encodePathParts(route.method, parts as readonly string[], route.kit === 'files' && path === '/api/v1/files') : null;
      if (enc === null) return { refused: 'ROUTE_PARAMS' };
      if (enc) path += '/' + enc;
      continue;
    }
    if (g.charAt(0) !== ':') { path += '/' + g; continue; }
    const v = Object.prototype.hasOwnProperty.call(params, g.slice(1)) ? params[g.slice(1)] : undefined;
    const sv = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : '';
    if (!sv || sv === '.' || sv === '..' || sv.length > 256 || /[/\\%\u0000-\u001f\u007f]/.test(sv)) return { refused: 'ROUTE_PARAMS' };
    path += '/' + encodeURIComponent(sv);
    ids[g.slice(1)] = sv;
  }
  if (!path) path = '/';
  const q = input.query || {};
  const query: Record<string, string> = {};
  const parts: string[] = [];
  for (const k of Object.keys(q)) {
    if (!route.query.includes(k)) return { refused: 'ROUTE_QUERY' };
    const v = q[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) return { refused: 'ROUTE_QUERY' };
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return { refused: 'ROUTE_QUERY' };
    query[k] = String(v);
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  let body: unknown = input.body;
  if (route.bodyText) {
    // Sent as it is: one string, never JSON.
    if (typeof body !== 'string' || body.length > MAX_BODY_TEXT) return { refused: 'ROUTE_BODY' };
  } else if (body !== undefined && body !== null) {
    if (!route.body) return { refused: 'ROUTE_BODY' };
    // Checked as it will be sent: its JSON, read back (a toJSON or a cycle cannot slip past).
    try { body = JSON.parse(JSON.stringify(body)); } catch { return { refused: 'ROUTE_BODY' }; }
    const isPlain = typeof body === 'object' && body !== null && !Array.isArray(body);
    if (!isPlain || Object.keys(body as object).some((k) => !(route.body as readonly string[]).includes(k))) return { refused: 'ROUTE_BODY' };
  } else body = null;
  // A cas body write never leaves without its token(s): a string (1..512 characters) or a positive whole number each (0 is the agent's "save unconditionally").
  if (route.cas && route.cas.via === 'body') {
    const b = (body ?? {}) as Record<string, unknown>;
    for (const k of route.cas.keys) {
      const v = b[k];
      if (!((typeof v === 'string' && v.length >= 1 && v.length <= 512) || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1))) return { refused: 'CAS_REQUIRED' };
    }
  }
  return Object.freeze({ url: path + (parts.length ? '?' + parts.join('&') : ''), path, query: Object.freeze(query), body, ids: Object.freeze(ids) });
}
