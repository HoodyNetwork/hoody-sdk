// ErrorOf takes details.code only for hoody-exec's own API (a
// non-run route of the exec kit), on a 4xx other than 429, when the top-level code is the generic ERROR_<that status>; a specific
// top-level code always stays. A promoted code names a cause, never a refusal: it never marks notApplied. Every other caller
// keeps its meaning: send() for other kits, a script answering on the exec host and the agent; upload.ts (sendFile).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { errorOf } from './kit';
import { run } from './kit-io';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { sendFile, setUploadEngineForTests } from './upload';
import { boot, onFetch, R1, TARGET } from './test/env';

const res = (status: number) => new Response(null, { status });
const of = (status: number, body: unknown, nested = true) => errorOf(res(status), JSON.stringify(body), nested);
const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);
const exec409 = (code: string) => ({ error: 'nothing was changed', code: 'ERROR_409', details: { code } });

describe('errorOf: the code a kit names', () => {
  it('nested (exec API): a generic ERROR_<status> 4xx with a string details.code gives the cause, marked promoted', () => {
    expect(of(409, exec409('REVISION_MISMATCH'))).toMatchObject({ code: 'REVISION_MISMATCH', promoted: true });
    expect(of(400, { code: 'ERROR_400', details: { code: 'UNROUTABLE_PATH', path: 'a' } })).toMatchObject({ code: 'UNROUTABLE_PATH', promoted: true });
  });
  it('not nested (every other caller): the generic code stays, nothing promoted', () => {
    const x = of(409, exec409('REVISION_MISMATCH'), false);
    expect(x.code).toBe('ERROR_409');
    expect(x.promoted).toBeUndefined();
  });
  it('a specific top-level code always stays, whatever details names', () => {
    expect(of(409, { code: 'SESSION_BUSY', details: { code: 'OTHER' } }).code).toBe('SESSION_BUSY');
    expect(of(404, { code: 'not_found', details: { code: 'gone' } }).code).toBe('not_found');
    expect(of(409, { code: 'ERROR_CONFLICT', details: { code: 'X' } }).code).toBe('ERROR_CONFLICT');
    expect(of(409, { error: 'revision_conflict', details: { code: 'X' } }).code).toBe('revision_conflict');
  });
  it('never a 5xx or a 429, another status, or details.code that is missing, empty, too long or not a string', () => {
    for (const [status, body] of [
      [500, { code: 'ERROR_500', details: { code: 'revision_conflict' } }],
      [503, { code: 'ERROR_503', details: { code: 'X' } }],
      [429, { code: 'ERROR_429', details: { code: 'quota' } }],
      [400, exec409('REVISION_MISMATCH')],
      [409, { code: 'ERROR_4090', details: { code: 'X' } }],
      [404, { error: 'Script not found', code: 'ERROR_404', details: { path: 'default/1/a.ts' } }],
      [409, { code: 'ERROR_409', details: { code: 7 } }],
      [409, { code: 'ERROR_409', details: { code: '' } }],
      [409, { code: 'ERROR_409', details: { code: 'X'.repeat(65) } }],
      [409, { code: 'ERROR_409', details: ['REVISION_MISMATCH'] }],
    ] as Array<[number, Record<string, unknown>]>) {
      const x = of(status, body);
      expect(x.code, JSON.stringify([status, body])).toBe(body.code);
      expect(x.promoted).toBeUndefined();
    }
  });
  it('details and data stay as sent (raw readers such as execSaysAbsent still see the body)', () => {
    const body = { error: 'x', code: 'ERROR_409', details: { code: 'REVISION_MISMATCH', path: 'p' } };
    const x = of(409, body);
    expect(x.details).toEqual(body.details);
    expect(x.data).toEqual(body);
  });
  it('no body, a body that is not JSON, a non-object: no code', () => {
    expect(errorOf(res(409), null, true).code).toBeNull();
    expect(errorOf(res(409), 'nope', true).code).toBeNull();
    expect(errorOf(res(409), '["ERROR_409"]', true).code).toBeNull();
  });
});

describe('errorOf through send(): only hoody-exec\'s own API is promoted', () => {
  const execApi = defineRoute({ method: 'POST', path: '/api/v1/exec/scripts/restore', scope: 'kit', kit: 'exec', index: 1, body: ['path'] });
  const execRun = defineRoute({ method: 'POST', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true });
  const termWrite = defineRoute({ method: 'POST', path: '/api/v1/terminal/write', scope: 'kit', kit: 'terminal', index: 15001, body: ['input'] });
  const logs = defineRoute({ method: 'GET', path: '/_logs', scope: 'kit', kit: 'logs', index: 1 });
  const agentPut = defineRoute({ method: 'PUT', path: '/things/:id', scope: 'agent', body: ['x'], refuses: ['revision_conflict'] });
  it('exec API: the cause; no promoted mark on the rejection', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: exec409('REVISION_MISMATCH') }));
    const e = (await outcome(api(execApi, { body: { path: 'default/1/a.ts' } }))) as HubError & { promoted?: unknown };
    expect(e).toMatchObject({ code: 'REVISION_MISMATCH', kind: 'refused', status: 409 });
    expect(e.promoted).toBeUndefined();
    expect(e.notApplied).toBeUndefined();
  });
  it('a script answering on the exec host (run route) is not hoody-exec: its answer is the script\'s own, read as is', async () => {
    boot({ realm: R1 });
    const body = JSON.stringify(exec409('REVISION_MISMATCH'));
    onFetch(() => ({ status: 409, body: exec409('REVISION_MISMATCH') }));
    const a = await run(execRun, TARGET, '/my-script', { method: 'POST' });
    expect(a.status).toBe(409);
    expect(JSON.parse(a.body as string)).toEqual(JSON.parse(body));
  });
  it('terminal and logs kits: a generic envelope with a nested code stays generic; 429 stays rate_limited', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: exec409('SESSION_BUSY') }));
    expect(await outcome(api(termWrite, { body: { input: 'ls' } }))).toMatchObject({ code: 'ERROR_409', kind: 'refused' });
    onFetch(() => ({ status: 409, body: { code: 'SESSION_BUSY', details: { code: 'REVISION_MISMATCH' } } }));
    expect(await outcome(api(termWrite, { body: { input: 'ls' } }))).toMatchObject({ code: 'SESSION_BUSY' });
    onFetch(() => ({ status: 400, body: { code: 'ERROR_400', details: { code: 'BAD_LIMIT' } } }));
    expect(await outcome(api(logs, {}))).toMatchObject({ code: 'ERROR_400', kind: 'bad_request' });
    onFetch(() => ({ status: 429, body: { code: 'ERROR_429', details: { code: 'quota' } } }));
    expect(await outcome(api(logs, {}))).toMatchObject({ code: 'ERROR_429', kind: 'rate_limited' });
  });
  it('an agent generic 500 or 409 naming a listed refusal in details is never a definite refusal', async () => {
    boot({ realm: R1 });
    for (const status of [500, 409]) {
      onFetch(() => ({ status, body: { code: `ERROR_${status}`, details: { code: 'revision_conflict' } } }));
      const e = (await outcome(api(agentPut, { params: { id: 'a' }, body: { x: 1 } }))) as HubError;
      expect(e.code).toBe(`ERROR_${status}`);
      expect(e.notApplied).toBeUndefined();
    }
    onFetch(() => ({ status: 409, body: { code: 'revision_conflict', message: 'x', details: { code: 'ERROR_409' } } }));
    expect(await outcome(api(agentPut, { params: { id: 'a' }, body: { x: 1 } }))).toMatchObject({ code: 'revision_conflict', notApplied: true });
  });
});

describe('errorOf through sendFile (upload.ts): never promoted', () => {
  const put = defineRoute({ method: 'PUT', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1, file: true, timeoutMs: 60_000 });
  let answer: { status: number; body: string } = { status: 201, body: '{}' };
  const fake: Transport = {
    hoody: () => Promise.reject(new Error('not used')),
    fetch: () => Promise.resolve(new Response(answer.body, { status: answer.status, headers: { 'content-type': 'application/json' } })),
  };
  beforeEach(() => { boot({ realm: R1 }); installTransport(fake); setUploadEngineForTests(null); });
  afterEach(() => { installTransport(null); setUploadEngineForTests(null); });
  it('a generic files-shaped envelope with a nested decision code keeps the generic code (409 and 429)', async () => {
    for (const [status, nested, kind] of [[409, 'DESTINATION_EXISTS', 'refused'], [429, 'quota', 'rate_limited']] as const) {
      answer = { status, body: JSON.stringify({ code: `ERROR_${status}`, details: { code: nested } }) };
      const o = await sendFile(put, { params: { path: ['tmp', 'a.txt'] }, target: TARGET, file: new Blob(['abc']), create: true, beforeSend: () => {} });
      expect(o).toMatchObject({ outcome: 'refusal', rejection: { code: `ERROR_${status}`, kind, status } });
      expect((o as { rejection: { promoted?: unknown } }).rejection.promoted).toBeUndefined();
    }
  });
});
