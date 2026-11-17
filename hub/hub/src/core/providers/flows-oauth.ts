// ChatGPT sign-in by device code. Device code only: no redirect ever
// reaches the Hub. The code and the sign-in link live only in the open drawer. A provider's own sign-in by a
// pasted code (OpenRouter) follows at the end of the file, sharing the poll loop.
//
//   deviceStart   POST {method:'device_code'} with one Idempotency-Key per click. A lost answer replays once
//                 with the same key (same job) while the drawer lives.
//   devicePoll    every 3 s; 429/503 wait Retry-After (at most 10 s); paused once the page has been hidden for
//                 more than 60 s; ends at 15 minutes, on a stop, with the context, or when the job was cancelled.
//   deviceCancel  cancelled | complete (the sign-in won the race) | not_confirmed.
import { isStale, isUnknown, type Env, type ProvidersApi as Api, type Stop } from './api';
import { obj, own, str } from './catalogue';
import type { Outcome, Settled } from './types';

export const POLL_STEP = 3000;
export const LIFE = 15 * 60000;
export const HIDDEN_MAX = 60000;
const LINK_HOSTS = new Set(['auth.openai.com', 'chatgpt.com']);

export interface DeviceCode {
  code: string | null;
  uri: string | null;
}

export function codeOf(b: unknown): DeviceCode {
  const out: DeviceCode = { code: null, uri: null };
  if (obj(b) && typeof b.user_code === 'string' && /^[A-Za-z0-9-]{4,32}$/.test(b.user_code)) out.code = b.user_code;
  if (obj(b) && typeof b.verification_uri === 'string' && b.verification_uri.length <= 512) out.uri = b.verification_uri;
  return out;
}

/** One URL part decoded until it stops changing (bounded), or null when an escape is malformed. */
function plain(part: string): string | null {
  let v = part.replace(/\+/g, ' ');
  for (let i = 0; i < 6; i++) {
    let n: string;
    try {
      n = decodeURIComponent(v);
    } catch {
      return null;
    }
    if (n === v) return v;
    v = n;
  }
  return null;
}
function flat(s: string): string {
  return s.toUpperCase().replace(/[-‐-―−﹘﹣－]/g, '');
}

/**
 * The sign-in link, shown only for https on auth.openai.com or chatgpt.com with no user or port, and
 * never when its path, query or fragment carries the code (each part decoded until it stops changing and
 * compared without case or hyphens).
 */
export function linkFor(uri: string, code: string | null): string | null {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !LINK_HOSTS.has(u.hostname)) return null;
  const parts = u.pathname.split('/').concat(u.search.replace(/^\?/, '').split(/[&=;]/), [u.hash.replace(/^#/, '')]);
  const text: string[] = [];
  for (const part of parts) {
    const p = plain(part);
    if (p === null) return null;
    text.push(p);
  }
  if (code && flat(text.join('\n')).includes(flat(code))) return null;
  return u.href;
}

export interface Plan {
  idem: string;
  another: boolean;
  replay: boolean;
}

// busy: the agent holds another pending sign-in for this provider and names it (details.job_id) to follow or cancel.
export type StartResult =
  | { state: 'job'; job: string; code: DeviceCode }
  | { state: 'busy'; job: string }
  | { state: 'not_confirmed' }
  | { state: 'failed'; err: Outcome }
  | { state: 'stale' };

export async function deviceStart(api: Api, plan: Plan, live?: () => boolean): Promise<StartResult> {
  const r = await api.oauthStart(plan.another, plan.idem);
  if (r.ok) return obj(r.body) && str(r.body.job_id) ? { state: 'job', job: r.body.job_id, code: codeOf(r.body) } : { state: 'not_confirmed' };
  if (isStale(r)) return { state: 'stale' };
  if (r.err.code === 'oauth_in_progress' && str(r.err.details.job_id)) return { state: 'busy', job: r.err.details.job_id };
  if (isUnknown(r)) {
    if (plan.replay || (live && !live())) return { state: 'not_confirmed' };
    plan.replay = true;
    return deviceStart(api, plan, live);
  }
  return { state: 'failed', err: r.err };
}

export type PollResult = { state: 'complete' | 'error' | 'cancelled' | 'gone' | 'expired' | 'stopped' | 'stale' };

/**
 * One job polled every 3 s until it ends: 429/503 wait Retry-After (at most 10 s), paused once the page has been hidden
 * for more than 60 s, ended at 15 minutes, on a stop, with the context, or when the job is gone (404). `ends` are the
 * job states that end it; every other answer is pending and goes to `pending`.
 */
async function pollJob<E extends string>(read: () => Promise<Settled<unknown>>, env: Env, stop: Stop, ends: readonly E[], pending: (body: unknown) => void): Promise<{ state: E | 'gone' | 'expired' | 'stopped' | 'stale' }> {
  const start = env.now();
  let hiddenAt: number | null = null;
  let wait = 0;
  for (;;) {
    await env.sleep(wait);
    if (stop.stopped) return { state: 'stopped' };
    if (!env.alive()) return { state: 'stale' };
    if (env.now() - start >= LIFE) return { state: 'expired' };
    if (!env.hidden()) hiddenAt = null;
    else if (hiddenAt === null) hiddenAt = env.now();
    else if (env.now() - hiddenAt > HIDDEN_MAX) {
      await env.visible(stop);
      hiddenAt = null;
      wait = 0;
      continue;
    }
    const r = await read();
    if (stop.stopped) return { state: 'stopped' };
    if (r.ok) {
      const s = obj(r.body) ? r.body.state : '';
      if ((ends as readonly unknown[]).includes(s)) return { state: s as E };
      pending(r.body);
      wait = POLL_STEP;
      continue;
    }
    if (isStale(r)) return { state: 'stale' };
    if (r.err.status === 404) return { state: 'gone' };
    if (r.err.status === 429 || r.err.status === 503) {
      wait = Math.min(10, r.err.retryAfter && r.err.retryAfter > 0 ? r.err.retryAfter : 6) * 1000;
      continue;
    }
    wait = POLL_STEP;
  }
}

/** Polls the job; `on` receives each pending answer's code (the first answer may carry it). A job cancelled elsewhere ends it. */
export function devicePoll(api: Api, env: Env, job: string, on: (c: DeviceCode) => void, stop: Stop): Promise<PollResult> {
  return pollJob(() => api.oauthPoll(job), env, stop, ['complete', 'error', 'cancelled'] as const, (b) => on(codeOf(b)));
}

export async function deviceCancel(api: Api, job: string): Promise<{ state: 'cancelled' | 'complete' | 'not_confirmed' | 'stale' }> {
  const r = await api.oauthCancel(job);
  if (isStale(r)) return { state: 'stale' };
  const s = r.ok && obj(r.body) ? r.body.state : '';
  return { state: s === 'cancelled' || s === 'complete' ? s : 'not_confirmed' };
}

/**
 * The job's own end, read after a cancel whose answer was lost or on "Check again": complete means it signed in;
 * cancelled or error means this attempt saved nothing; pending means it still waits; unreadable is still unknown.
 */
export async function jobEnd(api: Api, job: string): Promise<{ state: 'complete' | 'signed_out' | 'pending' | 'not_confirmed' | 'stale' }> {
  const r = await api.oauthPoll(job);
  if (isStale(r)) return { state: 'stale' };
  const s = r.ok && obj(r.body) ? r.body.state : '';
  return { state: s === 'complete' ? 'complete' : s === 'cancelled' || s === 'error' ? 'signed_out' : s === 'pending' ? 'pending' : 'not_confirmed' };
}

/**
 * "Check again" while a job is held (its cancel or end never confirmed): that job is read, never dropped. complete: its
 * sign-in is reported; ended (cancelled or error): it saved nothing, and the stored sign-in decides; pending: it is
 * followed again; unreadable: it stays held and not confirmed, and no new attempt is offered. Nothing once `on` is false.
 */
export async function checkHeldJob(api: Api, job: string, on: () => boolean, to: { complete: () => void; ended: () => void; pending: () => void; unknown: () => void }): Promise<void> {
  const end = await jobEnd(api, job);
  if (!on() || end.state === 'stale') return;
  if (end.state === 'complete') return to.complete();
  if (end.state === 'signed_out') return to.ended();
  if (end.state === 'pending') return to.pending();
  to.unknown();
}

export async function readAuth(api: Api, pid: string): Promise<{ state: 'ok'; auth: Record<string, unknown> } | { state: 'not_confirmed' | 'stale' }> {
  const r = await api.auth(pid);
  if (isStale(r)) return { state: 'stale' };
  return r.ok && obj(r.body) && obj(r.body.auth) ? { state: 'ok', auth: r.body.auth } : { state: 'not_confirmed' };
}

export async function signedIn(api: Api): Promise<{ state: 'signed_in' | 'signed_out' | 'not_confirmed' | 'stale' }> {
  const a = await readAuth(api, 'openai');
  if (a.state !== 'ok') return { state: a.state };
  return { state: a.auth.oauth_stored === true ? 'signed_in' : a.auth.oauth_stored === false ? 'signed_out' : 'not_confirmed' };
}

/** OpenAI with both a key and a sign-in: which one it uses. Only a read-back showing the choice is "saved". */
export async function setDefault(api: Api, which: 'api_key' | 'oauth'): Promise<{ state: 'saved' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome }> {
  const r = await api.authDefault(which);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  const a = await readAuth(api, 'openai');
  if (a.state !== 'ok') return { state: a.state };
  return { state: own(a.auth, 'default') && a.auth.default === which ? 'saved' : 'not_confirmed' };
}

// ── A provider's own sign-in by pasted code (OpenRouter) ──────────────────────────────────────────────────────────
// The agent runs the provider's PKCE flow on the computer. OpenRouter sends the browser back to localhost on the
// person's own machine, which never reaches the computer, so the person copies the address of the page they were sent
// to back into the Hub, and the Hub sends the code in it once per job.
//
//   pkceStart    POST {} with one Idempotency-Key per click; a lost answer replays once with the same key (same job).
//   pkceSubmit   the code taken out of the pasted text, sent once; `submitted:false` (already fed, or finished) and a lost
//                answer are left to the poll, never sent again. The caller's text is cleared once it is sent.
//   pkcePoll     as devicePoll, and each pending answer hands over the link and needs_code.
//   pkceCancel   cancelled | complete | not_confirmed, as deviceCancel; pkceJobEnd reads the job after a lost cancel.

const PKCE_HOSTS: Record<string, ReadonlySet<string>> = { openrouter: new Set(['openrouter.ai']) };

/** The provider's sign-in link, shown only for https on its own host with no user or port. */
export function pkceLink(pid: string, uri: string): string | null {
  const hosts = own(PKCE_HOSTS, pid) ? PKCE_HOSTS[pid] : undefined;
  if (!hosts) return null;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !hosts.has(u.hostname)) return null;
  return u.href;
}

export type PkceStartResult =
  | { state: 'job'; job: string; uri: string | null }
  | { state: 'busy'; job: string }
  | { state: 'not_confirmed' }
  | { state: 'failed'; err: Outcome }
  | { state: 'stale' };

const uriOf = (b: unknown): string | null => (obj(b) && typeof b.verification_uri === 'string' && b.verification_uri !== '' && b.verification_uri.length <= 2048 ? b.verification_uri : null);

export async function pkceStart(api: Api, pid: string, plan: Plan, live?: () => boolean): Promise<PkceStartResult> {
  const r = await api.pkceStart(pid, plan.idem);
  if (r.ok) return obj(r.body) && str(r.body.job_id) ? { state: 'job', job: r.body.job_id, uri: uriOf(r.body) } : { state: 'not_confirmed' };
  if (isStale(r)) return { state: 'stale' };
  if (r.err.code === 'oauth_in_progress' && str(r.err.details.job_id)) return { state: 'busy', job: r.err.details.job_id };
  if (isUnknown(r)) {
    if (plan.replay || (live && !live())) return { state: 'not_confirmed' };
    plan.replay = true;
    return pkceStart(api, pid, plan, live);
  }
  return { state: 'failed', err: r.err };
}

export type PkceInput = { ok: true; code: string } | { ok: false; why: 'empty' | 'no_code' | 'key' };

const CODE = /^[A-Za-z0-9._~-]{4,512}$/;
// An API key pasted by mistake is never sent as a code (it would leave the computer in the code exchange).
const KEYLIKE = /^sk-/i;

/** The code in what the person pasted: the address they were sent to (its `code` parameter) or a bare code. */
export function pkceInput(text: string): PkceInput {
  const t = text.trim();
  if (t === '') return { ok: false, why: 'empty' };
  if (t.length > 4096 || /\s/.test(t)) return { ok: false, why: 'no_code' };
  let code = t;
  if (t.includes('?') || t.includes('/') || t.includes(':')) {
    let u: URL;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t}`);
    } catch {
      return { ok: false, why: 'no_code' };
    }
    code = u.searchParams.get('code') ?? '';
  }
  if (KEYLIKE.test(code)) return { ok: false, why: 'key' };
  return CODE.test(code) ? { ok: true, code } : { ok: false, why: 'no_code' };
}

export type PkceSubmitResult =
  | { state: 'sent' | 'already' | 'not_confirmed' | 'gone' | 'stale' }
  | { state: 'refused'; why: 'empty' | 'no_code' | 'key' }
  | { state: 'failed'; err: Outcome };

/** Sends the pasted code once. `input.text` is cleared once it is sent (kept while it is refused, to be fixed). */
export async function pkceSubmit(api: Api, pid: string, job: string, input: { text: string }): Promise<PkceSubmitResult> {
  const p = pkceInput(input.text);
  if (!p.ok) return { state: 'refused', why: p.why };
  input.text = '';
  const r = await api.pkceCode(pid, job, { code: p.code });
  if (r.ok) return obj(r.body) && r.body.submitted === true ? { state: 'sent' } : obj(r.body) && r.body.submitted === false ? { state: 'already' } : { state: 'not_confirmed' };
  if (isStale(r)) return { state: 'stale' };
  if (isUnknown(r)) return { state: 'not_confirmed' };
  if (r.err.status === 404) return { state: 'gone' };
  return { state: 'failed', err: r.err };
}

export type PkcePollResult = { state: 'complete' | 'error' | 'cancelled' | 'gone' | 'expired' | 'stopped' | 'stale' };

/** Polls the provider's job; `on` receives each pending answer's link and whether it waits for a code. */
export function pkcePoll(api: Api, env: Env, pid: string, job: string, on: (s: { uri: string | null; needsCode: boolean }) => void, stop: Stop): Promise<PkcePollResult> {
  return pollJob(() => api.pkcePoll(pid, job), env, stop, ['complete', 'error', 'cancelled'] as const, (b) => on({ uri: uriOf(b), needsCode: obj(b) && b.needs_code === true }));
}

export async function pkceCancel(api: Api, pid: string, job: string): Promise<{ state: 'cancelled' | 'complete' | 'not_confirmed' | 'stale' }> {
  const r = await api.pkceCancel(pid, job);
  if (isStale(r)) return { state: 'stale' };
  const s = r.ok && obj(r.body) ? r.body.state : '';
  return { state: s === 'cancelled' || s === 'complete' ? s : 'not_confirmed' };
}

/** As jobEnd, for a provider's own sign-in job; `pending` when the job says it is still waiting. */
export async function pkceJobEnd(api: Api, pid: string, job: string): Promise<{ state: 'complete' | 'signed_out' | 'pending' | 'not_confirmed' | 'stale' }> {
  const r = await api.pkcePoll(pid, job);
  if (isStale(r)) return { state: 'stale' };
  const s = r.ok && obj(r.body) ? r.body.state : '';
  return { state: s === 'complete' ? 'complete' : s === 'cancelled' || s === 'error' ? 'signed_out' : s === 'pending' ? 'pending' : 'not_confirmed' };
}

/** Whether the provider holds a stored sign-in, from its own auth read. */
export async function signedInTo(api: Api, pid: string): Promise<{ state: 'signed_in' | 'signed_out' | 'not_confirmed' | 'stale' }> {
  const a = await readAuth(api, pid);
  if (a.state !== 'ok') return { state: a.state };
  return { state: a.auth.oauth_stored === true ? 'signed_in' : a.auth.oauth_stored === false ? 'signed_out' : 'not_confirmed' };
}
