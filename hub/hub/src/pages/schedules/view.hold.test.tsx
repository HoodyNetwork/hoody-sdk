// Vitest: the schedules page settles the send its proof is about. The pending answer's hold is kept
// with the held operation; Check again settles that hold, never the one held when the read comes back (another tab
// may have proved the older send and sent the same change again meanwhile). Without a hold in the answer, the hold
// held just before the proving read is the one settled.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import defaultFixtures from './fixtures';
import { type RawSchedules, type SchedRow, model } from './logic';
import { opsStore, savedArgs } from './parts/ops';
import page from './page';
import type * as Data from './data';
import strings from './strings.en.json';
import { pickRuns } from './testRuns';

/** The band's allow-again press and its second step, the question's own button (never one press). */
async function allowAgain(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: strings['ed.stuck.go'] }));
  const ask = await screen.findByRole('alertdialog', { name: strings['ed.stuck.go'] });
  expect(ask).toHaveTextContent(strings['ed.stuck.body']);
  await userEvent.click(within(ask).getByRole('button', { name: strings['ed.stuck.go'] }));
}

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
// A read without a3 ('sync-photos') proves its delete.
const gone = { ...raw, cron: { ...raw.cron, items: raw.cron.items.filter((e) => e.id !== 'a3') } } as RawSchedules;

const w = vi.hoisted(() => ({
  answer: { outcome: 'pending' } as { outcome: string; code?: string; hold?: string },
  saveAnswer: { outcome: 'pending' } as { outcome: string; code?: string; hold?: string },
  holdNow: undefined as string | undefined,
  holdLog: [] as (string | undefined)[],
  settled: [] as { act: string; hold: string | undefined }[],
  savesSettled: [] as (string | undefined)[],
  read: null as unknown,
  // The hold that becomes current while the proving read is out (another tab's newer send).
  duringRead: undefined as string | undefined,
  // The realm shown (realmNow), and the one shown once the proving read starts.
  realm: 'r-a',
}));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const schedules = {
    data: undefined as RawSchedules | undefined, isPending: false, error: null,
    refetch: async () => { if (w.duringRead !== undefined) w.holdNow = w.duringRead; return { data: w.read as RawSchedules }; },
  };
  return {
    ...real,
    useSchedules: () => schedules,
    useAct: () => async () => w.answer,
    // A save's read shows what it sent (curl c1 at the schedule sent), so Check again proves it.
    useSave: () => async (a: { schedule: string }) => {
      w.read = { ...raw, curl: { ...raw.curl, items: raw.curl.items.map((c) => (c.id === 'c1' ? { ...c, cron: a.schedule } : c)) } };
      return w.saveAnswer;
    },
    holdAct: async () => { w.holdLog.push(w.holdNow); return w.holdNow; },
    holdSave: async () => w.holdNow,
    realmNow: () => w.realm,
    settleAct: (a: { act: string }, hold?: string) => { w.settled.push({ act: a.act, hold }); },
    settleSave: (_a: unknown, hold?: string) => { w.savesSettled.push(hold); },
    __schedules: schedules,
  };
});

async function pressDelete(sel = 'cron%3Auser%2Fa3', ask: string | RegExp = 'Delete sync-photos?'): Promise<void> {
  const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
  data.__schedules.data = raw;
  await renderPage(page, { path: `/schedules?sel=${sel}` });
  await userEvent.click((await screen.findAllByRole('button', { name: /More actions/ }))[0] as HTMLElement);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(strings['action.delete']) }));
  await screen.findByText(ask);
  await userEvent.click(screen.getAllByRole('button', { name: strings['action.delete'] }).at(-1) as HTMLElement);
  await waitFor(() => expect([...opsStore.snapshot().values()].some((o) => o.status === 'unknown')).toBe(true));
}
const check = async () => userEvent.click((await screen.findAllByRole('button', { name: strings['u.check'] }))[0] as HTMLElement);

async function saveCurl(): Promise<void> {
  const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
  data.__schedules.data = raw;
  await renderPage(page, { path: '/schedules?edit=curl%3Ac1' });
  await pickRuns('weekdays');
  await userEvent.click(screen.getByRole('button', { name: strings['ed.save'] }));
  await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
}
const checkSave = async () => userEvent.click(screen.getAllByRole('button', { name: /Check again/ })[0] as HTMLElement);

beforeEach(() => {
  opsStore.reset();
  Object.assign(w, { answer: { outcome: 'pending' }, saveAnswer: { outcome: 'pending' }, holdNow: undefined, holdLog: [], settled: [], savesSettled: [], read: gone, duringRead: undefined, realm: 'r-a' });
});

describe('schedules: a proof settles the send it is about', () => {
  it('Check again settles the pending answer\'s own hold, not the newer one held when the read returns', async () => {
    w.answer = { outcome: 'pending', hold: 'h-mine' };
    await pressDelete();
    w.holdNow = 'h-newer';
    await check();
    await waitFor(() => expect(w.settled).toEqual([{ act: 'del', hold: 'h-mine' }]));
  });

  it('without a hold in the answer, it settles the hold held before the proving read, not after', async () => {
    w.answer = { outcome: 'pending' };
    await pressDelete();
    w.holdNow = 'h-before';
    w.duringRead = 'h-after';
    await check();
    await waitFor(() => expect(w.settled).toEqual([{ act: 'del', hold: 'h-before' }]));
  });

  it('a proof with no hold to name settles nothing', async () => {
    await pressDelete();
    w.holdNow = undefined;
    w.duringRead = 'h-after';
    await check();
    await waitFor(() => expect([...opsStore.snapshot().values()]).toHaveLength(0));
    expect(w.settled).toEqual([]);
  });

  it('a read that proves nothing settles nothing', async () => {
    w.answer = { outcome: 'pending', hold: 'h-mine' };
    w.read = raw;
    await pressDelete();
    await check();
    await waitFor(() => expect([...opsStore.snapshot().values()][0]?.stuck).toBe(true));
    expect(w.settled).toEqual([]);
  });

  it('a save: Check again settles the pending answer\'s own hold, not the newer one held when the read returns', async () => {
    w.saveAnswer = { outcome: 'pending', hold: 'hs-mine' };
    await saveCurl();
    w.holdNow = 'hs-newer';
    await checkSave();
    await waitFor(() => expect(w.savesSettled).toEqual(['hs-mine']));
  });

  it('a save without a hold in the answer settles the hold held before the proving read, not after', async () => {
    w.saveAnswer = { outcome: 'pending' };
    await saveCurl();
    w.holdNow = 'hs-before';
    w.duringRead = 'hs-after';
    await checkSave();
    await waitFor(() => expect(w.savesSettled).toEqual(['hs-before']));
  });

  it('allowing another try on a save frees the send its answer named', async () => {
    w.saveAnswer = { outcome: 'pending', hold: 'hs-mine' };
    w.holdNow = 'hs-newer';
    await saveCurl();
    w.read = raw; // the read proves nothing
    await checkSave();
    await allowAgain();
    expect(w.savesSettled).toEqual(['hs-mine']);
  });

  it('the allow-again band asks once more: its press alone, or Cancel, frees nothing', async () => {
    w.saveAnswer = { outcome: 'pending', hold: 'hs-mine' };
    w.holdNow = 'hs-newer';
    await saveCurl();
    w.read = raw;
    await checkSave();
    await userEvent.click(await screen.findByRole('button', { name: strings['ed.stuck.go'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['ed.stuck.go'] });
    expect(w.savesSettled).toEqual([]);
    await userEvent.click(within(ask).getByRole('button', { name: strings['confirm.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(w.savesSettled).toEqual([]);
    expect(screen.getByRole('button', { name: strings['ed.stuck.go'] })).toBeInTheDocument();
  });

  it('the question lets go only the save it was opened for: another taking its place, or the hold clearing, closes it', async () => {
    w.saveAnswer = { outcome: 'pending', hold: 'hs-mine' };
    w.holdNow = 'hs-newer';
    await saveCurl();
    w.read = raw;
    await checkSave();
    await userEvent.click(await screen.findByRole('button', { name: strings['ed.stuck.go'] }));
    await screen.findByRole('alertdialog', { name: strings['ed.stuck.go'] });
    const key = [...savedArgs.keys()][0] as string;
    const first = savedArgs.get(key);
    // Another send of the same save takes its place while the question is open: it closes, nothing is let go.
    act(() => { savedArgs.set(key, { ...first!, hold: 'hs-B' }); opsStore.patch(key, { stuck: true, checking: false }); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(w.savesSettled).toEqual([]);
    // The band asks again for the one shown now, and that one is let go.
    await allowAgain();
    expect(w.savesSettled).toEqual(['hs-B']);
  });

  it('a question whose hold cleared while open never comes back by itself when a hold shows again', async () => {
    w.saveAnswer = { outcome: 'pending', hold: 'hs-mine' };
    w.holdNow = 'hs-newer';
    await saveCurl();
    w.read = raw;
    await checkSave();
    await userEvent.click(await screen.findByRole('button', { name: strings['ed.stuck.go'] }));
    await screen.findByRole('alertdialog', { name: strings['ed.stuck.go'] });
    const key = [...savedArgs.keys()][0] as string;
    const op = opsStore.get(key)!;
    const entry = savedArgs.get(key)!;
    act(() => { opsStore.clear(key); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // The same record shows again: the question opened before stays closed until the band is pressed again.
    act(() => { savedArgs.set(key, entry); opsStore.set(key, { ...op, stuck: true, checking: false }); });
    expect(await screen.findByRole('button', { name: strings['ed.stuck.go'] })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(w.savesSettled).toEqual([]);
  });

  it('dismissing a held action frees the send its answer named', async () => {
    w.answer = { outcome: 'pending', hold: 'h-mine' };
    w.holdNow = 'h-newer';
    w.read = raw;
    await pressDelete();
    await check();
    await waitFor(() => expect([...opsStore.snapshot().values()][0]?.stuck).toBe(true));
    await userEvent.click((await screen.findAllByRole('button', { name: /^Stop tracking…?$/ }))[0] as HTMLElement);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Stop tracking( anyway)?$/ }));
    expect(w.settled).toEqual([{ act: 'del', hold: 'h-mine' }]);
  });
});

// A proof is only about the send it read. A loop change sent in one realm is proven only by a
// read of that realm; a READ_BACK_FIRST refusal holds an earlier send whose values this press does not know.
const loopRow = model(raw).rows.find((r) => r.src === 'loop' && r.can.del) as SchedRow;
const loopGone = { ...raw, loop: { ...raw.loop, items: raw.loop.items.filter((l) => l.id !== loopRow.ref.loop) } } as RawSchedules;
const pressLoopDelete = () => pressDelete(encodeURIComponent(loopRow.key), /^Delete .*\?$/);

describe('schedules: a proof is only about the send it read', () => {
  it('a loop delete sent in one realm is not proven by a read in another realm', async () => {
    w.answer = { outcome: 'pending', hold: 'h-loop-a' };
    w.read = loopGone;
    await pressLoopDelete();
    w.realm = 'r-b';
    await check();
    await waitFor(() => expect([...opsStore.snapshot().values()][0]?.stuck).toBe(true));
    expect(w.settled).toEqual([]);
  });

  it('control: the same read in the realm the loop delete was sent in proves it', async () => {
    w.answer = { outcome: 'pending', hold: 'h-loop-a' };
    w.read = loopGone;
    await pressLoopDelete();
    await check();
    await waitFor(() => expect(w.settled).toEqual([{ act: 'loop.del', hold: 'h-loop-a' }]));
  });

  it('a loop change records the realm shown when it is pressed', async () => {
    w.answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    w.read = loopGone;
    await pressLoopDelete();
    expect([...opsStore.snapshot().values()][0]?.realm).toBe('r-a');
  });

  it('an action refused with READ_BACK_FIRST offers no Check, says so plainly, and keeps it held', async () => {
    w.answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'h-earlier' };
    await pressDelete();
    await screen.findAllByText((t) => t.includes(strings['op.earlier']));
    expect(screen.queryAllByRole('button', { name: strings['u.check'] })).toHaveLength(0);
    expect(w.settled).toEqual([]);
  });

  it('the warned Close frees the earlier send a READ_BACK_FIRST answer named', async () => {
    w.answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'h-earlier' };
    w.holdNow = 'h-other';
    await pressDelete();
    await userEvent.click((await screen.findAllByRole('button', { name: /^Stop tracking…?$/ }))[0] as HTMLElement);
    expect(w.settled).toEqual([]);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Stop tracking( anyway)?$/ }));
    expect(w.settled).toEqual([{ act: 'del', hold: 'h-earlier' }]);
  });

  it('a save refused with READ_BACK_FIRST offers no Check and says so plainly', async () => {
    w.saveAnswer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'hs-earlier' };
    await saveCurl();
    await screen.findByText(strings['ed.earlierCurl']);
    // The form keeps its Check again place while a save is held, disabled: nothing it could read confirms this one.
    for (const b of screen.queryAllByRole('button', { name: /Check again/ })) expect(b).toBeDisabled();
    expect(w.savesSettled).toEqual([]);
  });

  it('a new schedule refused with READ_BACK_FIRST says an earlier new one (maybe this one) is waiting; allowing again frees it', async () => {
    w.saveAnswer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'hs-create' };
    const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
    data.__schedules.data = raw;
    await renderPage(page, { path: '/schedules?edit=new' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.cmd']) }));
    await userEvent.type(screen.getByLabelText(strings['e.name']), 'cleanup');
    await userEvent.type(screen.getByLabelText(strings['e.cmd']), '/usr/local/bin/cleanup.sh');
    await userEvent.click(screen.getByRole('button', { name: strings['ed.create'] }));
    await screen.findByText(strings['ed.earlierNew']);
    // The held create is any earlier create on this computer, this same one included: never "another".
    expect(strings['ed.earlierNew']).toMatch(/this one or a different one/);
    expect(strings['ed.earlierNew']).not.toMatch(/another/i);
    expect(screen.queryByText(strings['ed.earlier'])).toBeNull();
    expect(w.savesSettled).toEqual([]);
    await allowAgain();
    expect(w.savesSettled).toEqual(['hs-create']);
  });

  it('a cron edit refused with READ_BACK_FIRST names this entry\'s save or on/off change, not a new schedule', async () => {
    w.saveAnswer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'hs-edit' };
    const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
    data.__schedules.data = raw;
    await renderPage(page, { path: '/schedules?edit=cron%3Auser%2Fa1' });
    await pickRuns('weekdays');
    await userEvent.click(screen.getByRole('button', { name: strings['ed.save'] }));
    await screen.findByText(strings['ed.earlier']);
    expect(screen.queryByText(strings['ed.earlierNew'])).toBeNull();
    expect(screen.queryByText(strings['ed.earlierCurl'])).toBeNull();
  });

  it('turning a cron entry off refused with READ_BACK_FIRST says the earlier change may be a save', async () => {
    w.answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'h-pause' };
    const data = (await import('./data')) as unknown as { __schedules: { data: RawSchedules } };
    data.__schedules.data = raw;
    await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa3' });
    // The inspector's switch (the table row's switch sits under the row's own press handling).
    await userEvent.click((await screen.findAllByRole('switch', { name: 'Pause sync-photos' })).at(-1) as HTMLElement);
    await waitFor(() => expect([...opsStore.snapshot().values()].some((o) => o.act === 'pause' && o.earlier)).toBe(true));
    await screen.findAllByText((t) => t.includes(strings['op.earlierShared']));
    expect(screen.queryAllByText((t) => t.includes(strings['op.earlier']))).toHaveLength(0);
  });

  it('allowing another try on a READ_BACK_FIRST save frees the earlier send its answer named', async () => {
    w.saveAnswer = { outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: 'hs-earlier' };
    w.holdNow = 'hs-other';
    await saveCurl();
    await allowAgain();
    expect(w.savesSettled).toEqual(['hs-earlier']);
  });
});
