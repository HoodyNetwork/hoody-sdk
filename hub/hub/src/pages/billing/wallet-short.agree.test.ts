// Vitest: the wallet-short fixture state answers one balance everywhere, as a live quote does (one answer carries both):
// the account balance, each quote's balanceCents and each quote's Wallet balance line agree.
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures';

type Line = { label: string; cents: number };
type Slot = { data?: { balanceCents?: number; lines?: Line[]; general?: string } };

describe('billing fixture wallet-short', () => {
  const st = (fixtures as unknown as { states: Record<string, Record<string, Slot>> }).states['wallet-short']!;

  it.each(['quote.buy', 'quote.pay', 'quote.rent', 'quote.upgrade'])('%s: the Wallet balance line equals balanceCents', (k) => {
    const d = st[k]!.data!;
    const wallet = d.lines!.find((l) => l.label === 'buy.wallet');
    expect(wallet?.cents).toBe(d.balanceCents);
  });

  it('the account balance is the same amount', () => {
    expect(Math.round(Number(st.balance!.data!.general) * 100)).toBe(880);
  });
});
