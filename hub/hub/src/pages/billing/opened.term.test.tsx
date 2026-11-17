// What Plans & Billing hands outside the Hub in the terminal: Add funds -> Continue to payment sends the top-up and
// leaves for the provider's payment page (leaveTo, data.web.term.ts -> openOutside -> TermHostServices.openExternal),
// whole. renderPage's `openExternal` records it as the scenario `opened` expectation does. The web half is not covered
// here (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function press(role: Role, name: string): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const [n] = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}

test('Add funds: Continue to payment opens the payment page whole, once', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'billing', path: '/billing', cols: 140, rows: 60, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  await press('button', 'Add funds');
  await press('radio' as Role, 'Card');
  expect(opened).toEqual([]);
  await press('button', 'Continue to payment');
  await s.settle();
  expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5']);
}, 180_000);
