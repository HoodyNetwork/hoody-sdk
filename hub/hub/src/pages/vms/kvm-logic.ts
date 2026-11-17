// Pure rules of the KVM switch (Run VMs on a computer): no React, no I/O.
//
// Contract, in plain words:
//   - kvmFactsOf reads a computer's row from the Hoody API list as logic.ts hostFactsOf does, plus the raw status: the API
//     changes KVM only while the status is exactly `stopped` (a paused computer is not stopped there).
//   - Turning on and turning off are gated apart. Turning on is refused here only on what the row proves: expired, a
//     shared server, or a bare-metal server that says it allows no VMs. A server kind or support that is not known never
//     blocks: the API decides and its refusal is shown. Turning off is always offered.
//   - kvmAction says what a press does: change it now (stopped), stop the computer first (running or paused, a separate
//     press the person confirms), or wait (starting, creating, failed: neither works now). A row that does not say
//     whether KVM is on offers nothing.
//   - kvmVerdict is the proof of a KVM change on a fresh computers list: the row shows the asked value. Anything else
//     proves nothing (the old value is what a read shows whether or not the request arrived).
//   - kvmRefusal names a definite refusal of the API in the page's words; null leaves the kit's general words.
import type { ComputerState } from '@core';
import { hostFactsOf, type HostFacts } from './logic';

/** A read-back's verdict on a change (core's ReadVerdict, the `proves` answer). */
export type ReadVerdict = 'applied' | 'not_applied' | undefined;

export interface KvmFacts extends HostFacts {
  /** The row's status, lower case ('' when it has none). */
  readonly status: string;
}

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A computer's KVM facts from its list row, or null when the row is not readable. */
export function kvmFactsOf(row: unknown, state: ComputerState, planKind: 'paid' | 'bare_metal' | 'free' | null): KvmFacts | null {
  const f = hostFactsOf(row, state, planKind);
  if (!f) return null;
  const s = rec(row)?.status;
  return { ...f, status: typeof s === 'string' ? s.toLowerCase() : '' };
}

/** Why KVM cannot be turned on for a computer. */
export type KvmBlock = 'expired' | 'shared' | 'notAllowed';

/** Why turning KVM on is refused by what the row proves, or null (the API decides). */
export function turnOnBlock(f: Pick<KvmFacts, 'expired' | 'kind' | 'kvmSupported'>): KvmBlock | null {
  if (f.expired) return 'expired';
  if (f.kind === 'shared') return 'shared';
  if (f.kind === 'bare_metal' && f.kvmSupported === false) return 'notAllowed';
  return null;
}

/** What a press can do now: `set` changes KVM (the computer is stopped), `stopFirst` asks to stop the computer, `wait`
 *  does nothing until the computer is stopped or running. */
export type KvmStep = 'set' | 'stopFirst' | 'wait';
export function kvmStep(status: string): KvmStep {
  if (status === 'stopped') return 'set';
  if (status === 'running' || status === 'paused') return 'stopFirst';
  return 'wait';
}

export type KvmAction =
  /** The row does not say whether KVM is on: nothing is offered. */
  | { readonly kind: 'none' }
  /** KVM is off and cannot be turned on. */
  | { readonly kind: 'blocked'; readonly reason: KvmBlock }
  /** Turn it on (want true) or off, by `step`. */
  | { readonly kind: 'turn'; readonly want: boolean; readonly step: KvmStep };

export function kvmAction(f: Pick<KvmFacts, 'kvm' | 'expired' | 'kind' | 'kvmSupported' | 'status'>): KvmAction {
  if (f.kvm === null) return { kind: 'none' };
  const want = !f.kvm;
  if (want) {
    const b = turnOnBlock(f);
    if (b) return { kind: 'blocked', reason: b };
  }
  return { kind: 'turn', want, step: kvmStep(f.status) };
}

/** A KVM change's identity in the computer's lifecycle lock (the lock is shared with start and stop). */
export interface KvmIdentity { readonly computer: string; readonly op: 'kvm'; readonly kvm: boolean }
export const isKvmIdentity = (v: unknown): v is KvmIdentity => {
  const r = rec(v);
  return !!r && r.op === 'kvm' && typeof r.computer === 'string' && typeof r.kvm === 'boolean';
};

/** What a fresh computers list proves about a KVM change: applied when the computer's row shows the asked value. */
export function kvmVerdict(identity: unknown, rows: readonly unknown[]): ReadVerdict {
  if (!isKvmIdentity(identity)) return undefined;
  const row = rows.map(rec).find((r) => r?.id === identity.computer);
  if (!row || typeof row.kvm !== 'boolean') return undefined;
  return row.kvm === identity.kvm ? 'applied' : undefined;
}

/** The page's sentence for a definite refusal of a KVM change (strings `kvm.err.*`). */
export type KvmRefusal =
  | 'notStopped' | 'busy' | 'unchecked' | 'notAvailable' | 'upgrade' | 'moved' | 'expired' | 'suspended' | 'forbiddenOn' | 'forbidden' | 'gone' | 'notSetUp' | 'setupFailed';

const BY_CODE: Readonly<Record<string, KvmRefusal>> = {
  OPERATION_STATE_CONFLICT: 'notStopped',
  COMPUTER_OPERATION_IN_PROGRESS: 'busy',
  KVM_CHANGE_IN_PROGRESS: 'busy',
  KVM_HOST_STATE_UNKNOWN: 'unchecked',
  KVM_NOT_AVAILABLE: 'notAvailable',
  KVM_HOST_UPGRADE_REQUIRED: 'upgrade',
  COMPUTER_CHANGED_DURING_REQUEST: 'moved',
  COMPUTER_EXPIRED: 'expired',
  ACCESS_SUSPENDED_TARGET: 'suspended',
  KVM_PROVISIONING_FAILED: 'setupFailed',
  COMPUTER_NOT_FOUND: 'gone',
};

/** The words for a definite refusal of a KVM change (turning on when `want`), or null for the kit's general words (a
 *  refusal the Hub made itself, a rate limit, a sign-in that ended). Codes first, then the status the API gives its
 *  uncoded refusals: 403 (owner, token, server rental: several causes, one sentence each way), 404, 400 (the server is
 *  not set up for it). */
export function kvmRefusal(e: unknown, want: boolean): KvmRefusal | null {
  const r = rec(e);
  if (!r) return null;
  const code = typeof r.code === 'string' ? r.code : '';
  if (BY_CODE[code]) return BY_CODE[code];
  if (r.status === 403 && (code === '' || code === 'INSUFFICIENT_PERMISSIONS' || code === 'Forbidden')) return want ? 'forbiddenOn' : 'forbidden';
  if (r.status === 404) return 'gone';
  if (r.status === 400) return 'notSetUp';
  return null;
}
