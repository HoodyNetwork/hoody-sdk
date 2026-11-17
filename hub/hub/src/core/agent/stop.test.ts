// stopApi and stopPageOf: POST /stop sent once, `after` only when given, the realm named only when given;
// the answer is read as a page only when whole, and an outcome this page does not know is not "stopped".
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '../transport';
import { boot, R1, R2, TARGET } from '../test/env';
import { stopApi, stopPageOf } from './stop';

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown; network?: boolean } = () => ({ status: 200, body: { items: [], started_during_call: [], behind_cursor: [], not_covered: [], complete: true } });
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    const a = reply(r);
    if (a.network) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'content-type': 'application/json' } }));
  },
};
function page() { boot({ realm: R1 }); reqs = []; installTransport(tr); }
afterEach(() => installTransport(null));

describe('stopApi', () => {
  it('POST /stop with no cursor: an empty body; with a cursor: after, unchanged', async () => {
    page();
    await stopApi(TARGET).stop();
    await stopApi(TARGET).stop('c-1/2==');
    expect(reqs.map((r) => [r.init.method, new URL(r.url).pathname])).toEqual([['POST', '/api/v1/agent/stop'], ['POST', '/api/v1/agent/stop']]);
    expect(String(reqs[0]!.init.body ?? '{}')).not.toContain('after');
    expect(JSON.parse(String(reqs[1]!.init.body))).toEqual({ after: 'c-1/2==' });
  });
  it('the realm is the page\'s unless one is named', async () => {
    page();
    await stopApi(TARGET).stop();
    await stopApi(TARGET).stop(undefined, R2);
    expect(reqs[0]!.url).toContain(`realm=${R1}`);
    expect(reqs[1]!.url).toContain(`realm=${R2}`);
    expect(reqs[1]!.url).not.toContain(R1);
  });
  it('a lost answer is pending and the request is not sent again', async () => {
    page();
    reply = () => ({ status: 200, network: true });
    expect(await stopApi(TARGET).stop()).toMatchObject({ ok: false, err: { kind: 'pending' } });
    expect(reqs.length).toBe(1);
  });
});

describe('stopPageOf', () => {
  const whole = {
    items: [{ kind: 'session', id: 's1', outcome: 'stopped' }, { kind: 'loop', id: 'l1', outcome: 'already_done' }, { kind: 'bash_job', id: 'j1', outcome: 'failed', detail: 'did not return in time' }],
    started_during_call: [{ kind: 'session', id: 's9' }], behind_cursor: [{ kind: 'task', id: 's2/t1' }], complete: false, next_cursor: 'abc',
    not_covered: [{ kind: 'sync_request', reason: 'stop it from its computer' }, { kind: 'remote_bash_job_unowned', reason: 'old records', count: 3 }],
  };
  it('reads every part', () => {
    expect(stopPageOf(whole)).toEqual({
      items: [{ kind: 'session', id: 's1', outcome: 'stopped' }, { kind: 'loop', id: 'l1', outcome: 'already_done' }, { kind: 'bash_job', id: 'j1', outcome: 'failed', detail: 'did not return in time' }],
      started: [{ kind: 'session', id: 's9' }], behind: [{ kind: 'task', id: 's2/t1' }], complete: false, next: 'abc',
      notCovered: [{ kind: 'sync_request', reason: 'stop it from its computer' }, { kind: 'remote_bash_job_unowned', reason: 'old records', count: 3 }],
    });
  });
  const full = { items: [], started_during_call: [], behind_cursor: [], not_covered: [], complete: true };
  it('only the cursor may be absent', () => {
    expect(stopPageOf(full)).toEqual({ items: [], started: [], behind: [], complete: true, next: null, notCovered: [] });
  });
  it.each(['started_during_call', 'behind_cursor', 'not_covered'])('a page without %s says nothing about what was left: not a page', (k) => {
    const { [k]: _gone, ...rest } = full as Record<string, unknown>;
    expect(stopPageOf(rest)).toBeNull();
  });
  it('an outcome this page does not know is unknown, never stopped', () => {
    const p = stopPageOf({ ...full, items: [{ kind: 'session', id: 's1', outcome: 'cancelled' }, { kind: 'session', id: 's2' }] });
    expect(p!.items.map((i) => i.outcome)).toEqual(['unknown', 'unknown']);
  });
  it.each([
    ['null', null], ['no items', { ...full, items: undefined }], ['items not an array', { ...full, items: {} }], ['no complete', { ...full, complete: undefined }],
    ['complete as a string', { ...full, complete: 'true' }], ['an item without id', { ...full, items: [{ kind: 'session', outcome: 'stopped' }] }],
    ['an item that is a string', { ...full, items: ['x'] }], ['started not an array', { ...full, started_during_call: 'x' }],
    ['a behind row without kind', { ...full, behind_cursor: [{ id: 'x' }] }], ['an empty cursor', { ...full, complete: false, next_cursor: '' }],
    ['a numeric cursor', { ...full, complete: false, next_cursor: 7 }], ['not_covered not an array', { ...full, not_covered: {} }],
    ['not_covered without reason', { ...full, not_covered: [{ kind: 'x' }] }],
  ])('is not a page: %s', (_n, v) => { expect(stopPageOf(v)).toBeNull(); });
});
