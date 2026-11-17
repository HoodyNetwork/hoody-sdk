// an io frozen on server X (an engine's liveIO, a chat's shellJobsIO)
// sends nothing new once the computer's latest accepted row withholds server_name, and its stream (and every reconnect) is
// refused before a request; once a row names X again the same io works, with nothing replayed on its own.
import { noteComputerRows } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, UID, type Call, type Reply } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { liveIO, shellJobsIO, type StreamHandlers } from './data';

const X = TARGET.container.server_name!;
const C = TARGET.container.id;
const row = (server_name: unknown) => ({ id: C, project_id: TARGET.project.id, server_name });
const toX = (): Call[] => calls.filter((c) => c.url.startsWith(AGENT) || c.url.includes(`.${X}.`));
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string; notSent?: boolean }) => e);

beforeEach(() => {
  boot({ realm: R1 });
  onFetch((): Reply => ({ status: 200, body: { data: {} } }));
  noteComputerRows(UID, [row(X)]);
});

describe('an io frozen on X, then the row withholds the server', () => {
  it('liveIO: health, a recovery read and a stream send nothing; the same io works again once the row names X', async () => {
    const io = liveIO(TARGET);
    expect(await outcome(io.health())).toBe('ok');
    const n = toX().length;
    noteComputerRows(UID, [row(null)]);
    expect(await outcome(io.health())).toMatchObject({ notSent: true, code: 'NO_AGENT_URL' });
    expect(await outcome(io.turnByKey('s1', 'k-1', R1))).toMatchObject({ notSent: true });
    const log: string[] = [];
    const h: StreamHandlers = { open: () => log.push('open'), frame: (f) => log.push(f), error: () => log.push('error') };
    const s = io.stream('s1', null, R1, h);
    await settle();
    s?.close();
    expect(log).not.toContain('open');
    expect(toX().length, 'zero new requests to X').toBe(n);
    noteComputerRows(UID, [row(X)]);
    await settle();
    expect(toX().length, 'nothing replayed when X comes back').toBe(n);
    expect(await outcome(io.health())).toBe('ok');
    expect(toX().length).toBe(n + 1);
  });

  it('a stream already running keeps its connection; a new session joining it while withheld is refused, closing nothing', async () => {
    // The multiplexed connection stays open (the answer never comes within the test).
    onFetch((): Reply => ({ status: 200, delayMs: 60_000, headers: { 'content-type': 'text/event-stream' }, text: '' }));
    const io = liveIO(TARGET);
    const a: string[] = [], b: string[] = [];
    const ha: StreamHandlers = { open: () => a.push('open'), frame: (f) => a.push(f), error: () => a.push('error') };
    const hb: StreamHandlers = { open: () => b.push('open'), frame: (f) => b.push(f), error: () => b.push('error') };
    const sa = io.stream('s1', null, R1, ha);
    await settle();
    const n = toX().length;
    expect(n, 'A is out').toBeGreaterThan(0);
    noteComputerRows(UID, [row(null)]);
    const sb = io.stream('s2', null, R1, hb);
    await settle();
    expect(b).toEqual(['error']);
    expect(a, 'A was not closed or failed').toEqual([]);
    expect(toX().length, 'no reconnect, no new request').toBe(n);
    sa?.close(); sb?.close();
  });

  it('shellJobsIO frozen on X: the list and a stop send nothing', async () => {
    const jobs = shellJobsIO({ project: TARGET.project.id, computer: C, server: X });
    noteComputerRows(UID, [row(null)]);
    const listed = await jobs.list({ realm: R1, sid: 's1' }).catch(() => ({ ok: false }));
    expect(listed).toMatchObject({ ok: false });
    await jobs.stop({ realm: R1, sid: 's1', jobId: 'j1' }, 'hub-' + 'a'.repeat(26)).catch(() => null);
    expect(toX().length).toBe(0);
  });
});
