// Vitest: after a SUPPORT_BUSY answer with a Retry-After, Send (the reply box) and Send ticket (the New ticket drawer)
// open again by themselves when that wait ends, with no edit, and the busy words go. While the wait runs, the words
// name the one time the answer gave, however often the box is drawn again (typing).
import { act, renderPage, screen, userEvent } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests } from './links';
import page from './page';
import strings from './strings.en.json';

vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  // Imported here: the factory runs before this file's own imports are bound.
  const { answers, reply } = await import('@core');
  const { routes } = await import('./routes');
  // The first reply and the first create are refused busy for ten minutes; the rest is the default world.
  const busy = { ...answers.refused(503, 'SUPPORT_BUSY'), headers: { 'retry-after': '600' } };
  const busyWait = [reply(routes.reply, busy, { times: 1 }), reply(routes.create, busy, { times: 1 }), ...orig.default.states.default!];
  return { ...orig, default: { ...orig.default, states: { ...orig.default.states, busyWait } } };
});

const SLOW = { timeout: 15000 };
const MIN = 60_000;
const UNTIL = /taking no new messages until/i;
const off = (name: string): boolean => {
  const b = screen.getByRole('button', { name });
  return b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
};
const pass = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  requestLog.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

async function replyBusy() {
  await renderPage(page, { state: 'busyWait', path: `/support?sel=${String(T_OPEN.id)}` });
  const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
  await userEvent.type(box, 'Any news on the invoice?');
  await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
  const said = (await screen.findByText(UNTIL, undefined, SLOW)).textContent;
  expect(off(strings['action.send'])).toBe(true);
  // The time is the Retry-After's, so it is not called midnight UTC.
  expect(said).not.toContain(strings['error.utcMidnight']);
  return { box, said };
}

describe('Support: a busy wait ends by itself', () => {
  it('Send is live again when the Retry-After ends, with no edit, and the busy words are gone', async () => {
    await replyBusy();
    await pass(10 * MIN + 1000);
    expect(off(strings['action.send'])).toBe(false);
    expect(screen.queryByText(UNTIL)).toBeNull();
  });

  it('while the wait runs, typing draws the box again and the words keep naming the same time', async () => {
    const { box, said } = await replyBusy();
    await pass(5 * MIN);
    await userEvent.type(box, '!');
    expect(screen.getByText(UNTIL).textContent).toBe(said);
    expect(off(strings['action.send'])).toBe(true);
  });

  it('Send ticket in the New ticket drawer is live again when the Retry-After ends, with no edit', async () => {
    const r = await renderPage(page, { state: 'busyWait', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    await screen.findByText(UNTIL, undefined, SLOW);
    expect(off(strings['action.sendTicket'])).toBe(true);
    await pass(10 * MIN + 1000);
    expect(off(strings['action.sendTicket'])).toBe(false);
    expect(screen.queryByText(UNTIL)).toBeNull();
  });
});
