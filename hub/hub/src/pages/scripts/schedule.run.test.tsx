// Vitest: Run now on the Overview's Schedule card. It shows only while a schedule is written,
// asks first in words that say the script really runs now (and may send, change data or spend money), and then sends one run
// through the list's own run (parts/runScript.ts: the `exec.script.run` lock, its toasts), with no caller key and no force.
// A computer that is off, or a script with a caller key, keeps it off with the reason: nothing is sent to be refused.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseComputer, fixtureWorld } from '@core';
import type * as DataModule from './data';
import page from './page';
import { runWhy } from './parts/OverviewTab';
import strings from './strings.en.json';

const shown: Array<{ tone?: string; title: string; body?: string; action?: { label: string } }> = [];
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: (typeof shown)[number]) => {
    shown.push(c);
    return 'toast-1';
  },
  showErrorToast: (title: string) => {
    shown.push({ tone: 'error', title });
    return 'toast-e';
  },
}));

// What each run sent (the real trigger runs; this only records its variables).
const sentRuns = vi.hoisted(() => [] as Array<Record<string, unknown>>);
// Set: the computer the shell shows, as the run reads it (a stale page after a switch); unset: the real one.
const shownTarget = vi.hoisted(() => ({ v: undefined as unknown }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataModule>();
  return {
    ...real,
    useScriptsTarget: () => (shownTarget.v !== undefined ? (shownTarget.v as ReturnType<typeof real.useScriptsTarget>) : real.useScriptsTarget()),
    useTrigger: () => {
      const m = real.useTrigger();
      return { ...m, mutateAsync: async (v: Record<string, unknown>) => { sentRuns.push(v); return m.mutateAsync(v as never); } };
    },
  };
});

const DIGEST = '/scripts?sel=atlas.00a1~daily-digest.ts';
const card = async (state = 'default', path = DIGEST) => {
  const r = await renderPage(page, { state, path });
  const section = (await screen.findByRole('button', { name: strings['menu.run'] }, { timeout: 5000 })).closest('section') as HTMLElement;
  return Object.assign(r, { section });
};
/** Opens the confirm from the card and presses its Run now. */
const confirmRun = async (section: HTMLElement) => {
  await userEvent.click(within(section).getByRole('button', { name: strings['menu.run'] }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: strings['menu.run'] }));
};

describe('Run now on the Schedule card', () => {
  beforeEach(() => {
    shown.length = 0;
    sentRuns.length = 0;
  });

  it('asks first, in words that say it really runs now; Cancel sends nothing', async () => {
    const { section } = await card();
    await userEvent.click(within(section).getByRole('button', { name: strings['menu.run'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(strings['run.ask.body']);
    expect(dialog.textContent).toContain(strings['run.ask.once']);
    expect(dialog.textContent).toContain(strings['run.ask.lost']);
    expect(within(dialog).getByRole('heading').textContent).toMatch(/Daily digest|daily-digest/);
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(sentRuns).toHaveLength(0);
    expect(shown).toHaveLength(0);
  });

  it('Run now in the confirm sends one run of this script, with no force, and the toast says it started', async () => {
    const { section } = await card();
    await confirmRun(section);
    await vi.waitFor(() => expect(shown.length).toBeGreaterThanOrEqual(1));
    expect(sentRuns).toHaveLength(1);
    expect(sentRuns[0]).toMatchObject({ path: expect.stringMatching(/daily-digest\.ts$/) });
    expect(sentRuns[0]).not.toHaveProperty('force');
    expect(shown[0]).toMatchObject({ tone: 'ok', title: strings['run.started'] });
  });

  // A double press of the confirm sends one run.
  it('a double press of the confirm sends one run', async () => {
    const { section } = await card();
    await userEvent.click(within(section).getByRole('button', { name: strings['menu.run'] }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.dblClick(within(dialog).getByRole('button', { name: strings['menu.run'] }));
    await vi.waitFor(() => expect(shown.length).toBeGreaterThanOrEqual(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(sentRuns).toHaveLength(1);
  });

  // The card's run is the list's, with its answers. An answer that may have gone through says so and offers its runs;
  // an earlier run the kit still holds refuses the press unsent and says it is still being checked. (The fixture world answers
  // the held refusal itself, as the list's tests do: page.runlog.test.tsx.)
  it('a run whose outcome is unknown says it may have started and offers its runs, sending once', async () => {
    const { section } = await card('triggerPending', '/scripts?sel=atlas.00a1~jobs%2Fjob-01.ts');
    await confirmRun(section);
    await vi.waitFor(() => expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.pending'], body: strings['run.pendingBody'] }));
    expect((shown[0] as { action?: { label: string } }).action?.label).toBe(strings['run.seeRuns']);
    expect(sentRuns).toHaveLength(1);
  });

  it('an earlier run still held: the press is refused unsent and says it is still being checked', async () => {
    const { section } = await card('triggerHeld', '/scripts?sel=atlas.00a1~jobs%2Fjob-01.ts');
    await confirmRun(section);
    await vi.waitFor(() => expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.checking'], body: strings['run.checkingBody'] }));
  });

  it('a script of folder 3 runs in its folder, on its own computer', async () => {
    const { section } = await card('folder3', '/scripts?exec=3&sel=atlas.00a1~reports%2Fweekly.ts');
    await confirmRun(section);
    await vi.waitFor(() => expect(shown.length).toBeGreaterThanOrEqual(1));
    expect(sentRuns).toHaveLength(1);
    expect(String(sentRuns[0]!.path)).toMatch(/reports\/weekly\.ts$/);
    expect((sentRuns[0]!.target as { container: { id: string } }).container.id).toBe(String(sentRuns[0]!.compId));
  });

  // The run goes to the computer the shell shows; a switch while the confirm is open sends nothing.
  it('a computer switch while the confirm is open sends nothing', async () => {
    const { section } = await card();
    await userEvent.click(within(section).getByRole('button', { name: strings['menu.run'] }));
    await screen.findByRole('alertdialog');
    const other = fixtureWorld.computers.find((c) => !c.name.startsWith('atlas'))!;
    act(() => { chooseComputer(other); });
    const dialog = screen.queryByRole('alertdialog');
    if (dialog) {
      const b = within(dialog).getByRole('button', { name: strings['menu.run'] }) as HTMLButtonElement;
      expect(b.disabled || b.getAttribute('aria-disabled') === 'true').toBe(true);
      await userEvent.click(b);
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(sentRuns).toHaveLength(0);
  });

  // A stale page whose script is not on the computer shown is refused unsent, never sent to the shown one.
  it('the shared run refuses, unsent, a script whose computer is not the one shown (the list row)', async () => {
    shownTarget.v = { container: { id: 'not-atlas' }, project: { id: 'p-other' } };
    try {
      await renderPage(page, { state: 'triggerPending' });
      const table = await screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
      const row = (await within(table).findAllByRole('row', { name: /Job 1\b/ }))[0] as HTMLElement;
      await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
      await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.run'] }));
      await vi.waitFor(() => expect(shown[0]).toMatchObject({ tone: 'info', title: strings['run.failed'] }));
      expect(sentRuns).toHaveLength(0);
    } finally {
      shownTarget.v = undefined;
    }
  });
});

describe('when Run now is off', () => {
  it('runWhy: an off computer, then a caller key', () => {
    expect(runWhy({ keyed: false }, { state: 'on' })).toBeNull();
    expect(runWhy({ keyed: true }, { state: 'on' })).toBe('keyed');
    expect(runWhy({ keyed: true }, { state: 'off' })).toBe('off');
    expect(runWhy({ keyed: false }, { state: 'on' }, false)).toBe('elsewhere');
    expect(runWhy({ keyed: true }, { state: 'off' }, false)).toBe('off');
  });

  it('no schedule: no Run now on the card', async () => {
    await renderPage(page, { state: 'default', path: '/scripts?sel=atlas.00a1~weather.ts' });
    await screen.findByRole('button', { name: strings['overview.schedSet'] }, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: strings['menu.run'] })).toBeNull();
  });
});
