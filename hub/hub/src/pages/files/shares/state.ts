// What one share row shows: one state, one reason, at most one action, and how soon to read it again. Pure.
//
// The API stores only status (active | failed) × enabled × expires_at; a tenant's only failure detail is
// status_message, one of a fixed set of sentences (the API's own table; the API
// shows anything else as GENERIC). There is no pending or mounted state: a 201 means configured, and a host applies it
// later, so "on" never claims the folder is there yet. The sentences are matched exactly (the API has no stable code for them yet): a
// sentence this Hub does not know reads as GENERIC, the way the API reads its own unknowns.
import { mountPathOk, type ShareRow } from './wire';

/** The API's sentences, by its own key. Keep in step with the API's table: state.test.ts pins every one. */
export const SHARE_SENTENCES = {
  SETUP_FAILED:
    'The share could not be set up on the server. To retry, turn the share on again (set enabled to true); if it keeps failing, contact support.',
  DEFERRED:
    'This share reaches many computers, so it is being set up in the background. It becomes available within a few minutes.',
  TEARDOWN_INCOMPLETE:
    'The share could not be fully switched off on the server. To retry, turn the share on again (set enabled to true).',
  CROSS_SERVER_UNAVAILABLE:
    'Sharing with computers on other servers is unavailable right now. To set it up again later, turn the share on again (set enabled to true).',
  UNREACHABLE_CONSUMER:
    'This share cannot reach one or more of its computers. Check the share path and turn the share on again (set enabled to true) to retry, or contact support.',
  SWITCHED_OFF_DRAINING:
    'Sharing has been switched off, but the remote copy is still finishing its writes — access ends automatically within a few minutes.',
  SOURCE_MISSING:
    'Source directory not found on the owner computer — sharing is paused for this share and resumes automatically once the directory is restored.',
  RW_PAUSED_OWNER_QUOTA_UNSUPPORTED:
    'The owner host cannot currently enforce a read-write disk quota, so read-write sharing is paused for this share. ' +
    'It resumes automatically once the owner host has enforced disk quotas.',
  RW_PAUSED_NESTED_SUBVOLUME:
    'A nested subvolume under the shared directory escapes the disk quota, so read-write sharing is paused for this share. ' +
    'It resumes automatically once the nested subvolume is removed from the shared directory.',
  RW_PAUSED_NO_QUOTA:
    'The owner computer has no enforced disk quota, so read-write sharing is paused for this share. ' +
    'It resumes automatically once the owner computer has one. To share now, set the mode to readonly, or contact support.',
  RW_REFUSED_NESTED_SUBVOLUME:
    'Read-write could not be enabled: a nested subvolume under the shared directory escapes the disk quota. ' +
    'Sharing for this share is interrupted until the nested subvolume is removed from the shared directory.',
  RW_REFUSED_NO_QUOTA:
    'Read-write could not be enabled: the owner computer has no enforced disk quota. ' +
    'Sharing for this share is interrupted until the owner computer has one. To share now, set the mode to readonly, or contact support.',
  RW_PAUSED_SQUASH_ACL:
    'The shared directory could not be prepared for read-write sharing (it may hold too many files), ' +
    'so sharing is paused for this share. It resumes automatically once that succeeds; to share now, ' +
    'share a smaller folder or set the mode to readonly.',
  RW_SQUASH_ACL_FAILED:
    'The shared directory could not be prepared for read-write sharing (it may hold too many files). ' +
    'Share a smaller folder or set the mode to readonly, then turn the share on again (set enabled to true).',
  RO_PAUSED_SQUASH_ACL:
    'The shared directory could not be prepared for sharing (it may hold too many files), ' +
    'so sharing is paused for this share. It resumes automatically once that succeeds; to share now, share a smaller folder.',
  RO_SQUASH_ACL_FAILED:
    'The shared directory could not be prepared for sharing (it may hold too many files). ' +
    'Share a smaller folder, then turn the share on again (set enabled to true).',
  OWNER_UNREACHABLE_NOTHING_HELD:
    'The server holding this share stopped responding. Sharing resumes automatically when it is back.',
  OWNER_UNREACHABLE_RELEASED:
    'The server holding this share stopped responding, so its connected computers were released. ' +
    'Recent writes to the share may have been lost. Sharing resumes automatically when the server is back.',
  OWNER_UNREACHABLE_UNCONFIRMED:
    'The server holding this share stopped responding, and releasing its connected computers could not be confirmed. ' +
    'Recent writes to the share may have been lost; do not assume they were saved. Contact support if sharing does not resume.',
  OWNER_HOST_NOT_READY:
    'The server holding this share cannot publish it right now. ' +
    'Sharing starts automatically once it can; contact support if this lasts.',
  RECEIVER_HOST_NOT_READY:
    'A server of this share is not ready for sharing yet, so the share does not reach some of its computers. ' +
    'Sharing starts automatically once it is; contact support if this lasts.',
  CROSS_SERVER_NOT_AVAILABLE_HERE:
    'Sharing with computers on other servers is not available for this server, so this share does not reach them. ' +
    'Place the computers on the same server to share between them.',
  CONSUMER_STILL_HELD:
    'A program still has files open from an earlier connection to this share, so the share cannot ' +
    'reconnect yet. It reconnects automatically once that program exits; contact support if this lasts.',
  GENERIC:
    'This share has a problem on the server. To retry, turn the share on again (set enabled to true); if it keeps failing, contact support.',
} as const;

export type ShareReason = keyof typeof SHARE_SENTENCES;

const BY_SENTENCE: ReadonlyMap<string, ShareReason> = new Map(
  (Object.entries(SHARE_SENTENCES) as [ShareReason, string][]).map(([k, v]) => [v, k]),
);

/** The API key of a status_message: null for none, GENERIC for a sentence this Hub does not know. */
export function reasonOf(message: string | null): ShareReason | null {
  if (message === null || message === '') return null;
  return BY_SENTENCE.get(message) ?? 'GENERIC';
}

// Sentences of a share that heals by itself while the servers catch up: read again soon, offer nothing.
const WAITING: ReadonlySet<ShareReason> = new Set(['DEFERRED', 'OWNER_HOST_NOT_READY', 'RECEIVER_HOST_NOT_READY', 'CONSUMER_STILL_HELD', 'SWITCHED_OFF_DRAINING']);
// Read and write is held while the owner side cannot bound it; read only works now.
const PAUSED_RW: ReadonlySet<ShareReason> = new Set(['RW_PAUSED_OWNER_QUOTA_UNSUPPORTED', 'RW_PAUSED_NESTED_SUBVOLUME', 'RW_PAUSED_NO_QUOTA', 'RW_PAUSED_SQUASH_ACL']);
// The owner's server stopped answering; the share comes back with it.
const OWNER_DOWN: ReadonlySet<ShareReason> = new Set(['OWNER_UNREACHABLE_NOTHING_HELD', 'OWNER_UNREACHABLE_RELEASED', 'OWNER_UNREACHABLE_UNCONFIRMED']);
// Writes made through the share may be gone: the row says so whatever else it shows.
const MAY_HAVE_LOST: ReadonlySet<ShareReason> = new Set(['OWNER_UNREACHABLE_RELEASED', 'OWNER_UNREACHABLE_UNCONFIRMED']);
// Interrupted until the person changes something: read only is the way out.
const READ_ONLY_FIX: ReadonlySet<ShareReason> = new Set(['RW_REFUSED_NESTED_SUBVOLUME', 'RW_REFUSED_NO_QUOTA', 'RW_SQUASH_ACL_FAILED']);
// Interrupted, but the share comes back by itself (the folder returns, the servers get a read-only folder ready, or
// the pair can never cross servers here).
const HEALS_ALONE: ReadonlySet<ShareReason> = new Set(['SOURCE_MISSING', 'RO_PAUSED_SQUASH_ACL', 'CROSS_SERVER_NOT_AVAILABLE_HERE']);

/** A change of this share the Hub has sent and not yet heard back about. */
export type ShareHold = 'creating' | 'turningOff' | 'turningOn' | 'changing' | 'stopping';

export interface ShareContext {
  /** Unix seconds. */
  readonly now: number;
  readonly hold?: ShareHold | null;
  /** A change's answer was lost and its read-back has not settled. */
  readonly unsure?: boolean;
  /** Each computer's running state from the Hub's computer list; null when not known (another realm, not listed). */
  readonly sourceRunning?: boolean | null;
  readonly targetRunning?: boolean | null;
}

export type ShareStateKind =
  | 'sending' | 'unsure' | 'expired' | 'legacy' | 'unreadable' | 'failed' | 'off'
  | 'waiting' | 'pausedRw' | 'interrupted' | 'ownerDown' | 'sourceStopped' | 'targetStopped' | 'unclear' | 'on';

export type ShareAction = 'checkAgain' | 'shareAgain' | 'tryAgain' | 'turnOn' | 'readOnly' | 'startSource' | 'startTarget';

export interface ShareState {
  readonly kind: ShareStateKind;
  readonly hold: ShareHold | null;
  readonly reason: ShareReason | null;
  readonly action: ShareAction | null;
  /** Writes made through the share may have been lost (said on every state it reaches). */
  readonly mayHaveLost: boolean;
  /** How soon to read the list again: fast while something is moving, slow otherwise. */
  readonly poll: 'fast' | 'slow';
  /** What the answer did not say, so the share cannot be called on: where it appears (an absent mount_path: it may be
   *  an old share that never mounts), or its end (it may already have expired). */
  readonly unknown: readonly ShareUnknown[];
}

export type ShareUnknown = 'mountPath' | 'expiry';

/** The one state a share row shows. Order: what the Hub is doing, what it cannot tell, then the stored state. */
export function shareState(row: ShareRow, ctx: ShareContext): ShareState {
  const reason = reasonOf(row.statusMessage);
  const lost = reason !== null && MAY_HAVE_LOST.has(reason);
  const unknown: ShareUnknown[] = [];
  if (row.mountPath === null) unknown.push('mountPath');
  if (!row.expiryKnown) unknown.push('expiry');
  const at = (kind: ShareStateKind, action: ShareAction | null, poll: 'fast' | 'slow' = 'slow', hold: ShareHold | null = null): ShareState =>
    ({ kind, hold, reason, action, mayHaveLost: lost, poll, unknown });
  if (ctx.hold) return at('sending', null, 'fast', ctx.hold);
  if (ctx.unsure) return at('unsure', 'checkAgain', 'fast');
  if (row.expiresAt !== null && row.expiresAt <= ctx.now) return at('expired', null);
  // A stored path the current rule never makes: the row predates it and the servers refuse to mount it.
  if (row.mountPath !== null && !mountPathOk(row.mountPath)) return at('legacy', 'shareAgain');
  if (row.status === 'other') return at('unreadable', null);
  if (row.status === 'failed') {
    return at('failed', reason !== null && READ_ONLY_FIX.has(reason) && row.mode === 'readwrite' ? 'readOnly' : 'tryAgain');
  }
  if (!row.enabled) return at('off', 'turnOn', reason === 'SWITCHED_OFF_DRAINING' ? 'fast' : 'slow');
  if (reason !== null) {
    if (WAITING.has(reason)) return at('waiting', null, 'fast');
    if (PAUSED_RW.has(reason)) return at('pausedRw', row.mode === 'readwrite' ? 'readOnly' : null);
    if (OWNER_DOWN.has(reason)) return at('ownerDown', null);
    if (HEALS_ALONE.has(reason)) return at('interrupted', null);
    return at('interrupted', READ_ONLY_FIX.has(reason) && row.mode === 'readwrite' ? 'readOnly' : 'tryAgain');
  }
  if (ctx.sourceRunning === false) return at('sourceStopped', 'startSource');
  if (row.targetType === 'computer' && ctx.targetRunning === false) return at('targetStopped', 'startTarget');
  // On only when the answer says where the share appears and when it ends; otherwise the Hub cannot tell.
  return at(unknown.length > 0 ? 'unclear' : 'on', null);
}
