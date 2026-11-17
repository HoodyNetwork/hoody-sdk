// How a send's or a read-back's answer moves the Checkout drawer: one pure mapping from the change outcome (C9: done |
// pending | not_sent | stale | failed) to a reducer event, shared by the fixture path and core's live machines.
import type { ErrorInfo } from '@core';
import type { OutcomeKind } from '@kit/outcome';
import { type CheckoutEvent, type CheckoutKind, type CheckoutResult, RETRY_AFTER_S } from './checkout-logic';
import { attemptWords, marketWords, refusalFromCode } from './logic';
import type { Word } from './types';

export interface Change<T = undefined> {
  outcome: OutcomeKind;
  data?: T;
  code?: string;
  /** The failed answer's allow-listed facts (core's errorInfo), for the failed outcome's Details. */
  info?: ErrorInfo;
}

export interface SendData extends Partial<CheckoutResult> {
  /** A support reference after a failure. */
  ref?: string | null;
  /** The server's re-quote after a price change. */
  totalCents?: number | null;
  /** The wallet balance the refusal saw. */
  balanceCents?: number | null;
}

const EMPTY_RESULT: CheckoutResult = {
  chargedCents: null,
  at: null,
  replayed: false,
  setupFailed: false,
  until: null,
  readyBy: null,
  ref: null,
};

export function resultOf(d: SendData | undefined): CheckoutResult {
  return {
    ...EMPTY_RESULT,
    ...d,
    replayed: d?.replayed === true,
    setupFailed: d?.setupFailed === true,
    ref: d?.ref ?? null,
  };
}

/**
 * `retryIn` is the machine's own countdown (a 429's Retry-After) for a reservation; without it a fixed wait stands in.
 */
export function settleEvent(kind: CheckoutKind, r: Change<SendData>, phase: 'send' | 'check', retryIn?: number): CheckoutEvent | null {
  const d = r.data;
  const market = kind === 'rent' || kind === 'reserve';
  switch (r.outcome) {
    case 'done': {
      const result = resultOf(d);
      return {
        type: phase === 'send' ? 'sent' : 'checkFound',
        kind: result.replayed ? 'already' : 'done',
        result,
      };
    }
    case 'pending':
      return phase === 'send' ? { type: 'unknown', retryIn: kind === 'reserve' ? (retryIn ?? RETRY_AFTER_S) : 0 } : { type: 'checkUnknown' };
    case 'not_sent':
    case 'stale':
      return phase === 'send'
        ? {
            type: 'notSent',
            word:
              r.outcome === 'not_sent' && r.code === 'noLocks'
                ? ({ k: 'noLocks' } as Word)
                : r.outcome === 'not_sent' && r.code === 'heldUpgrade'
                  ? ({ k: 'up.heldOther' } as Word)
                  : // The reason nothing was sent, in its own words where it has some; else the general line. A send
                    // given up because its account was no longer the live one ('expired') was not slow: the general line.
                    ((r.outcome === 'not_sent' && r.code !== undefined && r.code !== 'refused' && r.code !== 'expired' ? attemptWords({ reason: r.code }, kind === 'pay')?.word : undefined)
                    ?? attemptWords({ reason: 'refused', kind: 'unknown', notSent: true }, kind === 'pay')?.word
                    ?? ({ k: 'notSent' } as Word)),
          }
        : // Check again refused for want of Web Locks (another tab dropped the kept key): still unknown, with the reason.
          r.outcome === 'not_sent' && r.code === 'noLocks'
          ? { type: 'checkUnknown', word: { k: 'noLocks' } as Word }
          : { type: 'checkUnknown' };
    default: {
      if (phase === 'check') {
        // A read-back that finds nothing (rent) or a failure that proves the charge did not happen.
        if (r.code === 'NOT_FOUND') return { type: 'checkNotFound' };
        // An intent mismatch proves only that this request did not run: the earlier one may have been charged.
        if (r.code === 'IDEMPOTENCY_INTENT_MISMATCH') return { type: 'checkUnknown' };
        return { type: 'failed', word: { k: 'mkt.failedGeneric' }, ref: d?.ref ?? null, ...(r.info ? { info: r.info } : {}) };
      }
      const refusal = market
        ? marketWords(r.code, undefined, d?.totalCents)
        : (attemptWords(refusalFromCode(r.code), kind === 'pay') ?? { word: { k: 'buy.refused' } as Word });
      // A refused location goes back to the review too: its picker is where the person chooses another.
      if (refusal.requote || refusal.funds || refusal.gone || refusal.region) {
        return {
          type: 'refused',
          word: refusal.word,
          requote: refusal.requote ? (d?.totalCents ?? null) : null,
          short: refusal.funds,
          fresh: d?.balanceCents !== undefined ? { balanceCents: d.balanceCents } : undefined,
        };
      }
      return { type: 'failed', word: refusal.word, ref: d?.ref ?? null, ...(r.info ? { info: r.info } : {}) };
    }
  }
}

/**
 * Which answer a purchase machine's change is: a read-back (checking, or reconciling that found nothing) or a send.
 * A not-found read-back is "not confirmed", never a failure: the purchase may still exist (C9).
 */
export function purchasePhase(phase: string, r: Change<SendData>): 'send' | 'check' {
  return phase === 'checking' || (phase === 'reconciling' && r.code === 'NOT_FOUND') ? 'check' : 'send';
}
