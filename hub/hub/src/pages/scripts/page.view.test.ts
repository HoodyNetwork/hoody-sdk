// Vitest at the view: pressing a row's "Run now" whose answer may have gone through leaves a sticky
// "unknown" toast with Check again (never the 4 s warning), and sends nothing a second time.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { setTarget } from '@core/ctx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DataModule from './data';
import page from './page';
import strings from './strings.en.json';

const shown: Array<{ tone?: string; title: string; action?: { label: string; onAction: () => unknown } }> = [];
// Error toasts go through showErrorToast (title, the rejection, its retry): recorded with tone 'error'.
const errors: Array<{ title: string; error: unknown; retry?: { label: string; onAction: () => unknown } }> = [];
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: (typeof shown)[number]) => {
    shown.push(c);
    return 'toast-1';
  },
  showErrorToast: (title: string, error: unknown, opts: { retry?: { label: string; onAction: () => unknown } } = {}) => {
    errors.push({ title, error, ...(opts.retry ? { retry: opts.retry } : {}) });
    shown.push({ tone: 'error', title, ...(opts.retry ? { action: opts.retry } : {}) });
    return 'toast-e';
  },
}));

// What each Run now press sent (the real trigger runs; this only records its variables).
const sentRuns = vi.hoisted(() => [] as Array<{ compId: string; path: string; target?: { container: { id: string } } }>);
vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataModule>();
  return {
    ...real,
    useTrigger: () => {
      const m = real.useTrigger();
      return { ...m, mutateAsync: (v: (typeof sentRuns)[number]) => { sentRuns.push(v); return m.mutateAsync(v as never); } };
    },
  };
});

async function pressRun(state: string, presses = 1) {
  await renderPage(page, { state });
  const table = await screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
  for (let n = 1; n <= presses; n++) {
    const row = (await within(table).findAllByRole('row', { name: /Job 1\b/ }))[0] as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.run'] }));
    await vi.waitFor(() => expect(shown.length).toBeGreaterThanOrEqual(n));
  }
}

describe('a row run whose outcome is not known', () => {
  beforeEach(() => {
    shown.length = 0;
  });
  it('a pending run is a sticky unknown toast with no release: its one action opens its runs', async () => {
    await pressRun('triggerPending');
    expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.pending'] });
    // No read proves a run, so the first pending toast frees nothing: its action opens its runs.
    expect(shown[0]?.action?.label).toBe(strings['run.seeRuns']);
    expect(shown[0]?.action?.label).not.toBe(strings['run.check']);
  });
  it('a second press the kit holds reads as still checking the earlier run, never as did not start', async () => {
    await pressRun('triggerHeld');
    expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.checking'] });
    expect(shown[0]?.title).not.toBe(strings['run.failed']);
  });
  it('a run the kit refused is an error with its Details and Try again, which sends one new run', async () => {
    errors.length = 0;
    await pressRun('triggerFailed');
    expect(shown[0]).toMatchObject({ tone: 'error', title: strings['run.failed'] });
    expect(errors[0]?.error).toBeTruthy();
    expect(shown[0]?.action?.label).toBe(strings['run.again']);
    shown[0]!.action!.onAction();
    await vi.waitFor(() => expect(shown).toHaveLength(2));
    expect(shown[1]).toMatchObject({ tone: 'error', title: strings['run.failed'] });
  });
  it('Try again runs on the computer the run was pressed for, even after a switch to another computer (C9)', async () => {
    sentRuns.length = 0;
    await pressRun('triggerFailed');
    const atlas = sentRuns[0]?.target?.container.id;
    expect(atlas).toBe(fixtureWorld.computers.find((c) => c.name === 'atlas')!.id);
    const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar')!;
    act(() => setTarget({ project: { id: cedar.project_id }, container: { id: cedar.id } }));
    await act(async () => { await shown[0]!.action!.onAction(); });
    await vi.waitFor(() => expect(sentRuns).toHaveLength(2));
    expect(sentRuns[1]).toMatchObject({ compId: sentRuns[0]!.compId, path: sentRuns[0]!.path, target: { container: { id: atlas } } });
  });
  it('a run never sent is info with Try again, never an error or a warning', async () => {
    await pressRun('triggerNotSent');
    expect(shown[0]).toMatchObject({ tone: 'info', title: strings['run.failed'] });
    expect(shown[0]?.action?.label).toBe(strings['run.again']);
  });
  it('the warned Dismiss names the held run it concerns, and is not offered without one', async () => {
    const { heldRunRelease } = await import('./logic');
    const settled: unknown[][] = [];
    const trigger = { settle: async (...a: unknown[]) => { settled.push(a); return true; } };
    const vars = { compId: 'c1', path: 'a.ts' };
    expect(heldRunRelease(trigger, vars, undefined)).toBeUndefined();
    const release = heldRunRelease(trigger, vars, 'h1');
    expect(await release?.()).toBe(true);
    expect(settled).toEqual([[vars, 'h1']]);
  });
  it('a release the kit refused is not reported as done: the unknown toast stays', async () => {
    const { heldRunRelease } = await import('./logic');
    for (const answer of [false, undefined]) {
      const release = heldRunRelease({ settle: async () => answer }, { compId: 'c1', path: 'a.ts' }, 'h1');
      expect(await release?.()).toBe(false);
    }
  });
});
