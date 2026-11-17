// The manager's record shapes. Internal: approver.ts and approver-settle.ts only.
import type { Attempt } from './approver-custody';
import type { T } from './approver-timing';
import type { ApproverHandle, ApproverRef } from './approver-types';

export type Why = 'none' | 'elsewhere' | 'failing' | 'gone';
export type Ctl = 'N' | 'Q' | 'P' | 'H' | 'X' | 'E' | 'F' | 'G';
/** A request waiting for its record's one outstanding slot: it is made, but its ticket is not minted until it reaches the head. */
export interface Queued { a: Attempt; send(r: Rec, a: Attempt): void }
export interface Rec {
  key: string; ref: ApproverRef; hs: Set<Handle>; why: Why; refusedAt?: number; fails: number;
  /** The one acquire/PATCH on the wire for this record (null when none) and the ones waiting behind it, in order. */
  out: Attempt | null; q: Queued[];
  acq: Attempt | null; retry: T | null; newest: number; lastEpoch: string | null; lastEpochSeq: number; last: string;
}
export interface Tm { renewAt: T | null; lapse: T | null; probeRetry: T | null; delRetry: T | null }
export interface Handle extends ApproverHandle { _sid: string | null; _open: boolean; _strict: boolean; _acct: string; _acctEpoch: number; _mgr: number; _ref: ApproverRef; _bound: boolean }
