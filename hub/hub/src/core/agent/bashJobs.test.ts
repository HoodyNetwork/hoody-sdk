// bashJobsApi: the list is a fresh read of the path session's jobs; the stop is one keyed POST per call with the
// caller's key and no body, the realm named only when given; the adapters pass the agent's real answers on as plain data
// (status and code of a refusal, status 0 for a lost answer); the kit parser (kit/agent/jobStop.ts) reads them.
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '../transport';
import { boot, R1, R2, TARGET } from '../test/env';
import { bashJobsApi, jobListReplyOf, jobStopReplyOf } from './bashJobs';

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown; network?: boolean } = () => ({ status: 200, body: { items: [] } });
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
const header = (r: Req, h: string): string | null => new Headers(r.init.headers).get(h);
const env = (code: string) => ({ code, message: 'x' });

describe('bashJobsApi', () => {
  it('list: GET the path session\'s bash-jobs in the chat\'s realm', async () => {
    page();
    reply = () => ({ status: 200, body: { items: [] } });
    const r = await bashJobsApi(TARGET).list('s-1', R2);
    expect(reqs.map((q) => [q.init.method, new URL(q.url).pathname])).toEqual([['GET', '/api/v1/agent/sessions/s-1/bash-jobs']]);
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
    expect(jobListReplyOf(r)).toEqual({ ok: true, body: { items: [] } });
  });
  it('stop: one POST with the caller\'s key and no body; the realm is the page\'s unless named', async () => {
    page();
    reply = () => ({ status: 200, body: { job_id: 'bg 7', outcome: 'stopped', already_ended: false, remote: false, duplicate: false } });
    await bashJobsApi(TARGET).stop('s-1', 'bg 7', 'k-1');
    await bashJobsApi(TARGET).stop('s-1', 'bg 7', 'k-2', R2);
    expect(reqs.map((q) => [q.init.method, new URL(q.url).pathname])).toEqual([
      ['POST', '/api/v1/agent/sessions/s-1/bash-jobs/bg%207/stop'], ['POST', '/api/v1/agent/sessions/s-1/bash-jobs/bg%207/stop'],
    ]);
    expect(header(reqs[0]!, 'Idempotency-Key')).toBe('k-1');
    expect(header(reqs[1]!, 'Idempotency-Key')).toBe('k-2');
    expect(reqs[0]!.url).toContain(`realm=${R1}`);
    expect(reqs[1]!.url).toContain(`realm=${R2}`);
    for (const q of reqs) expect(q.init.body ?? null).toBeNull();
  });
  it('a lost answer is never resent and reads as unknown', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const r = await bashJobsApi(TARGET).stop('s-1', 'bg-7', 'k-1');
    expect(reqs).toHaveLength(1);
    expect(jobStopReplyOf(r)).toMatchObject({ ok: false, status: 0 });
  });
  it.each([
    ['200 stopped', 200, { job_id: 'bg-7', outcome: 'stopped', already_ended: false, remote: false, duplicate: false }],
    ['200 unknown', 200, { job_id: 'bg-7', outcome: 'unknown', reason: 'unconfirmed', already_ended: false, remote: true, duplicate: false }],
  ] as const)('a 200 (%s) reaches the kit parser as its status and raw body', async (_n, status, body) => {
    page();
    reply = () => ({ status, body });
    expect(jobStopReplyOf(await bashJobsApi(TARGET).stop('s-1', 'bg-7', 'k-1'))).toEqual({ ok: true, status: 200, body });
  });
  it.each([202, 201, 203])('a %i stop answer keeps its own status beside its body', async (status) => {
    page();
    const body = { job_id: 'bg-7', outcome: 'stopped', already_ended: false, remote: false, duplicate: false };
    reply = () => ({ status, body });
    expect(jobStopReplyOf(await bashJobsApi(TARGET).stop('s-1', 'bg-7', 'k-1'))).toEqual({ ok: true, status, body });
  });
  it('a success whose status was not read (an answer without {status, body}) has status 0', () => {
    expect(jobStopReplyOf({ ok: true, body: { job_id: 'bg-7' } })).toEqual({ ok: true, status: 0, body: undefined });
    expect(jobStopReplyOf({ ok: true, body: null })).toEqual({ ok: true, status: 0, body: undefined });
  });
  it('the list route does not read its status: its answer is the body alone', async () => {
    page();
    reply = () => ({ status: 202, body: { items: [] } });
    expect(await bashJobsApi(TARGET).list('s-1')).toEqual({ ok: true, body: { items: [] } });
  });
  it.each([
    [404, 'bash_job_not_found'], [422, 'idempotency_key_reused'], [503, 'service_unavailable'], [500, 'internal_error'], [404, 'not_found'], [400, 'bad_request'],
  ] as const)('a refusal %i %s reaches the kit parser as its status and code, and is never resent', async (status, code) => {
    page();
    reply = () => ({ status, body: env(code) });
    expect(jobStopReplyOf(await bashJobsApi(TARGET).stop('s-1', 'bg-7', 'k-1'))).toEqual({ ok: false, status, code });
    expect(reqs).toHaveLength(1);
  });
  it('an unreadable list read is not readable', async () => {
    page();
    reply = () => ({ status: 500, body: env('internal_error') });
    expect(jobListReplyOf(await bashJobsApi(TARGET).list('s-1'))).toEqual({ ok: false });
  });
});
