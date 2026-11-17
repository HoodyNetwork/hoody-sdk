// The outcome of a send (C9). Only a definite answer is `done` or `failed`; a send the server may
// have applied without confirming is `pending` ("this may have gone through": never resend it,
// read back instead); `not_sent` was refused before leaving the browser; `stale` arrived after
// its context ended and was not applied. core/ produces these; the kit only shows them.
//
// What the kit does with each (Outcome line, Form lock, FormFooter, OutcomeSlot):
//   pending   locks the form and the action; the only action is "Check again", which reads back.
//   failed    a definite refusal: the action comes back, so sending again is allowed.
//   not_sent  nothing left the browser: the action comes back.
//   stale     the answer was dropped unseen: the action comes back.
//   done      a short "Saved"/"Done" where the action is, then the action returns.
import type { IconName } from './icons';
export type OutcomeKind = 'done' | 'pending' | 'failed' | 'not_sent' | 'stale';

/** The one icon per outcome, for every surface that shows one (banner, Outcome line). `pending` is a
 *  clock, never a warning: nothing is known to be wrong, it is not known yet. */
export const OUTCOME_ICON: Record<OutcomeKind, IconName> = {
  done: 'check-circle',
  pending: 'clock',
  failed: 'error',
  not_sent: 'info',
  stale: 'info',
};

export interface OutcomeLike {
  kind: OutcomeKind;
  /** Server code or short reason, already scrubbed by core. */
  code?: string;
  /** Optional detail text (already a resolved string). Under `pending` it is the page's own C9 guidance ("the computer did
   *  not confirm…"), shown as the body: never put refusal words there (a refusal is `failed`). */
  message?: string;
}

/**
 * Everything a page may hold as "the last result": a kit OutcomeLike, a bare kind, or core's
 * mutation `outcome` ('idle' | 'running' | 'read' | kind). Nothing to show is null/undefined.
 */
export type OutcomeInput = OutcomeLike | OutcomeKind | 'idle' | 'running' | 'read' | null | undefined;

const KINDS: ReadonlySet<string> = new Set<OutcomeKind>(['done', 'pending', 'failed', 'not_sent', 'stale']);

/** The outcome to show, or null for none ('idle', 'running' and 'read' show nothing). */
export function toOutcome(o: OutcomeInput): OutcomeLike | null {
  if (!o) return null;
  if (typeof o === 'string') return KINDS.has(o) ? { kind: o as OutcomeKind } : null;
  return KINDS.has(o.kind) ? o : null;
}

/** C9: an unknown outcome locks the form and its action until a read-back settles it. */
export function isUnknown(o: OutcomeInput): boolean {
  return toOutcome(o)?.kind === 'pending';
}

/** True while core reports the send in flight. */
export function isRunning(o: OutcomeInput): boolean {
  return o === 'running';
}

/** The parts of core's MutationHook the kit reads (structural, so the kit has no core type here). */
export interface MutationLike {
  readonly outcome: OutcomeInput;
  readonly running?: boolean;
  readBack?: () => Promise<void> | void;
}

export interface OutcomeProps {
  outcome: OutcomeLike | null;
  busy: boolean;
  onCheck?: () => Promise<void> | void;
}

/**
 * Spread a core mutation into a kit FormFooter, Form or OutcomeSlot:
 *   <FormFooter {...fromMutation(save)} onSubmit={…} />
 * `onCheck` is the mutation's read-back, never a resend.
 */
export function fromMutation(m: MutationLike): OutcomeProps {
  return {
    outcome: toOutcome(m.outcome),
    busy: Boolean(m.running) || m.outcome === 'running',
    ...(m.readBack ? { onCheck: () => m.readBack?.() } : {}),
  };
}
