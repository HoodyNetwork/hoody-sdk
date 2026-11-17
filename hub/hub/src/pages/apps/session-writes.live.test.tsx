// Vitest: the live side of session-writes.test.tsx. With core's run-open machine scripted, a Stop or Check the launcher
// (launch/useApps.ts) began before the store's reset answers after it: the next session's row under the same key keeps
// its own busy mark and gets no note. (live.ts already fences its own writes; these are the launcher's.)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RunHandle, RunOpen, Target } from '@core';
import { useCurrentComputer } from '@core';
import type { PageManifest } from '@kit';
import { act, renderPage, screen, waitFor } from '@app/testing';
import type * as Data from './data';
import type { OpenApp } from './logic';

const S = vi.hoisted(() => ({
  closes: 0,
  statuses: 0,
  close: (): Promise<unknown> => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' }),
  status: (): Promise<unknown> => new Promise<never>(() => {}),
}));
const CID = 'b'.repeat(24);
const PID = 'a'.repeat(24);

vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), LIVE: true }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect, useState } = await import('react');
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  const machine = {
    open: () => new Promise<never>(() => {}),
    status: () => {
      S.statuses++;
      return S.status();
    },
    close: () => {
      S.closes++;
      return S.close();
    },
    watch: (_h: unknown, o: { signal: AbortSignal }) => new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ ok: false, code: 'aborted', message: '', state: 'unknown' }))),
  } as unknown as RunOpen;
  return {
    ...real,
    useCurrentComputer: () => t,
    // As core's hook: null on the first render, the machine from an effect on.
    useRunOpen: () => {
      const [m, setM] = useState<RunOpen | null>(null);
      useEffect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness } = await import('./launch/harness');
const { ops } = await import('./parts/ops');
const { fromHandle } = await import('./parts/recent');
const { useApps } = await import('./launch/useApps');

let A!: ReturnType<typeof useApps>;
function Hook() {
  A = useApps({ target: useCurrentComputer() as Target, nav: { select: () => undefined } });
  return <p>hook</p>;
}
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: Hook }) };

const TAG = 'd'.repeat(16);
const H = { v: 1, terminal_id: 8003, incarnation: 'c'.repeat(32), command_id: 7, display: 8003, launch_tag: TAG, opens_in: 'terminal', computer: { project: PID, computer_id: CID } } as unknown as RunHandle;
/** A row listed and bound (an earlier Open), as the page shows it. */
function listed(key: string) {
  ops.addLaunch({ key, name: 'htop', app: 'htop', opensIn: 'terminal', state: 'running', code: '', terminal: 8003, handle: TAG, source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
  ops.bind(key, fromHandle(H, { name: 'htop', app: 'htop' }, 1)!);
  return { ...ops.get().launches.find((l) => l.key === key)! };
}
/** The session ends while the action is out; the next one lists a row under the same key, busy with its own action. */
const nextSession = (key: string, busy: 'stop' | 'check') => {
  ops.reset();
  listed(key);
  ops.patch(key, { busy });
};
/** Lists row k1 after the mount (the mount's own read finds nothing to read). */
const rowNow = (): OpenApp => {
  let r!: OpenApp;
  act(() => void (r = listed('k1')));
  return r;
};
const still = { ok: false, code: 'still_running', message: '', state: 'running' };

beforeEach(async () => {
  S.closes = 0;
  S.statuses = 0;
  S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' });
  S.status = () => new Promise<never>(() => {});
  ops.reset();
  await renderPage(page, { path: '/apps' });
  await screen.findByText('hook');
  await waitFor(() => expect(A.live.m).not.toBeNull());
});

describe('live: an answer after the reset', () => {
  it('control: in the same session a Stop that left the app running leaves its note and settles its busy mark', async () => {
    const r = rowNow();
    S.close = () => Promise.resolve(still);
    await act(async () => void (await A.stop(r)));
    expect(S.closes).toBe(1);
    expect(ops.get().patches.get('k1')?.note).toBe('stopFailed');
    expect(ops.get().patches.get('k1')?.busy).toBeUndefined();
  });

  it('a Stop: the next session row keeps its busy mark and gets no note', async () => {
    const r = rowNow();
    let answer!: (v: unknown) => void;
    S.close = () => new Promise((res) => (answer = res));
    let done!: Promise<void>;
    act(() => void (done = A.stop(r)));
    expect(S.closes).toBe(1);
    act(() => nextSession('k1', 'stop'));
    await act(async () => {
      answer(still);
      await done;
    });
    expect(ops.get().patches.get('k1')?.note).toBeUndefined();
    expect(ops.get().patches.get('k1')?.busy).toBe('stop');
  });

  it('a Check: the next session row keeps its own Check busy mark', async () => {
    const r = rowNow();
    let answer!: (v: unknown) => void;
    S.status = () => new Promise((res) => (answer = res));
    let done!: Promise<void>;
    act(() => void (done = A.check(r)));
    // The read goes out once any server wait has passed (none here).
    await waitFor(() => expect(S.statuses).toBe(1));
    act(() => nextSession('k1', 'check'));
    await act(async () => {
      answer({ ok: true, code: 'stopped', message: '', state: 'stopped' });
      await done;
    });
    expect(ops.get().patches.get('k1')?.busy).toBe('check');
    expect(ops.get().patches.get('k1')?.state).toBeUndefined();
  });
});
