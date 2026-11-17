// Vitest: Billing's balance read through the real core and the page's own selector, Referral credit included.
// GET /wallet/balances carries referral_credit and referral_credit_owed as dollar strings beside
// general_balance (pattern ^(0|[1-9]\d*)(\.\d{2})$); the select keeps each only
// when it is such an amount, else null: never a guessed amount (C9). The general balance keeps its C9 rule: absent
// is unknown (''), never 0. The AI side (core balances(), used by AI) keeps the general balance alone: Referral
// credit is never AI money.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commerce } from '@core';
import { capture } from '@core/ctx';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import { useBalance } from './data';

function Probe() {
  const balance = useBalance();
  return <p data-testid="balance">{balance.data ? JSON.stringify(balance.data) : balance.isError ? 'error' : 'pending'}</p>;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

async function read(body: unknown): Promise<unknown> {
  boot();
  queryClient.clear();
  onFetch((c) => (c.url.includes('/wallet/balances') ? { status: 200, body } : { status: 200, body: { data: [] } }));
  const r = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(flush);
  const text = screen.getByTestId('balance').textContent ?? '';
  r.unmount();
  return text.startsWith('{') ? JSON.parse(text) : text;
}

describe('billing balance read: Referral credit', () => {
  beforeEach(() => queryClient.clear());

  it('keeps referral_credit and referral_credit_owed when each is a dollar amount', async () => {
    expect(await read({ data: { general_balance: '5.00', referral_credit: '10.00', referral_credit_owed: '3.00' } })).toEqual({
      general: '5.00',
      referral: '10.00',
      owed: '3.00',
    });
  });

  it('malformed_referral_counts_zero: a referral or owed value that is not a D.CC amount reads null, never a guess', async () => {
    for (const v of ['abc', '12.5', '-1', '-1.00', 12, null, true, '']) {
      expect(await read({ data: { general_balance: '5.00', referral_credit: v, referral_credit_owed: v } })).toEqual({ general: '5.00', referral: null, owed: null });
    }
  });

  it('missing_referral_counts_zero: an answer without the fields reads them as null, not as an error', async () => {
    expect(await read({ data: { general_balance: '5.00' } })).toEqual({ general: '5.00', referral: null, owed: null });
  });

  it('unreadable_general_stays_unknown: no general balance stays unknown even with Referral credit', async () => {
    expect(await read({ data: { referral_credit: '10.00', referral_credit_owed: '0.00' } })).toEqual({
      general: '',
      referral: '10.00',
      owed: '0.00',
    });
  });
});

describe('ai_transfer_unchanged', () => {
  it('core balances() (the AI side) reads the general balance alone, never adding Referral credit', async () => {
    boot();
    onFetch(() => ({
      status: 200,
      body: { data: { general_balance: '5.00', referral_credit: '10.00', referral_credit_owed: '0.00', ai_usage_status: 'live', ai_remaining: '1.00' } },
    }));
    expect(await commerce.balances(capture())).toEqual({ general: '5.00', aiRemaining: '1.00', aiLive: true });
  });
});
