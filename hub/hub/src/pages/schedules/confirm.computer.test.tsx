// Vitest: a Delete (or Run now) question belongs to the computer whose row it was asked about. Switching computer under
// it (the URL, the back button) closes it and sends nothing, even when the other computer has a schedule with the same
// key; coming back does not open it again. On the same computer the confirm sends once (control).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import defaultFixtures from './fixtures';
import type { RawSchedules } from './logic';
import { opsStore } from './parts/ops';
import page from './page';
import type * as Data from './data';
import strings from './strings.en.json';

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const w = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  // The same rows whatever computer is shown: the other computer has a schedule with the same key.
  const schedules = { data: undefined as RawSchedules | undefined, isPending: false, error: null, refetch: async () => ({ data: schedules.data }) };
  return {
    ...real,
    useSchedules: () => schedules,
    useAct: () => async (a: { act: string }) => {
      w.sent.push(a.act);
      return { outcome: 'done' };
    },
    __schedules: schedules,
  };
});

const [A, B] = fixtureWorld.computers;
const ASK = 'Delete sync-photos?';

async function askDelete(): Promise<void> {
  const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
  data.__schedules.data = raw;
  await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa3' });
  act(() => void chooseComputer(A!));
  await userEvent.click((await screen.findAllByRole('button', { name: /More actions/ }))[0] as HTMLElement);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(strings['action.delete']) }));
  await screen.findByText(ASK);
}

beforeEach(() => {
  w.sent.length = 0;
  opsStore.reset();
});
afterEach(() => {
  act(() => void chooseComputer(A!));
});

describe('schedules: a question is bound to its computer', () => {
  it('a computer switch under the Delete question closes it, sends nothing, and coming back does not reopen it', async () => {
    await askDelete();
    act(() => void chooseComputer(B!));
    await waitFor(() => expect(screen.queryByText(ASK)).toBeNull());
    expect(w.sent).toEqual([]);
    act(() => void chooseComputer(A!));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(ASK)).toBeNull();
    expect(w.sent).toEqual([]);
  });

  it('on the same computer the confirm sends the delete once (control)', async () => {
    await askDelete();
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.delete'] }).at(-1) as HTMLElement);
    await waitFor(() => expect(w.sent).toHaveLength(1));
    expect(screen.queryByText(ASK)).toBeNull();
  });
});
