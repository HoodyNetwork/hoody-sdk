// ShellJobRows: the rows are the per-session list's (a Stop is never
// offered on a job that list did not name); a row shows its command, how long it has run, its last line and Stop while the
// gate allows; a Stop's words are only what its answer proved; an unknown offers Check again (a read) with its hint.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Capability } from './capability';
import { ShellJobRows, shownShellJobs } from './ShellJobRows';
import { createShellJobStops, type ShellJobStops, type ShellJobStopsSnapshot } from './shellJobStop';
import type { JobRow } from './jobStop';
import strings from './ShellJobRows.strings.en.json';

const T0 = 1_761_800_000_000;
const row = (jobId: string, o: Record<string, unknown> = {}) => ({ job_id: jobId, command: `cmd ${jobId}`, started_ms: T0, state: 'running', last_line: '', remote: false, ...o });
const ans = (jobId: string, o: Record<string, unknown>) => ({ ok: true, status: 200, body: { job_id: jobId, already_ended: false, remote: false, duplicate: false, ...o } });

async function storeWith(items: unknown[], o: { replies?: unknown[]; lists?: unknown[]; gate?: () => Capability } = {}) {
  const replies = [...(o.replies ?? [])];
  const lists = [{ ok: true as const, body: { items } }, ...(o.lists ?? [])];
  const stop = vi.fn(async () => { const x = replies.shift(); if (x instanceof Error) throw x; return x; });
  const list = vi.fn(async () => (lists.length > 1 ? lists.shift() : lists[0]) as { ok: true; body: unknown });
  let n = 0;
  const stops = createShellJobStops({ chat: { computer: 'atlas', realm: 'global', sid: 's-1' }, list, stop, newKey: () => `k-${++n}`, can: o.gate ?? (() => ({ ok: true })) });
  await stops.refresh();
  return { stops, stop, list };
}
const items = () => within(screen.getByRole('list', { name: strings['sj.list'] })).getAllByRole('listitem');
const stopButtons = () => screen.queryAllByRole('button', { name: /^Stop / });

describe('ShellJobRows: rows', () => {
  it('shows each running job with its command, how long it has run, its last line and Stop; ended jobs are left out', async () => {
    const { stops } = await storeWith([row('a', { command: 'npm run dev', last_line: 'ready on :3000' }), row('b', { state: 'ended' })]);
    render(<ShellJobRows stops={stops} now={T0 + 3 * 60_000 + 5_000} />);
    expect(items()).toHaveLength(1);
    expect(items()[0]!).toHaveTextContent('npm run devRunning for 3 minutesready on :3000Stop');
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeInTheDocument();
  });
  it('an unnamed job reads "A shell job"; under a minute reads "started just now"; one minute is singular; unknown state says so', async () => {
    const { stops } = await storeWith([row('a', { command: '' }), row('b', { started_ms: T0 - 60_000 }), row('c', { state: 'unknown' })]);
    render(<ShellJobRows stops={stops} now={T0 + 30_000} />);
    expect(items()[0]!).toHaveTextContent('A shell jobRunning · started just now');
    expect(items()[1]!).toHaveTextContent('cmd bRunning for 1 minute');
    expect(items()[2]!).toHaveTextContent('cmd cMay still be running');
    expect(items()[2]!).not.toHaveTextContent('could not be read');
  });
  it('with nothing running it renders nothing, and shownShellJobs says so, so the panel keeps its own words', async () => {
    const { stops } = await storeWith([row('a', { state: 'ended' })]);
    const { container } = render(<ShellJobRows stops={stops} now={T0} />);
    expect(container).toBeEmptyDOMElement();
    expect(shownShellJobs(stops.snapshot())).toEqual([]);
  });
  it('a Stop is never offered on a row the per-session list did not name, whatever else the store holds', () => {
    // A store whose list names only `a`, holding an attempt for `zzz` (never listed) and answering ok for any id.
    const listed: JobRow = { jobId: 'a', command: 'cmd a', startedMs: T0, state: 'running', lastLine: '', remote: false };
    const snap: ShellJobStopsSnapshot = { rows: [listed], listUnreadable: false, attempts: new Map([['zzz', { phase: 'unknown', checking: false }]]), attemptRows: new Map() };
    const fake: ShellJobStops = {
      snapshot: () => snap, subscribe: () => () => undefined, refresh: async () => undefined,
      canStop: () => ({ k: 'ok' }), stop: vi.fn(async () => ({ k: 'refused' as const, why: 'busy' as const })), check: vi.fn(async () => undefined),
    };
    render(<ShellJobRows stops={fake} now={T0} />);
    expect(items()).toHaveLength(1);
    expect(stopButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Stop cmd a']);
    expect(screen.queryByText(/zzz/)).toBeNull();
    expect(screen.queryByRole('button', { name: strings['sj.checkAgain'] })).toBeNull();
  });
  it('an unknown Stop whose job a Check read no longer lists keeps its row: status and Check again, no Stop', async () => {
    const { stops } = await storeWith([row('a', { last_line: 'tick' })], { replies: [new Error('lost')], lists: [{ ok: true, body: { items: [] } }] });
    render(<ShellJobRows stops={stops} now={T0} />);
    await act(async () => { await stops.stop('a'); });
    await act(async () => { await stops.check('a'); });
    expect(stops.snapshot().rows).toEqual([]);
    expect(items()).toHaveLength(1);
    expect(items()[0]!).toHaveTextContent('cmd aNo longer listedThis may have gone through.Check again');
    expect(items()[0]!).not.toHaveTextContent('tick');
    expect(stopButtons()).toEqual([]);
    expect(shownShellJobs(stops.snapshot())).toEqual([{ row: expect.objectContaining({ jobId: 'a' }), listed: false }]);
  });
  it('a settled Stop on a job the list no longer names is not kept', async () => {
    const { stops } = await storeWith([row('a')], { replies: [ans('a', { outcome: 'stopped' })], lists: [{ ok: true, body: { items: [] } }] });
    await stops.stop('a');
    await stops.refresh();
    expect(shownShellJobs(stops.snapshot())).toEqual([]);
  });
  it('without the activation gate a row has no Stop and says it stops with this chat\'s Stop', async () => {
    const { stops } = await storeWith([row('a')], { gate: () => ({ ok: false, reason: 'prerequisites', missing: ['attachment'] }) });
    render(<ShellJobRows stops={stops} now={T0} />);
    expect(stopButtons()).toEqual([]);
    expect(items()[0]!).toHaveTextContent("Running · started just now · Stops with this chat's Stop");
  });
  it('an unknown Stop on a row the gate now refuses offers Check again but no new Stop', () => {
    const listed: JobRow = { jobId: 'a', command: 'cmd a', startedMs: T0, state: 'running', lastLine: '', remote: false };
    const snap: ShellJobStopsSnapshot = { rows: [listed], listUnreadable: false, attempts: new Map([['a', { phase: 'unknown', checking: false }]]), attemptRows: new Map([['a', listed]]) };
    const fake: ShellJobStops = {
      snapshot: () => snap, subscribe: () => () => undefined, refresh: async () => undefined,
      canStop: () => ({ k: 'refused', why: 'capability', capability: { ok: false, reason: 'closed' } }),
      stop: vi.fn(async () => ({ k: 'refused' as const, why: 'capability' as const })), check: vi.fn(async () => undefined),
    };
    render(<ShellJobRows stops={fake} now={T0} />);
    expect(stopButtons()).toEqual([]);
    expect(screen.getByRole('button', { name: strings['sj.checkAgain'] })).toBeInTheDocument();
  });
});

describe('ShellJobRows: a Stop shows only what its answer proved', () => {
  const CASES: Array<[string, unknown, string, boolean]> = [
    ['stopped', ans('a', { outcome: 'stopped' }), 'Stopped', true],
    ['already ended', ans('a', { outcome: 'stopped', already_ended: true }), 'Not running now', true],
    ['still running', ans('a', { outcome: 'failed', reason: 'still_running', remote: true }), 'Still running: the stop did not take', true],
    ['unsafe record', ans('a', { outcome: 'failed', reason: 'unsafe_record', remote: true }), 'Not stopped: the agent could not act on this job safely', true],
    ['503', { ok: false, status: 503, code: 'service_unavailable' }, 'Not sent; nothing stopped', true],
    ['404', { ok: false, status: 404, code: 'bash_job_not_found' }, 'This job is gone', true],
  ];
  for (const [name, reply, words, offersStop] of CASES) {
    it(`${name}: "${words}"`, async () => {
      const { stops, stop } = await storeWith([row('a')], { replies: [reply] });
      render(<ShellJobRows stops={stops} now={T0} />);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop cmd a' })); });
      expect(stop).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(words);
      expect(screen.queryByRole('button', { name: strings['sj.checkAgain'] })).toBeNull();
      // The row is still listed as running in this store, so a new Stop (a new key) stays on offer.
      expect(stopButtons().length > 0).toBe(offersStop);
    });
  }
  it('while the stop is out it reads "Stopping…" and offers nothing to press', async () => {
    let release!: (v: unknown) => void;
    const stop = vi.fn(() => new Promise<unknown>((r) => { release = r; }));
    const stops = createShellJobStops({ chat: { computer: 'atlas', realm: 'global', sid: 's-1' }, list: async () => ({ ok: true, body: { items: [row('a')] } }), stop, newKey: () => 'k', can: () => ({ ok: true }) });
    await stops.refresh();
    render(<ShellJobRows stops={stops} now={T0} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop cmd a' })); });
    expect(screen.getByRole('status')).toHaveTextContent('Stopping…');
    expect(screen.queryAllByRole('button')).toEqual([]);
    await act(async () => { release(ans('a', { outcome: 'stopped' })); });
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('an unknown answer: "This may have gone through." with Check again and its hint; Check again reads and never sends', async () => {
    const { stops, stop, list } = await storeWith([row('a')], { replies: [new Error('lost')], lists: [{ ok: true, body: { items: [row('a', { state: 'ended' })] } }] });
    render(<ShellJobRows stops={stops} now={T0} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop cmd a' })); });
    expect(screen.getByRole('status')).toHaveTextContent('This may have gone through.');
    expect(screen.getByText('Reads what happened; never sends it again.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['sj.checkAgain'] })); });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Not running now');
    expect(items()[0]!).toHaveTextContent('Ended');
    expect(stopButtons()).toEqual([]);
  });
});
