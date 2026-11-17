// agent-signin.ts: signs a computer's agent in to the account the Hub shows, then proves it. The sign-in is POST /hoody/auth/bootstrap with core's boot token; the
// proof is the agent's own status (GET /hoody/auth/status).
//
// Contract, in plain words:
//   - agentLoginOf(status, account): what a status answer says for this account. 'ready': signed in as it, with its
//     identity and realm restriction known. 'login': signed out, or its login was rejected (a Hub sign-out revokes the
//     key). 'account': signed in to another account. 'identity': no identity or restriction yet, or no answer to read.
//     Pages read this projection, never their own.
//   - signInOffered(ctx): the Hub may offer the sign-in: a live account session whose account is known. Never in a
//     shared-access (token) session.
//   - signInAgent(ctx, target): one sign-in, then the proof. It resolves, never rejects:
//       {kind: 'signedIn'}            a status read after the sign-in says 'ready';
//       {kind: 'unknown'}             it may have gone through (a lost answer, a 5xx, a sign-in already running on
//                                     the agent, or a 2xx) and no status read proved 'ready' within PROOF_TRIES reads;
//       {kind: 'refused', reason}     nothing was changed: 'key' (the Hub could not make the key, or the agent refused
//                                     it as unusable), 'cancelled' (the 2FA code prompt for the key was cancelled),
//                                     'busy' (an earlier sign-in's key work is still finishing: nothing was asked),
//                                     'disabled' (the agent refuses sign-in from the Hub: 404), 'notThisBox' (it could
//                                     not prove the computer is the account's), 'computerLogin' (a login set on the
//                                     computer that it never replaces), 'refused' (any other refusal, or never sent);
//       {kind: 'notAllowed', reason}  'shared' (a token session), 'otherAccount' (the agent's answer, or a status read,
//                                     names another account), 'admin' (an administrator's key);
//       {kind: 'stale'}               the context died (account or realm changed), or the Hub showed another
//                                     computer than `target` at any moment since the call began (going back to it
//                                     does not revive the call): show nothing. Checked before the key is asked for,
//                                     by the key's mint (agentBootToken still), at every send (the bootstrap and each
//                                     status read) and after each answer.
//     C9: 'signedIn' comes only from a status read, every refused/notAllowed only from a refusal code, a status read or
//     a refusal made before anything was sent. Never "signed in" or "could not" without one of them.
//   - checkAgentLogin(ctx, target, o?): one status read only (Check again): the projection, 'unread' when no answer came,
//     'stale' as above (from the call's own start). The status route keeps the agent transport's own timeout; the proof bounds each of its reads
//     to PROOF_READ_MS with its own signal (a read cut there is 'unread').
//   - One sign-in per computer at a time: a call while one runs for the same computer and account shares its result and
//     sends nothing more.
//   - An unknown sign-in holds its computer (C9): for the same account and computer, every
//     later call answers {kind: 'unknown'} and sends nothing, whatever place asks (a remount, a second list of the same
//     computer, the Ask dock), across computer and realm switches. So does one whose bootstrap went out (or may have:
//     answered, or pending) and that then ended stale because the Hub left the computer or the context ended while it
//     ran: its caller shows nothing, but the sign-in may have landed. Held only while the account is
//     the one that sent it. Only a status read that started after the unknown came ends it (checkAgentLogin, or a read
//     a place sends itself and notes with noteAgentStatus, as the Ask dock does): one that says 'ready', or any answer
//     to a read started UNSURE_HOLD_MS or more after the unknown came (the sign-in had its time to land; a late one is
//     single-flight on the agent, bootstrap_in_progress). Dropped with the account (a bump keepsChanges does not keep, as changes.ts drops its locks) and by resetAgentSignIn. Memory only: the web
//     keeps no record of the send (directChange has no gate there); a reload starts over. signInUnsure tells a place
//     to show the held outcome; subscribeSignInUnsure tells it when that may have changed.
//   - The key lives in memory for its one request: never stored, logged, shown or resolved to the caller. The route is
//     declared secret (its token body key), so a refusal is rebuilt from safe fields and keeps only the listed codes.
//     The key's mint may ask for a 2FA code (agentBootToken codePrompt): the caller is a person's press.
import { api, outcomeOf, type HubError } from './api';
import { agentBootToken } from './boot-token';
import { keepsChanges } from './changes';
import { alive, capture, onBump, subscribe, target as shownTarget, tokenSession, type Ctx, type Target } from './ctx';
import { defineRoute } from './routes';
import { directChange } from './live-gate';
import { isRecord } from './shape';

/** Status reads after the sign-in before it is unknown, and the wait before each (a fresh install may not report its
 *  identity at once). */
export const PROOF_TRIES = 3;
/** How long an unknown sign-in holds its computer against a status read that does not say 'ready' (see the contract). */
export const UNSURE_HOLD_MS = 60_000;
export const PROOF_GAP_MS = 2000;
export const PROOF_READ_MS = 15000;

const REFUSAL_CODES = [
  'login_not_for_this_box', 'credential_present', 'agent_login_conflict', 'admin_login_refused',
  'token_rejected', 'login_grant_insufficient', 'login_expiring', 'login_changed',
] as const;

export const agentSignInRoutes = Object.freeze({
  status: defineRoute({ method: 'GET', path: '/hoody/auth/status', scope: 'agent', realm: 'none' }),
  // bootstrap_in_progress: an install is running on the agent (single-flight), maybe this one: under way, never failed.
  bootstrap: defineRoute<unknown, { token: string }>({
    method: 'POST', path: '/hoody/auth/bootstrap', scope: 'agent', realm: 'none', body: ['token'],
    secret: ['token'], codes: REFUSAL_CODES, unknownCodes: ['bootstrap_in_progress'],
  }),
});

export type AgentLogin = 'ready' | 'login' | 'account' | 'identity';
export type SignInResult =
  | { kind: 'signedIn' }
  | { kind: 'unknown' }
  | { kind: 'refused'; reason: 'key' | 'cancelled' | 'busy' | 'disabled' | 'notThisBox' | 'computerLogin' | 'refused' }
  | { kind: 'notAllowed'; reason: 'shared' | 'otherAccount' | 'admin' }
  | { kind: 'stale' };


/** What a status answer says for `account` (see the contract). */
export function agentLoginOf(status: unknown, account: unknown): AgentLogin {
  if (!isRecord(status) || typeof account !== 'string' || !account) return 'identity';
  const acct = status.account_id == null ? '' : String(status.account_id);
  if (acct && acct !== account) return 'account';
  const rejected = isRecord(status.last_error) && status.last_error.credential_rejected === true;
  if (status.auth_active !== true || rejected) return 'login';
  if (!acct || status.identity_unavailable === true || typeof status.owner_fingerprint !== 'string' || !status.owner_fingerprint) return 'identity';
  if (status.restriction !== 'none' && status.restriction !== 'realms') return 'identity';
  return 'ready';
}

const tid = (t: Target | null | undefined): string => `${t?.project?.id ?? ''}\u0000${t?.container?.id ?? ''}`;
/** The Hub still shows `t`'s computer: computer.ts changes the target without a new generation, so alive() alone
 *  cannot tell. */
const shows = (t: Target): boolean => tid(shownTarget()) === tid(t);

// A call's hold on its computer: left once the Hub shows any other computer, for good (every core change is seen as it
// happens, so a switch away and back is seen too).
interface Pin { readonly t: Target; left: boolean; drop(): void }
function pin(t: Target): Pin {
  const p: Pin = { t, left: !shows(t), drop: () => {} };
  p.drop = subscribe(() => { if (!shows(t)) p.left = true; });
  return p;
}
const holds = (p: Pin): boolean => !p.left && shows(p.t);
const live = (ctx: Ctx, p: Pin): boolean => alive(ctx) && holds(p);

/** Calls onLeave whenever core shows another computer than `computerId` (container id), as it happens: before React renders the
 *  move, so a page's own continuation can end even on away-and-back between two renders. Returns the unsubscribe. */
export function watchComputer(computerId: string, onLeave: () => void): () => void {
  return subscribe(() => { if ((shownTarget()?.container?.id ?? '') !== computerId) onLeave(); });
}

export function signInOffered(ctx: Ctx): boolean {
  return alive(ctx) && !!ctx.account && !tokenSession();
}

/** One status read (Check again): the projection for ctx's account, 'unread' when no answer came, 'stale' when the
 *  context died. */
export async function checkAgentLogin(ctx: Ctx, target: Target): Promise<AgentLogin | 'unread' | 'stale'> {
  const p = pin(target);
  const started = mark();
  try {
    const r = await readStatus(ctx, p);
    if (r !== 'stale' && r !== 'unread') proved(targetKey(ctx, target), r, started);
    return r;
  } finally { p.drop(); }
}

async function readStatus(ctx: Ctx, p: Pin, signal?: AbortSignal): Promise<AgentLogin | 'unread' | 'stale'> {
  if (!live(ctx, p)) return 'stale';
  try {
    const b = await api(agentSignInRoutes.status, { ctx, target: p.t, still: () => holds(p), signal });
    return live(ctx, p) ? agentLoginOf(b, ctx.account) : 'stale';
  } catch {
    return live(ctx, p) ? 'unread' : 'stale';
  }
}

const running = new Map<string, Promise<SignInResult>>();
const targetKey = (ctx: Ctx, t: Target): string => `${String(ctx.account)}\u0000${t?.project?.id ?? ''}\u0000${t?.container?.id ?? ''}`;

// When a status read started, or an unknown came: the time (for the UNSURE_HOLD_MS rule) and its place in one order of
// both. Two of them in the same millisecond still have an order: the place says which came first.
interface Mark { readonly at: number; readonly seq: number }
let seq = 0;
const mark = (): Mark => ({ at: Date.now(), seq: ++seq });

// The unknown sign-ins still holding their computer: the key (account, project, computer) and when the unknown came.
const unsure = new Map<string, Mark>();
const unsureFns = new Set<() => void>();
function unsureChanged(): void {
  for (const f of [...unsureFns]) {
    try { f(); } catch { /* the listener's own */ }
  }
}
// The account ended (sign-out, another account, a fresh boot): its holds go with it, as changes.ts drops its locks.
onBump((reason) => { if (!keepsChanges(reason) && unsure.size > 0) { unsure.clear(); unsureChanged(); } });

/** A status read ends the hold of its computer: at once when it says ready; otherwise only when it started UNSURE_HOLD_MS
 *  or more after the unknown came. A read that started before the unknown came (even in the same millisecond) says
 *  nothing about it. */
function proved(k: string, r: AgentLogin, started: Mark): void {
  const held = unsure.get(k);
  if (held === undefined || started.seq < held.seq) return;
  if (r === 'ready' || started.at - held.at >= UNSURE_HOLD_MS) { unsure.delete(k); unsureChanged(); }
}

/** A status read a place sends itself (GET /hoody/auth/status through its own route) counts for the hold as Check again's
 *  does. Call it as the read starts, then call what it returns with the answer's body; a read that got no answer is not
 *  noted. */
export function noteAgentStatus(ctx: Ctx, target: Target): (status: unknown) => void {
  const k = targetKey(ctx, target);
  const started = mark();
  return (status) => { if (alive(ctx)) proved(k, agentLoginOf(status, ctx.account), started); };
}

/** The account that sent a sign-in is still the Hub's (a computer or realm switch keeps it; sign-out or another account
 *  does not). */
const sameAccount = (ctx: Ctx): boolean => !!ctx.account && capture().account === ctx.account;

/** True while a sign-in of ctx's account on `target`'s computer may have landed (unknown, or stale after its bootstrap went
 *  out) and no status read has ended its hold. */
export function signInUnsure(ctx: Ctx, target: Target): boolean {
  return unsure.has(targetKey(ctx, target));
}

/** Calls `fn` whenever signInUnsure may answer otherwise. Returns the unsubscribe. */
export function subscribeSignInUnsure(fn: () => void): () => void {
  unsureFns.add(fn);
  return () => { unsureFns.delete(fn); };
}

export function signInAgent(ctx: Ctx, target: Target): Promise<SignInResult> {
  const k = targetKey(ctx, target);
  const was = running.get(k);
  if (was) return was;
  // Held (C9): nothing is sent. A call for a computer the Hub no longer shows, or from a dead context, is stale as signIn
  // would answer it.
  if (unsure.has(k)) return Promise.resolve<SignInResult>(alive(ctx) && shows(target) ? { kind: 'unknown' } : { kind: 'stale' });
  const sent: Sent = { v: false };
  const p = signIn(ctx, target, sent).then((r) => {
    // Unknown, or stale after the bootstrap went out: it may have landed (see the contract).
    if ((r.kind === 'unknown' || (r.kind === 'stale' && sent.v)) && sameAccount(ctx)) { unsure.set(k, mark()); unsureChanged(); }
    return r;
  }).finally(() => { if (running.get(k) === p) running.delete(k); });
  running.set(k, p);
  return p;
}

let proofGap = PROOF_GAP_MS;
let proofRead = PROOF_READ_MS;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const codeOf = (e: unknown): string => (isRecord(e) && typeof e.code === 'string' ? e.code : '');

/** Set once the bootstrap went out (answered, or pending: it may have). */
type Sent = { v: boolean };

async function signIn(ctx: Ctx, target: Target, sent: Sent): Promise<SignInResult> {
  const p = pin(target);
  try { return await signInPinned(ctx, p, sent); } finally { p.drop(); }
}

async function signInPinned(ctx: Ctx, p: Pin, sent: Sent): Promise<SignInResult> {
  const target = p.t;
  if (!live(ctx, p) || !ctx.account) return { kind: 'stale' };
  if (tokenSession()) return { kind: 'notAllowed', reason: 'shared' };
  let token: string;
  try {
    token = await agentBootToken(ctx, { codePrompt: true, still: () => holds(p) });
  } catch (e) {
    const c = codeOf(e);
    if (c === 'STALE' || !live(ctx, p)) return { kind: 'stale' };
    if (c === 'NOT_ALLOWED') return { kind: 'notAllowed', reason: 'shared' };
    return { kind: 'refused', reason: c === 'CANCELLED' ? 'cancelled' : c === 'BUSY' ? 'busy' : 'key' };
  }
  // The key came back for a computer the Hub no longer shows: dropped unsent.
  if (!live(ctx, p)) { token = ''; return { kind: 'stale' }; }
  try {
    // Answered (installed or renewed) or under way: either way only the status says whether it took.
    await directChange('agent-bootstrap', { project: target.project.id, computer: target.container.id }, (bind) => api(agentSignInRoutes.bootstrap, { ctx, target, body: { token }, recovers: true, still: () => holds(p), ...(bind ? { bind } : {}) }));
    sent.v = true;
  } catch (e) {
    const o = outcomeOf(e, true);
    if (o === 'pending') sent.v = true;
    if (o === 'stale' || !live(ctx, p)) return { kind: 'stale' };
    if (o === 'not_sent') return { kind: 'refused', reason: 'refused' };
    if (o !== 'pending') return refusalOf(e as HubError);
  } finally { token = ''; }
  if (!live(ctx, p)) return { kind: 'stale' };
  return prove(ctx, p);
}

function refusalOf(e: HubError): SignInResult {
  if (e && e.status === 404) return { kind: 'refused', reason: 'disabled' };
  switch (codeOf(e)) {
    case 'agent_login_conflict': return { kind: 'notAllowed', reason: 'otherAccount' };
    case 'admin_login_refused': return { kind: 'notAllowed', reason: 'admin' };
    case 'login_not_for_this_box': return { kind: 'refused', reason: 'notThisBox' };
    case 'credential_present': return { kind: 'refused', reason: 'computerLogin' };
    case 'token_rejected': case 'login_grant_insufficient': case 'login_expiring': case 'login_changed':
      return { kind: 'refused', reason: 'key' };
    default: return { kind: 'refused', reason: 'refused' };
  }
}

// The proof: up to PROOF_TRIES status reads. 'ready' proves it; another account is a fact the read shows; anything else
// (signed out, no identity yet, no answer) after the last read is unknown: the sign-in may still finish.
async function prove(ctx: Ctx, p: Pin): Promise<SignInResult> {
  for (let i = 0; i < PROOF_TRIES; i++) {
    if (i > 0) await wait(proofGap);
    const ac = new AbortController();
    const cut = setTimeout(() => ac.abort(), proofRead);
    let r: AgentLogin | 'unread' | 'stale';
    try { r = await readStatus(ctx, p, ac.signal); } finally { clearTimeout(cut); }
    if (r === 'stale') return { kind: 'stale' };
    if (r === 'ready') return { kind: 'signedIn' };
    if (r === 'account') return { kind: 'notAllowed', reason: 'otherAccount' };
  }
  return { kind: 'unknown' };
}

/** The sign-in proofs and holds forgotten and the proof timings set (session disposal, dispose.ts; tests). */
export function resetAgentSignIn(gapMs = PROOF_GAP_MS, readMs = PROOF_READ_MS): void {
  running.clear();
  if (unsure.size > 0) { unsure.clear(); unsureChanged(); }
  proofGap = gapMs; proofRead = readMs;
}
