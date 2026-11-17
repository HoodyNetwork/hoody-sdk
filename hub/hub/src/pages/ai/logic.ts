// Pure rules of the AI models page. Raw agent answers in, plain values out: no React, no I/O, no clock.
//
// The catalogue projection (readiness, 'gone', Hoody AI's names) lives in @core's providers
// and is re-exported here; this file passes it the page's words for a provider or model with no name to show.
//
// Truth rules kept here:
//   - defaults carry no pin provenance: `model` is the row's value ("" when omitted), `effective` is the
//     chain a session uses. The only model ever suggested is Hoody Free.
//   - Hoody AI is named by the Hub (core providers): its provider line reads as the Hub's own words, and a model
//     or spend line under it shows a name or id only in Hoody's own form, else the generic word; every other
//     provider is named as the agent names it.
import { providers } from '@core';
import { makeT, type StringVars } from '@kit';
import strings from './strings.en.json';
import type { Catalogue, Checker, ClaudeCode, ClaudeState, Defaults, Model, Obj, Pay, Settled } from './types';

export const t = makeT(strings);
/** The same lookup for a key held in a variable (words and card tables choose keys at run time). */
export const tk = (key: string, vars?: StringVars): string => t(key as never, vars);

const { HOODY_NAME } = providers;
export const { FREE, DECIDE, HOODY, REALM_RE, SPEC_RE, own, obj, str, prefixOf, rows, CAPS, parseVersion, cap, catalogue, providerState, classify, labelOf, probeSet } =
  providers;
export type CatalogueInput = providers.CatalogueInput;

const UNKNOWN = 'unknown';

function strOr(s: unknown): string | null {
  return str(s) ? s : null;
}

/** The generic word when there is no name to show. */
function generic(kind: 'provider' | 'model'): string {
  return kind === 'model' ? t('name.model') : t('name.provider');
}
const pageNames = (): providers.Names => ({ model: generic('model'), provider: generic('provider') });

/** A raw id (a provider id, a spec) in Advanced, as core providers shows it; an empty result reads "The AI provider". */
export function idText(x: unknown): string {
  return providers.idText(x, pageNames());
}

/**
 * The models in the picker's order: the effective default (when it qualifies), Hoody Free, then ready
 * rows by account and name, then unknown, then not connected, then ensembles (bots only). 'explain' keeps
 * only ready, non-ensemble rows that accept an output cap.
 */
export function list(cat: Catalogue, purpose: string, defaultSpec: string | null): Model[] {
  return providers.list(cat, purpose, defaultSpec, pageNames());
}

// ── defaults ─────────────────────────────────────────────────────────────────────────────

/**
 * The agents' rows → the AI helper's and the Bots' defaults. `others` are rows with their own model that
 * differs from the helper's effective one (Advanced: "uses its own model").
 */
export function defaults(agentRows: readonly unknown[]): Defaults {
  let cfg: Obj | null = null;
  let bot: Obj | null = null;
  for (const r of agentRows) {
    if (!obj(r) || !str(r.name)) continue;
    if (r.is_configured_default === true && !cfg) cfg = r;
    if (r.name === 'bot') bot = r;
  }
  const hm = cfg && typeof cfg.model === 'string' ? cfg.model : '';
  const bm = bot && typeof bot.model === 'string' ? bot.model : '';
  const out: Defaults = {
    helper: { agent: cfg ? String(cfg.name) : '', model: hm, effective: hm || FREE },
    bots: { model: bm, effective: bm || FREE },
    others: [],
  };
  for (const a of agentRows) {
    if (obj(a) && str(a.name) && a !== cfg && a !== bot && str(a.model) && a.model !== out.helper.effective) out.others.push({ agent: a.name, model: a.model });
  }
  return out;
}

/** The only model ever suggested: Hoody Free, when listed and ready. */
export function suggest(models: readonly Model[]): string | null {
  for (const m of models) if (m.spec === FREE && m.ready === 'ready') return FREE;
  return null;
}

export interface UsableResult {
  ok: boolean | null;
  reason: 'ready' | 'needs_key' | 'model_gone' | 'unknown' | 'claude_code_not_ready';
}
const USABLE: Record<string, UsableResult> = {
  ready: { ok: true, reason: 'ready' },
  needs_key: { ok: false, reason: 'needs_key' },
  gone: { ok: false, reason: 'model_gone' },
  unknown: { ok: null, reason: 'unknown' },
};
export function usableOf(cls: string): UsableResult {
  return USABLE[cls] ?? (USABLE.unknown as UsableResult);
}

/** Can the default answer? Claude Code, when selected for the Hub, decides on its own. */
export function usable(d: Defaults | null, cat: Catalogue | null, cc: ClaudeCode | null): UsableResult & { spec: string | null } {
  if (!d) return { ok: null, reason: 'unknown', spec: null };
  if (cc && cc.selected === null) return { ok: null, reason: 'unknown', spec: null };
  if (cc && cc.selected) return { ok: cc.inUse, reason: cc.inUse ? 'ready' : 'claude_code_not_ready', spec: null };
  const spec = d.helper.effective;
  return { ...usableOf(classify(spec, cat)), spec };
}

// ── the guardrail checker ────────────────────────────────────────────────────────────────

/** read: a settled read, or null when no request was made (a named realm on an old agent). */
export function checkerOf(read: Settled<unknown> | null, o: { realm: string | null; realmSettings: boolean }): Checker {
  const out: Checker = { enabled: null, model: null, label: null, usable: UNKNOWN, reason: 'read_failed', state: UNKNOWN };
  const set = (u: Checker['usable'], r: string, s: Checker['state']): Checker => {
    out.usable = u;
    out.reason = r;
    out.state = s;
    return out;
  };
  if (!o.realmSettings && o.realm !== 'global') return set(UNKNOWN, 'old_agent', UNKNOWN);
  if (!read || !read.ok || !obj(read.body)) return out;
  // Only `effective` says what the checker does: a reply without it (an agent from before per-realm settings, or a
  // partial reply) proves nothing and reads like a failed read.
  const e = read.body.effective;
  if (!obj(e)) return out;
  out.enabled = typeof e.enabled === 'boolean' ? e.enabled : null;
  out.model = strOr(e.model);
  if (e.enabled === false) return set('no', 'disabled', 'disabled');
  if (e.usable === true) return set('yes', 'ok', 'configured');
  if (e.usable === false) return e.key_ready === false ? set('no', 'no_model_key', 'unconfigured') : set('no', 'model_unavailable', 'unconfigured');
  return out;
}

/** Bots with guardrails whose check is not off, by realm. A row another agent process serves carries no settings and is not counted. */
export function guarded(botRows: readonly unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of botRows) {
    if (!obj(b) || b.owned_elsewhere === true || !str(b.guardrails) || !b.guardrails.trim() || b.guardrail_check === 'off') continue;
    if (str(b.realm) && (b.realm === 'global' || REALM_RE.test(b.realm))) out[b.realm] = (out[b.realm] ?? 0) + 1;
  }
  return out;
}

export interface CheckerBanner {
  fix: boolean;
  off: boolean;
  kind: 'banner' | 'old';
}
/** A banner for a checker that cannot run. `fix` only where a write can reach that realm. */
export function checkerBanner(chk: Checker, realm: string, perRealm: boolean): CheckerBanner | null {
  if (chk.usable === 'no') return { kind: 'banner', fix: realm === 'global' || perRealm, off: chk.reason === 'disabled' };
  if (chk.reason === 'old_agent' && realm !== 'global') return { kind: 'old', fix: false, off: false };
  return null;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Models for a picker: the current one first, then by provider, then by name (never the catalogue's API order). */
export function orderModels<T extends { spec: string; label: string; providerLabel: string }>(models: readonly T[], current: string): T[] {
  return [...models].sort((a, b) => Number(b.spec === current) - Number(a.spec === current) || byName(a.providerLabel, b.providerLabel) || byName(a.label, b.label));
}

/** A selected account stays selected only while it is still listed; before the list is read, unknown is not "gone". */
export function presentOnly<T extends { id: string }>(selected: T | null, accounts: readonly { id: string }[] | null): T | null {
  if (!selected || !accounts) return selected;
  return accounts.some((a) => a.id === selected.id) ? selected : null;
}

/** Checker choices by name, Hoody's own (no key) first. */
export function orderChoices<T extends { spec: string; label: string }>(choices: readonly T[]): T[] {
  return [...choices].sort((a, b) => Number(b.spec === DECIDE) - Number(a.spec === DECIDE) || byName(a.label, b.label));
}

/** The checker models usable now: Hoody's needs no key, the others need theirs set. */
export function checkerChoices(body: unknown): Array<{ spec: string; label: string }> {
  const ms = obj(body) && Array.isArray(body.models) ? (body.models as unknown[]) : [];
  const out: Array<{ spec: string; label: string }> = [];
  for (const m of ms) {
    if (!obj(m) || !str(m.spec) || !(m.key_set === true || m.spec === DECIDE)) continue;
    out.push({ spec: m.spec, label: m.spec === DECIDE ? t('name.checker') : providers.publicName(m.display_name, m.spec) || t('name.customChecker') });
  }
  return out;
}

// ── Claude Code ──────────────────────────────────────────────────────────────────────────

/** acp: the settled /acp/agents read; def: the settled /acp/default read, or null when the agent has none. */
export function claudeOf(
  acp: Settled<unknown> | null,
  def: Settled<unknown> | null,
): ClaudeCode {
  const out: ClaudeCode = {
    state: UNKNOWN,
    enabled: false,
    selected: null,
    startable: false,
    inUse: false,
    loginVerified: false,
    setupUser: null,
    installHint: null,
    loginHint: null,
  };
  out.selected = def === null ? false : def && def.ok && obj(def.body) ? def.body.delegated_agent === 'claude' : null;
  if (!acp || !acp.ok) {
    if (acp && !acp.ok && acp.err.status === 404 && acp.err.code === 'unknown_agent') out.state = 'unavailable';
    return out;
  }
  // GET /acp/agents → {status, report:{agents:[…]}}
  const report = obj(acp.body) ? acp.body.report : null;
  const list = rows(report, 'agents');
  const row = list.find((r) => obj(r) && r.name === 'claude') as Obj | undefined;
  if (!row) {
    out.state = 'unavailable';
    return out;
  }
  const is = row.install_state;
  let s: ClaudeState;
  if (row.missing_launcher === true || is === 'missing_launcher') s = 'agent_update';
  else if (is === 'probe_failure') s = 'check_failed';
  else if (row.installed !== true || is === 'missing_binary') s = 'not_installed';
  else if (is === 'unsupported_version') s = 'outdated';
  else if (row.logged_in === 'logged_out') s = 'signed_out';
  else if (row.logged_in === 'logged_in') s = 'signed_in';
  else s = 'sign_in_unknown';
  out.state = s;
  out.enabled = row.enabled === true;
  out.startable = row.startable === true;
  out.loginVerified = row.login_verified === true;
  out.setupUser = strOr(row.setup_user);
  out.installHint = strOr(row.install_hint);
  out.loginHint = strOr(row.login_hint);
  out.inUse = s === 'signed_in' && out.enabled && out.selected === true && out.startable;
  return out;
}

/** hoody | claude_code | unknown: what the helper runs on. */
export function helperBackend(c: ClaudeCode): 'hoody' | 'claude_code' | 'unknown' {
  if (c.selected === null) return UNKNOWN;
  if (!c.selected) return 'hoody';
  if (c.inUse) return 'claude_code';
  return c.state === UNKNOWN ? UNKNOWN : 'hoody';
}

/** The fixed commands the Hub ever types into a terminal, offered only when the agent's own hint equals it. */
export const COMMANDS = { install: 'sudo npm install -g @anthropic-ai/claude-code', login: 'claude auth login' } as const;

export interface ClaudeCard {
  /** String key of the state line. */
  state: string;
  /** The reducer row's action. */
  act: 'check' | 'install' | 'update' | 'login' | null;
  /** String key of the selection line (Claude.tsx maps each one to a literal t() key). */
  sel: 'claude.inUse' | 'claude.notReady' | 'claude.off' | 'claude.cantStart' | 'claude.needUpdate' | null;
  selAct: 'use' | 'undo' | 'turnOn' | 'check' | null;
}
const CARD_ACT: Partial<Record<ClaudeState, ClaudeCard['act']>> = {
  unknown: 'check',
  check_failed: 'check',
  not_installed: 'install',
  outdated: 'update',
  signed_out: 'login',
  sign_in_unknown: 'login',
};
export function claudeCard(cc: ClaudeCode, o: { acpDefault: boolean }): ClaudeCard {
  const out: ClaudeCard = { state: `cc.${cc.state}`, act: CARD_ACT[cc.state] ?? null, sel: null, selAct: null };
  if (cc.state === 'signed_in' && cc.loginVerified) out.state = 'cc.signed_in_verified';
  if (cc.selected === true) {
    if (cc.inUse) {
      out.sel = 'claude.inUse';
      out.selAct = 'undo';
    } else if (cc.state !== 'signed_in') {
      out.sel = 'claude.notReady';
      out.selAct = 'undo';
    } else if (!cc.enabled) {
      out.sel = 'claude.off';
      out.selAct = 'turnOn';
    } else {
      out.sel = 'claude.cantStart';
      out.selAct = 'check';
    }
  } else if (cc.selected === false && cc.state === 'signed_in') {
    if (o.acpDefault) out.selAct = 'use';
    else out.sel = 'claude.needUpdate';
  }
  return out;
}

// ── realm of a computer ──────────────────────────────────────────────────────────────────

/**
 * The realm a per-realm read uses when none is named: the computer's only realm, 'global' when it
 * belongs to none, the Hub's selected realm when the computer is in it; null when that cannot be told.
 */
export function realmOf(realmIds: readonly string[] | null, selected: string | null): string | null {
  const ids = realmIds ? realmIds.filter((r) => REALM_RE.test(r)) : null;
  if (!ids) return selected && REALM_RE.test(selected) ? selected : null;
  if (ids.length === 0) return 'global';
  if (ids.length === 1) return ids[0] ?? null;
  return selected && ids.includes(selected) ? selected : null;
}

/**
 * The realms a computer's record proves it is in (its `realm_ids`), as realmOf takes them; null when the record proves
 * nothing: not an object, another computer's record than `id`, or a `realm_ids` that is missing, not a list, or holds
 * anything but realm ids. Not told is never read as "no realm" (that is Global): only an empty list proves none, and no
 * entry is dropped to make a list fit.
 */
export function membershipOf(record: unknown, id: string): string[] | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as { id?: unknown; realm_ids?: unknown };
  if (r.id !== id || !Array.isArray(r.realm_ids)) return null;
  const out: string[] = [];
  for (const x of r.realm_ids as unknown[]) {
    if (typeof x !== 'string' || !REALM_RE.test(x)) return null;
    out.push(x);
  }
  return out;
}

// ── one model, in words ──────────────────────────────────────────────────────────────────

/** The one tag a model row carries: Not connected wins; none when unknown. */
export function tagOf(m: Pick<Model, 'ready' | 'pay'>): string {
  if (m.ready === 'needs_key') return t('tag.needs_key');
  if (m.pay === 'included') return t('tag.included');
  if (m.pay === 'own_key') return t('tag.own_key');
  if (m.pay === 'plan') return t('tag.plan');
  if (m.pay === 'ai_credit') return t('tag.ai_credit');
  return '';
}

/** Never a raw spec outside Advanced: a model the catalogue doesn't name reads "AI model". */
export function modelLabel(models: readonly Model[], spec: string): string {
  const m = models.find((x) => x.spec === spec);
  return m ? m.label : spec === FREE ? providers.FREE_NAME : t('name.model');
}

// ── connected accounts ───────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  prefix: string;
  label: string;
  ready: boolean;
  pay: Pay;
  custom: boolean;
  via: string | null;
  status: string | null;
}

/**
 * One row per provider this computer can use: Hoody AI first, then the others by name. A provider counts
 * when the agent says it is ready, or (older agent) when one of its models reads ready; a custom endpoint
 * shows even without a working key, so it can be fixed or removed. null when neither read answered.
 */
export function accountsOf(models: readonly Model[] | null, providers: unknown): Account[] | null {
  const raw = providers ? rows(providers, 'providers') : null;
  if (!models && !raw) return null;
  const by: Record<string, Account> = {};
  for (const m of models ?? []) {
    if (m.source === 'fusion') continue;
    const a = (by[m.providerId] ??= { id: m.providerId, prefix: m.provider, label: m.providerLabel, ready: false, pay: UNKNOWN, custom: false, via: null, status: null });
    // An account is a provider line, not a model's readiness: on an agent without provider status no
    // model reads ready, but a row's pay is known exactly when its provider's state is ready (Hoody AI, or a
    // probe that said ready).
    if (m.ready === 'ready' || m.pay !== UNKNOWN) {
      a.ready = true;
      if (a.pay === UNKNOWN) a.pay = m.pay;
    }
  }
  for (const p of raw ?? []) {
    if (!obj(p) || !str(p.id)) continue;
    const a = (by[p.id] ??= {
      id: p.id,
      prefix: str(p.prefix) ? p.prefix.replace(/\/$/, '') : p.id,
      label: p.id === HOODY ? HOODY_NAME : String(p.display_name ?? p.id),
      ready: false,
      pay: UNKNOWN,
      custom: false,
      via: null,
      status: null,
    });
    a.custom = p.custom === true;
    if (obj(p.status)) {
      a.status = strOr(p.status.state);
      a.via = strOr(p.status.via);
      a.ready = p.status.state === 'ready';
    }
  }
  const out = Object.values(by).filter((a) => a.ready || a.custom);
  out.sort((x, y) => (x.id === HOODY ? -1 : y.id === HOODY ? 1 : x.label.localeCompare(y.label, 'en', { numeric: true, sensitivity: 'base' })));
  return out;
}

const PAY_VIA: Record<string, string> = { included: 'included', own_key: 'stored_key', plan: 'signin' };

/** How the account connects, in words (key of strings). */
export function connectsKey(a: Account): string {
  const via = a.via ?? PAY_VIA[a.pay] ?? '';
  return ({ included: 'page.accIncluded', stored_key: 'page.accKey', external_key: 'page.accExternal', signin: 'page.accPlan' } as Record<string, string>)[via] ?? 'page.accReady';
}

/** The Bots (not served by another agent process) whose model is on this account. */
export function usedBy(a: Account, d: Defaults | null, bots: readonly unknown[] | null): number {
  let n = 0;
  for (const b of bots ?? []) {
    if (!obj(b) || b.owned_elsewhere === true) continue;
    const spec = str(b.model) ? b.model : d ? d.bots.effective : '';
    if (prefixOf(spec) === a.prefix) n++;
  }
  return n;
}

export type AccountAction = 'replace' | 'test' | 'disconnect' | 'edit';
/** What a row's ⋯ menu offers: built-in accounts and sign-ins only what they can do. */
export function actionsFor(a: Account): AccountAction[] {
  const via = a.via ?? PAY_VIA[a.pay];
  if (a.id === HOODY || via === 'included') return [];
  if (a.custom) return ['edit', 'replace', 'test', 'disconnect'];
  if (via === 'signin') return ['disconnect'];
  if (via === 'external_key') return ['test'];
  return ['replace', 'test', 'disconnect'];
}

export function disconnectWhat(a: Account): 'endpoint' | 'signin' | 'key' {
  return a.custom ? 'endpoint' : a.via === 'signin' || a.pay === 'plan' ? 'signin' : 'key';
}

/** The Bot list, or null when the answer isn't one. */
export function botList(body: unknown): Obj[] | null {
  const r = obj(body) ? (body.items ?? body.bots) : null;
  return Array.isArray(r) ? (r.filter(obj) as Obj[]) : null;
}
/** The Bot list for an impact claim: null when a row can't be read (a Bot another process serves shows no model). */
export function botRows(body: unknown): Obj[] | null {
  const r = botList(body);
  return r && !r.some((b) => b.owned_elsewhere) ? r : null;
}

// ── the default change: impact before saving ────────────────────────────────────────────

const NAMES_MAX = 5;
export function names(list: readonly string[]): string {
  const shown = list.slice(0, NAMES_MAX).join(', ');
  return list.length > NAMES_MAX ? t('page.andMore', { names: shown, n: list.length - NAMES_MAX }) : shown;
}

export type Part = 'helper' | 'bots' | 'both';

export interface Impact {
  /** Bots that follow the default, own model, per-task models; null when the Bot list could not be read. */
  follow: string[] | null;
  own: string[];
  task: string[];
  agents: string[];
  known: boolean;
}
export function impactOf(part: Part, d: Defaults, bots: Obj[] | null): Impact {
  const list = bots ?? [];
  const who = (f: (b: Obj) => boolean): string[] => list.filter(f).map((b) => String(b.name ?? b.id ?? ''));
  return {
    known: !!bots,
    follow: bots ? who((b) => !str(b.model)) : null,
    own: who((b) => str(b.model)),
    task: who((b) => obj(b.routing)),
    agents: part !== 'bots' ? d.others.map((a) => a.agent) : [],
  };
}

// ── "Now using": the one summary line and its problems ──────────────────────────────────

export type Problem =
  | { kind: 'needs_key'; providerId: string | null; provider: string; model: string }
  | { kind: 'model_gone' }
  | { kind: 'claude' }
  | { kind: 'checker'; realm: string; fix: boolean; off: boolean; old: boolean };

export function problemOf(u: UsableResult, d: Defaults | null, models: readonly Model[]): Problem | null {
  if (!d) return null;
  if (u.reason === 'needs_key') {
    const m = models.find((x) => x.spec === d.helper.effective);
    return { kind: 'needs_key', providerId: m ? m.providerId : null, provider: m && m.providerLabel ? m.providerLabel : t('name.provider'), model: modelLabel(models, d.helper.effective) };
  }
  if (u.reason === 'model_gone') return { kind: 'model_gone' };
  if (u.reason === 'claude_code_not_ready') return { kind: 'claude' };
  return null;
}

/** The subtitle: one plain sentence about what everything on this computer uses. */
export function headline(d: Defaults, models: readonly Model[], computer: string): string {
  const model = modelLabel(models, d.helper.effective);
  if (d.helperBackend === 'claude_code') return t('page.headClaude', { computer, model });
  if (d.helper.effective === d.bots.effective) return t(d.helper.effective === FREE ? 'page.headFree' : 'page.headModel', { computer, model });
  return t('page.headSplit', { computer, model, bots: modelLabel(models, d.bots.effective) });
}

/** How the default connects, in words: included, a key, a plan, or Claude Code. */
export function defaultVia(d: Defaults, models: readonly Model[]): string {
  if (d.helperBackend === 'claude_code') return t('page.claudePlan');
  const m = models.find((x) => x.spec === d.helper.effective);
  if (!m) return d.helper.effective === FREE ? t('page.accIncluded') : '';
  return ({ included: t('page.accIncluded'), own_key: t('page.accKey'), plan: t('page.accPlan'), ai_credit: t('tag.ai_credit'), unknown: '' } as Record<Pay, string>)[m.pay];
}

// ── spending ─────────────────────────────────────────────────────────────────────────────

export type Period = 'd7' | 'd30' | 'all';
const DAY = 86400;
const PERIOD_DAYS: Record<Period, number> = { d7: 7, d30: 30, all: 0 };

/** Unix seconds a period starts at, or null for all time. */
export function since(p: Period, nowMs: number): number | null {
  const d = PERIOD_DAYS[p];
  return d ? Math.floor(nowMs / 1000) - d * DAY : null;
}

/** A positive cost, "less than $0.01", or "No cost recorded" for zero or anything unreadable: never "$0.00" or "Free". */
export function money(n: unknown): string {
  if (typeof n !== 'number' || !(n > 0) || !isFinite(n)) return t('spend.none');
  return n < 0.01 ? t('spend.lt') : `$${n.toFixed(2)}`;
}

function num(r: Obj, a: string, b: string): number {
  const v = r[a] !== undefined ? r[a] : r[b];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}
/** An uncatalogued spend line's model, by its spec: the part after the provider, for a Hoody AI line only when the id is in Hoody's own form. */
function lineModel(model: string, spec: string): string {
  return providers.publicId(spec) ? model.slice(model.indexOf('/') + 1) : '';
}

export interface SpendRow {
  id: string;
  label: string;
  provider: string;
  calls: number;
  rate: string;
  cost: string;
  other: boolean;
}
/**
 * The usage rollup → table rows. The rollup's Go field names (Model, Provider, Calls, SuccessRate,
 * TotalCostUSD) and snake_case are both read. Catalogued rows first, in the agent's order; then "Other
 * models", named by their spec without the provider prefix.
 */
export function spendTable(body: unknown, models: readonly Model[]): { rows: SpendRow[]; total: number } {
  const list = obj(body) && Array.isArray(body.rollup) ? (body.rollup as unknown[]) : rows(body, 'rollup');
  const by: Record<string, Model> = {};
  const prov: Record<string, string> = {};
  for (const m of models) {
    by[m.spec] = m;
    if (str(m.providerId) && !prov[m.providerId]) prov[m.providerId] = m.providerLabel;
  }
  const out: SpendRow[] = [];
  let total = 0;
  list.forEach((r, i) => {
    if (!obj(r)) return;
    const model = String(r.Model !== undefined ? r.Model : (r.model ?? ''));
    let p = String(r.Provider !== undefined ? r.Provider : (r.provider ?? ''));
    const spec = model.indexOf('/') > 0 ? model : `${p}/${model}`;
    const m = by[spec];
    const cost = num(r, 'TotalCostUSD', 'total_cost_usd');
    p = p || spec.slice(0, spec.indexOf('/'));
    const rate = r.SuccessRate !== undefined ? r.SuccessRate : r.success_rate;
    total += cost > 0 ? cost : 0;
    out.push({
      id: `${i}:${spec}`,
      label: m ? m.label : lineModel(model, spec) || generic('provider'),
      provider: m ? m.providerLabel : (str(prov[p]) ? prov[p] : '') || generic('provider'),
      calls: num(r, 'Calls', 'calls'),
      rate: typeof rate === 'number' && isFinite(rate) ? `${Math.round(rate * 100)}%` : '',
      cost: money(cost),
      other: !m,
    });
  });
  out.sort((a, b) => Number(a.other) - Number(b.other));
  return { rows: out, total };
}

/** The account's AI credit: an amount only while the AI balance is live. */
export function creditAmount(b: unknown): number | null {
  const v = obj(b) && b.aiLive === true ? b.aiRemaining : null;
  const a = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
  return isFinite(a) && a >= 0 ? a : null;
}
export function creditText(b: unknown): string {
  const a = creditAmount(b);
  return a === null ? t('spend.creditUnknown') : t('spend.creditLeft', { amount: `$${a.toFixed(2)}` });
}
