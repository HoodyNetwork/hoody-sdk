// An own endpoint's edit (name, address, models) whose outcome is unknown, held by core the way an agent's model change is
// (modelHold.ts): the same durable hold (stored, every tab of the account sees it), its own sender, the lock
// ai.endpoint-edit:<project>/<container>/<endpoint>. Endpoints belong to the computer's agent, not to a realm (their
// routes send no realm), so the lock names none. Closing the edit drawer and opening it again, leaving the page or
// another tab therefore shows "may have gone through" with Check again over a locked form, never a Save a second change
// could be sent from.
//   - The hold is taken before the change leaves. Refused (this endpoint's edit is already held, or storage that cannot
//     keep it): nothing is sent. The page's api sends to the computer shown at each call, so a computer switch while the
//     edit is being prepared or held (the models' digest, the hold) sends nothing and lets the hold go (as Default model's
//     followsShown, modelHold.ts). The change and its read-back then go only to that computer (shownGate.ts onlyOn):
//     after a switch the read-back reads nothing and the hold stays.
//   - It is let go only on a proved outcome: saved (the answer, or the read-back showing the values), nothing to send,
//     or a definite refusal. Every other answer (lost, a context that moved on) keeps it.
//   - Check again only reads the endpoint back, and only from the computer the caller was shown, and compares it with
//     what was sent (as `shows` does: the name, the address as the agent stores it, the models in any order), then frees
//     the hold through core's checked free ('proved'), never while the send may still be out. Stop tracking is the
//     person's warned dismiss.
//   - The form is reached only from the endpoint's row. An endpoint the list no longer shows (removed here, in another tab
//     or on the computer) takes it away, so the page reads such a hold back itself (useSettleGoneEdits) and lets it go
//     only when the agent answers that the endpoint does not exist: its PATCH changes an existing endpoint and never makes
//     one, so nothing of the edit is left to land or to check.
//   - The meta keeps the name and address sent and the SHA-256 of the sorted model list (a list can be far larger than a
//     hold may be). Plain data, never a secret.
import { attemptFor, heldAttempts, holdAttempt, providers, sha256Hex, useAttemptsVersion, type HeldAttempt } from '@core';
import { useEffect, useMemo, useRef } from 'react';
import type { Api } from './api';
import { editEndpoint, normUrl, readEndpoint, type EditResult, type Saved } from './flows-endpoint';
import { onlyOn, shownComputer } from './shownGate';
import { listReadKey } from './disconnectHold';
import type { Settled } from './types';

/** The sender of these holds in core: only it lets them go. */
export const EDIT_HOLD_BY = 'ai.endpoint-edit';
/** A project id as core's computer identities take it (modelHold.ts). */
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;
const COMPUTER = /^[A-Za-z0-9_.-]{1,48}$/;
/** An endpoint id as EndpointStep.tsx plans it. */
const ENDPOINT = /^[A-Za-z0-9_.:-]{1,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** The computer an edit goes to: its project and container id (a container id alone is not unique across projects). */
export interface EditAt { project: string; computer: string }

/** Every edit lock on `at` starts with this; null when the computer cannot be named. */
function editBase(at: EditAt): string | null {
  return PROJECT.test(at.project) && COMPUTER.test(at.computer) ? `${EDIT_HOLD_BY}:${at.project}/${at.computer}/` : null;
}

/** The lock of one endpoint's edit on one computer; null when a part cannot be named (nothing is sent). */
export function editLock(at: EditAt, endpoint: string): string | null {
  const base = editBase(at);
  return base && ENDPOINT.test(endpoint) ? base + endpoint : null;
}

/** What was sent, as Check again compares it: the name, the address as the agent stores it, the models' digest. */
interface Sent { name: string; url: string; models: string }

/** A held edit as the form shows it. `sent` is null if the stored meta cannot be read (Check again then proves nothing:
 *  only Stop tracking, or the endpoint read gone, lets it go); `inFlight`: its request may still be out. */
export interface HeldEdit { id: string; sent: Sent | null; metaVersion: number; inFlight: boolean }

const modelsDigest = (models: readonly string[]): Promise<string> => sha256Hex([...models].sort().join('\n'));

function sentOf(meta: unknown): Sent | null {
  const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  return typeof m.name === 'string' && typeof m.url === 'string' && typeof m.models === 'string' && HEX64.test(m.models) ? { name: m.name, url: m.url, models: m.models } : null;
}

function heldOf(h: HeldAttempt): HeldEdit {
  return { id: h.id, sent: sentOf(h.meta), metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
}

/** The held edit of `endpoint` at `at`, re-read whenever core's holds move; null when none. */
export function useHeldEdit(at: EditAt | null, endpoint: string): HeldEdit | null {
  const version = useAttemptsVersion();
  const lock = at ? editLock(at, endpoint) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === EDIT_HOLD_BY) : undefined;
    return h ? heldOf(h) : null;
    // `version` is core's signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** A send's result: the flow's, or `held` (refused: this endpoint's edit is already held) or `not_held` (refused: core
 *  could not keep the hold). Neither refusal sent anything. */
export type EditHoldResult = EditResult | { state: 'held' } | { state: 'not_held' };

/** Holds the edit, sends it once (editEndpoint: the change, then the read-back) and lets the hold go only on a proved
 *  outcome. The edit is sent only if the computer shown did not change since the call began (else `stale`: nothing sent,
 *  the hold let go), and the change and its read-back go to that computer or nowhere. */
export async function sendEdit(api: Api, at: EditAt, endpoint: string, before: Saved, after: Saved, on?: string): Promise<EditHoldResult> {
  const lock = editLock(at, endpoint);
  if (!lock) return { state: 'not_held' };
  // The render's computer when the caller passes it (the sections do), else the one shown at the call. Core showing
  // another one sends nothing and holds nothing.
  const chosenOn = on ?? shownComputer();
  if (shownComputer() !== chosenOn) return { state: 'stale' };
  const meta: Sent = { name: after.name, url: normUrl(after.base_url), models: await modelsDigest(after.models) };
  const got = await holdAttempt(lock, {
    by: EDIT_HOLD_BY,
    identity: { project: at.project, computer: at.computer, endpoint },
    meta,
  }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  if (shownComputer() !== chosenOn) {
    hold.release();
    return { state: 'stale' };
  }
  const r = await editEndpoint(onlyOn(api, chosenOn), endpoint, before, after).catch((): EditResult => ({ state: 'not_confirmed' }));
  // `invalid` and `failed` are definite refusals (editEndpoint reads an unknown answer back, never failed).
  if (r.state === 'saved' || r.state === 'unchanged' || r.state === 'invalid' || r.state === 'failed') hold.release();
  else hold.sent();
  return r;
}

/** Check again: reads the endpoint back, never a second send, and only from `on` (the computer the caller was shown,
 *  shownComputer(); shown another one, it answers `stale` with nothing read). The hold goes once the read shows what was
 *  sent and core's checked free agrees (never while the send may still be out). Refused: the hold stays and the form
 *  reads as before. */
export async function checkEdit(api: Api, endpoint: string, held: HeldEdit, on: string): Promise<'saved' | 'not_confirmed' | 'stale'> {
  if (!held.sent) return 'not_confirmed';
  const r = await readEndpoint(onlyOn(api, on), endpoint);
  if (r.state === 'stale') return 'stale';
  if (r.state !== 'ok' || r.def.name !== held.sent.name || normUrl(r.def.base_url) !== held.sent.url || (await modelsDigest(r.def.models)) !== held.sent.models) return 'not_confirmed';
  const h = attemptFor(held.id, EDIT_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : 'freed';
  return freed === 'freed' ? 'saved' : 'not_confirmed';
}

/** The person's Stop tracking (after the kit's question): true once core let the hold go. */
export async function stopEdit(held: HeldEdit): Promise<boolean> {
  const h = attemptFor(held.id, EDIT_HOLD_BY);
  if (!h) return false;
  return (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
}

/** Holds being read back by settleGoneEdits now (one read per hold at a time, StrictMode's second run included). */
const settling = new Set<string>();

/** The agent's answer that an endpoint does not exist (its read and its PATCH alike): a 404 with the not_found code. A 404
 *  without that code (a route the agent does not serve, something on the way) proves nothing. */
/** Holds a pass skipped while their request was out: each is read once its request answers (then dropped from here). */
const owedOnAnswer = new Set<string>();

const isGone = (r: Settled<unknown>): boolean => !r.ok && r.err.kind === 'failed' && r.err.status === 404 && r.err.code === 'not_found';

/** One pass of the page's reader of held edits no form can reach. Every held edit on the computer `on` names (a
 *  shownComputer() value) whose endpoint `accounts` does not list, and whose request is not out, is read once, from that
 *  computer only (a read, never a send). The hold goes only on the agent's answer that the endpoint does not exist,
 *  whatever its stored meta says. Any other answer (the endpoint read, a refused or lost read, a switch) keeps it for
 *  the next list read. Resolves once every read it started has settled. */
export async function settleGoneEdits(accounts: readonly { id: string }[], api: Api, on: string, only?: ReadonlySet<string>): Promise<void> {
  const [project = '', computer = ''] = on.split('\n');
  const base = editBase({ project, computer });
  // A held key save of an own endpoint is read the same way: an endpoint that does not exist holds no key, whether it
  // went before the key arrived or took the key with it.
  const keyBase = providers.credentialLockBase({ project, computer });
  if (!base || !keyBase) return;
  const listed = new Set(accounts.map((a) => a.id));
  const reads: Promise<void>[] = [];
  for (const h of heldAttempts()) {
    const at = h.by === EDIT_HOLD_BY ? base : h.by === providers.KEY_SAVE_HOLD_BY ? keyBase : null;
    if (!at || !h.lock.startsWith(at)) continue;
    const endpoint = h.lock.slice(at.length);
    if (!ENDPOINT.test(endpoint) || listed.has(endpoint)) continue;
    const held = { id: h.id, metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
    if (only && !only.has(held.id)) continue;
    // Its request is out: skipped now, and owed one read once it answers (useSettleGoneEdits), not at the next list read.
    if (held.inFlight) { owedOnAnswer.add(held.id); continue; }
    if (settling.has(held.id)) continue;
    settling.add(held.id);
    reads.push((async () => {
      if (!isGone(await onlyOn(api, on).provider(endpoint))) return;
      await attemptFor(held.id, h.by)?.free('proved', { metaVersion: held.metaVersion });
    })().catch(() => undefined).finally(() => { settling.delete(held.id); }));
  }
  await Promise.all(reads);
}

/** The page's reader of held edits whose endpoint the list no longer shows: once per read of the accounts list (`read` +
 *  the listed ids, listReadKey, as useSettleUnlisted) it runs settleGoneEdits from the computer shown when that list was
 *  drawn. */
export function useSettleGoneEdits(accounts: readonly { id: string }[] | null, read: number | null, api: Api): void {
  const on = shownComputer();
  // The holds moving (a skipped hold's own sent()) re-reads only the holds owed a read whose request has answered, once.
  const version = useAttemptsVersion();
  const ready = useMemo(() => {
    const ids: string[] = [];
    for (const h of heldAttempts()) if ((h.by === EDIT_HOLD_BY || h.by === providers.KEY_SAVE_HOLD_BY) && owedOnAnswer.has(h.id) && h.inFlight === false) ids.push(h.id);
    return ids.sort().join('\n');
    // `version` is the signal that the holds moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  // An owed hold that is gone from the holds is owed nothing (outside render: the set is module state).
  useEffect(() => {
    const held = new Set(heldAttempts().map((h) => h.id));
    for (const id of owedOnAnswer) if (!held.has(id)) owedOnAnswer.delete(id);
  }, [version]);
  const key = listReadKey(read, accounts);
  const list = useRef(accounts);
  list.current = accounts;
  useEffect(() => {
    const accounts = list.current;
    if (key !== null && accounts && on) void settleGoneEdits(accounts, api, on);
  }, [key, api, on]);
  useEffect(() => {
    const accounts = list.current;
    if (ready === '' || !accounts || !on) return;
    const only = new Set(ready.split('\n'));
    for (const id of only) owedOnAnswer.delete(id);
    void settleGoneEdits(accounts, api, on, only);
  }, [ready, api, on]);
}
