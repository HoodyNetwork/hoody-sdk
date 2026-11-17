// MCP servers of AI → Settings → Connections: what the agent's list says, what a change
// sends, what it will start or where it will send (for the confirm), what an import's preview says, and what a fresh
// list says about a change whose answer was lost (never that it applied: see proveWrite). No words and no requests live here.
//
// The agent reports env and header NAMES only, never their values; nothing here ever holds a value the agent sent. A value the
// person types goes into the one request that sets it and nowhere else (never into a change's identity).
import { utf8Bytes } from '@core/pure';

export const MCP_SCOPES = ['user', 'project', 'local'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const TRANSPORTS = ['stdio', 'http', 'sse'] as const;
export type Transport = (typeof TRANSPORTS)[number];
export type McpOp = 'upsert' | 'delete' | 'set_enabled' | 'import';

export interface McpServer {
  name: string;
  /** The settings layer the entry comes from (the last one that declares the name); null when it is none of the three. */
  scope: McpScope | null;
  transport: Transport;
  enabled: boolean;
  requireConfirmation: boolean;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  headerKeys: string[];
  /** The tool allow-list; null when the server is not restricted. */
  allowedTools: string[] | null;
  connected: boolean;
  toolCount: number | null;
  revoked: boolean;
  revokedReason: string | null;
  stderrTail: string | null;
}

export interface McpFile { scope: McpScope; path: string; exists: boolean; hash: string }

/** One list as the agent answered it, with the place and the session it was read on. */
export interface McpList {
  servers: McpServer[];
  /** Entries the agent listed that could not be read (their names, null when even that was unreadable). */
  unreadable: (string | null)[];
  /** Each settings layer the session can write, with the hash a write to it is checked against. */
  files: Partial<Record<McpScope, McpFile>>;
  warnings: string[];
  realm: string;
  cwd: string | null;
  sid: string;
}

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const isScope = (x: unknown): x is McpScope => typeof x === 'string' && (MCP_SCOPES as readonly string[]).includes(x);
const isTransport = (x: unknown): x is Transport => typeof x === 'string' && (TRANSPORTS as readonly string[]).includes(x);
const strs = (x: unknown): string[] | null => (Array.isArray(x) && x.every((s) => typeof s === 'string') ? [...(x as string[])] : null);
const text = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

/** An entry of the list the page could not read: shown as unreadable, never edited, never a proof. */
export interface McpInvalid { invalid: true; name: string | null }
export const isInvalid = (x: McpServer | McpInvalid): x is McpInvalid => 'invalid' in x;

/**
 * One entry of the agent's list, read strictly: every field the agent always sends (name, scope, transport, enabled,
 * require_confirmation, connected, env_keys, header_keys; a command and its args for a command server, a url for an address
 * server) must be there with its type, and an optional one (allowed_tools, tool_count, revoked, revoked_reason, stderr_tail)
 * must have its type when present. Anything else is Invalid, never a default: a missing list of names is not "no names".
 */
export function decodeServer(x: unknown): McpServer | McpInvalid {
  const r = rec(x);
  const name = r && typeof r.name === 'string' && r.name !== '' ? r.name : null;
  const bad: McpInvalid = { invalid: true, name };
  // The agent names a layer or sends '' (a layer it does not write); any other string is not its answer.
  if (!r || name === null || !isTransport(r.transport) || !(r.scope === '' || isScope(r.scope))) return bad;
  if (typeof r.enabled !== 'boolean' || typeof r.require_confirmation !== 'boolean' || typeof r.connected !== 'boolean') return bad;
  const envKeys = strs(r.env_keys);
  const headerKeys = strs(r.header_keys);
  if (!envKeys || !headerKeys) return bad;
  let command: string | null = null;
  let args: string[] = [];
  let url: string | null = null;
  // The agent refuses a command server with a url and an address server with a command: an entry carrying both contradicts itself.
  if (r.transport === 'stdio') {
    command = text(r.command);
    const a = strs(r.args);
    if (command === null || a === null || r.url !== undefined) return bad;
    args = a;
  } else {
    url = text(r.url);
    if (url === null || r.command !== undefined || r.args !== undefined) return bad;
  }
  const allowed = r.allowed_tools === undefined ? null : strs(r.allowed_tools);
  if (r.allowed_tools !== undefined && allowed === null) return bad;
  const toolCount = r.tool_count === undefined ? null : typeof r.tool_count === 'number' && Number.isInteger(r.tool_count) && r.tool_count >= 0 ? r.tool_count : undefined;
  if (toolCount === undefined) return bad;
  if (r.revoked !== undefined && typeof r.revoked !== 'boolean') return bad;
  for (const k of ['revoked_reason', 'stderr_tail'] as const) if (r[k] !== undefined && typeof r[k] !== 'string') return bad;
  return {
    name,
    scope: r.scope === '' ? null : r.scope,
    transport: r.transport,
    enabled: r.enabled,
    requireConfirmation: r.require_confirmation,
    command,
    args,
    url,
    envKeys,
    headerKeys,
    allowedTools: allowed,
    connected: r.connected,
    toolCount,
    revoked: r.revoked === true,
    revokedReason: text(r.revoked_reason),
    stderrTail: text(r.stderr_tail),
  };
}

/** The list answer, or null when the answer itself (its status, files or warnings) cannot be read. An entry that cannot be read
 *  is kept apart in `unreadable` (by name when it has one): it is shown as such, and any proof read on this list is unknown. */
export function listOf(raw: unknown, place: { realm: string; cwd: string | null; sid: string }): McpList | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || !Array.isArray(r.servers) || !Array.isArray(r.files)) return null;
  const warnings = strs(r.warnings);
  if (!warnings) return null;
  const servers: McpServer[] = [];
  const unreadable: (string | null)[] = [];
  for (const x of r.servers) {
    const one = decodeServer(x);
    if (isInvalid(one)) unreadable.push(one.name);
    else servers.push(one);
  }
  // The effective list holds each name once and each layer once: a repeat contradicts the answer, so none of it is read.
  const names = [...servers.map((s) => s.name), ...unreadable.filter((n): n is string => n !== null)];
  if (new Set(names).size !== names.length) return null;
  const files: Partial<Record<McpScope, McpFile>> = {};
  for (const f of r.files) {
    const x = rec(f);
    if (!x || !isScope(x.scope) || typeof x.hash !== 'string' || x.hash === '' || typeof x.path !== 'string' || typeof x.exists !== 'boolean') return null;
    if (files[x.scope]) return null;
    files[x.scope] = { scope: x.scope, path: x.path, exists: x.exists, hash: x.hash };
  }
  return { servers, unreadable, files, warnings, realm: place.realm, cwd: place.cwd, sid: place.sid };
}

/** The nonce of a beginMCPWrite answer, or null. */
export function nonceOf(raw: unknown): string | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok') return null;
  return typeof r.nonce === 'string' && r.nonce.length >= 1 && r.nonce.length <= 512 ? r.nonce : null;
}

/** A write's answer: the layer's hash after it, or null when the answer is not the agent's success. */
export function writtenOf(raw: unknown): { hash: string } | null {
  const r = rec(raw);
  return r && r.status === 'ok' && typeof r.hash === 'string' && r.hash !== '' ? { hash: r.hash } : null;
}

/** A reconnect's answer, or null when it cannot be read or contradicts itself (more sessions left to the background than were
 *  visited). partial: sessions with a layer that did not load (not reconnected); deferred: other open chats left to a background
 *  pass, which `started` says was started (false: skipped, those chats keep their old tools until the next change). */
export interface Reconnected { partial: number; deferred: number; started: boolean }
export function reconnectOf(raw: unknown): Reconnected | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || !strs(r.warnings) || !Array.isArray(r.servers) || typeof r.deferred_started !== 'boolean') return null;
  const n = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);
  const sessions = n(r.sessions);
  const partial = n(r.partial_sessions);
  const deferred = n(r.deferred_sessions);
  if (sessions === null || partial === null || deferred === null || n(r.revoked) === null || deferred > sessions) return null;
  return { partial, deferred, started: r.deferred_started };
}

// ---- what a change runs or where it sends ----

/** What a server runs, as one line: the command and its arguments as typed (shown, never interpreted). */
export const commandLine = (command: string, args: readonly string[]): string => [command, ...args].join(' ');

/** The host a URL sends to; null when it is not an http(s) URL. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host : null;
  } catch { return null; }
}

/** The effect a server has, for its row and its confirms. */
export type Effect = { kind: 'runs'; command: string } | { kind: 'sends'; host: string } | { kind: 'unknown' };
export function effectOf(s: { transport: Transport; command: string | null; args: readonly string[]; url: string | null }): Effect {
  if (s.transport === 'stdio') return s.command ? { kind: 'runs', command: commandLine(s.command, s.args) } : { kind: 'unknown' };
  const host = s.url ? hostOf(s.url) : null;
  return host ? { kind: 'sends', host } : { kind: 'unknown' };
}

// A credential typed into an address or an argument is saved and shown as typed (only env and header VALUES are hidden).
const CRED_ARG = /(?:^|[-_])(?:token|secret|password|passwd|api[-_]?key|apikey|auth|bearer|key)(?:=|$)/i;
const CRED_QUERY = /^(?:token|access_token|api[-_]?key|apikey|key|secret|password|auth|sig|signature)$/i;
/** True when the address or the arguments look like they carry a credential, so the editor warns before saving them. */
export function looksLikeCredential(s: { url: string | null; args: readonly string[] }): boolean {
  if (s.url) {
    try {
      const u = new URL(s.url);
      if (u.username || u.password) return true;
      for (const k of u.searchParams.keys()) if (CRED_QUERY.test(k)) return true;
    } catch { /* not a URL: nothing to judge */ }
  }
  return s.args.some((a) => CRED_ARG.test(a) || /^(?:sk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{8,}/.test(a));
}

// ---- the editor ----

export const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** What a name may not be (the agent checks again). */
export function nameProblem(name: string, taken: readonly string[]): 'empty' | 'chars' | 'reserved' | 'taken' | null {
  if (name === '') return 'empty';
  if (!NAME_RE.test(name) || name.includes('__')) return 'chars';
  if (/^(?:hoody|mcp)$/i.test(name)) return 'reserved';
  if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return 'taken';
  return null;
}
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const HEADER_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;

/** One env or header row of the editor: a name the agent already has (value kept or removed) or a new one with a value. */
export type CredRow = { name: string; kind: 'kept' } | { name: string; kind: 'removed' } | { name: string; kind: 'set'; value: string };

export interface Draft {
  name: string;
  transport: Transport;
  command: string;
  /** Arguments as the person types them, one per line. */
  args: string;
  /** The saved arguments, exactly as the agent has them (an edit). They are sent as they are until the person edits the text. */
  origArgs: string[] | null;
  argsEdited: boolean;
  url: string;
  requireConfirmation: boolean;
  env: CredRow[];
  headers: CredRow[];
  /** Which of the server's tools agents get: every one (no allow-list: allowed_tools absent), only the names typed, or
   *  none (an empty allow-list). "No list" and an empty list are different settings and stay apart here. */
  tools: ToolMode;
  /** The tool names for 'only', as typed: one per line (a comma is part of a name: the agent matches names exactly). */
  toolNames: string;
  /** False until the person changes the tools (an edit opens with the saved list): an untouched edit sends no allowed_tools and
   *  asks nothing of the saved names, so a list the agent holds is never rewritten by an edit of another field. */
  toolsEdited: boolean;
}

export const TOOL_MODES = ['all', 'only', 'none'] as const;
export type ToolMode = (typeof TOOL_MODES)[number];
/** The draft's tools as a saved entry has them: 'all' when it has no allow-list, 'none' for an empty one, else 'only'. */
export const toolModeOf = (allowed: readonly string[] | null): ToolMode => (allowed === null ? 'all' : allowed.length === 0 ? 'none' : 'only');
/** The lines typed for 'only' (a line break, LF or CRLF, is the only separator). */
const toolLinesOf = (typed: string): string[] => typed.split(/\r?\n/);
/** The names typed for 'only': one per line, trimmed, blanks dropped, each once, in the order typed. */
export function toolNamesOf(typed: string): string[] {
  const out: string[] = [];
  for (const n of toolLinesOf(typed).map((x) => x.trim())) if (n !== '' && !out.includes(n)) out.push(n);
  return out;
}
/** The allow-list the draft asks for: null = no list (every tool), [] = no tool, else the names. */
export function allowedAfter(d: Pick<Draft, 'tools' | 'toolNames'>): string[] | null {
  return d.tools === 'all' ? null : d.tools === 'none' ? [] : toolNamesOf(d.toolNames);
}
const sameNames = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
/**
 * Whether a saved allow-list can be lifted from here: not today. The agent keeps a stored allowed_tools that an upsert leaves
 * out and refuses a null one, and an empty list means no tool, so no write turns a restricted server back to every tool.
 * An unrestricted server, or a new one, can be set to anything.
 */
export const toolsLocked = (orig: McpServer | null): boolean => orig !== null && orig.allowedTools !== null;
export type ToolsProblem = 'tools_locked' | 'tools_empty' | 'tool_name';
/** What is wrong with the draft's tools (the agent matches names exactly; it checks nothing else). */
export function toolsProblem(d: Pick<Draft, 'tools' | 'toolNames' | 'toolsEdited'>, orig: McpServer | null): ToolsProblem | null {
  if (orig && !d.toolsEdited) return null; // the saved list, sent as it is (not at all): nothing typed to check
  if (d.tools === 'all') return toolsLocked(orig) ? 'tools_locked' : null;
  if (d.tools === 'none') return null;
  const names = toolNamesOf(d.toolNames);
  if (names.length === 0) return 'tools_empty';
  // A control character (C0, DEL, C1) anywhere on a line, checked before trimming so none is trimmed away; then a space
  // inside a name.
  // eslint-disable-next-line no-control-regex
  if (toolLinesOf(d.toolNames).some((l) => /[\u0000-\u001f\u007f-\u009f]/.test(l))) return 'tool_name';
  if (names.some((n) => n.length > 128 || /\s/.test(n))) return 'tool_name';
  return null;
}
/** The allowed_tools a write sends, or undefined to leave the saved one as it is: a new server sends a list only when it has
 *  one; an edit sends one only when it differs from the saved one (left out, the agent keeps what is saved). Never null. */
export function toolsBody(d: Pick<Draft, 'tools' | 'toolNames' | 'toolsEdited'>, orig: McpServer | null): string[] | undefined {
  if (orig && !d.toolsEdited) return undefined; // untouched: the agent keeps the saved list byte for byte
  const after = allowedAfter(d);
  if (after === null) return undefined; // every tool: no list to send (an edit of a restricted server cannot get here: tools_locked)
  if (orig && orig.allowedTools !== null && sameNames(after, orig.allowedTools)) return undefined;
  return after;
}

export const argsOf = (typed: string): string[] => typed.split('\n').map((a) => a.trim()).filter((a) => a !== '');
/** The arguments a draft sends: the saved ones byte for byte while untouched, else the typed lines. */
export const draftArgs = (d: Draft): string[] => (d.origArgs !== null && !d.argsEdited ? [...d.origArgs] : argsOf(d.args));

/** True when the edit changes what runs or where it connects: the agent then clears the saved values the edit does not set. */
export function repoints(orig: McpServer, d: Draft): boolean {
  if (orig.transport !== d.transport) return true;
  if (d.transport === 'stdio') {
    const a = draftArgs(d);
    return (orig.command ?? '') !== d.command.trim() || a.length !== orig.args.length || a.some((x, i) => x !== orig.args[i]);
  }
  return (orig.url ?? '') !== d.url.trim();
}

/** The draft's credential rows for its transport (env for a command, headers for an address). */
export const credsOf = (d: Draft): CredRow[] => (d.transport === 'stdio' ? d.env : d.headers);

/** The saved names an edit clears, env and headers apart: on a re-point the agent keeps no value the write does not set again in
 *  the same map (a command sends env only, an address headers only; header names match case-insensitively, env names exactly).
 *  Names only; both empty when nothing is re-pointed. */
export interface Cleared { env: string[]; headers: string[] }
export function clearedBy(orig: McpServer | null, d: Draft): Cleared {
  if (!orig || !repoints(orig, d)) return { env: [], headers: [] };
  const stdio = d.transport === 'stdio';
  const envSet = new Set(stdio ? d.env.filter((c) => c.kind === 'set').map((c) => c.name) : []);
  const headerSet = new Set(stdio ? [] : d.headers.filter((c) => c.kind === 'set').map((c) => c.name.toLowerCase()));
  return {
    env: orig.envKeys.filter((n) => !envSet.has(n)).sort(),
    headers: orig.headerKeys.filter((n) => !headerSet.has(n.toLowerCase())).sort(),
  };
}
export const clearsAny = (c: Cleared): boolean => c.env.length + c.headers.length > 0;

export type DraftProblem = 'name' | 'command' | 'url' | 'env_key' | 'header_key' | 'header_reserved' | 'duplicate_key';
/** A header name the agent keeps for itself and refuses in a server's headers (its protocol
 *  headers: Accept, Content-Type, MCP-Protocol-Version, Last-Event-ID and every Mcp-* name, in any letter case). */
export const reservedHeader = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return n === 'accept' || n === 'content-type' || n === 'mcp-protocol-version' || n === 'last-event-id' || n.startsWith('mcp-');
};
export function draftProblem(d: Draft, taken: readonly string[], editing: boolean): DraftProblem | null {
  if (!editing && nameProblem(d.name, taken) !== null) return 'name';
  if (d.transport === 'stdio' ? d.command.trim() === '' : hostOf(d.url.trim()) === null) return d.transport === 'stdio' ? 'command' : 'url';
  const creds = credsOf(d);
  const keyRe = d.transport === 'stdio' ? ENV_KEY_RE : HEADER_RE;
  if (creds.some((c) => c.kind === 'set' && !keyRe.test(c.name))) return d.transport === 'stdio' ? 'env_key' : 'header_key';
  if (d.transport !== 'stdio' && creds.some((c) => c.kind === 'set' && reservedHeader(c.name))) return 'header_reserved';
  const names = creds.filter((c) => c.kind !== 'removed').map((c) => (d.transport === 'stdio' ? c.name : c.name.toLowerCase()));
  if (new Set(names).size !== names.length) return 'duplicate_key';
  return null;
}

/** The credential map a write sends: a typed value sets a name, a removed name is null, a kept name is left out (kept by the
 *  agent). After a re-point the agent keeps nothing that is not sent, so kept names are gone. */
function credBody(rows: readonly CredRow[], creating: boolean): Record<string, string | null> | undefined {
  // Built from entries, so every accepted name is an own key (an assignment named __proto__ would set the prototype instead).
  const out: [string, string | null][] = [];
  for (const r of rows) {
    if (r.kind === 'set') out.push([r.name, r.value]);
    else if (r.kind === 'removed' && !creating) out.push([r.name, null]);
  }
  return out.length ? Object.fromEntries(out) : undefined;
}

/** The `server` object of an upsert. */
export function serverBody(d: Draft, orig: McpServer | null): Record<string, unknown> {
  const body: Record<string, unknown> = { name: orig?.name ?? d.name, type: d.transport, require_confirmation: d.requireConfirmation };
  if (d.transport === 'stdio') {
    body.command = d.command.trim();
    body.args = draftArgs(d);
    const env = credBody(d.env, orig === null);
    if (env) body.env = env;
  } else {
    body.url = d.url.trim();
    const headers = credBody(d.headers, orig === null);
    if (headers) body.headers = headers;
  }
  const tools = toolsBody(d, orig);
  if (tools) body.allowed_tools = tools;
  if (orig === null) body.enabled = true;
  return body;
}

/** True when the write sends a credential VALUE: names in a later list cannot show whether a value was saved. */
export const setsValues = (d: Draft): boolean => credsOf(d).some((c) => c.kind === 'set');

// ---- a change's intent and its proof ----

/** What an entry is, by what the list shows (names only, never a value). */
export interface Shape {
  transport: Transport;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  /** Lower case: header names are case-insensitive. */
  headerKeys: string[];
  requireConfirmation: boolean;
  enabled: boolean;
  /** The allow-list, sorted (null: no list, every tool; []: no tool). Absent in a change held by an older Hub: read as unknown. */
  allowedTools?: string[] | null;
}
export function shapeOf(s: McpServer): Shape {
  return {
    transport: s.transport, command: s.command, args: [...s.args], url: s.url, envKeys: [...s.envKeys].sort(),
    headerKeys: s.headerKeys.map((h) => h.toLowerCase()).sort(), requireConfirmation: s.requireConfirmation, enabled: s.enabled,
    allowedTools: s.allowedTools === null ? null : [...s.allowedTools].sort(),
  };
}
/** The entry an upsert asks for (`orig`: the entry it edits, as the person reviewed it; null for a new one). */
export function shapeAfter(d: Draft, orig: McpServer | null): Shape {
  const repoint = orig !== null && repoints(orig, d);
  const keys = (rows: readonly CredRow[], saved: readonly string[], mine: boolean): string[] => {
    // The transport's own rows decide its names; the other map is cleared by a re-point and untouched otherwise.
    if (!mine) return repoint || orig === null ? [] : [...saved];
    return rows.filter((r) => r.kind === 'set' || (r.kind === 'kept' && !repoint)).map((r) => r.name);
  };
  const stdio = d.transport === 'stdio';
  return {
    transport: d.transport,
    command: stdio ? d.command.trim() : null,
    args: stdio ? draftArgs(d) : [],
    url: stdio ? null : d.url.trim(),
    envKeys: keys(d.env, orig?.envKeys ?? [], stdio).sort(),
    headerKeys: keys(d.headers, orig?.headerKeys ?? [], !stdio).map((h) => h.toLowerCase()).sort(),
    requireConfirmation: d.requireConfirmation,
    enabled: orig ? orig.enabled : true,
    // What the agent will hold: the list sent, else the saved one (an edit that sends none keeps it), else none (a new server).
    allowedTools: ((): string[] | null => {
      const sent = toolsBody(d, orig);
      if (sent) return [...sent].sort();
      return orig?.allowedTools ? [...orig.allowedTools].sort() : null;
    })(),
  };
}

/** Every layer's hash as the person saw it. The agent merges an entry's fields across the layers, so what a confirm shows (and
 *  what a later list can prove) depends on all of them, not only on the layer written. */
export type Layers = Partial<Record<McpScope, string>>;
export const layersOf = (l: McpList): Layers => Object.fromEntries(Object.values(l.files).map((f) => [f.scope, f.hash]));
export function sameLayers(a: Layers, b: Layers): boolean {
  return MCP_SCOPES.every((s) => (a[s] ?? null) === (b[s] ?? null));
}

/** A change's identity, held while its answer is unknown and judged by proveWrite. Names only, never a value. */
export interface WriteIntent {
  computer: string;
  realm: string;
  /** The folder of the session's place ('' for the realm). */
  cwd: string;
  scope: McpScope;
  op: McpOp;
  name: string;
  /** The layer hash the write was checked against (the one the person reviewed): layers[scope]. */
  expectHash: string;
  /** Every layer's hash as reviewed. */
  layers: Layers;
  /** The entry as the person reviewed it; null when the layer had none of that name (an add). */
  before: Shape | null;
  /** upsert: the entry asked for. */
  shape?: Shape;
  /** upsert: it sends a credential value. */
  setsValues?: boolean;
  /** set_enabled: the state asked for. */
  enabled?: boolean;
  /** import: the previewed names, and whether the import replaces entries of those names. Never the document. */
  names?: string[];
  replace?: boolean;
}

const sameShape = (a: Shape, b: Shape): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What a confirm showed: every layer's hash, and the entry of that name as merged with the layer it came from (`before`: null
 *  for an add, which expects no entry of that name). */
export interface Reviewed { layers: Layers; name: string; before: Shape | null; from: McpScope | null }
/** Whether a fresh list still shows what the person reviewed. The hashes alone do not prove it: a file the loader skipped keeps
 *  its hash, and the agent reads the entries and the hashes apart. So the list must be complete (no loader warning, no
 *  unreadable entry), every hash as reviewed, and the entry exactly as the confirm showed it, from the same layer. */
export function stillReviewed(l: McpList, r: Reviewed): boolean {
  if (l.warnings.length > 0 || l.unreadable.length > 0 || !sameLayers(layersOf(l), r.layers)) return false;
  const s = l.servers.find((x) => x.name === r.name);
  if (r.before === null) return s === undefined;
  return s !== undefined && s.scope === r.from && sameShape(shapeOf(s), r.before);
}

/** 'applied' is kept for when the list can show a layer's own content; no list today yields it. */
export type Proof = 'applied' | 'notApplied' | 'unknown';

/**
 * What one fresh list of the same realm and folder says about a lost write. It never proves one applied: an entry's `scope` names the last layer that declares it, not the layer each field came from
 * (fields merge across the layers), and the agent also reads a top-level key in another spelling (MCP_SERVERS) that no hash
 * covers, which can supply a field or hide an entry the layer still holds. So a list cannot show what the written layer itself
 * holds:
 *   - unknown when the list is incomplete: a loader warning (an entry dropped, a layer skipped) or an entry it could not read;
 *   - notApplied when the written layer is byte for byte as the person reviewed it (same hash);
 *   - unknown otherwise. A held change ends only by Stop tracking.
 */
export function proveWrite(intent: WriteIntent, l: McpList): Proof {
  if (l.realm !== intent.realm || (l.cwd ?? '') !== intent.cwd) return 'unknown';
  const file = l.files[intent.scope];
  if (!file || l.warnings.length > 0 || l.unreadable.length > 0) return 'unknown';
  return file.hash === intent.expectHash ? 'notApplied' : 'unknown';
}

const isShape = (x: unknown): x is Shape => {
  const r = rec(x);
  return !!r && isTransport(r.transport) && Array.isArray(r.args) && Array.isArray(r.envKeys) && Array.isArray(r.headerKeys)
    && typeof r.requireConfirmation === 'boolean' && typeof r.enabled === 'boolean';
};

/** Core's verdict for a held change: 'applied' only, which proveWrite never answers today, so a held change ends by Stop
 *  tracking. notApplied frees nothing either: the sent request may still land after the read. */
export function mcpProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const id = rec(identity);
  if (!id || !isScope(id.scope) || typeof id.expectHash !== 'string' || id.expectHash === '' || typeof id.name !== 'string' || id.name === '') return undefined;
  if (typeof id.realm !== 'string' || typeof id.cwd !== 'string' || !(id.op === 'upsert' || id.op === 'delete' || id.op === 'set_enabled')) return undefined;
  if (id.before !== null && !isShape(id.before)) return undefined;
  const ly = rec(id.layers);
  if (!ly || Object.entries(ly).some(([k, v]) => !isScope(k) || typeof v !== 'string' || v === '') || ly[id.scope] !== id.expectHash) return undefined;
  if (id.op === 'upsert' && !isShape(id.shape)) return undefined;
  const intent = id as unknown as WriteIntent;
  for (const a of answers[0] ?? []) {
    const l = a as McpList | null;
    if (!l || !Array.isArray(l.servers) || !Array.isArray(l.unreadable) || !Array.isArray(l.warnings) || !l.files) continue;
    if (proveWrite(intent, l) === 'applied') return 'applied';
  }
  return undefined;
}

// ---- import ----

/** One server of an import's preview: what it runs or where it sends, and the NAMES of its values. */
export interface ImportEntry {
  name: string;
  transport: Transport;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  headerKeys: string[];
}
/** The agent's preview of a pasted config (mcp.parse): it writes nothing. */
export interface ImportPreview { dialect: string; servers: ImportEntry[]; warnings: string[] }

/** A pasted type as the agent reads it (trimmed, any case, its spellings); anything else is unreadable. */
function importTransportOf(x: unknown): Transport | null {
  if (typeof x !== 'string') return null;
  const t = x.trim().toLowerCase();
  if (t === '' || t === 'stdio') return 'stdio';
  if (t === 'http' || t === 'url' || t === 'streamable' || t === 'streamable-http') return 'http';
  return t === 'sse' ? 'sse' : null;
}

/** One previewed server, read strictly. The agent replaces env and headers by their key names; an entry that still carries
 *  either map (in any case) would put a value in the page, and one that is not off contradicts "imports land off": either makes
 *  the whole preview unreadable. Only the fields below are read: any other key of the document never travels on. */
function importEntryOf(x: unknown): ImportEntry | null {
  const r = rec(x);
  if (!r || typeof r.name !== 'string' || r.name === '' || r.enabled !== false) return null;
  if (Object.keys(r).some((k) => k.toLowerCase() === 'env' || k.toLowerCase() === 'headers')) return null;
  const envKeys = r.env_keys === undefined ? [] : strs(r.env_keys);
  const headerKeys = r.header_keys === undefined ? [] : strs(r.header_keys);
  if (!envKeys || !headerKeys) return null;
  // The agent gives an address without a type the type http; a command without one is a command.
  const transport = r.type === undefined ? (r.command !== undefined ? 'stdio' : null) : importTransportOf(r.type);
  if (transport === null) return null;
  if (transport === 'stdio') {
    const command = text(r.command);
    const args = r.args === undefined ? [] : strs(r.args);
    if (command === null || args === null || r.url !== undefined) return null;
    return { name: r.name, transport, command, args, url: null, envKeys, headerKeys };
  }
  const url = text(r.url);
  if (url === null || r.command !== undefined || r.args !== undefined) return null;
  return { name: r.name, transport, command: null, args: [], url, envKeys, headerKeys };
}

/** The preview answer, or null when any of it cannot be read: a preview read in part would import what was not shown. */
export function importPreviewOf(raw: unknown): ImportPreview | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || typeof r.dialect !== 'string' || !Array.isArray(r.servers) || r.count !== r.servers.length) return null;
  const warnings = strs(r.warnings);
  if (!warnings) return null;
  const servers: ImportEntry[] = [];
  for (const x of r.servers) {
    const e = importEntryOf(x);
    if (!e) return null;
    servers.push(e);
  }
  // The agent compares names case-insensitively: two that differ only in case contradict its own check.
  if (new Set(servers.map((s) => s.name.toLowerCase())).size !== servers.length) return null;
  return { dialect: r.dialect, servers, warnings };
}

/** Why an import cannot be reviewed, from the list as shown:
 *   - incomplete: the list has a loader warning or an entry it could not read, so nothing about a name can be judged;
 *   - other_layer: the name is listed from another settings layer (or none stated). The agent merges an entry's fields across
 *     the layers and a later one wins, so that layer could turn the imported entry on or re-point it;
 *   - case: the name differs only in case from a listed one. The writer matches names exactly, so the import would add a
 *     second entry beside it instead of replacing it. */
export type ImportBlock = { kind: 'incomplete' } | { kind: 'other_layer'; name: string; layer: McpScope | null } | { kind: 'case'; name: string; existing: string };
export function importBlocks(entries: readonly { name: string }[], l: McpList, scope: McpScope): ImportBlock[] {
  if (l.warnings.length > 0 || l.unreadable.length > 0) return [{ kind: 'incomplete' }];
  const out: ImportBlock[] = [];
  for (const e of entries) {
    // Every listed entry matching in any case: an exact match must not hide a later case-only one.
    for (const s of l.servers.filter((x) => x.name.toLowerCase() === e.name.toLowerCase())) {
      if (s.name !== e.name) out.push({ kind: 'case', name: e.name, existing: s.name });
      else if (s.scope !== scope) out.push({ kind: 'other_layer', name: e.name, layer: s.scope });
    }
  }
  return out;
}

/** The previewed names listed from the layer the import writes, spelled exactly: without Replace the agent refuses the import if
 *  the layer holds one. The list cannot show every name a layer holds (an entry can be hidden from it), so with Replace the
 *  confirm names every incoming server instead. */
export function sameLayerNames(entries: readonly { name: string }[], l: McpList, scope: McpScope): string[] {
  return entries.map((e) => e.name).filter((n) => l.servers.some((s) => s.name === n && s.scope === scope));
}

/** The effective entry of a previewed name as the confirm saw it (names only). */
export interface Seen { name: string; scope: McpScope | null; shape: Shape }
/** The listed entries whose name matches a previewed one in any case, sorted by name. */
export function seenOf(names: readonly string[], l: McpList): Seen[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  return l.servers.filter((s) => want.has(s.name.toLowerCase())).map((s) => ({ name: s.name, scope: s.scope, shape: shapeOf(s) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** What the import's confirm showed: every layer's hash, the previewed names, and the effective entry of each of them. */
export interface ImportReviewed { layers: Layers; names: readonly string[]; seen: readonly Seen[] }
/** Whether a fresh list still shows what the person reviewed for an import: complete, every hash as reviewed, and the effective
 *  entries of the previewed names exactly as seen (same names, layers and shapes, enabled included). Hashes and names alone miss
 *  a spelling no hash covers turning an entry on. */
export function importStillReviewed(l: McpList, r: ImportReviewed): boolean {
  if (l.warnings.length > 0 || l.unreadable.length > 0 || !sameLayers(layersOf(l), r.layers)) return false;
  return JSON.stringify(seenOf(r.names, l)) === JSON.stringify(r.seen);
}

/** A parser advisory as fixed words. The agent's text quotes the value it is about (a `${…}` in an env or header value, an env
 *  file's path), so it is never shown: only its kind, and the server name when it is one of the previewed names. */
export type AdvisoryKind = 'inputs' | 'env_file' | 'unresolved' | 'literal' | 'other';
export interface Advisory { kind: AdvisoryKind; name: string | null }
// The fixed parts of the agent's import formats; the name is a server name (NAME_RE) before the first ': '.
const ADVISORIES: [AdvisoryKind, RegExp][] = [
  ['inputs', /^the document declares VS Code inputs \(/],
  ['env_file', /^([A-Za-z0-9_-]{1,64}): envFile \(/],
  ['unresolved', /^([A-Za-z0-9_-]{1,64}): \S+ references .*, which hoody cannot resolve — it would expand to EMPTY;/],
  ['literal', /^([A-Za-z0-9_-]{1,64}): \S+ contains .* — hoody expands \$\{…\} only in env and headers,/],
];
export function advisoriesOf(warnings: readonly string[], names: readonly string[]): Advisory[] {
  const out: Advisory[] = [];
  for (const w of warnings) {
    let a: Advisory = { kind: 'other', name: null };
    for (const [kind, re] of ADVISORIES) {
      const m = re.exec(w);
      if (m) { a = { kind, name: m[1] !== undefined && names.includes(m[1]) ? m[1] : null }; break; }
    }
    if (!out.some((x) => x.kind === a.kind && x.name === a.name)) out.push(a);
  }
  return out;
}

/** The agent's limit for a pasted document, in bytes. */
export const MAX_IMPORT_BYTES = 1 << 20;
/** The display fields the agent writes into a preview. A document carrying one could replace the names the agent generates
 *  (its preview copies the entry's own keys, then the generated ones, in map order), so such a paste is never previewed. */
const RESERVED_KEYS = ['env_keys', 'header_keys'];
/** Why a paste is not previewed: empty, over the agent's limit, not JSON (the agent reads plain JSON only), or carrying a
 *  reserved display field at any depth. */
export function importDocProblem(doc: string): 'empty' | 'too_big' | 'not_json' | 'reserved' | null {
  if (doc.trim() === '') return 'empty';
  if (utf8Bytes(doc) > MAX_IMPORT_BYTES) return 'too_big';
  let root: unknown;
  try { root = JSON.parse(doc); } catch { return 'not_json'; }
  // Walked with a stack, never recursion: a deep paste must not overflow the page.
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const x = stack.pop();
    if (Array.isArray(x)) { for (const v of x) stack.push(v); continue; }
    const r = rec(x);
    if (!r) continue;
    for (const [k, v] of Object.entries(r)) {
      if (RESERVED_KEYS.includes(k)) return 'reserved';
      stack.push(v);
    }
  }
  return null;
}

/** An import's answer: the layer's hash after it and how many entries the agent wrote, or null. */
export function importedOf(raw: unknown): { hash: string; imported: number } | null {
  const w = writtenOf(raw);
  const r = rec(raw);
  if (!w || !r || typeof r.imported !== 'number' || !Number.isInteger(r.imported) || r.imported < 0) return null;
  return { hash: w.hash, imported: r.imported };
}
