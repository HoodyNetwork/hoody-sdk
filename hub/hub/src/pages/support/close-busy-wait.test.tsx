// Vitest: a close refused SUPPORT_BUSY with a Retry-After names the time of that answer ("until <time>"). Every later
// draw of the thread (here: Close ticket… pressed again, which opens its question) names the same time; before, each draw
// took the clock again, so the time moved on.
import { act, renderPage, screen, userEvent } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { T_OPEN, requestLog } from './fixtures';
import { resetPrefillForTests } from './links';
import page from './page';
import strings from './strings.en.json';

vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  // Imported here: the factory runs before this file's own imports are bound.
  const { answers, reply } = await import('@core');
  const { routes } = await import('./routes');
  // The first close is refused busy for ten minutes; the rest is the default world.
  const busy = { ...answers.refused(503, 'SUPPORT_BUSY'), headers: { 'retry-after': '600' } };
  const closeBusy = [reply(routes.close, busy, { times: 1 }), ...orig.default.states.default!];
  return { ...orig, default: { ...orig.default, states: { ...orig.default.states, closeBusy } } };
});

const SLOW = { timeout: 15000 };
const MIN = 60_000;
const UNTIL = /taking no new messages until/i;
const pass = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
async function pressClose() {
  await userEvent.click(screen.getByRole('button', { name: kit['action.more'] }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.close'] }));
  return screen.findByRole('button', { name: strings['close.confirm'] });
}

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

describe('Support: a close refused busy', () => {
  it('names the time of its answer on every later draw of the thread', async () => {
    await renderPage(page, { state: 'closeBusy', path: `/support?sel=${String(T_OPEN.id)}` });
    await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    await userEvent.click(await pressClose());
    const said = (await screen.findByText(UNTIL, undefined, SLOW)).textContent;

    // Five minutes on, the thread is drawn again (the question opens): the same time, not five minutes later.
    await pass(5 * MIN);
    await pressClose();
    expect(screen.getByText(UNTIL).textContent).toBe(said);
  });
});
