// Vitest: the Build step's clock is kit/useNow, on only while the build runs. Running, the
// elapsed line and a retry wait count down with it; stopped, the retry line shows the stated wait (words gets no now),
// and no 1 s interval runs. Time moves only through fake timers.
import { act, render, screen } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Progress from './progress';
import type * as Record_ from './record';

const at = vi.hoisted(() => ({ t0: 0 }));

// The attempt's stored ask: sent at t0, its turn known.
vi.mock('./record', async (orig) => {
  const real = await orig<typeof Record_>();
  return { ...real, useBuildRun: (_d: string, n: number) => (n > 0 ? { phase: 'turn', sid: 's1', turnId: 't1', sentAt: at.t0 } : null) };
});
// The progress the step starts from: one finished check and a retry wait of 30 s that arrived at t0 (b is null, so no
// stream feeds it further).
vi.mock('./progress', async (orig) => {
  const real = await orig<typeof Progress>();
  return { ...real, start: (turnId?: unknown) => ({ ...real.start(turnId), rows: [{ id: 'a', kind: 'routes' as const, ok: true }], current: { k: 'retry' as const, attempt: 1, max: 3, wait: 30, at: at.t0 } }) };
});

import strings from '../strings.en.json';
import { StepBuild, type Build, type UseBuild } from './StepBuild';

const api = (build: Build) => ({ build, run: async () => undefined, stop: async () => undefined, checkAgain: async () => undefined, askReplace: false, confirmReplace: async () => undefined, cancelReplace: () => undefined, builtWith: null, keep: () => undefined }) as unknown as UseBuild;
const step = (build: Build) => <StepBuild b={null} draftId="dddddddddd" computer="atlas" description="d" api={api(build)} code="" codeEdited={false} onWriteMyself={() => undefined} />;
const retry = (s: number) => strings['flow.build.retry'].replace('{{s}}', String(s)).replace('{{attempt}}', '1').replace('{{max}}', '3');
const sec = (s: number) => strings['flow.build.elapsedSec'].replace('{{s}}', String(s));
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); at.t0 = Date.now(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Build step clock', () => {
  it('while running, the elapsed line and the retry wait move with the clock', () => {
    render(step({ k: 'running', n: 1 }));
    expect(screen.getByRole('status').textContent).toBe(retry(30));
    expect(screen.getByText(sec(0))).toBeInTheDocument();
    tick(3000);
    expect(screen.getByText(sec(3))).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe(retry(27));
  });

  it('a build that stopped during a retry wait shows the stated wait, the same on every render', () => {
    const v = render(step({ k: 'running', n: 1 }));
    tick(4000);
    expect(screen.getByRole('status').textContent).toBe(retry(26));
    v.rerender(step({ k: 'stopped', n: 1 }));
    expect(screen.getByRole('status').textContent).toBe(retry(30));
    tick(10_000);
    v.rerender(step({ k: 'stopped', n: 1 }));
    expect(screen.getByRole('status').textContent).toBe(retry(30));
    expect(screen.queryByText(sec(14))).toBeNull();
  });

  it('while running, one build plate with the elapsed time in its head, and right under it a bar with no amount; ended, neither', () => {
    const v = render(step({ k: 'running', n: 1 }));
    const plate = screen.getByRole('group', { name: strings['flow.built.verdict'] });
    expect(plate.textContent).toContain(strings['flow.built.running']);
    expect(plate.textContent).toContain(sec(0));
    const bar = screen.getByRole('progressbar', { name: strings['flow.built.running'] });
    // The bar sits right under the plate (a body part of the step, not inside the plate's slot).
    expect(plate.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plate.parentElement?.contains(bar)).toBe(true);
    // No amount is claimed: the bar carries no value.
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    v.rerender(step({ k: 'stopped', n: 1 }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(sec(0))).toBeNull();
  });

  it('no 1 s clock runs while the build is not running', () => {
    const set = vi.spyOn(globalThis, 'setInterval');
    render(step({ k: 'stopped', n: 1 }));
    tick(5000);
    expect(set.mock.calls.filter((c) => c[1] === 1000)).toEqual([]);
  });
});
