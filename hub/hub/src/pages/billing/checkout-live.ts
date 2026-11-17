// The Checkout drawer on core's commerce machines (live pages). Core owns every money rule: the idempotency key is
// minted, stored and read back before a send and kept until a definitive answer; an unknown outcome is never resent
// under a new key, only replayed with the same one (buy / pay / upgrade) or read back (rent / reserve). This file only
// turns a machine's answers into the drawer's quote and events.
import { type commerce, commerceRules, type ErrorInfo } from '@core';
import type { CheckoutKind, CheckoutQuote, QuoteLine } from './checkout-logic';
import { cents, quoteBlock, type QuoteCap } from './logic';
import { placeName } from './plans-regions';
import { splitTerm } from './servers/logic';
import type { Change, SendData } from './settle';
import type { Word } from './types';

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec => (x && typeof x === 'object' ? (x as Rec) : {});
const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);
const count = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);

export interface QuoteEnv {
  /** The general wallet; null when it could not be read. */
  generalCents: number | null;
  /** Referral credit; 0 when there is none. Spent first on servers. */
  referralCents: number;
  /** What the purchase can spend: general + Referral credit; null while general is unknown. */
  spendableCents: number | null;
  /** The server an upgrade changes, for its warnings. */
  server: string;
  /** Buy a plan: the chosen location's name, when one is chosen (a "no room" quote is then about that location). */
  placeName?: string | null;
  /** Buy a plan: the location code the attempt asks for (a kept request's own); null: Automatic. */
  region?: string | null;
}

/** The wallet lines: the general wallet, then Referral credit when there is some (used first). */
function walletLine(env: QuoteEnv): QuoteLine[] {
  if (env.generalCents === null) return [];
  const general: QuoteLine = { label: 'buy.wallet', cents: env.generalCents };
  return env.referralCents > 0 ? [general, { label: 'buy.referral', cents: env.referralCents }] : [general];
}

/** A buy / pay / upgrade quote as the drawer shows it. */
export function attemptQuote(kind: CheckoutKind, q: commerce.AttemptQuote, env: QuoteEnv): CheckoutQuote {
  const charge = q.charge_cents;
  const first: QuoteLine =
    kind === 'upgrade'
      ? { label: 'co.upgradeDifference', cents: charge }
      : { label: 'co.plan', cents: kind === 'buy' ? (q.price_cents_per_month ?? charge) : charge };
  const notes: Word[] = kind === 'buy' ? [{ k: 'co.newServer' }] : [];
  const warnings: Word[] =
    kind === 'upgrade'
      ? [
          { k: 'up.downtime', v: { server: env.server } },
          { k: 'up.oneWay', v: { server: env.server } },
        ]
      : [];
  // A price that came back for another place than the one asked for is not this purchase's price: Confirm stays shut
  // until a new read names the place asked for. The words name what the answer said.
  // A price for a chosen place whose answer names no place it can read is not proven to be that place's price either.
  const place = kind === 'buy' ? commerceRules.paidPlace(q.region) : null;
  const elsewhere = kind === 'buy' && !!env.region && !!place && place.region !== env.region;
  const unread = kind === 'buy' && !!env.region && !place;
  return {
    chargeCents: charge,
    lines: [first, { label: 'buy.chargeNow', cents: charge, strong: true }, ...walletLine(env)],
    balanceCents: env.spendableCents,
    notes,
    blocked: elsewhere
      ? { k: 'loc.mismatch', v: { got: placeName(place), asked: env.placeName || String(env.region).toUpperCase() } }
      : unread
        ? { k: 'loc.unread', v: { asked: env.placeName || String(env.region).toUpperCase() } }
        : quoteBlock(q as { available?: unknown; cap?: QuoteCap | null }, kind === 'buy' ? env.placeName : null),
    warnings,
    // The quote's own place: the chosen location, or where Automatic would place the server right now.
    ...(kind === 'buy' ? { place } : {}),
  };
}

/** A rent / reserve quote from the listing row's own price maps. null: this term cannot be quoted. */
export function purchaseQuote(
  row: commerceRules.MarketRow,
  days: string,
  env: QuoteEnv,
  requote?: { days: string; totalCents: number } | null,
): CheckoutQuote | null {
  const q = commerceRules.quoteFor(row, days);
  if (!q || q.totalCents === null) return null;
  // The server's re-quote is the ceiling the next send carries: the summary shows it, not the listing's old total.
  if (requote && requote.days === days) {
    return {
      chargeCents: requote.totalCents,
      lines: [{ label: 'mkt.bdTotal', cents: requote.totalCents, strong: true }, ...walletLine(env)],
      balanceCents: env.spendableCents,
      notes: [{ k: 'co.ceiling', v: { amount: cents(requote.totalCents) } }, { k: row.kind === 'offer' ? 'mkt.preorderProtect' : 'mkt.noRefunds' }],
      blocked: null,
      warnings: [],
    };
  }
  // The inspector's split (a stock tier's setup is its total less the rental); a part that cannot be derived is left out.
  const { rental, setup } = splitTerm({ priceCents: q.priceCents, feeCents: q.feeCents, totalCents: q.totalCents });
  const lines: QuoteLine[] = [
    ...(rental !== null ? [{ label: 'mkt.bdRental', cents: rental } as const] : []),
    ...(setup !== null ? [{ label: 'mkt.bdSetup', cents: setup } as const] : []),
    { label: 'mkt.bdTotal', cents: q.totalCents, strong: true },
    ...walletLine(env),
  ];
  return {
    chargeCents: q.totalCents,
    lines,
    balanceCents: env.spendableCents,
    notes: [{ k: 'co.ceiling', v: { amount: cents(q.totalCents) } }, { k: row.kind === 'offer' ? 'mkt.preorderProtect' : 'mkt.noRefunds' }],
    blocked: null,
    warnings: [],
  };
}

/** One buy / pay / upgrade answer as a change outcome (C9): only a definitive refusal is `failed`. */
export function attemptChange(r: commerce.AttemptConfirm, errorCode: string | null, info?: ErrorInfo | null): Change<SendData> {
  if (r.ok) {
    const op = rec(r.result.operation);
    const sub = rec(r.result.subscription);
    return {
      outcome: 'done',
      data: {
        // The real debit of the operation; the ceiling is only what the person authorised and may be higher.
        chargedCents: count(op.charge_cents),
        at: str(op.created_at) ?? str(op.at),
        replayed: r.result.replayed,
        setupFailed: r.result.failed,
        ref: str(op.id) ?? str(sub.id),
        until: str(sub.paid_through),
        place: commerceRules.paidPlace(sub.region),
      },
    };
  }
  // An earlier retained attempt was adopted, or the kept one a resend was for vanished (answered or dropped
  // elsewhere): either may have been charged, so it is unknown, never "nothing charged".
  if (r.reason === 'unknown' || r.reason === 'adopted' || r.reason === 'gone') return { outcome: 'pending' };
  // No Web Locks in this browser: nothing was sent, and the drawer says why.
  if (r.reason === 'noLocks') return { outcome: 'not_sent', code: 'noLocks' };
  // Another upgrade of this server, to another plan, is stored and unresolved: nothing was sent, and the drawer says why.
  if (r.reason === 'heldUpgrade') return { outcome: 'not_sent', code: 'heldUpgrade' };
  // Nothing was sent, and why (took too long, the request could not be saved, the account changed…): the drawer words it.
  if (r.notSent || !r.definitive) return { outcome: 'not_sent', code: r.reason };
  return { outcome: 'failed', code: errorCode ?? undefined, ...(info ? { info } : {}) };
}

/** A rent / reserve machine state as a change outcome; null while nothing has settled. */
export function purchaseChange(s: commerce.PurchaseSnapshot): Change<SendData> | null {
  switch (s.state) {
    case 'confirmed': {
      const rc = rec(s.receipt);
      const rental = rec(rc.rental);
      return {
        outcome: 'done',
        data: {
          chargedCents: count(rental.total_paid_cents) ?? count(rc.total_paid_cents) ?? count(rc.charge_cents),
          at: str(rc.created_at) ?? str(rental.created_at),
          replayed: s.replayed,
          readyBy: str(rc.ready_by) ?? str(rental.ready_by),
        },
      };
    }
    case 'indeterminate':
      return { outcome: 'pending' };
    case 'not-found':
      return { outcome: 'failed', code: 'NOT_FOUND' };
    case 'failed': {
      const f = s.failure;
      return {
        outcome: 'failed',
        code: f?.code ?? undefined,
        ...(f?.info ? { info: f.info } : {}),
        data: { totalCents: f?.requoteCents ?? null, balanceCents: f?.availableCents ?? undefined },
      };
    }
    default:
      return null;
  }
}
