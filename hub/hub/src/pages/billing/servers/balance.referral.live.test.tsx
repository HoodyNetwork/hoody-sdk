// Vitest: the Market's wallet read counts Referral credit as the server spends it.
// Renting or reserving a server spends Referral credit first, then the general wallet (the API checks
// reward + balance), so the Market's "enough / short by"
// compares the total with general + referral_credit. What is owed is never counted. A missing referral_credit counts
// as 0, and so does one that is not a D.CC amount (never a guessed amount, C9); a missing general balance stays a
// failed read whatever Referral credit says. The select also keeps the split (general, referral) for the Detail's
// two lines. Through the real core and the
// page's own selector (the page fixtures answer after the selector, so they cannot prove it).
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import { useBalance } from './data';
import { shortfall } from './logic';

function Probe() {
  const balance = useBalance();
  return <p data-testid="balance">{balance.data ? JSON.stringify(balance.data) : balance.isError ? 'error' : 'pending'}</p>;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

async function read(data: Record<string, unknown>): Promise<string> {
  boot();
  queryClient.clear();
  onFetch((c) => (c.url.includes('/wallet/balances') ? { status: 200, body: { statusCode: 200, data } } : { status: 200, body: { data: [] } }));
  const r = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(flush);
  const text = screen.getByTestId('balance').textContent ?? '';
  r.unmount();
  return text;
}

const cents = (text: string): number | string => (text.startsWith('{') ? (JSON.parse(text) as { cents: number }).cents : text);

describe('market balance read: Referral credit', () => {
  beforeEach(() => queryClient.clear());

  it('referral_credit_covers_charge: general 5.00 + Referral credit 10.00 is 1500 cents, enough for 12.00', async () => {
    const text = await read({ general_balance: '5.00', referral_credit: '10.00', referral_credit_owed: '0.00' });
    expect(JSON.parse(text)).toEqual({ general: 500, referral: 1000, cents: 1500 });
    expect(shortfall(1500, 1200)).toEqual({ ok: true });
  });

  it('partial_shortfall_uses_sum: general 5.00 + Referral credit 4.00 is short by 3.00 on 12.00', async () => {
    const c = cents(await read({ general_balance: '5.00', referral_credit: '4.00', referral_credit_owed: '0.00' }));
    expect(c).toBe(900);
    expect(shortfall(c as number, 1200)).toEqual({ ok: false, shortBy: 300 });
  });

  it('owed_never_changes_spendable: owed is neither added nor subtracted', async () => {
    expect(cents(await read({ general_balance: '5.00', referral_credit: '2.00', referral_credit_owed: '3.00' }))).toBe(700);
    expect(cents(await read({ general_balance: '5.00', referral_credit: '0.00', referral_credit_owed: '3.00' }))).toBe(500);
  });

  it('missing_referral_counts_zero: an answer without referral_credit reads the general balance alone', async () => {
    expect(JSON.parse(await read({ general_balance: '5.00' }))).toEqual({ general: 500, referral: 0, cents: 500 });
  });

  it('malformed_referral_counts_zero: a referral value that is not a D.CC amount counts 0', async () => {
    for (const v of ['abc', '12.5', '-1', '-1.00', 12, null]) {
      expect(JSON.parse(await read({ general_balance: '5.00', referral_credit: v }))).toEqual({ general: 500, referral: 0, cents: 500 });
    }
  });

  it('unreadable_general_stays_unknown: no general balance is a failed read, even with Referral credit', async () => {
    expect(await read({ referral_credit: '10.00', referral_credit_owed: '0.00' })).toBe('error');
    expect(await read({ general_balance: '12.5', referral_credit: '10.00' })).toBe('error');
  });
});
