// The API-key flows: save with the agent's check, read back a lost
// answer by fingerprint, Test, and what the account uses after a save.
//
// Truth rules: a key is "saved" only from an answer, or a read-back whose fingerprint equals the key's.
// A lost answer reads GET /providers/:id/auth at 2, 8 and 25 seconds; if the fingerprint never shows, the
// result is "not confirmed", never "not saved". The fingerprint lives only while that confirmation is
// open; nothing here logs, stores or echoes the key.
import { alive, capture, subscribe, target as shownTarget, type Ctx, type Target } from '../ctx';
import { isStale, isUnknown, type Env, type ProvidersApi as Api } from './api';
import { list, obj, str, type Names } from './catalogue';
import type { Outcome } from './types';

/** Waits before each read-back: 2 s, then 6 s more (8 s), then 17 s more (25 s). The agent's own check takes up to 20 s. */
export const READ_WAITS = [2000, 6000, 17000] as const;

export type KeyState = 'valid' | 'inconclusive' | 'untested' | 'saved' | 'refused' | 'def_changed' | 'ended' | 'stale' | 'failed' | 'not_confirmed' | 'not_sent';

export interface KeyResult {
  state: KeyState;
  /** failed: the refusal. */
  err?: Outcome;
  /** not_confirmed: the fingerprint to check again with. */
  fp?: string | null;
}

/**
 * Saves a built-in provider's key with the agent's check. `live()`, when given, is asked after hashing: false
 * sends nothing ("ended"). An older agent ignores `check` and answers without one: "untested". A custom
 * endpoint's key goes through `saveEndpointKey`, which never sends without a revision.
 */
export async function saveKey(api: Api, env: Env, pid: string, key: string, rev: string | null, live?: () => boolean): Promise<KeyResult> {
  return putKey(api, env, pid, key, str(rev) ? rev : undefined, live ?? (() => true));
}

/**
 * Saves a custom endpoint's key, only with the definition revision its step read (the agent accepts a PUT
 * without one, so a missing revision must never reach it): an empty `rev` is "not_sent". `live` is the step's
 * guard (its attempt is the open one, the scope it opened in holds); with the page's `env.alive()` it is asked
 * before hashing and again after, right before the PUT: false sends nothing ("ended"). It is asked once more when
 * the answer comes and before each read-back: an answer that arrives after the step moved on (a new read, another
 * computer) is "ended", never the newer attempt's outcome. A changed endpoint answers 409 definition_changed:
 * "def_changed". `after`, when given, replaces `live` from the answer on: a step that went while its PUT was out still
 * takes that PUT's answer, while `live` alone keeps a step that went before the PUT from sending.
 */
export async function saveEndpointKey(api: Api, env: Env, pid: string, key: string, rev: string | null, live: () => boolean, after: () => boolean = live): Promise<KeyResult> {
  if (!str(rev)) return { state: 'not_sent' };
  const guard = () => live() && env.alive();
  if (!guard()) return { state: 'ended' };
  return putKey(api, env, pid, key, rev, guard, () => after() && env.alive());
}

/**
 * The Hub context a setup step opened in: the account, realm and generation (`alive`) and the computer shown then.
 * It dies the first time any of them changes and stays dead (switching back does not revive it). `alive()` alone
 * does not cover the computer: choosing another computer moves no generation.
 */
export interface StepScope {
  readonly ctx: Ctx;
  readonly target: string;
  dead: boolean;
}
const targetKey = (t: Target | null): string => (t ? `${t.project.id}|${t.container.id}` : '');
export function stepScope(): StepScope {
  const ctx = capture();
  return { ctx, target: targetKey(ctx.target), dead: false };
}
export function stepScopeLive(sc: StepScope): boolean {
  if (!sc.dead && (!alive(sc.ctx) || targetKey(shownTarget()) !== sc.target)) sc.dead = true;
  return !sc.dead;
}
/** Watches the core synchronously, so a change that is undone before anything asks still ends the scope. `onEnd`, when
 *  given, runs once when the scope ends (at once if it already has); the watch stops itself then. */
export function watchStepScope(sc: StepScope, onEnd?: () => void): () => void {
  let off: (() => void) | null = null;
  let done = false;
  const look = () => {
    if (done || stepScopeLive(sc)) return;
    done = true;
    off?.();
    off = null;
    onEnd?.();
  };
  off = subscribe(look);
  look();
  return () => {
    done = true;
    off?.();
    off = null;
  };
}

export type EndpointRev = { state: 'ok'; rev: string } | { state: 'failed' } | { state: 'stale' };

/** A custom endpoint's definition revision: only from an answer that carries a non-empty one, else "failed". */
export async function readEndpointRev(api: Api, pid: string): Promise<EndpointRev> {
  const r = await api.provider(pid);
  if (isStale(r)) return { state: 'stale' };
  const p = r.ok && obj(r.body) && obj(r.body.provider) ? r.body.provider : null;
  return p && str(p.definition_rev) ? { state: 'ok', rev: p.definition_rev } : { state: 'failed' };
}

// `after`, when given (the endpoint path), is asked when the answer comes and before each read-back.
async function putKey(api: Api, env: Env, pid: string, key: string, rev: string | undefined, live: () => boolean, after?: () => boolean): Promise<KeyResult> {
  let fp: string | null = null;
  try {
    fp = await env.digest(key);
  } catch {
    fp = null;
  }
  if (!live()) return { state: 'ended' };
  const body: { api_key: string; check: true; if_definition_rev?: string } = { api_key: key, check: true };
  if (rev !== undefined) body.if_definition_rev = rev;
  const r = await api.keyPut(pid, body);
  body.api_key = '';
  if (after && !after()) return { state: 'ended' };
  if (r.ok) {
    const c = obj(r.body) ? r.body.check : null;
    return { state: c === 'valid' ? 'valid' : c === 'inconclusive' ? 'inconclusive' : 'untested' };
  }
  if (isStale(r)) return { state: 'stale' };
  if (isUnknown(r)) return confirmKey(api, env, pid, fp, READ_WAITS, after);
  if (r.err.code === 'api_key_refused') return { state: 'refused' };
  if (r.err.code === 'definition_changed') return { state: 'def_changed' };
  return { state: 'failed', err: r.err };
}

/** Reads the stored fingerprint after each wait; "saved" only when it equals the key's. `env.alive()` is asked before
 *  each read and after it (false is "stale"), and `live`, when given, too (false is "ended"). */
export async function confirmKey(api: Api, env: Env, pid: string, fp: string | null, waits: readonly number[], live?: () => boolean): Promise<KeyResult> {
  for (const w of waits) {
    await env.sleep(w);
    if (!env.alive()) return { state: 'stale' };
    if (live && !live()) return { state: 'ended' };
    const r = await api.auth(pid);
    if (isStale(r) || !env.alive()) return { state: 'stale' };
    if (live && !live()) return { state: 'ended' };
    if (r.ok && fp && obj(r.body) && obj(r.body.auth) && r.body.auth.api_key_fingerprint === fp) return { state: 'saved' };
  }
  return { state: 'not_confirmed', fp };
}

// afterSave counts rows only: their labels are never read, so no words are needed.
const NO_NAMES: Names = { model: '', provider: '' };

/** After a save: the provider's ready models now, and what it uses (the agent's `via`). */
export async function afterSave(api: Api, pid: string): Promise<{ n: number | null; via: string | null }> {
  const [cat, prov] = await Promise.all([api.catalogue(), api.provider(pid)]);
  const n = cat.ok ? list(cat.body, 'worker', null, NO_NAMES).filter((m) => m.providerId === pid && m.ready === 'ready').length : null;
  const p = prov.ok && obj(prov.body) && obj(prov.body.provider) ? prov.body.provider : null;
  const via = p && obj(p.status) && str(p.status.via) ? p.status.via : null;
  return { n, via };
}

export type CheckResult = 'valid' | 'invalid' | 'inconclusive' | null;

/** Tests the stored key: valid | invalid | inconclusive | null (no answer), with the refusal when there was one. */
export async function testKey(api: Api, pid: string): Promise<{ check: CheckResult; err: Outcome | null; stale: boolean }> {
  const r = await api.authTest(pid);
  if (isStale(r)) return { check: null, err: null, stale: true };
  const c = r.ok && obj(r.body) ? r.body.check : null;
  return { check: c === 'valid' || c === 'invalid' || c === 'inconclusive' ? c : null, err: r.ok ? null : r.err, stale: false };
}
