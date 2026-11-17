// fork.ts: the pure side of forking a chat from a turn. A fork is a keyed create that branches from a LIVE session
// (POST /sessions with `fork` and, for "from here", `fork_turn_idx`). No engine, no storage, no React.
//
// What the agent does and this file relies on:
//   - fork_turn_idx is the 0-based index of a turn in the parent's turn_boundaries (the transcript read), NOT of its receipts; an explicit 0
//     is the first turn; absent is "through the last turn". A negative or missing index is 400 bad_request and nothing is made.
//   - A fork inherits the agent, tool mode and directory scope: its body carries none of agent, tool_mode, dir_scope or approval.
//   - The created session reports where it came from: started.parent_id, and started.fork_turn_idx (omitted when it is 0).
//   - The parent must be live: an unknown, other-realm or ended parent is the uniform 404.
import * as L from './logic';

/** "From here": the 0-based turn and the boundary value the page read for it (the message index that ends the turn). A caller that
 *  names only the turn gets the boundary of the conversation the page is showing (the engine's own history read). */
export interface ForkSpec { turn: number; pin?: number }

/** Why a fork came to what it did: the host chooses its tone and its actions from this alone, never from the words. */
export type ForkReason =
  | 'opened' | 'none' | 'gone' | 'unconfirmed' | 'busy' | 'pending' | 'lost' | 'handoff' | 'inFlight'
  | 'untracked' | 'full' | 'refused' | 'notOpen' | 'changed' | 'approval' | 'notRead' | 'notRemembered' | 'unreadable' | 'account';

/** What a fork came to. `opened` is the only outcome a host may navigate on; it exists only once the create is settled (a reply that is
 *  that fork, its record moved to the new chat and read back). `refused`: this action ended with nothing of its own pending - the words
 *  and `reason` say why; for `gone` and `unconfirmed` the target is free again, which does not mean that none was made. `unknown`: a
 *  record of this target remains pending (its create key is `k1`) and Check can recover it. */
export type ForkOutcome = (
  | { k: 'opened'; sid: string; k1: string }
  | { k: 'refused'; key: string; reason: ForkReason }
  | { k: 'unknown'; k1: string; key: string; reason: ForkReason }
) & ForkDecidedFor;
/** Stamped on the outcome of a Check: the account it was decided for and the create key that was checked (the host's `forkNow` guard reads them). */
export interface ForkDecidedFor { acct?: string; asked?: string }

/** The words (a strings key the engine owns) for a reason; a reason with no sentence of its own reads as the pending one. A fork of the
 *  whole chat (`whole`) has its own sentence where the reply's number would be mentioned. */
export function reasonKey(reason: ForkReason, whole: boolean): string {
  const w = (k: string): string => (whole ? k + 'Whole' : k);
  switch (reason) {
    case 'none': return w('ask.forkNone');
    case 'gone': return 'ask.forkGone';
    case 'unconfirmed': return 'ask.forkUnconfirmed';
    case 'busy': return 'ask.forkBusy';
    case 'lost': return 'ask.forkMade';
    case 'handoff': return 'ask.forkHandoff';
    case 'inFlight': return 'ask.forkInFlight';
    case 'untracked': return 'ask.forkUntracked';
    case 'full': return 'ask.forkFull';
    case 'unreadable': return 'ask.forkUnreadable';
    case 'account': return 'ask.forkAccount';
    case 'notRemembered': return 'ask.notRemembered';
    case 'notOpen': return 'ask.forkNotOpen';
    case 'changed': return 'ask.forkChanged';
    case 'approval': return 'ask.forkApproval';
    case 'notRead': return 'ask.forkNotRead';
    default: return w('ask.forkPending');
  }
}
/** The reason a refusal's strings key stands for (the typed mapping of forkRefusal and the engine's own refusals). */
export function refusalReason(key: string): ForkReason {
  switch (key) {
    case 'ask.forkNotOpen': case 'ask.forkNoTurn': case 'ask.forkReopenFailed': case 'ask.forkReopenGates': case 'ask.forkReopenUnconfirmed': return 'notOpen';
    case 'ask.forkChanged': return 'changed';
    case 'ask.forkApproval': return 'approval';
    case 'ask.forkNotRead': case 'ask.forkStateUnread': return 'notRead';
    case 'ask.forkAccountMoved': return 'account';
    case 'ask.forkFull': return 'full';
    case 'ask.notRemembered': case 'ask.checkEarlier': return 'notRemembered';
    default: return 'refused';
  }
}

export function forkBody(realm: unknown, container: unknown, parent: unknown, idx: number | null): L.ForkBody | null {
  const base = L.createBody(realm, container);
  if (!base || !L.seg(parent)) return null;
  if (idx !== null && !(typeof idx === 'number' && Number.isSafeInteger(idx) && idx >= 0)) return null;
  return { realm: base.realm, computer: base.computer, expected_binding: base.expected_binding, fork: parent as string, ...(idx !== null ? { fork_turn_idx: idx } : {}) };
}

/** The turn boundaries of a transcript read: whole non-negative message indexes that never go back; anything else is not a reading. */
export function boundsOf(body: unknown): readonly number[] | null {
  if (!L.isObj(body) || !Array.isArray(body.turn_boundaries)) return null;
  const out: number[] = [];
  for (const x of body.turn_boundaries as unknown[]) {
    if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || (out.length && x < (out[out.length - 1] as number))) return null;
    out.push(x);
  }
  return out;
}

/** The pin check at press time: the turn is still there and still ends where the page saw it end (a trim, a /clear or a compaction since
 *  would shift the indexes and fork at the wrong turn). Without a spec (the whole chat) the chat needs one finished turn. */
export type PinView = 'ok' | 'changed' | 'nothing';
export function pinView(bounds: readonly number[], spec: { turn: number; pin: number } | null): PinView {
  if (spec === null) return bounds.length ? 'ok' : 'nothing';
  if (!Number.isSafeInteger(spec.turn) || spec.turn < 0 || !Number.isSafeInteger(spec.pin)) return 'changed';
  return bounds.length > spec.turn && bounds[spec.turn] === spec.pin ? 'ok' : 'changed';
}

/** The create reply is accepted as THE fork asked for only when it is a started session in the captured binding AND names this parent
 *  and this index. fork_turn_idx is omitted by the agent when it is 0, so an absent echo reads as 0; a "whole chat" fork checks the
 *  parent only. Anything else is not a reply this page can navigate on. */
export function checkForked(res: unknown, want: { realm: string; container: string; owner: string; parent: string; idx: number | null }): 'BINDING' | 'NOTFORK' | null {
  if (L.checkStarted(res, want)) return 'BINDING';
  const s = (res as { started: Record<string, unknown> }).started;
  if (s.parent_id !== want.parent) return 'NOTFORK';
  if (want.idx !== null) {
    const echo = s.fork_turn_idx === undefined ? 0 : s.fork_turn_idx;
    if (echo !== want.idx) return 'NOTFORK';
  }
  return null;
}

/** A refusal's words, from the one typed mapping (logic.errorView) with the fork's own sentence where the generic one would mislead:
 *  a refused index is "changed", a posture the parent's locked policy refuses its own line. A 404 is not here: the journal never reads a 404
 *  as proof (proof.ts), so a fork whose parent was not open stays unknown (nothing in this build reads a key back). */
export function forkRefusal(e: unknown): { key: string; unknown: boolean } {
  const v = L.errorView(e);
  // A refusal of a superseded or stale context says nothing about the request: it may have been made.
  if (v.unknown || v.drop) return { key: 'ask.forkMade', unknown: true };
  if (L.isObj(e)) {
    const code = typeof e.code === 'string' ? e.code : '';
    if (code === 'approval_policy_unsatisfiable') return { key: 'ask.forkApproval', unknown: false };
    if (e.status === 400 && code === 'bad_request') return { key: 'ask.forkChanged', unknown: false };
  }
  return { key: v.key ?? 'ask.failed', unknown: false };
}
/** Whether two stored fork origins are the same fork: the parent and the turn (and neither unreadable). */
export function sameForkOrigin(a: { s: string; i: number | null; bad?: true } | undefined, b: { s: string; i: number | null; bad?: true } | undefined): boolean {
  return !!a && !!b && !a.bad && !b.bad && a.s === b.s && a.i === b.i;
}
