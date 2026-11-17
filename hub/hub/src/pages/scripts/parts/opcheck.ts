// Check again for a change the computer journals by operation id (write, restore, comments, env, saved tests, delete): the
// computer's own settle answers what became of that op, which no list proves. Shared by every place that sends such a change so
// each offers the same way out as the editor: settle first, then the change's read-back, then only the warned close.
//
// Two things are fixed when the send is made and never read again from the shell: the PLACE it was sent from (a Check made from
// any other place proves nothing about it and frees nothing of it), and the COMPUTER it was sent to (the settle goes there, never to
// the computer the shell shows by then: another computer would answer "never seen" for an op it was never sent).
import { showToast, useStrings } from '@kit';
import type { HeldRow } from '@core';
import { useCallback, useRef } from 'react';
import { useSettle } from '../data';
import { execOf, settleView } from '../logic';
import strings from '../strings.en.json';
import { ownHoldOf } from './ops';
/** Core's read-back of one held send: readBackNow({ hold }) (core/source.ts) reads back only the change holding that token; the
 *  hook's published type names only the bare form, and core/storage/runner.ts calls it the same way. */
type ReadBackOne = (only: { hold: string }) => Promise<boolean>;

type Release = { complete(vars: never, hold: string): Promise<boolean>; discard(vars: never, hold: string): Promise<boolean>; held?(): readonly HeldRow[] };

/** The send a Check concerns: its op, the mutation that sent it, the lock variables (never a value that may be a secret) and its hold. */
export interface OpSent {
  /** The computer the op was sent to (the page's own id of it). */
  compId: string;
  /** The Exec folder of the path it changed (null: none, and nothing is asked). */
  exec: number | null;
  opId: string;
  m: Release;
  vars: never;
  hold: Promise<string | undefined>;
}

/**
 * What a Check concerns, from the answer of a send: only a pending answer has one. The hold is the answer's own, else the one
 * held row of this path on the computer the send was made on (never a lookup by the computer the shell shows later).
 * `vars` are the lock variables only: never a value that may be a secret.
 */
export function sentOf(m: object, o: { compId: string; path: string; opId: string; vars: unknown }, r: { outcome?: string; hold?: string; code?: string } | null | undefined): OpSent | null | undefined {
  if (r?.outcome !== 'pending') return null;
  // A press core refused because an earlier change of this lock is still held (it answers "pending" with the refusal's code) sent
  // nothing under this op id: binding that id to the OLDER hold would let a Check fence an op that never ran and free a hold with
  // no proof. Nothing is recorded, and what was recorded for the older send stays.
  if (r.code === 'READ_BACK_FIRST' || r.code === 'BUSY' || r.code === 'HELD_BY_OTHER') return undefined;
  const rel = m as Release;
  return { compId: o.compId, exec: execOf(o.path), opId: o.opId, m: rel, vars: o.vars as never, hold: Promise.resolve(ownHoldOf(rel, o.path, o.compId, r.hold)) };
}

export type OpVerdict = 'done' | 'not_sent' | 'failed' | 'unknown';
/** A Check's answer: a proved refusal carries its own code, so a toast never names another Check's. */
type OpProof = { verdict: 'failed'; code: string } | { verdict: Exclude<OpVerdict, 'failed'> };

export function useOpCheck() {
  const t = useStrings(strings);
  const settle = useSettle();
  const sent = useRef<{ rec: OpSent; scope: string } | null>(null);
  /** Remember the send that just answered pending, with the place it was sent from (null: nothing to check by op). */
  const remember = useCallback((rec: OpSent | null | undefined, scope = '') => { if (rec === undefined) return; sent.current = rec ? { rec, scope } : null; }, []);
  /**
   * Ask the computer the op was sent to what became of it. Only a proving answer frees the send's own hold (complete when it
   * committed, discard when it never ran or was refused). Anything else is 'unknown' and frees nothing: a Check from another
   * place than the send's, a send replaced meanwhile, a hold that is gone or records no computer, an answer that proves nothing.
   */
  const prove = useCallback(async (scope: string): Promise<OpProof> => {
    const unknown = { verdict: 'unknown' } as const;
    const mem = sent.current;
    if (!mem || mem.scope !== scope) return unknown;
    const { rec } = mem;
    const hold = await rec.hold;
    if (!hold) return unknown;
    const target = rec.m.held?.().find((h) => h.hold === hold)?.target;
    if (!target || rec.exec === null) return unknown;
    // A settle is itself a guarded send: one whose own answer was lost stays held, and core refuses the next (READ_BACK_FIRST)
    // until a read-back proves it changed nothing. So this settle's own held send, if any, is read back first (only it: none
    // held reads nothing, and another settle's read-back is never waited for), then the op is asked again.
    const vars = { compId: rec.compId, opId: rec.opId, sentAfter: 0, target, exec: rec.exec };
    const own = await settle.holdOf(vars).catch(() => undefined);
    if (own) await (settle.readBack as ReadBackOne)({ hold: own }).catch(() => false);
    const r = await settle.mutateAsync(vars).catch(() => null);
    if (sent.current !== mem) return unknown;
    const v = settleView(r?.data ?? null);
    if (v.state === 'done') {
      await rec.m.complete(rec.vars, hold);
      // A send remembered while this hold was being freed is its own: only this Check's send is forgotten.
      if (sent.current === mem) sent.current = null;
      return { verdict: 'done' };
    }
    if (v.state === 'not_sent' || v.state === 'failed') {
      await rec.m.discard(rec.vars, hold);
      if (sent.current === mem) sent.current = null;
      return v.state === 'failed' ? { verdict: 'failed', code: v.code } : { verdict: 'not_sent' };
    }
    return unknown;
  }, [settle]);
  const check = useCallback(async (scope = ''): Promise<OpVerdict> => (await prove(scope)).verdict, [prove]);
  /**
   * The Check again of one place: the op's settle first; a proof ends the banner (and runs `after` on a committed op); no proof
   * falls back to the place's own read-back, and without one the change stays pending with its warned close.
   * A refusal the computer answered is a failure: an error toast that names its code and its fix, which is the place's own send:
   * the banner it ends leaves that place's controls live again. A place with no send left after the refusal (the saved-tests step
   * of a script delete, whose page closes) passes `refusedBody`, a sentence that says what stays instead. Never sent is a warning:
   * nothing happened.
   */
  const checkWith = useCallback(async (scope: string, end: () => void, readBack: () => Promise<unknown>, after?: () => void, refusedBody: 'check.failedFix' | 'check.failedTests' = 'check.failedFix'): Promise<void> => {
    const p = await prove(scope);
    const v = p.verdict;
    if (v === 'done') {
      end();
      after?.();
    } else if (p.verdict === 'failed') {
      end();
      showToast({
        title: t('check.failed'),
        body: t(refusedBody, { code: p.code }),
        tone: 'error',
        /* noDetails: the settle answer is a decided refusal that carries only its code, which the sentence names (core's Details keep declared codes only) */
      });
    } else if (v === 'not_sent') {
      end();
      showToast({ title: t('check.notSent'), tone: 'warn' /* noDetails: the computer proved the change never ran; nothing was sent, so there is no rejection */ });
    } else {
      await readBack();
    }
  }, [prove, t]);
  return { remember, check, checkWith };
}
