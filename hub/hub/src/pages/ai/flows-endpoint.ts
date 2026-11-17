// Custom endpoints. The id is planned before the first send and never
// changes; a lost create replays once with the same Idempotency-Key and body, and a "name taken" answer to
// that replay adopts the endpoint only when its definition equals this plan's. Edits send only what changed
// and read a lost answer back. The form is checked with the agent's own rules first, so
// the person reads the sentence before anything is sent; the agent still checks and stays the authority.
import { utf8Bytes } from '@core/pure';
import { isStale, isUnknown, type Api } from './api';
import { obj, rows, str } from './logic';
import type { Outcome } from './types';

export const WIRES = ['chat_completions', 'messages', 'responses'] as const;
export type Wire = (typeof WIRES)[number];
const SCHEME: Record<Wire, string> = { chat_completions: 'bearer', responses: 'bearer', messages: 'x-api-key' };

export interface EndpointForm {
  name: string;
  address: string;
  models: string;
  wire: string;
}
export interface EndpointDef {
  name: string;
  base_url: string;
  models: string[];
  wire: Wire;
}
export type BadField = 'display_name' | 'base_url' | 'models';

// The agent's control-character check: C0, DEL and C1.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// The agent's local-only name suffixes.
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.private'];
// What the agent's public-address check refuses: netip's loopback, private, link-local, multicast and
// unspecified ranges, then its nonPublicV4 list. [first address, prefix length].
const NON_PUBLIC_V4: ReadonlyArray<readonly [string, number]> = [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
  ['224.0.0.0', 4],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['240.0.0.0', 4],
];

/** A canonical dotted IPv4 address as a number, as netip.ParseAddr reads one (no leading zeros); else null. */
function v4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((o) => /^(0|[1-9][0-9]{0,2})$/.test(o) && Number(o) <= 255)) return null;
  return parts.reduce((n, o) => n * 256 + Number(o), 0);
}

/** The agent's public-host and public-address checks, by spelling: a public name or a public IPv4 address. */
export function publicHost(raw: string): boolean {
  const host = raw.toLowerCase().replace(/\.$/, '');
  const ip = v4(host);
  if (ip !== null) return NON_PUBLIC_V4.every(([first, len]) => Math.floor(ip / 2 ** (32 - len)) !== Math.floor((v4(first) as number) / 2 ** (32 - len)));
  // Every IPv6 address is refused (the platform is IPv4-only); a last label that is a number or starts with 0x
  // is an address in a form a resolver may still read (2130706433, 0x7f.1, 017.0.0.1, 127.1).
  if (host.includes(':') || host.startsWith('[')) return false;
  const last = host.slice(host.lastIndexOf('.') + 1);
  if (last === '' || /^[0-9]+$/.test(last) || last.startsWith('0x')) return false;
  if (host === 'localhost' || !host.includes('.')) return false;
  return !LOCAL_SUFFIXES.some((s) => host.endsWith(s));
}

/** The agent stores base_url with its trailing slashes cut; compare that way. */
export const normUrl = (url: string): string => url.replace(/\/+$/, '');

/** The same model names in any order. */
export const sameModels = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join('\n') === [...b].sort().join('\n');


/** The form, validated: the definition, or which fields are bad (each maps to one sentence). */
export function parseEndpoint(f: EndpointForm): { def: EndpointDef } | { bad: Partial<Record<BadField, true>> } {
  const bad: Partial<Record<BadField, true>> = {};
  const name = f.name.trim();
  const url = f.address.trim();
  const seen = new Set<string>();
  const models: string[] = [];
  // BuildCustomSpec: at most 80 characters (runes), no control characters, no ${.
  if (!name || [...name].length > 80 || CONTROL.test(name) || name.includes('${')) bad.display_name = true;
  // CheckPublicBaseURL: https (any case, as url.Parse reads a scheme), no user name, query or fragment, no control
  // characters or ${, a host PublicHost accepts (a port after it is allowed). url.Parse also refuses a % not followed
  // by two hex digits, and an ASCII host character outside its host set. Tighter than the agent on purpose: 512
  // characters (agent 2048), and no % or ] in the host at all (the agent takes a few escaped forms, and a stray ]
  // that no DNS name holds, so its create-time resolution check refuses it there).
  const at = /^https:\/\/([^\s/?#@]+)(?:\/[^\s?#]*)?$/i.exec(url);
  const authority = at ? /^([^:]+)(?::[0-9]*)?$/.exec(at[1] ?? '') : null;
  const host = authority?.[1] ?? '';
  const syntax = !/%(?![0-9a-f]{2})/i.test(url) && /^[\w\-.~!$&'()*+,;=<>"\u0080-\uffff]+$/.test(host);
  if (url.length > 512 || url.includes('${') || CONTROL.test(url) || !authority || !syntax || !publicHost(host)) bad.base_url = true;
  for (const l of f.models.split(/\r?\n/)) {
    const m = l.trim();
    if (m && !seen.has(m)) {
      seen.add(m);
      models.push(m);
    }
  }
  // buildCustomModels: 1 to 500 models, each at most 200 bytes with no spaces or control characters and no empty
  // part between slashes. Any whitespace is refused here, a little tighter than the agent's space and tab.
  if (!models.length || models.length > 500 || models.some((m) => utf8Bytes(m) > 200 || /\s/.test(m) || CONTROL.test(m) || m.split('/').includes(''))) bad.models = true;
  if (Object.keys(bad).length) return { bad };
  return { def: { name, base_url: normUrl(url), models, wire: (WIRES as readonly string[]).includes(f.wire) ? (f.wire as Wire) : WIRES[0] } };
}

export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 36)
    .replace(/-+$/, '');
  return s || 'endpoint';
}

export interface CreatePlan {
  id: string;
  idem: string;
  replay: boolean;
  body: { id: string; model_prefix: string; display_name: string; wire_format: Wire; base_url: string; models: Array<{ model: string }> };
}

export type PlanResult = { state: 'plan'; plan: CreatePlan } | { state: 'name_taken' | 'stale' | 'not_confirmed' };

/** Picks the id now (the slug, then -2, -3 …, against every id and prefix taken) from a fresh provider list. */
export async function planEndpoint(api: Api, def: EndpointDef, idem: string): Promise<PlanResult> {
  const r = await api.providers();
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok) return { state: 'not_confirmed' };
  const taken = new Set<string>(['fusion']);
  for (const p of rows(r.body, 'providers')) {
    if (!obj(p)) continue;
    if (str(p.id)) taken.add(p.id);
    if (str(p.prefix)) taken.add(p.prefix.replace(/\/$/, ''));
    // The same definition is already there (an earlier create that went through, a lost plan): never a second copy under -2.
    const nm = str(p.display_name) ? p.display_name : str(p.name) ? p.name : '';
    const cd = obj(p.custom_definition) ? p.custom_definition : null;
    if (nm === def.name && cd && str(cd.base_url) && normUrl(cd.base_url) === normUrl(def.base_url)) return { state: 'name_taken' };
  }
  const base = slug(def.name);
  for (let i = 1; i < 100; i++) {
    const c = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(c)) {
      return { state: 'plan', plan: { id: c, idem, replay: false, body: { id: c, model_prefix: c, display_name: def.name, wire_format: def.wire, base_url: def.base_url, models: def.models.map((model) => ({ model })) } } };
    }
  }
  return { state: 'name_taken' };
}

export function modelsOf(p: unknown, prefix: string): string[] {
  const list = obj(p) && Array.isArray(p.models) ? p.models : [];
  return list.map((m) => (obj(m) && str(m.spec) && m.spec.startsWith(`${prefix}/`) ? m.spec.slice(prefix.length + 1) : null)).filter((x): x is string => x !== null);
}

function sameDef(p: unknown, b: CreatePlan['body']): boolean {
  if (!obj(p)) return false;
  const c = obj(p.custom_definition) ? p.custom_definition : null;
  if (!c || p.id !== b.id || String(p.prefix ?? '').replace(/\/$/, '') !== b.model_prefix || p.display_name !== b.display_name) return false;
  // A plan held from before addresses were normalized may still end in a slash.
  if (c.wire_format !== b.wire_format || c.auth_scheme !== SCHEME[b.wire_format] || !str(c.base_url) || normUrl(c.base_url) !== normUrl(b.base_url)) return false;
  if (!Array.isArray(c.header_names) || c.header_names.length) return false;
  return sameModels(modelsOf(p, b.id), b.models.map((m) => m.model));
}

export type CreateResult =
  | { state: 'created'; rev: string | null }
  | { state: 'name_taken' | 'other_endpoint' | 'not_confirmed' | 'stale' }
  | { state: 'invalid'; field: string }
  | { state: 'failed'; err: Outcome };

function created(p: unknown): CreateResult {
  return { state: 'created', rev: obj(p) && str(p.definition_rev) ? p.definition_rev : null };
}

export async function createEndpoint(api: Api, plan: CreatePlan, live?: () => boolean): Promise<CreateResult> {
  const r = await api.customCreate(plan.body, plan.idem);
  if (r.ok) return created(obj(r.body) ? r.body.provider : null);
  if (isStale(r)) return { state: 'stale' };
  if (isUnknown(r)) {
    if (plan.replay || (live && !live())) return { state: 'not_confirmed' };
    plan.replay = true;
    return createEndpoint(api, plan, live);
  }
  const er = r.err;
  // After an unknown first send (the replay), only a definite answer by key counts: "not sent" or any other
  // failure may hide a first send that applied, so the hold stays.
  if (plan.replay && er.code !== 'provider_exists' && er.code !== 'model_prefix_taken' && er.code !== 'provider_invalid') return { state: 'not_confirmed' };
  if (er.code === 'provider_exists' || er.code === 'model_prefix_taken') return plan.replay ? adopt(api, plan) : { state: 'name_taken' };
  if (er.code === 'provider_invalid') return { state: 'invalid', field: er.details.field ?? '' };
  return { state: 'failed', err: er };
}

async function adopt(api: Api, plan: CreatePlan): Promise<CreateResult> {
  const r = await api.provider(plan.id);
  if (isStale(r)) return { state: 'stale' };
  const p = r.ok && obj(r.body) ? r.body.provider : null;
  if (!obj(p) || !obj(p.custom_definition)) return { state: 'not_confirmed' };
  return sameDef(p, plan.body) ? created(p) : { state: 'other_endpoint' };
}

/** Reads the endpoint back and compares it with what was sent; sends nothing. */
export const checkCreated = adopt;

/** A model's catalogue fields the agent's PATCH overwrites for every model it is sent. */
export interface ModelMeta {
  context_window?: number;
  output_limit?: number;
  reasoning?: boolean;
}
export interface Saved {
  name: string;
  base_url: string;
  models: string[];
  /** By model name, from the read the edit started from; sent back unchanged for every kept model. */
  meta?: ReadonlyMap<string, ModelMeta>;
}
export type EditResult =
  | { state: 'saved' | 'unchanged' | 'not_confirmed' | 'stale' }
  | { state: 'invalid'; field: string }
  | { state: 'failed'; err: Outcome };

/** Whether a read definition shows these values: addresses as the agent stores them, models in any order. */
export const shows = (d: Saved, want: Saved): boolean => d.name === want.name && normUrl(d.base_url) === normUrl(want.base_url) && sameModels(d.models, want.models);

export async function editEndpoint(api: Api, pid: string, before: Saved, after: Saved): Promise<EditResult> {
  const body: Record<string, unknown> = {};
  if (after.name !== before.name) body.display_name = after.name;
  if (normUrl(after.base_url) !== normUrl(before.base_url)) body.base_url = after.base_url;
  // The agent sets every listed model's window, output limit and reasoning from the request (0 and false when
  // left out), so each kept model carries its current values back; a new model carries none.
  if (!sameModels(after.models, before.models)) body.models = after.models.map((model) => ({ model, ...before.meta?.get(model) }));
  if (!Object.keys(body).length) return { state: 'unchanged' };
  const r = await api.customPatch(pid, body);
  if (r.ok) return { state: 'saved' };
  if (isStale(r)) return { state: 'stale' };
  if (r.err.code === 'provider_invalid') return { state: 'invalid', field: r.err.details.field ?? '' };
  if (!isUnknown(r)) return { state: 'failed', err: r.err };
  const back = await readEndpoint(api, pid);
  if (back.state === 'stale') return { state: 'stale' };
  const d = back.state === 'ok' ? back.def : null;
  return d && shows(d, after) ? { state: 'saved' } : { state: 'not_confirmed' };
}

export type ReadEndpoint = { state: 'ok'; def: Saved & { wire: string }; rev: string | null } | { state: 'failed' | 'stale' };

export async function readEndpoint(api: Api, pid: string): Promise<ReadEndpoint> {
  const r = await api.provider(pid);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok) return { state: 'failed' };
  const p = obj(r.body) ? r.body.provider : null;
  const c = obj(p) && obj(p.custom_definition) ? p.custom_definition : null;
  // No custom_definition: not enough to edit from (an older agent, or a partial reply). It reads like any failed read.
  if (!obj(p) || !c) return { state: 'failed' };
  return { state: 'ok', rev: str(p.definition_rev) ? p.definition_rev : null, def: { name: String(p.display_name ?? ''), base_url: String(c.base_url ?? ''), wire: String(c.wire_format ?? ''), models: modelsOf(p, pid), meta: metaOf(p, pid) } };
}

const tokens = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000_000;

/** Each model's window, output limit and reasoning as the provider read shows them; only well-formed values. */
function metaOf(p: unknown, prefix: string): Map<string, ModelMeta> {
  const out = new Map<string, ModelMeta>();
  for (const m of obj(p) && Array.isArray(p.models) ? p.models : []) {
    if (!obj(m) || !str(m.spec) || !m.spec.startsWith(`${prefix}/`)) continue;
    const meta: ModelMeta = {};
    if (tokens(m.context_window)) meta.context_window = m.context_window;
    if (tokens(m.output_limit)) meta.output_limit = m.output_limit;
    if (typeof m.reasoning === 'boolean') meta.reasoning = m.reasoning;
    out.set(m.spec.slice(prefix.length + 1), meta);
  }
  return out;
}

export async function deleteEndpoint(api: Api, pid: string): Promise<{ state: 'saved' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome }> {
  const r = await api.customDelete(pid);
  if (r.ok) return { state: 'saved' };
  if (isStale(r)) return { state: 'stale' };
  if (!isUnknown(r)) return r.err.status === 404 ? { state: 'saved' } : { state: 'failed', err: r.err };
  const list = await api.providers();
  if (!list.ok) return { state: 'not_confirmed' };
  // Absence is proved only by a list read whole (as Check again's, flows-disconnect confirmGone): no list, or a row with
  // no id (it may be this very endpoint), proves nothing.
  const listed = obj(list.body) && (Array.isArray(list.body.items) || Array.isArray(list.body.providers)) ? rows(list.body, 'providers') : null;
  if (!listed || listed.some((p) => !obj(p) || typeof p.id !== 'string')) return { state: 'not_confirmed' };
  return listed.some((p) => p.id === pid) ? { state: 'not_confirmed' } : { state: 'saved' };
}

