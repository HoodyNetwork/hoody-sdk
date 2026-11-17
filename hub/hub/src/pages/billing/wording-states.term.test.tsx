// Billing in a terminal: three places whose words said something other than what the press or the state is.
//  - the payment-return band's button reads the payment's status again and sends nothing: "Check again", not "Try again";
//  - a sign-in that may not see the AI usage is told so and is offered no "Try again" (reading again cannot change it),
//    while a throttled read still is;
//  - the auto-renew question names the server with its plan ("Small n12"): the plan alone names two rows.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function reach(mark: string): Promise<string> {
  let frame = await s!.settle();
  for (let i = 0; i < 12 && !frame.includes(mark); i++) {
    await s!.keys.press('pagedown');
    frame = await s!.settle();
  }
  return frame;
}
const lineAt = (frame: string, word: string): number => frame.split('\n').findIndex((l) => l.includes(word));

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a cancelled payment's band offers Check again`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing', fx: 'return-cancelled', cols, rows });
    const frame = await s.settle();
    expect(frame).toContain('The payment was cancelled or expired.');
    expect(frame).toContain('[↻ Check again]');
    expect(frame).not.toContain('Try again');
  }, 180_000);

  test(`${cols}x${rows}: AI usage this sign-in may not see has no Try again; a throttled read has`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: 'usage-forbidden', cols, rows });
    let frame = await reach("AI usage isn't shown for this sign-in.");
    await s.keys.press('pagedown');
    frame += '\n' + (await s.settle());
    expect(frame).toContain("AI usage isn't shown for this sign-in.");
    expect(frame).not.toContain('Try again');
    s.close();
    s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: 'usage-throttled', cols, rows });
    frame = await reach('[Try again]');
    expect(frame).toContain('[Try again]');
  }, 240_000);
}

test('160x50: turning auto-renew off asks about the server by plan and name', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols: 160, rows: 50 });
  const frame = await reach('SG n12');
  const y = lineAt(frame, 'SG n12');
  const x = frame.split('\n')[y]!.indexOf('[■ on ]');
  expect(x).toBeGreaterThan(0);
  await s.click(x + 2, y);
  const asked = await s.settle();
  expect(asked).toContain('Turn off auto-renew?');
  expect(asked).toContain('Small n12 keeps running until');
}, 180_000);
