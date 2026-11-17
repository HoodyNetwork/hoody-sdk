// Vitest: a run toast whose outcome is not known carries a read. A run's state shows
// in its runs: Logs for a folder 1 script, and the script's own Overview (its last 24 hours, read in its folder) for a
// script of another folder, which Logs cannot read. A refused run keeps Try again; if its answer turns out pending, its
// toast reads the runs too, never resends.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseComputer, fixtureWorld, rememberedComputerId } from '@core';
import { runsHref } from './logic';
import type * as DataModule from './data';
import page from './page';
import strings from './strings.en.json';

const shown: Array<{ tone?: string; title: string; body?: string; action?: { label: string; onAction: () => unknown } }> = [];
// Error toasts go through showErrorToast (title, the rejection, its retry): recorded with tone 'error'.
const errors: Array<{ title: string; error: unknown; retry?: { label: string; onAction: () => unknown }; check?: { label: string; onAction: () => unknown }; change?: boolean }> = [];
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: (typeof shown)[number]) => {
    shown.push(c);
    return 'toast-1';
  },
  showErrorToast: (title: string, error: unknown, opts: { retry?: { label: string; onAction: () => unknown }; check?: { label: string; onAction: () => unknown }; change?: boolean } = {}) => {
    errors.push({ title, error, ...opts });
    shown.push({ tone: 'error', title, ...(opts.retry ? { action: opts.retry } : {}) });
    return 'toast-e';
  },
}));

// What each Run now press sent (the real trigger runs; this only records its variables).
const sentRuns = vi.hoisted(() => [] as Array<{ compId: string; path: string; target?: { container: { id: string } } }>);
// A hold to put on the run's answer (the kit names the held run it refused this press for), or none.
const answerHold = vi.hoisted(() => ({ hold: undefined as string | undefined, outcome: undefined as string | undefined }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataModule>();
  return {
    ...real,
    useTrigger: () => {
      const m = real.useTrigger();
      return { ...m, mutateAsync: async (v: (typeof sentRuns)[number]) => { sentRuns.push(v); const res = await m.mutateAsync(v as never); return { ...(res as object), ...(answerHold.hold ? { hold: answerHold.hold } : {}), ...(answerHold.outcome ? { outcome: answerHold.outcome } : {}) }; } };
    },
  };
});

async function pressRun(state: string, path?: string, name: RegExp = /Job 1\b/) {
  const r = await renderPage(page, { state, ...(path ? { path } : {}) });
  const table = await screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
  const row = (await within(table).findAllByRole('row', { name }))[0] as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.run'] }));
  await vi.waitFor(() => expect(shown.length).toBeGreaterThanOrEqual(1));
  return r;
}

describe('where a run is read', () => {
  it('a folder 1 script: its runs in Logs; another folder: the script itself in that folder (its Overview), never Logs without a script', () => {
    expect(runsHref('atlas', 'default/1/jobs/a.ts')).toBe('/logs?computer=atlas&src=scripts&win=24h&script=jobs%2Fa.ts');
    expect(runsHref('atlas', 'default/3/jobs/a.ts')).toBe('/scripts?sel=atlas~jobs%2Fa.ts&exec=3');
  });
});

describe('a run toast whose outcome is not known reads its runs', () => {
  beforeEach(() => {
    shown.length = 0;
    errors.length = 0;
    sentRuns.length = 0;
  });
  it('a pending run: sticky unknown toast whose one action opens its runs, and sends nothing', async () => {
    sentRuns.length = 0;
    const r = await pressRun('triggerPending');
    expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.pending'], body: strings['run.pendingBody'] });
    expect(shown[0]?.action?.label).toBeTruthy();
    expect(shown[0]?.action?.label).toBe(strings['run.seeRuns']);
    act(() => { void shown[0]!.action!.onAction(); });
    await vi.waitFor(() => expect(r.router.state.location.pathname).toBe('/logs'));
    const q = r.router.state.location.search as Record<string, unknown>;
    expect(q.src).toBe('scripts');
    expect(String(q.script ?? '')).toMatch(/job/i);
    expect(sentRuns).toHaveLength(1);
  });
  it('still checking an earlier run with no hold to free: the action opens its runs, never a Dismiss that frees nothing', async () => {
    const r = await pressRun('triggerHeld');
    expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.checking'], body: strings['run.checkingBody'] });
    expect(shown[0]?.action?.label).toBeTruthy();
    expect(shown[0]?.action?.label).toBe(strings['run.seeRuns']);
    act(() => { void shown[0]!.action!.onAction(); });
    await vi.waitFor(() => expect(r.router.state.location.pathname).toBe('/logs'));
  });
  it('still checking an earlier run the kit holds: the one action stays the warned Dismiss naming that hold', async () => {
    answerHold.hold = 'h1';
    try {
      await pressRun('triggerHeld');
      expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.checking'] });
      expect(shown[0]?.action?.label).toBe(strings['run.check']);
    } finally {
      answerHold.hold = undefined;
    }
  });
  it('a pending run of a folder 3 script (Weekly report) opens that script in folder 3, on the Overview that reads its last 24 hours', async () => {
    answerHold.outcome = 'pending';
    try {
      const r = await pressRun('folder3', '/scripts?exec=3', /Weekly report/);
      expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.pending'] });
      act(() => { void shown[0]!.action!.onAction(); });
      await vi.waitFor(() => expect((r.router.state.location.search as Record<string, unknown>).sel).toBeTruthy());
      const q = r.router.state.location.search as Record<string, unknown>;
      expect(r.router.state.location.pathname).toBe('/scripts');
      expect(String(q.exec)).toBe('3');
      expect(String(q.sel)).toMatch(/~reports%2Fweekly\.ts$|~reports\/weekly\.ts$/);
      expect(q.tab).toBeUndefined();
      expect(await screen.findByText(strings['overview.last24'], {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getAllByText('Weekly report').length).toBeGreaterThan(0);
    } finally {
      answerHold.outcome = undefined;
    }
  });
  it('a folder 3 run, then a switch to another computer: See its runs shows the run\'s own computer again, then its script', async () => {
    answerHold.outcome = 'pending';
    try {
      const r = await pressRun('folder3', '/scripts?exec=3', /Weekly report/);
      const runOn = sentRuns[0]?.target?.container.id;
      expect(runOn).toBeTruthy();
      const other = fixtureWorld.computers.find((c) => c.id !== runOn)!;
      // The top bar switches to another computer while the sticky toast stays open.
      act(() => { chooseComputer(other); });
      expect(rememberedComputerId()).toBe(other.id);
      act(() => { void shown[0]!.action!.onAction(); });
      await vi.waitFor(() => expect((r.router.state.location.search as Record<string, unknown>).sel).toBeTruthy());
      // The page lists the shell's computer: the run's own is shown again, so its script is found (never "Gone" on B's list).
      expect(rememberedComputerId()).toBe(runOn);
      expect(String((r.router.state.location.search as Record<string, unknown>).exec)).toBe('3');
      expect(await screen.findByText(strings['overview.last24'], {}, { timeout: 5000 })).toBeInTheDocument();
    } finally {
      answerHold.outcome = undefined;
    }
  });
  it('a folder 1 run after a switch keeps the shown computer: its Logs link names the run\'s computer itself', async () => {
    const r = await pressRun('triggerPending');
    const runOn = sentRuns[0]?.target?.container.id;
    const other = fixtureWorld.computers.find((c) => c.id !== runOn)!;
    act(() => { chooseComputer(other); });
    act(() => { void shown[0]!.action!.onAction(); });
    await vi.waitFor(() => expect(r.router.state.location.pathname).toBe('/logs'));
    expect(rememberedComputerId()).toBe(other.id);
  });
  it('a refused run keeps Try again, stays a change, and reads its runs if its answer turns out pending', async () => {
    const r = await pressRun('triggerFailed');
    expect(errors[0]?.retry?.label).toBe(strings['run.again']);
    expect(errors[0]?.change).not.toBe(false);
    expect(errors[0]?.check?.label).toBeTruthy();
    expect(errors[0]?.check?.label).toBe(strings['run.seeRuns']);
    act(() => { void errors[0]!.check!.onAction(); });
    await vi.waitFor(() => expect(r.router.state.location.pathname).toBe('/logs'));
    expect(sentRuns).toHaveLength(1);
  });
});
