// The held top-up band's resend in the terminal (HeldTopUp: "Send the same request again" -> Send again -> leaveTo,
// data.web.term.ts -> openOutside -> TermHostServices.openExternal) opens the payment page whole, once. A fixture hold
// is made the way a person makes one: state `topup-unknown` answers the send pending (data.ts keeps the hold in memory),
// the drawer is closed, then the fixture state goes back to the default (the hub:dev state switch, fixtureStore.set),
// whose top-up answers with the payment page. The web half is not covered here.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';
import { fixtureStore } from '../../app/fixtures';
import { resetUnknownCheckouts } from './data';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; resetUnknownCheckouts(); });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

async function press(role: Role, name: string | RegExp): Promise<void> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}

test('held top-up band: Send the same request again, confirmed, opens the payment page whole, once', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'billing', path: '/billing', fx: 'topup-unknown', cols: 140, rows: 60, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  await press('button', 'Add funds');
  await press('radio' as Role, 'Card');
  await press('button', 'Continue to payment');
  expect(s.frame).toContain('Payment page: not confirmed');
  await press('button', 'Cancel');
  expect(s.frame).toContain('top-up may have gone through');
  expect(opened).toEqual([]);
  fixtureStore.set({ state: null });
  await s.settle();
  await press('button', 'Send the same request again');
  await press('button', 'Send again');
  await s.settle();
  expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5']);
}, 180_000);
