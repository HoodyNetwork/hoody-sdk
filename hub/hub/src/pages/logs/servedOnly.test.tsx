// Vitest: the one-file Hub opened from a file. Its requests carry `Origin: null`; the computer's logs service (visits,
// Bots, proxy decisions) may not answer that origin while its programs do. A logs-service read that fails there says the
// records open in the served Hub, with one button there, instead of "could not reach". It is decided by the read failing: a
// logs service that answers shows its rows, and every other source and failure keeps its own words.
import { servedHubUrl } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@app/testing';
import type { LogsApi } from './api';
import { createLogs, type Computer, type Logs, type Snapshot } from './controller';
import fixtures from './fixtures';
import { fileOriginPage } from './data.web';
import { DEFAULT_VIEW, errKey, servedOnlyOf, servedRoute, type ErrCode, type Tx, type ViewState } from './logic';
import { Notes, StateBox } from './parts/Bands';
import strings from './strings.en.json';
import { fixtureApi, type World } from './world';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;
const tx: Tx = (key) => key;
const computer: Computer = { id: 'c0a7150000000000000000a1', projectId: '6a0000000000000000000001', name: 'atlas', running: true };
const worldOf = (state: keyof typeof fixtures.states): World => (fixtures.states[state] as { world: { data: World } }).world.data;
const store = () => { let p = {}; return { read: () => p, write: (n: object) => { p = n; return true; } }; };
const TITLE = 'Visits, Bots and proxy decisions open in your Hoody Hub online.';
/** The served Hub's route of DEFAULT_VIEW on `computer` (handle = name + last four of the id). */
const HERE = '/logs?computer=atlas.00a1';

function open(world: World, fileOrigin: (() => boolean) | undefined, initial: ViewState = DEFAULT_VIEW): Logs {
  const l = createLogs({ api: fixtureApi({ ...world, delayMs: 0 }), computer, initial, prefs: store(), t: tx, visible: () => true, online: () => true, ...(fileOrigin ? { fileOrigin } : {}) });
  l.setView(initial);
  return l;
}
async function until(l: Logs, ok: (s: Snapshot) => boolean): Promise<Snapshot> {
  for (let i = 0; i < 400; i++) {
    const s = l.get();
    if (ok(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting for the snapshot');
}

describe('servedOnlyOf', () => {
  it('a blocked logs-service read on a page opened from a file is the hand-off', () => {
    for (const source of ['everything', 'visits', 'bots', 'decisions', 'execVisits']) {
      expect(servedOnlyOf({ code: 'blocked' }, source, true, HERE)).toEqual({ code: 'servedOnly', route: HERE });
    }
    expect(servedOnlyOf({ code: 'blocked' }, 'visits', true)).toEqual({ code: 'servedOnly', route: '/logs' });
  });

  it('the hand-off route keeps the computer and the view, never the search text', () => {
    expect(servedRoute(DEFAULT_VIEW, computer)).toBe(HERE);
    const v: ViewState = { ...DEFAULT_VIEW, source: 'visits', severity: 'failed', window: '24h', search: 'token=abc' };
    expect(servedRoute(v, computer)).toBe('/logs?computer=atlas.00a1&src=visits&sev=failed&win=24h');
    expect(servedRoute(DEFAULT_VIEW, { ...computer, name: 'my box' })).toBe('/logs?computer=my%20box.00a1');
  });

  it('a page not opened from a file keeps "blocked"', () => {
    expect(servedOnlyOf({ code: 'blocked' }, 'visits', false)).toEqual({ code: 'blocked' });
  });

  it('sources read from the programs, the Agent or the API keep their own failure', () => {
    for (const source of ['programs', 'scripts', 'changes', 'account', 'helper']) {
      expect(servedOnlyOf({ code: 'blocked' }, source, true)).toEqual({ code: 'blocked' });
    }
  });

  it('a logs service that answered keeps its answer (private, busy, limits, failures)', () => {
    const codes: ErrCode[] = ['private', 'rate_limited', 'quota', 'unavailable', 'unreachable', 'failed', 'stopped', 'offline', 'update'];
    for (const code of codes) expect(servedOnlyOf({ code, retryAfterMs: 5 }, 'visits', true)).toEqual({ code, retryAfterMs: 5 });
  });

  it('has its words', () => {
    expect(errKey('servedOnly')).toBe('st.servedOnly');
    expect(table['st.servedOnly']).toBe(TITLE);
    expect(table['st.servedOnlyWhy']).toBeTruthy();
    expect(table['act.servedHub']).toBe('Open your Hoody Hub');
  });

  it('the served Hub is never a page opened from a file', () => {
    expect(fileOriginPage()).toBe(false);
  });
});

describe('the controller on a page opened from a file', () => {
  it('a logs service the browser could not read says servedOnly', async () => {
    const l = open(worldOf('blocked'), () => true);
    const s = await until(l, (x) => !!x.err);
    expect(s.err).toEqual({ code: 'servedOnly', route: HERE });
    l.dispose();
  });

  it('the hand-off names the view it failed on', async () => {
    const view: ViewState = { ...DEFAULT_VIEW, source: 'bots', window: '24h' };
    const l = open(worldOf('blocked'), () => true, view);
    const s = await until(l, (x) => !!x.err);
    expect(s.err).toEqual({ code: 'servedOnly', route: '/logs?computer=atlas.00a1&src=bots&win=24h' });
    l.dispose();
  });

  it('a failed older Changes read beside Everything keeps its own failure (the API read, not the logs service)', async () => {
    const changes = Array.from({ length: 300 }, (_, i) => ({ id: `chg${i + 1}`, created_at: new Date(Date.now() - (i + 1) * 1000).toISOString(), event_type: 'computer.started', resource_type: 'computer', resource_id: 'atlas' }));
    const base = fixtureApi({ ...worldOf('quiet'), changes, delayMs: 0 });
    // The first Changes page answers; the next one (offset 200) fails as a network failure would.
    const api: LogsApi = { ...base, side: (scope, path, o) => (scope === 'realm' && /[?&]offset=[1-9]/.test(path) ? Promise.reject({ kind: 'unreachable' }) : base.side(scope, path, o)) };
    const l = createLogs({ api, computer, initial: DEFAULT_VIEW, prefs: store(), t: tx, visible: () => true, online: () => true, fileOrigin: () => true });
    l.setView(DEFAULT_VIEW);
    await until(l, (x) => !x.loading && x.moreOlder && x.items.some((i) => i.kind === 'changes'));
    l.older();
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).toBe('blocked');
    l.dispose();
  });

  it('the same failure on the served Hub stays blocked', async () => {
    for (const fileOrigin of [undefined, () => false]) {
      const l = open(worldOf('blocked'), fileOrigin);
      const s = await until(l, (x) => !!x.err);
      expect(['blocked', 'unreachable']).toContain(s.err!.code);
      l.dispose();
    }
  });

  it('a logs service that answers shows its rows (no hand-off)', async () => {
    const l = open(worldOf('quiet'), () => true);
    const s = await until(l, (x) => !x.loading && x.items.length > 0);
    expect(s.err).toBeNull();
    expect(s.items.filter((i) => i.kind !== 'div').length).toBeGreaterThan(0);
    l.dispose();
  });

  it('a private logs service stays private', async () => {
    const l = open(worldOf('private'), () => true);
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).toBe('private');
    l.dispose();
  });

  it('the programs source keeps its own failure', async () => {
    const world = { ...worldOf('quiet'), faults: { programs: { kind: 'unreachable' } } } as World;
    const l = open(world, () => true, { ...DEFAULT_VIEW, source: 'programs' });
    const s = await until(l, (x) => !!x.err);
    expect(s.err!.code).not.toBe('servedOnly');
    l.dispose();
  });
});

describe('the hand-off on screen', () => {
  afterEach(cleanup);

  afterEach(() => { vi.restoreAllMocks(); });

  it('the list area says where the records open, with one way to the served Hub and no Try again', () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<StateBox t={t} err={{ code: 'servedOnly', route: '/logs?computer=atlas.00a1&src=visits' }} onRetry={() => {}} onAgentUrl={null} />);
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText(table['st.servedOnlyWhy']!)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
    expect(screen.queryByText("The Hub could not reach this computer's logs.")).toBeNull();
    screen.getByRole('button', { name: 'Open your Hoody Hub' }).click();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0]![0]).toBe(servedHubUrl('/logs?computer=atlas.00a1&src=visits'));
  });

  it('blocked keeps its own words and its Why?', () => {
    render(<StateBox t={t} err={{ code: 'blocked' }} onRetry={() => {}} onAgentUrl={null} />);
    expect(screen.getByText("The Hub could not reach this computer's logs.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Why?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open your Hoody Hub' })).toBeNull();
  });

  it('beside other rows (Everything with changes) it is a note with the way to the served Hub, not a retry', () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const snap = { err: { code: 'servedOnly', route: HERE }, items: [{ kind: 'changes' }], v: DEFAULT_VIEW } as unknown as Snapshot;
    render(<Notes t={t} snap={snap} onRetry={() => {}} onResume={() => {}} onNewest={() => {}} onVisits={() => {}} />);
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    screen.getByRole('button', { name: 'Open your Hoody Hub' }).click();
    expect(opened.mock.calls[0]![0]).toBe(servedHubUrl(HERE));
  });

  it('other failures beside rows keep Try again', () => {
    const snap = { err: { code: 'blocked' }, items: [{ kind: 'changes' }], v: DEFAULT_VIEW } as unknown as Snapshot;
    render(<Notes t={t} snap={snap} onRetry={() => {}} onResume={() => {}} onNewest={() => {}} onVisits={() => {}} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open your Hoody Hub' })).toBeNull();
  });
});
