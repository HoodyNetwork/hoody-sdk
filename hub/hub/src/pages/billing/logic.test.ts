// Vitest: the billing page's pure rules (money, bonus, payment return, state words, refusals, top-up, plans).
import strings from './strings.en.json';
import { describe, expect, it } from 'vitest';
import {
  amountFits,
  attemptWords,
  bonusView,
  cents,
  centsFromUsd,
  marketWords,
  methodsFor,
  normalizeAmount,
  presets,
  quoteBlock,
  refusalFromCode,
  returnView,
  stateChip,
  stateWords,
  topupWords,
  upgradeWords,
  usd,
} from './logic';

describe('money', () => {
  it('shows USD strings and integer cents only; anything else is a dash', () => {
    expect(usd('12.50')).toBe('$12.50');
    for (const bad of ['12.5', '-1.00', '1e3', '012.00', '', null, 12.5, '12.50 ']) expect(usd(bad)).toBe('—');
    expect(cents(1250)).toBe('$12.50');
    expect(cents(5)).toBe('$0.05');
    for (const bad of [-1, 1.5, '100', null, Number.NaN, Infinity]) expect(cents(bad)).toBe('—');
  });
  it('groups thousands in whole dollars, never the cents', () => {
    expect(usd('1234.50')).toBe('$1,234.50');
    expect(usd('999.99')).toBe('$999.99');
    expect(usd('1000000.00')).toBe('$1,000,000.00');
    expect(cents(123450)).toBe('$1,234.50');
    expect(cents(99999)).toBe('$999.99');
    expect(cents(100000)).toBe('$1,000.00');
    expect(cents(123456789012)).toBe('$1,234,567,890.12');
  });
  it('converts a USD string to cents and normalises typed amounts', () => {
    expect(centsFromUsd('12.50')).toBe(1250);
    expect(centsFromUsd('nope')).toBeNull();
    expect(normalizeAmount('12.5')).toBe('12.50');
    expect(normalizeAmount('7')).toBe('7.00');
    expect(normalizeAmount('1e3')).toBeNull();
    expect(normalizeAmount('-4')).toBeNull();
  });
});

describe('GitHub bonus', () => {
  it('draws nothing when the user cannot take part', () => {
    expect(bonusView(null)).toBeNull();
    expect(bonusView({ enabled: false })).toBeNull();
    expect(bonusView({ enabled: true, github_linked: false })).toBeNull();
  });
  it('offers a claim, and a failure keeps it as a retry', () => {
    const st = {
      enabled: true,
      github_linked: true,
      amount_usd: '5.00',
      github_username: 'octo',
    };
    expect(bonusView(st)).toMatchObject({
      claim: true,
      retry: false,
      user: 'octo',
    });
    const rate = bonusView(st, { result: 'rate_limited' });
    expect(rate).toMatchObject({ retry: true, cooling: true });
    expect(bonusView(st, { result: 'retry' })).toMatchObject({
      retry: true,
      cooling: false,
    });
  });
  it('closes the offer on a final answer and on a claimed bonus', () => {
    const st = { enabled: true, github_linked: true, amount_usd: '5.00' };
    expect(bonusView(st, { result: 'granted', amount_usd: '5.00' })?.badge?.tone).toBe('ok');
    expect(bonusView(st, { result: 'offer_ended' })?.claim).toBeUndefined();
    expect(
      bonusView({
        claimed: true,
        claim: { amount_usd: '5.00', at: '2026-10-01T00:00:00Z' },
      })?.lines[0]?.k,
    ).toBe('bonus.ghBonusClaimedOn');
  });
});

describe('a malformed claimed flag is never shown as claimed', () => {
  it('only claimed === true draws the claimed card (the proof reads the same rule)', () => {
    for (const claimed of ['false', 'true', 1, {}, [], 'yes']) {
      const v = bonusView({ enabled: true, github_linked: true, amount_usd: '5.00', claimed } as never);
      expect(v?.badge?.tone).not.toBe('ok');
      expect(JSON.stringify(v?.lines ?? [])).not.toMatch(/Claimed|Granted/);
    }
    expect(bonusView({ claimed: true } as never)?.badge?.tone).toBe('ok');
  });
});

describe('payment return', () => {
  it('ends the stash only on received, review and failed; the rest can be checked again', () => {
    expect(returnView({ state: 'received' })).toMatchObject({
      tone: 'ok',
      terminal: true,
      refresh: false,
    });
    expect(returnView({ state: 'failed' }).terminal).toBe(true);
    for (const state of ['cancelled', 'processing', 'unverified'] as const) {
      expect(returnView({ state })).toMatchObject({
        terminal: false,
        refresh: true,
      });
    }
    expect(returnView(null)).toMatchObject({
      busy: true,
      refresh: false,
      terminal: false,
    });
  });
});

describe('subscription state words', () => {
  it('names each state, and an unknown one gets the generic word', () => {
    expect(stateWords({ state: 'active' }).k).toBe('subs.stActive');
    expect(stateWords({ state: 'past_due' }).k).toBe('subs.stPastDue');
    expect(
      stateWords({
        state: 'past_due',
        active_operation_id: 'o',
        auto_renew: false,
      }).k,
    ).toBe('subs.stStoppingOff');
    expect(stateWords({ state: 'held', delete_at: null, active_operation_id: 'o' }).k).toBe('subs.stResuming');
    expect(stateWords({ state: 'held', delete_at: null }).k).toBe('subs.stResumeFailed');
    expect(stateWords({ state: 'held', delete_at: '2026-11-01T00:00:00Z' }).k).toBe('subs.stHeld');
    expect(stateWords({ state: 'nope' as never }).k).toBe('subs.stOther');
  });
  it('keeps the chip to one word', () => {
    expect(stateChip({ state: 'active' }).k).toBe('subs.chipActive');
    expect(stateChip({ state: 'past_due' }).k).toBe('subs.chipUnpaid');
    expect(stateChip({ state: 'held', delete_at: '2026-11-01T00:00:00Z' }).k).toBe('subs.chipOnHold');
  });
});

describe('plans', () => {
  it('blocks a quote marked unavailable: the limit when the cap is used up, else no room', () => {
    expect(quoteBlock({ available: true })).toBeNull();
    expect(quoteBlock({ available: false, cap: { max: 2, used: 2 } })).toEqual({
      k: 'buy.limit',
      v: { max: 2 },
    });
    expect(quoteBlock({ available: false })).toEqual({ k: 'buy.noRoom' });
  });

  // A token limited to realms gets cap {max, reached} without `used` (the count spans every realm). `reached` decides
  // the limit first; a missing count is never read as 0 used.
  it('reads cap.reached first: at the limit even with no used count, or with a count that says otherwise', () => {
    expect(quoteBlock({ available: false, cap: { max: 2, reached: true } })).toEqual({ k: 'buy.limit', v: { max: 2 } });
    expect(quoteBlock({ available: false, cap: { max: 2, used: 0, reached: true } })).toEqual({ k: 'buy.limit', v: { max: 2 } });
    expect(quoteBlock({ available: false, cap: { reached: true } })).toEqual({ k: 'limitPlain' });
    expect(quoteBlock({ available: false, cap: { max: -1, reached: true } })).toEqual({ k: 'limitPlain' });
  });
  it('reached false: under the limit, so an unavailable quote is no room, whatever used says', () => {
    expect(quoteBlock({ available: false, cap: { max: 2, reached: false } })).toEqual({ k: 'buy.noRoom' });
    expect(quoteBlock({ available: false, cap: { max: 2, used: 2, reached: false } })).toEqual({ k: 'buy.noRoom' });
  });
  it('no reached flag: the counts decide only when both are there; a missing count is unknown, never 0 used', () => {
    expect(quoteBlock({ available: false, cap: { max: 2, used: 1 } })).toEqual({ k: 'buy.noRoom' });
    expect(quoteBlock({ available: false, cap: { max: 2, used: 3 } })).toEqual({ k: 'buy.limit', v: { max: 2 } });
    expect(quoteBlock({ available: false, cap: { max: 2 } })).toEqual({ k: 'buy.notNow' });
    expect(quoteBlock({ available: false, cap: { max: 2, used: null } })).toEqual({ k: 'buy.notNow' });
    expect(quoteBlock({ available: false, cap: { max: 2, reached: 'true' } })).toEqual({ k: 'buy.notNow' });
    expect(quoteBlock({ available: false, cap: {} })).toEqual({ k: 'buy.notNow' });
  });
  it('a limit of 0 never reads as "your limit of 0 paid servers": the plain words', () => {
    expect(quoteBlock({ available: false, cap: { max: 0, reached: true } })).toEqual({ k: 'limitPlain' });
    expect(quoteBlock({ available: false, cap: { max: 0, used: 0 } })).toEqual({ k: 'limitPlain' });
  });
  it('an unavailable quote is always blocked, whatever its cap looks like (the words never open the gate)', () => {
    const caps: unknown[] = [undefined, null, {}, { max: 0 }, { max: 0, reached: true }, { max: 2, used: 9, reached: false }, { reached: 'yes' }, { max: 'x', used: 'y' }, 7, 'cap'];
    for (const cap of caps) expect(quoteBlock({ available: false, cap: cap as never }), JSON.stringify(cap)).not.toBeNull();
  });
  it('an available quote is never blocked, whatever the cap says', () => {
    expect(quoteBlock({ available: true, cap: { max: 2, reached: true } })).toBeNull();
    expect(quoteBlock({ cap: { max: 2, reached: true } })).toBeNull();
    expect(quoteBlock(null)).toBeNull();
  });
  it('has words for every blocked state', () => {
    for (const k of ['buy.limit', 'limitPlain', 'buy.noRoom', 'buy.notNow'] as const) expect(typeof strings[k]).toBe('string');
  });
});

describe('refusals', () => {
  it('maps nothing-sent reasons to our own words', () => {
    expect(attemptWords({ reason: 'accountChanged' }, false)?.word.k).toBe('buy.accountChanged');
    expect(attemptWords({ reason: 'account' }, true)?.word.k).toBe('subs.accountChanged');
    expect(attemptWords({ reason: 'timeout' }, false)?.word.k).toBe('notSentSlow');
    expect(attemptWords({ reason: 'unquoted' }, false)).toMatchObject({
      requote: true,
    });
    expect(attemptWords({ reason: 'busy' }, false)).toBeNull();
    expect(attemptWords({ reason: 'consent' }, false)).toBeNull();
  });
  it('maps definitive refusals by kind', () => {
    const w = (kind: string, pay = false, rec = false) => attemptWords({ reason: 'refused', kind }, pay, rec);
    expect(w('funds')).toMatchObject({ funds: true });
    expect(w('priceChanged')).toMatchObject({ requote: true });
    expect(w('gone')).toMatchObject({ gone: true });
    expect(w('limit')?.word.k).toBe('buy.limitRefused');
    expect(w('capacity')?.word.k).toBe('buy.noRoomRefused');
    expect(w('permission', true, true)?.word.k).toBe('subs.recoveryNoPermission');
    expect(w('refused', true)?.word.k).toBe('subs.payRefused');
    expect(w('refused')?.word.k).toBe('buy.refused');
  });
  it('says what happened to the money on every refusal after Confirm', () => {
    const said = (k: string) => (strings as Record<string, string>)[k] ?? '';
    for (const kind of ['funds', 'priceChanged', 'gone', 'limit', 'capacity', 'regionFull', 'regionUnknown', 'rate', 'permission', 'refused'])
      for (const [pay, rec] of [[false, false], [true, false], [true, true]] as const) {
        const k = attemptWords({ reason: 'refused', kind }, pay, rec)!.word.k;
        expect(said(k), `${kind} ${pay} ${rec}: ${k}`).toMatch(/nothing was charged/i);
      }
    expect(said(upgradeWords({ reason: 'refused', kind: 'refused', code: 'X' })!.word.k)).toMatch(/nothing was charged/i);
    for (const code of ['CHARGE_EXCEEDS_MAX', 'INVALID_DURATION', 'INSUFFICIENT_BALANCE', 'OUT_OF_STOCK', 'OFFER_UNAVAILABLE', 'SERVER_UNAVAILABLE', 'PRICING_INVALID', 'NO_PRICING', 'RATE_LIMITED'])
      for (const total of [1200, null]) expect(said(marketWords(code, undefined, total).word.k), code).toMatch(/nothing was charged/i);
    // A charge the page has not read back never claims what the balance shows: it says where to look.
    for (const [k, v] of Object.entries(strings as Record<string, string>)) expect(v, k).not.toMatch(/already includes|balance .{0,40}includes (it|the charge)/i);
    expect(said('held.settledBody')).not.toMatch(/balance/i);
    expect(said('held.settledBody')).toMatch(/contact support before purchasing again/i);
    // The plan card's blocked line is shown before any purchase: it never talks about a charge.
    for (const k of ['buy.limit', 'limitPlain', 'buy.noRoom']) expect(said(k)).not.toMatch(/charged/i);
  });
  it('turns server codes into refusal kinds', () => {
    expect(refusalFromCode('INSUFFICIENT_BALANCE').kind).toBe('funds');
    expect(refusalFromCode('CHARGE_EXCEEDS_MAX').kind).toBe('priceChanged');
    expect(refusalFromCode(undefined, 429).kind).toBe('rate');
    expect(refusalFromCode(undefined, 403).kind).toBe('permission');
    expect(refusalFromCode('WHATEVER').kind).toBe('refused');
  });
  it('reads an upgrade again only when a fresh read is the one true answer', () => {
    const w = (code: string) =>
      upgradeWords({
        reason: 'refused',
        code,
        kind: refusalFromCode(code).kind,
      });
    expect(w('PLAN_CHANGE_NOT_UPGRADE')).toMatchObject({ reread: true });
    expect(w('SUBSERVER_DORMANT')).toMatchObject({ reread: true });
    expect(w('PLAN_NOT_AVAILABLE')).toMatchObject({ reread: true });
    expect(w('SUBSCRIPTION_PERIOD_ENDED')).toMatchObject({ pay: true });
    expect(w('SOMETHING_ELSE')?.word.k).toBe('up.refused');
    expect(w('INSUFFICIENT_BALANCE')).toMatchObject({ funds: true });
  });
});

describe('top-up', () => {
  const av = {
    methods: [
      { key: 'card', min: 5, max: 1000 },
      { key: 'crypto', min: 20, max: 10000 },
      { key: 'other', min: 1, max: 2 },
    ],
  } as never;
  it('offers only card and crypto, presets a method accepts, and bounds the amount by the method', () => {
    expect(methodsFor(av).map((m) => m.key)).toEqual(['card', 'crypto']);
    expect(presets([{ key: 'crypto', min: 20, max: 60 }] as never)).toEqual([20, 50]);
    expect(amountFits('25.00', { key: 'card', min: 5, max: 1000 } as never)).toBe(true);
    expect(amountFits('4.99', { key: 'card', min: 5, max: 1000 } as never)).toBe(false);
    expect(amountFits('0.00', { key: 'card', min: 0, max: 1000 } as never)).toBe(false);
    expect(amountFits(null, { key: 'card', min: 5, max: 1000 } as never)).toBe(false);
  });
  it('never shows the server words', () => {
    expect(topupWords({ code: 'PAYMENT_IDEMPOTENCY_KEY_REUSED' })).toMatchObject({ rekey: true });
    expect(topupWords({ code: 'BAD_CHECKOUT_URL' }).word.k).toBe('top.badUrl');
    expect(topupWords({ pending: true })).toMatchObject({ unknown: true });
    expect(topupWords({ status: 500 }).word.k).toBe('top.failed');
    expect(topupWords({ code: 'FRAMED_ACTION_REFUSED', framed: true, notSent: true } as never).word.k).toBe('top.framed');
  });
});

import { autoRenewProves, claimProves } from './data';
import { settleEvent } from './settle';

describe('what proves a held change', () => {
  const sub = (auto_renew: boolean) => [{ subs: [{ id: 's1', auto_renew }], partial: null }];
  it('auto-renew: a row still showing the old value proves nothing, the sent value proves it', () => {
    expect(autoRenewProves({ id: 's1', auto_renew: true }, [sub(false)])).toBeUndefined();
    expect(autoRenewProves({ id: 's1', auto_renew: true }, [sub(true)])).toBe('applied');
    expect(autoRenewProves({ id: 'gone', auto_renew: true }, [sub(true)])).toBeUndefined();
    expect(autoRenewProves({ id: 's1', auto_renew: true }, [])).toBeUndefined();
  });
  it('bonus: only a claimed offer proves the claim', () => {
    expect(claimProves(undefined, [[{ claimed: false }]])).toBeUndefined();
    expect(claimProves(undefined, [[null]])).toBeUndefined();
    expect(claimProves(undefined, [[{ claimed: true }]])).toBe('applied');
  });
});

describe('a held money change is freed only by an applied proof', () => {
  const sub = (auto_renew: unknown) => [{ subs: [{ id: 's1', auto_renew }], partial: null }];
  const id = { id: 's1', auto_renew: true };
  it('the old value never frees the hold, however late the read (no not_applied proof)', () => {
    // A third argument a future core might pass (finished long ago, read much later) changes nothing.
    const late = { finishedAt: 1, readStartedAt: 1e12 };
    for (const extra of [[], [late]] as const) {
      expect((autoRenewProves as (...a: unknown[]) => unknown)(id, [sub(false)], ...extra)).toBeUndefined();
      expect((claimProves as (...a: unknown[]) => unknown)(undefined, [[{ claimed: false }]], ...extra)).toBeUndefined();
    }
  });
  it('a missing or malformed field keeps the hold', () => {
    for (const bad of [undefined, null, 'false', 0, 1, {}]) expect(autoRenewProves(id, [sub(bad)])).toBeUndefined();
    expect(autoRenewProves({ id: 's1' }, [sub(true)])).toBeUndefined();
    expect(autoRenewProves({ id: 's1', auto_renew: 'true' }, [sub('true')])).toBeUndefined();
    expect(autoRenewProves({ id: 'gone', auto_renew: false }, [sub(false)])).toBeUndefined();
    expect(autoRenewProves(id, [])).toBeUndefined();
    for (const bad of [{}, { claimed: 'true' }, { claimed: 1 }, { claimed: null }, null, undefined])
      expect(claimProves(undefined, [[bad]])).toBeUndefined();
    expect(claimProves(undefined, [[]])).toBeUndefined();
  });
  it('the sent value still proves applied', () => {
    expect(autoRenewProves(id, [sub(true)])).toBe('applied');
    expect(autoRenewProves({ id: 's1', auto_renew: false }, [sub(false)])).toBe('applied');
    expect(claimProves(undefined, [[{ claimed: true }]])).toBe('applied');
  });
});

describe('an idempotency intent refusal', () => {
  it('never reads as "nothing was charged"', () => {
    const w = JSON.stringify(strings['buy.adopted']);
    expect(w).not.toMatch(/nothing was charged|not charged/i);
    expect(w).toMatch(/unknown/i);
  });
});

describe('a read-back refused with an intent mismatch', () => {
  it('stays unknown, never the generic "nothing appears to have been charged" failure', () => {
    expect(settleEvent('buy', { outcome: 'failed', code: 'IDEMPOTENCY_INTENT_MISMATCH' }, 'check')).toEqual({ type: 'checkUnknown' });
    expect(settleEvent('buy', { outcome: 'failed', code: 'SOMETHING_ELSE' }, 'check')?.type).toBe('failed');
  });
});
