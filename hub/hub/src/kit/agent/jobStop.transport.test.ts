// Vitest: a Stop answer read end to end, from the wire through core's readsStatus route
// (core/agent/bashJobs.ts) to the kit parser. Only a 200 proves what the body says: any other 2xx, stopped or already ended, is
// unknown (the row shows "This may have gone through." with Check again).
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '../../core/transport';
import { boot, R1, TARGET } from '../../core/test/env';
import { bashJobsApi, jobStopReplyOf } from '../../core/agent/bashJobs';
import { evidenceOfStop, parseJobStopReply } from './jobStop';

let answer: { status: number; body: unknown } = { status: 200, body: {} };
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch: () => Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } })),
};
afterEach(() => installTransport(null));

async function evidence(status: number, alreadyEnded: boolean) {
  boot({ realm: R1 });
  installTransport(tr);
  answer = { status, body: { job_id: 'bg-7', outcome: 'stopped', already_ended: alreadyEnded, remote: false, duplicate: false } };
  return evidenceOfStop(parseJobStopReply({ jobId: 'bg-7' }, jobStopReplyOf(await bashJobsApi(TARGET).stop('s-1', 'bg-7', 'k-1'))));
}

describe('a Stop answer through core to the kit parser', () => {
  it('200 stopped is "stopped"; 200 already ended is "not running now"', async () => {
    expect(await evidence(200, false)).toBe('stopped');
    expect(await evidence(200, true)).toBe('not_running');
  });
  it.each([201, 202, 203, 206])('%i with a stopped body proves nothing, already ended or not', async (status) => {
    expect(await evidence(status, false)).toBe('unknown');
    expect(await evidence(status, true)).toBe('unknown');
  });
});
