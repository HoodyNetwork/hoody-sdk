// The checkout in a terminal of 80x24: after Confirm, the notice of a send that changed nothing is on screen. Confirm
// is pressed with the drawer's body at its end (the consent box is its last line); the notice is put at the body's top
// and was out of sight: a price that had changed showed only "Tick the box to agree to the terms first.", and a send
// that did not go through showed nothing at all. Fixtures only: nothing is sent.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** Ticks the consent box and presses Confirm, as a person does at this size: the box is at the body's end. */
async function confirm(): Promise<{ before: string; after: string }> {
  await s!.settle();
  await s!.keys.press('end');
  const end = await s!.settle();
  const y = end.split('\n').findIndex((l) => l.includes('I understand'));
  expect(y).toBeGreaterThan(0);
  await s!.click(end.split('\n')[y]!.indexOf('I understand') + 2, y);
  const before = await s!.settle();
  expect(before).toContain('[x] I understand');
  await s!.keys.press('tab');
  await s!.keys.press('tab');
  await s!.keys.press('return');
  return { before, after: await s!.settle() };
}

test('80x24: a price that changed is said on screen after Confirm', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx: 'send-requote', cols: 80, rows: 24 });
  const { before, after } = await confirm();
  expect(before).not.toContain('The price changed');
  expect(after).toContain('The price changed to $14.00.');
  // The footer still says what Confirm waits for.
  expect(after).toContain('Tick the box to agree');
}, 180_000);

test('80x24: a send that did not go through is said on screen after Confirm', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx: 'send-notsent', cols: 80, rows: 24 });
  const { after } = await confirm();
  expect(after).toContain("It didn't go through");
}, 180_000);

// A taller terminal scrolls the review too once the consent box is reached: the same there.
test('120x40: a price that changed is said on screen after Confirm', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx: 'send-requote', cols: 120, rows: 40 });
  const { after } = await confirm();
  expect(after).toContain('The price changed to $14.00.');
}, 180_000);
