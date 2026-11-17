// Vitest ("parse at the boundary"): the per-session job list and a per-job stop's reply, read whole.
// A table of the real shapes the agent sends (its bash-job routes and job handlers, local and remote), a
// malformed row per field, contradiction rows (pairs the agent never sends), the identity check against the captured job, and
// what each parsed reply proves. Only positive evidence is "stopped"; a lost or unreadable answer is unknown.
import { describe, expect, it } from 'vitest';
import { evidenceOfRead, evidenceOfStop, parseJobList, parseJobStopReply, type JobRow, type JobTarget, type StopEvidence } from './jobStop';

const job: JobTarget = { jobId: 'bg-7' };
const row = { job_id: 'bg-7', command: 'npm run dev', started_ms: 1_761_800_000_000, state: 'running', last_line: 'ready on :5173', remote: false };
const ans = (o: Record<string, unknown>) => ({ ok: true, status: 200, body: { job_id: 'bg-7', already_ended: false, remote: false, duplicate: false, ...o } });
const refusal = (status: number, code: string) => ({ ok: false, status, code });

describe('parseJobList', () => {
  it('reads the agent\'s list whole: every field, in order', () => {
    const remote = { ...row, job_id: 'r-1', state: 'unknown', remote: true, last_line: '' };
    expect(parseJobList({ items: [row, remote] })).toEqual([
      { jobId: 'bg-7', command: 'npm run dev', startedMs: 1_761_800_000_000, state: 'running', lastLine: 'ready on :5173', remote: false },
      { jobId: 'r-1', command: 'npm run dev', startedMs: 1_761_800_000_000, state: 'unknown', lastLine: '', remote: true },
    ]);
    expect(parseJobList({ items: [] })).toEqual([]);
    expect(parseJobList({ items: [{ ...row, state: 'ended' }] })).not.toBe('unknown');
  });

  const MALFORMED: Array<[string, unknown]> = [
    ['job_id missing', { ...row, job_id: undefined }],
    ['job_id empty', { ...row, job_id: '' }],
    ['job_id not a string', { ...row, job_id: 7 }],
    ['command not a string', { ...row, command: null }],
    ['started_ms a string', { ...row, started_ms: '1' }],
    ['started_ms negative', { ...row, started_ms: -1 }],
    ['started_ms fractional', { ...row, started_ms: 1.5 }],
    ['state outside the set', { ...row, state: 'stopped' }],
    ['state not a string', { ...row, state: true }],
    ['last_line not a string', { ...row, last_line: 3 }],
    ['remote not a boolean', { ...row, remote: 'false' }],
    ['row not an object', 'bg-7'],
    ['row an array', [row]],
  ];
  for (const [name, bad] of MALFORMED) {
    it(`one unreadable row makes the whole list unknown: ${name}`, () => {
      const b = typeof bad === 'object' && bad && !Array.isArray(bad) ? JSON.parse(JSON.stringify(bad)) : bad;
      expect(parseJobList({ items: [{ ...row, job_id: 'ok-1' }, b] })).toBe('unknown');
    });
  }
  for (const k of Object.keys(row)) {
    it(`a row without ${k} is unknown (every field is required)`, () => {
      const r: Record<string, unknown> = { ...row };
      delete r[k];
      expect(parseJobList({ items: [r] })).toBe('unknown');
    });
  }
  it('two rows with one id: nothing in the list is trusted', () => {
    expect(parseJobList({ items: [row, { ...row, state: 'ended' }] })).toBe('unknown');
  });
  it('not a list answer', () => {
    for (const b of [null, [], 'x', {}, { items: null }, { items: {} }]) expect(parseJobList(b)).toBe('unknown');
  });
});

describe('parseJobStopReply: real shapes', () => {
  const REAL: Array<[string, unknown, StopEvidence]> = [
    ['stopped (this machine, the job exited on the signal)', ans({ outcome: 'stopped' }), 'stopped'],
    ['stopped, had ended before: not running now, never "stopped"', ans({ outcome: 'stopped', already_ended: true }), 'not_running'],
    ['stopped on the container', ans({ outcome: 'stopped', remote: true }), 'stopped'],
    ['a same-key retry answers the first outcome', ans({ outcome: 'stopped', duplicate: true }), 'stopped'],
    ['failed: the container job still runs', ans({ outcome: 'failed', reason: 'still_running', remote: true }), 'running'],
    ['failed: unsafe record, nothing signalled', ans({ outcome: 'failed', reason: 'unsafe_record', remote: true }), 'running'],
    ['unknown: unconfirmed on the container', ans({ outcome: 'unknown', reason: 'unconfirmed', remote: true }), 'unknown'],
    ['unknown: unconfirmed here (a panic in the stop)', ans({ outcome: 'unknown', reason: 'unconfirmed' }), 'unknown'],
    ['unknown: end not seen here', ans({ outcome: 'unknown', reason: 'end_not_seen' }), 'unknown'],
    ['unknown: a reply the gateway could not read (no reason)', ans({ outcome: 'unknown' }), 'unknown'],
    ['404 bash_job_not_found', refusal(404, 'bash_job_not_found'), 'gone'],
    ['422 idempotency_key_reused: our one-key contract broke, an earlier send may have acted', refusal(422, 'idempotency_key_reused'), 'unknown'],
    ['503 service_unavailable (receipts full)', refusal(503, 'service_unavailable'), 'not_sent'],
    ['400 bad_request', refusal(400, 'bad_request'), 'not_sent'],
  ];
  for (const [name, r, ev] of REAL) {
    it(`${name} -> ${ev}`, () => {
      const p = parseJobStopReply(job, r);
      expect(p.kind).not.toBe('unknown');
      expect(evidenceOfStop(p)).toBe(ev);
    });
  }
  it('the parsed answer carries what the agent said', () => {
    expect(parseJobStopReply(job, ans({ outcome: 'stopped', already_ended: true, remote: true, duplicate: true })))
      .toEqual({ kind: 'answer', outcome: 'stopped', alreadyEnded: true, remote: true, duplicate: true });
    expect(parseJobStopReply(job, ans({ outcome: 'failed', reason: 'still_running', remote: true })))
      .toEqual({ kind: 'answer', outcome: 'failed', reason: 'still_running', remote: true, duplicate: false });
    expect(parseJobStopReply(job, ans({ outcome: 'unknown', reason: 'end_not_seen' })))
      .toEqual({ kind: 'answer', outcome: 'unknown', reason: 'end_not_seen', remote: false, duplicate: false });
    expect(parseJobStopReply(job, ans({ outcome: 'unknown' }))).toEqual({ kind: 'answer', outcome: 'unknown', remote: false, duplicate: false });
    expect(parseJobStopReply(job, refusal(404, 'bash_job_not_found'))).toEqual({ kind: 'refused', code: 'bash_job_not_found' });
  });
});

describe('parseJobStopReply: malformed, contradictory or not ours -> unknown', () => {
  const omit = (k: string) => { const r = ans({ outcome: 'stopped' }); delete (r.body as Record<string, unknown>)[k]; return r; };
  const BAD: Array<[string, unknown]> = [
    // discriminator and envelope
    ['not an object', 'stopped'],
    ['null', null],
    ['ok missing', { status: 200, body: ans({ outcome: 'stopped' }).body }],
    ['ok truthy, not true', { ok: 1, status: 200, body: ans({ outcome: 'stopped' }).body }],
    ['ok false-ish string', { ok: 'false', status: 404, code: 'bash_job_not_found' }],
    ['success with a code', { ...ans({ outcome: 'stopped' }), code: 'x' }],
    ['success with details', { ...ans({ outcome: 'stopped' }), details: {} }],
    ['success with status 202', { ...ans({ outcome: 'stopped' }), status: 202 }],
    ['success with status 500', { ...ans({ outcome: 'stopped' }), status: 500 }],
    ['success with status 204', { ...ans({ outcome: 'stopped' }), status: 204 }],
    ['success with status 0 (not read)', { ...ans({ outcome: 'stopped' }), status: 0 }],
    ['success with status "200"', { ...ans({ outcome: 'stopped' }), status: '200' }],
    ['success without a body', { ok: true, status: 200 }],
    ['refusal carrying a body', { ...refusal(404, 'bash_job_not_found'), body: {} }],
    // identity
    ['another job', ans({ outcome: 'stopped', job_id: 'bg-8' })],
    ['job_id missing', omit('job_id')],
    ['job_id not a string', ans({ outcome: 'stopped', job_id: 7 })],
    // fields
    ['outcome missing', omit('outcome')],
    ['outcome outside the set', ans({ outcome: 'killed' })],
    ['already_ended missing', omit('already_ended')],
    ['already_ended not a boolean', ans({ outcome: 'stopped', already_ended: 'true' })],
    ['remote missing', omit('remote')],
    ['remote not a boolean', ans({ outcome: 'stopped', remote: 1 })],
    ['duplicate missing', omit('duplicate')],
    ['duplicate not a boolean', ans({ outcome: 'stopped', duplicate: 'no' })],
    ['reason not a string', ans({ outcome: 'unknown', reason: 3 })],
    ['a field the agent does not send', ans({ outcome: 'stopped', status: 'ok' })],
    // contradictions (pairs the agent never sends)
    ['stopped with a reason', ans({ outcome: 'stopped', reason: 'still_running' })],
    ['failed without a reason', ans({ outcome: 'failed', remote: true })],
    ['failed with an unknown-outcome reason', ans({ outcome: 'failed', reason: 'unconfirmed', remote: true })],
    ['failed on this machine', ans({ outcome: 'failed', reason: 'still_running', remote: false })],
    ['failed but already ended', ans({ outcome: 'failed', reason: 'still_running', remote: true, already_ended: true })],
    ['unknown but already ended', ans({ outcome: 'unknown', reason: 'unconfirmed', already_ended: true })],
    ['unknown with a failed reason', ans({ outcome: 'unknown', reason: 'still_running' })],
    ['unknown, end not seen, on the container', ans({ outcome: 'unknown', reason: 'end_not_seen', remote: true })],
    ['unknown with a reason outside the set', ans({ outcome: 'unknown', reason: 'timeout' })],
    // refusals
    ['refusal without a code', { ok: false, status: 404 }],
    ['refusal code not a string', { ok: false, status: 404, code: 404 }],
    ['refusal code outside the set', refusal(409, 'conflict')],
    ['not_found for the session (not the job)', refusal(404, 'not_found')],
    ['404 code with another status', refusal(410, 'bash_job_not_found')],
    ['422 code with another status', refusal(409, 'idempotency_key_reused')],
    ['503 code with another status', refusal(500, 'service_unavailable')],
    ['400 code with another status', refusal(422, 'bad_request')],
    ['refusal without a status', { ok: false, code: 'bash_job_not_found' }],
    ['a code the agent never sends, without a status', { ok: false, code: 'unexpected' }],
    ['a prototype key as the code', { ok: false, status: 404, code: 'toString' }],
  ];
  for (const [name, r] of BAD) {
    it(name, () => {
      const p = parseJobStopReply(job, r);
      expect(p).toEqual({ kind: 'unknown' });
      expect(evidenceOfStop(p)).toBe('unknown');
    });
  }
  it('a success without a status proves nothing (only a 200 does)', () => {
    for (const already of [false, true]) {
      const p = parseJobStopReply(job, { ok: true, body: ans({ outcome: 'stopped', already_ended: already }).body });
      expect(p).toEqual({ kind: 'unknown' });
      expect(evidenceOfStop(p)).toBe('unknown');
    }
  });
});

describe('evidenceOfRead: Check again reads the list and settles only "not running now"', () => {
  const r = (state: JobRow['state'], jobId = 'bg-7'): JobRow => ({ jobId, command: 'x', startedMs: 1, state, lastLine: '', remote: false });
  it('ended -> not_running; running, unknown, absent or unreadable -> unknown', () => {
    expect(evidenceOfRead([r('ended')], job)).toBe('not_running');
    expect(evidenceOfRead([r('running')], job)).toBe('unknown');
    expect(evidenceOfRead([r('unknown')], job)).toBe('unknown');
    expect(evidenceOfRead([r('ended', 'bg-8')], job)).toBe('unknown');
    expect(evidenceOfRead([], job)).toBe('unknown');
    expect(evidenceOfRead('unknown', job)).toBe('unknown');
  });
});

describe('evidenceOfStop: only a stopped answer is "stopped"', () => {
  it('maps each parsed kind', () => {
    expect(evidenceOfStop({ kind: 'answer', outcome: 'stopped', alreadyEnded: false, remote: false, duplicate: false })).toBe('stopped');
    expect(evidenceOfStop({ kind: 'answer', outcome: 'stopped', alreadyEnded: true, remote: false, duplicate: true })).toBe('not_running');
    expect(evidenceOfStop({ kind: 'refused', code: 'idempotency_key_reused' })).toBe('unknown');
    expect(evidenceOfStop({ kind: 'refused', code: 'bad_request' })).toBe('not_sent');
    expect(evidenceOfStop({ kind: 'answer', outcome: 'failed', reason: 'unsafe_record', remote: true, duplicate: false })).toBe('running');
    expect(evidenceOfStop({ kind: 'answer', outcome: 'unknown', remote: true, duplicate: true })).toBe('unknown');
    expect(evidenceOfStop({ kind: 'refused', code: 'bash_job_not_found' })).toBe('gone');
    expect(evidenceOfStop({ kind: 'refused', code: 'service_unavailable' })).toBe('not_sent');
    expect(evidenceOfStop({ kind: 'unknown' })).toBe('unknown');
  });
});
