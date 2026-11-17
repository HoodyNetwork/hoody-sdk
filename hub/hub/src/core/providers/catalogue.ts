// The computer's AI catalogue, lifted from pages/ai/logic.ts so the AI page, the Bots page and
// the kit's model picker read one projection. Raw agent answers in, plain values out: no React, no I/O, no
// clock, and no words: the two fallback names (a hidden provider, a nameless model) come from the caller.
//
// Truth rules kept here, in one place (applied by catalogueReadiness):
//   - a model or ensemble is ready only by membership in a trusted ready list: the ready read (?ready=true) of an
//     agent that reports provider status, answered. Without one (the read failed, or an agent without status)
//     nothing is ready. Stored-credential probes of an older agent change only the provider line, never a model.
//   - needs_key comes from the provider's own status, whether or not the ready read answered; an ensemble with a
//     member that needs setup or is gone needs setup too.
//   - 'gone' is authoritative absence only: an unknown provider prefix or a missing ensemble. A model the
//     catalogue lacks under a known provider is 'unknown'.
//   - Hoody AI is named by the Hub, not by the agent: its provider row always reads as the Hub's own words, and a
//     model under it shows the agent's name or id only in Hoody's own form (OWN_ID, below); anything else under
//     Hoody AI takes the caller's word. Every other provider's names and ids show as the agent gives them.
import { CLAUDE } from '../agent/types';
import type { AuthBody, Catalogue, CatProvider, Model, Obj, Pay, ProviderState, Ready, VersionBody } from './types';
import words from './strings.en.json';

/** The caller's words for a name the catalogue hides or lacks. */
export interface Names {
  model: string;
  provider: string;
}
export const FREE = 'hoody-ai/hoody-free';
/** Hoody Free's shown name (strings.en.json name.free), for every page that names it without a catalogue row. */
export const FREE_NAME = words['name.free'];
export const DECIDE = 'hoody-ai/hoody-decide';
export const HOODY = 'hoody-ai';
export const REALM_RE = /^[0-9a-f]{24}$/;
/** A model spec as the agent writes it: provider/model, each part URL-safe. */
export const SPEC_RE = /^[a-z0-9][a-z0-9._-]{0,63}\/[^\s\u0000-\u001f\u007f?#]{1,200}$/;

const UNKNOWN = 'unknown';
const PURPOSES = new Set(['bot', 'worker', 'default', 'explain']);

export function own(o: unknown, k: string): boolean {
  return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
}
export function obj(o: unknown): o is Obj {
  return !!o && typeof o === 'object' && !Array.isArray(o);
}
export function str(s: unknown): s is string {
  return typeof s === 'string' && s !== '';
}

// ── Hoody AI's names ─────────────────────────────────────────────────────────────────────

/** Hoody AI's shown name (strings.en.json name.hoody): the Hub's own words, whatever name the agent sends for it. */
export const HOODY_NAME = words['name.hoody'];

/** The words Hoody names its own models with (hoody-free, hoody-decide, ...): a closed list, so no other word is ever shown. */
const OWN_WORDS = ['free', 'decide', 'tts', 'stt', 'fast', 'plus', 'pro', 'max', 'mini', 'lite', 'auto', 'voice', 'vision', 'code', 'search'];
/** A Hoody AI model id in Hoody's own form: "hoody-" and one of Hoody's own model words (hoody-ai/hoody-free). */
const OWN_ID = new RegExp(`^hoody-ai/hoody-(?:${OWN_WORDS.join('|')})$`);

/** Hoody AI's own provider id, prefix or spec: the only names and ids this rule judges. */
export function ownedByHoody(idOrSpec: unknown): boolean {
  const v = String(idOrSpec ?? '');
  return v === HOODY || v.startsWith(`${HOODY}/`);
}

/** The part of a spec after its provider. */
const tailOf = (spec: string): string => spec.slice(spec.indexOf('/') + 1);

/**
 * A raw id as it may be shown. Another provider's id is itself. Hoody AI's provider id is itself; a Hoody AI
 * model id is itself only in Hoody's own form, else '' (the caller then shows its generic word).
 */
export function publicId(idOrSpec: unknown): string {
  const v = String(idOrSpec ?? '');
  return !ownedByHoody(v) || v === HOODY || OWN_ID.test(v) ? v : '';
}

/**
 * A name as shown, by the spec or provider id it belongs to. Another provider's name is whole. Hoody AI's provider
 * name is HOODY_NAME. A Hoody AI model's name is kept only when the id is in Hoody's own form and the name spells
 * that id ("Hoody Free" for hoody-free), so it adds nothing the id does not say; else '' and the caller's word shows.
 */
function clean(s: unknown, owner?: string): string {
  if (!str(s)) return '';
  const o = String(owner ?? '');
  if (!ownedByHoody(o)) return s;
  if (o === HOODY) return HOODY_NAME;
  return OWN_ID.test(o) && s.toLowerCase() === tailOf(o).replace('-', ' ') ? s : '';
}

/** A provider or model name as shown, by the spec or provider id it belongs to; empty when nothing may be shown. */
export function publicName(s: unknown, owner: unknown): string {
  return clean(s, String(owner ?? ''));
}

function labelFor(m: { spec: string; display_name?: string }, names: Names): string {
  return clean(m.display_name, m.spec) || publicId(m.spec) || names.model;
}

/** A raw id (a provider id, a spec) in Advanced: shown as is, except a Hoody AI model id not in Hoody's own form shows as the provider id alone; empty reads "The AI provider". */
export function idText(x: unknown, names: Names): string {
  const v = String(x ?? '');
  return (ownedByHoody(v) ? publicId(v) || HOODY : v) || names.provider;
}

export function prefixOf(spec: unknown): string {
  const i = typeof spec === 'string' ? spec.indexOf('/') : -1;
  return i > 0 ? (spec as string).slice(0, i) : '';
}

/** A list envelope's rows: {items:[…]} (kit list routes) or {<key>:[…]} (daemon-shaped bodies). */
export function rows<T = Obj>(body: unknown, key?: string): T[] {
  if (obj(body) && Array.isArray(body.items)) return body.items as T[];
  if (obj(body) && key && Array.isArray(body[key])) return body[key] as T[];
  return [];
}

// ── capabilities ─────────────────────────────────────────────────────────────────────────

export const CAPS = { device: 'provider_oauth_device', jevRealm: 'jev_realm_settings', acpDefault: 'acp_default' } as const;
const CODE_RE = /^[a-z0-9_]{1,48}$/;

/** Only an ABSENT capability selects the older path; one the agent reports unavailable counts as absent. */
export function parseVersion(body: unknown): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  const list = obj(body) && Array.isArray((body as VersionBody).capabilities) ? ((body as VersionBody).capabilities as unknown[]) : [];
  for (const r of list) {
    if (obj(r) && str(r.name) && CODE_RE.test(r.name) && r.supported !== false) caps[r.name] = r.available !== false;
  }
  return caps;
}
export function cap(caps: Record<string, boolean> | null | undefined, name: string): boolean {
  return !!caps && caps[name] === true;
}

// ── the catalogue ────────────────────────────────────────────────────────────────────────

export interface CatalogueInput {
  providers: unknown;
  models: unknown;
  /** The ready-models answer (?ready=true) of an agent that reports provider status. */
  ready?: unknown;
  /** Stored-credential probes by provider id, for an agent without provider status. */
  auth?: Record<string, AuthBody>;
}

/** The computer-wide view every projection reads; it holds no secret. */
export function catalogue(raw: CatalogueInput): Catalogue {
  const cat: Catalogue = { byPrefix: {}, byId: {}, models: [], bySpec: {}, readySpecs: null, am1: false, auth: {} };
  for (const p of rows(raw.providers, 'providers')) {
    if (!obj(p) || !str(p.id)) continue;
    // The agent's prefix carries a trailing slash ("openai/").
    const pre = (str(p.prefix) && p.prefix.replace(/\/$/, '')) || p.id;
    const row: CatProvider = {
      id: p.id,
      prefix: pre,
      label: p.id === HOODY || pre === HOODY ? HOODY_NAME : str(p.display_name) ? p.display_name : p.id,
      custom: p.custom === true,
      status: null,
    };
    if (obj(p.status)) {
      row.status = p.status;
      cat.am1 = true;
    }
    cat.byPrefix[pre] = row;
    cat.byId[p.id] = row;
  }
  for (const m of rows(raw.models, 'models')) {
    if (!obj(m) || !str(m.spec) || own(cat.bySpec, m.spec)) continue;
    const row = m as unknown as Model & { spec: string };
    cat.bySpec[m.spec] = row;
    cat.models.push(row);
  }
  if (cat.am1 && raw.ready) {
    cat.readySpecs = {};
    for (const r of rows(raw.ready, 'models')) if (obj(r) && str(r.spec)) cat.readySpecs[r.spec] = 1;
  }
  cat.auth = obj(raw.auth) ? raw.auth : {};
  return cat;
}

/**
 * One provider's state. pay: included | own_key | plan | unknown ('ai_credit' needs the agent to say so
 * and is never produced here). completion: the provider accepts an output cap (false on the ChatGPT
 * sign-in wire).
 */
export function providerState(cat: Catalogue, p: CatProvider | undefined): ProviderState {
  if (!p) return { state: UNKNOWN, pay: UNKNOWN, completion: false };
  if (p.status) {
    const s = p.status;
    const via = s.via;
    return {
      state: s.state === 'ready' || s.state === 'needs_key' ? s.state : UNKNOWN,
      pay: via === 'included' ? 'included' : via === 'stored_key' || via === 'external_key' ? 'own_key' : via === 'signin' ? 'plan' : UNKNOWN,
      completion: s.output_cap !== false,
    };
  }
  if (p.id === HOODY) return { state: 'ready', pay: 'included', completion: true };
  const probe = cat.auth[p.id];
  const a = obj(probe) && obj(probe.auth) ? probe.auth : null;
  if (!a || a.ready !== true) return { state: UNKNOWN, pay: UNKNOWN, completion: true };
  const plan = a.default === 'oauth' && a.oauth_stored === true;
  const pay: Pay = a.no_auth_ready === true ? 'included' : plan ? 'plan' : a.api_key_stored === true ? 'own_key' : UNKNOWN;
  return { state: 'ready', pay, completion: !(plan && p.id === 'openai') };
}

const isFusion = (spec: string): boolean => prefixOf(spec) === 'fusion';
const membersOf = (m: unknown): string[] => (obj(m) && Array.isArray(m.members) ? (m.members as unknown[]).filter(str) : []);

/** The ready list is trusted: the agent reports provider status and its ready read answered. */
export function readyTrusted(cat: Catalogue): boolean {
  return cat.am1 && cat.readySpecs !== null;
}

const listed = (cat: Catalogue, spec: string): boolean => readyTrusted(cat) && own(cat.readySpecs, spec);

/** A model or ensemble member, without the ensemble rule (a member that is itself an ensemble is judged by presence). */
function plainReadiness(cat: Catalogue, spec: string): Ready | 'gone' {
  if (isFusion(spec)) return own(cat.bySpec, spec) ? (listed(cat, spec) ? 'ready' : UNKNOWN) : 'gone';
  const p = cat.byPrefix[prefixOf(spec)];
  if (!p) return 'gone';
  if (providerState(cat, p).state === 'needs_key') return 'needs_key';
  return listed(cat, spec) ? 'ready' : UNKNOWN;
}

/** A Claude Code ensemble member (`claude-code` or `claude-code/<model>`): not a catalogue row, so readinessOf judges it from the Claude read. */
export const isClaudeMember = (spec: string): boolean => spec === CLAUDE || spec.startsWith(`${CLAUDE}/`);

/**
 * An ensemble's members that the catalogue knows need setup or are gone: "there may be more". A Claude Code
 * member is never one: the catalogue cannot tell its state (readinessOf judges it from the Claude read).
 */
export function ensembleProblems(cat: Catalogue | null, spec: string): string[] {
  if (!cat || !isFusion(spec)) return [];
  return membersOf(cat.bySpec[spec]).filter((m) => {
    if (isClaudeMember(m)) return false;
    const r = plainReadiness(cat, m);
    return r === 'needs_key' || r === 'gone';
  });
}

/**
 * One spec's readiness from the catalogue, in this order: gone (a prefix that names no
 * provider, a named ensemble the models read lacks), then needs_key (the provider's status, or an ensemble
 * with a member that needs setup or is gone), then ready (membership in a trusted ready list), else unknown.
 * Claude Code rows are not catalogue rows: readinessOf (readiness.ts) judges them.
 */
export function catalogueReadiness(cat: Catalogue | null, spec: string): Ready | 'gone' {
  if (!cat || !str(spec)) return UNKNOWN;
  if (isFusion(spec) && own(cat.bySpec, spec) && ensembleProblems(cat, spec).length) return 'needs_key';
  return plainReadiness(cat, spec);
}

/** A catalogue row's readiness: a row is listed, so it is never shown as gone (a row under no provider reads unknown). */
function rowReady(cat: Catalogue, m: { spec: string }): Ready {
  const r = catalogueReadiness(cat, m.spec);
  return r === 'gone' ? UNKNOWN : r;
}
type RawFusion = { spec: string; members?: string[]; source?: string; display_name?: string };

function project(cat: Catalogue, m: RawFusion, names: Names): Model {
  if (m.source === 'fusion' || prefixOf(m.spec) === 'fusion') {
    return {
      spec: m.spec,
      label: labelFor(m, names),
      provider: 'fusion',
      providerLabel: '',
      providerId: 'fusion',
      source: 'fusion',
      ready: rowReady(cat, m),
      pay: UNKNOWN,
      completion: false,
    };
  }
  const pre = prefixOf(m.spec);
  const p = cat.byPrefix[pre];
  const ps = providerState(cat, p);
  const out: Model = {
    spec: m.spec,
    label: labelFor(m, names),
    provider: pre,
    providerLabel: !p ? pre || names.provider : p.label === null ? names.provider : p.label,
    providerId: p ? p.id : pre,
    source: 'provider',
    ready: rowReady(cat, m),
    pay: ps.pay,
    completion: ps.completion,
  };
  if (m.spec === FREE) out.recommended = true;
  return out;
}

/**
 * The models in the picker's order: the effective default (when it qualifies), Hoody Free, then ready
 * rows by account and name, then unknown, then not connected, then ensembles (bots only). 'explain' keeps
 * only ready, non-ensemble rows that accept an output cap.
 */
export function list(cat: Catalogue, purpose: string, defaultSpec: string | null, names: Names): Model[] {
  if (!PURPOSES.has(purpose)) return [];
  const out: Model[] = [];
  const fus: Model[] = [];
  for (const raw of cat.models) {
    const m = project(cat, raw, names);
    if (m.source === 'fusion') {
      if (purpose === 'bot') fus.push(m);
      continue;
    }
    if (purpose === 'explain' && (m.ready !== 'ready' || !m.completion)) continue;
    out.push(m);
  }
  const RANK: Record<string, number> = { ready: 0, unknown: 1, needs_key: 2 };
  const key = (m: Model): number => (m.spec === defaultSpec ? -2 : m.spec === FREE ? -1 : (RANK[m.ready] ?? 1));
  const by = (a: Model, b: Model): number => {
    const d = key(a) - key(b);
    if (d) return d;
    const pa = a.providerLabel.toLowerCase();
    const pb = b.providerLabel.toLowerCase();
    if (pa !== pb) return pa < pb ? -1 : 1;
    const la = a.label.toLowerCase();
    const lb = b.label.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  };
  out.sort(by);
  fus.sort(by);
  return out.concat(fus);
}

/** ready | needs_key | gone | unknown (catalogueReadiness). A null catalogue (the reads failed) is unknown. */
export function classify(spec: string, cat: Catalogue | null): Ready | 'gone' {
  return catalogueReadiness(cat, spec);
}

export function labelOf(spec: string, cat: Catalogue | null): string | null {
  const m = cat && cat.bySpec[spec];
  return m && str(m.display_name) ? clean(m.display_name, spec) || null : null;
}

/**
 * The one rule for a model's name where a spec is all there is: the catalogue's name, else a Hoody AI id in Hoody's own
 * form without its provider part, else `word`; another provider's spec as it is.
 */
export function modelNameOf(spec: string, cat: Catalogue | null, word: string): string {
  const named = labelOf(spec, cat);
  if (named) return named;
  return ownedByHoody(spec) ? (publicId(spec) && spec !== HOODY ? tailOf(spec) : '') || word : spec;
}

/** The five providers a person picks from first, in this order: the directory's Suggested
 * section, the probe order on an agent without provider status, and the AI page's preferred tiles. */
export const SUGGESTED: readonly string[] = ['openai', 'anthropic', 'google', 'openrouter', 'mimo'];
const NAMED = SUGGESTED;
/** Providers to probe on an agent without provider status (at most 11): the defaults' providers first, then the named tiles, then custom endpoints. */
export function probeSet(cat: Catalogue, wanted: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    if (out.length < 11 && id && id !== HOODY && cat.byId[id] && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const spec of wanted) add(cat.byPrefix[prefixOf(spec)]?.id);
  NAMED.forEach(add);
  Object.keys(cat.byId)
    .sort()
    .forEach((id) => {
      if (cat.byId[id]?.custom) add(id);
    });
  return out;
}
