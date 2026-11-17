// Billing's tab-scoped markers (top-up return, buy resume, Market resume, plan intent) live in the host's session store
// (core/host-env sessionStore: web sessionStorage, terminal the mount's session), never the sessionStorage global: in
// the terminal a read of the global is a TERM_GLOBAL trap, which stopped the shipped billing page at mount. Here the
// markers round-trip through the terminal session with no trap (the preload fails a test on any undeclared trap).
import { afterEach, expect, test } from 'bun:test';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { clearBuyResume, clearMarketResume, dropTopupReturn, marketResume, paymentsSettled, readBuyResume, readTopupReturn, setMarketResume } from '@core/commerce';

let s: TermSession | null = null;
afterEach(() => { s?.end(); s = null; });

test('nothing stored: payments settled, no markers, and no global read', () => {
  s = beginTermSession({});
  expect(paymentsSettled()).toBe('settled');
  expect(readTopupReturn()).toBeNull();
  expect(readBuyResume()).toBeNull();
  expect(marketResume()).toBeNull();
});

test('a Market resume marker is written to and read from the session store, and holds payments', () => {
  s = beginTermSession({});
  setMarketResume({ kind: 'stock', id: 'st1' }, '30');
  expect(marketResume()).toMatchObject({ kind: 'stock', id: 'st1', days: '30' });
  expect(s.stores().session.getItem('hub_market_resume')).not.toBeNull();
  expect(paymentsSettled()).toBe('held');
  clearMarketResume();
  expect(s.stores().session.getItem('hub_market_resume')).toBeNull();
  expect(paymentsSettled()).toBe('settled');
});

test('a top-up return marker in the session store is read, and a bad one dropped', () => {
  s = beginTermSession({});
  const store = s.stores().session;
  store.setItem('hub_topup_return', JSON.stringify({ payment: 'a'.repeat(24), provider: 'earlier-word', status: 'paid', at: Date.now() }));
  expect(readTopupReturn()).toMatchObject({ payment: 'a'.repeat(24), provider: 'card' });
  expect(paymentsSettled()).toBe('held');
  dropTopupReturn();
  expect(store.getItem('hub_topup_return')).toBeNull();
  store.setItem('hub_topup_return', '{not json');
  expect(readTopupReturn()).toBeNull();
  expect(store.getItem('hub_topup_return')).toBeNull();
  clearBuyResume();
});

test('each mount has its own session store: a marker never outlives its mount', () => {
  s = beginTermSession({});
  setMarketResume({ kind: 'offer', id: 'of1' }, '30');
  expect(marketResume()).not.toBeNull();
  s.end();
  s = beginTermSession({});
  expect(marketResume()).toBeNull();
});
