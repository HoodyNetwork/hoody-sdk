// Vitest: a prefill never travels in the URL. newTicket() navigates to the bare
// New ticket link and keeps {category, subject, body} in one in-memory slot: taken once, only under the account it was
// put for, within ten minutes, bounded in size, and cleared when the account changes or signs out.
import { bootFixtureCore } from '@core';
import { bump, identity, setIdentity } from '@core/ctx';
import { beforeEach, describe, expect, it } from 'vitest';
import { PREFILL_TTL_MS, links, newTicket, putPrefill, resetPrefillForTests, takePrefill } from './links';

beforeEach(() => {
  bootFixtureCore();
  resetPrefillForTests();
});

describe('the prefill slot', () => {
  it('newTicket navigates to a link that carries no field', () => {
    const went: string[] = [];
    newTicket({ category: 'billing', subject: 'Refund', body: 'Card 4242' }, (h) => went.push(h));
    expect(went).toEqual([links.newTicket]);
    for (const h of [...went, links.list, links.ticket('abc'), links.newTicket]) expect(h).not.toMatch(/subject|body|category|Refund|4242|billing/);
  });

  it('is taken once', () => {
    putPrefill({ subject: 'Refund' });
    expect(takePrefill()).toEqual({ subject: 'Refund' });
    expect(takePrefill()).toBeNull();
  });

  it('is never read under another account, and an account change clears it', () => {
    const me = identity() as NonNullable<ReturnType<typeof identity>>;
    putPrefill({ subject: 'Refund' });
    setIdentity({ ...me, id: 'ffffffffffffffffffffffff' });
    expect(takePrefill()).toBeNull();
    setIdentity(me);
    putPrefill({ subject: 'Refund' });
    bump('account');
    expect(takePrefill()).toBeNull();
  });

  it('expires after ten minutes and is bounded', () => {
    const t0 = 1_000_000;
    putPrefill({ subject: 'x'.repeat(500), body: 'y'.repeat(5000) }, t0);
    expect(takePrefill(t0 + PREFILL_TTL_MS + 1)).toBeNull();
    putPrefill({ subject: 'x'.repeat(500), body: 'y'.repeat(5000) }, t0);
    const p = takePrefill(t0 + 1);
    expect(p?.subject).toHaveLength(200);
    expect(p?.body).toHaveLength(4000);
  });
});
