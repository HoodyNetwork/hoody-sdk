// Creating a workflow through the real core over a fake fetch: only {definition, expected_absent: true} leaves
// the browser (without expected_absent: true the PUT is an unconditional write that replaces a workflow of the same name;
// with expected_revision it is a conditional save, not a create), the answers settle to what they prove (created only on
// the agent's affirmative envelope), and a lost create's Check again only reads.
import { beforeEach, describe, expect, it } from 'vitest';
import { api, queryClient, type CallInput, type Route } from '@core';
import { AGENT, boot, calls, onFetch, R1 } from '@core/test/env';
import { checkCreate, createOutcome, nameProblem, nameTaken, NAME_MAX } from './create';
import { createOnly, sourceRoutes, workflowCreateApi, type Settled } from './sourceApi';

const DEF = { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } };
const at = (c: (typeof calls)[number]) => new URL(c.url);

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); });

/** Sends `body` through the create route as core would, and says whether anything left. */
async function sends(body: unknown): Promise<boolean> {
  onFetch(() => ({ status: 200, body: { status: 'ok', output: 'created', is_error: false } }));
  const before = calls.length;
  try { await api(sourceRoutes.create as Route, { params: { name: 'mine' }, body } as CallInput); } catch { /* refused unsent */ }
  return calls.length > before;
}

describe('the create route sends only a create', () => {
  it('PUT /workflows/{name} {definition, expected_absent: true} in the realm', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'created workflow "mine"', is_error: false } }));
    const r = await workflowCreateApi('mine', R1).create(DEF);
    expect(r).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PUT');
    expect(at(calls[0]!).pathname).toBe('/api/v1/agent/workflows/mine');
    expect(calls[0]!.url.startsWith(`${AGENT}/workflows/mine`)).toBe(true);
    expect(calls[0]!.body).toEqual({ definition: DEF, expected_absent: true });
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R1);
  });
  it('core refuses unsent a body without expected_absent, with it false, "true" or 1, with expected_revision, with any other key, or with a definition that is not an object', async () => {
    const bad: unknown[] = [
      { definition: DEF },
      { definition: DEF, expected_absent: false },
      { definition: DEF, expected_absent: 'true' },
      { definition: DEF, expected_absent: 1 },
      { definition: DEF, expected_absent: true, expected_revision: 'r1:ab' },
      { definition: DEF, expected_absent: true, name: 'other' },
      { definition: [DEF], expected_absent: true },
      { definition: 'x', expected_absent: true },
      { definition: null, expected_absent: true },
      { expected_absent: true },
      null,
    ];
    // Through core's admit/buildRequest first (the request path), then the guard on its own.
    for (const b of bad) expect(await sends(b), JSON.stringify(b)).toBe(false);
    for (const b of bad) expect(createOnly(b), JSON.stringify(b)).toBe(false);
    expect(await sends({ definition: DEF, expected_absent: true })).toBe(true);
  });
  it('the route itself is the create: a guard function and exactly the two body keys, no compare-and-swap', () => {
    expect(typeof sourceRoutes.create.guard).toBe('function');
    expect(sourceRoutes.create.body).toEqual(['definition', 'expected_absent']);
    expect(sourceRoutes.create.cas).toBeNull();
    expect(createOnly({ definition: DEF, expected_absent: true })).toBe(true);
    expect(createOnly(Object.assign(Object.create({ extra: 1 }), { definition: DEF, expected_absent: true }))).toBe(true);
  });
});

describe('what a create answer means', () => {
  const env = (body: Record<string, unknown>) => () => ({ status: 200, body: { status: 'ok', ...body } });
  it('created; already_exists wrote nothing; reserved_name, daemon_paused and invalid_definition are refusals with their reason', async () => {
    onFetch(env({ output: 'created', is_error: false }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toEqual({ k: 'created' });
    onFetch(env({ output: 'Error [already_exists]: a workflow named "mine" already exists', is_error: true, code: 'already_exists' }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toEqual({ k: 'exists' });
    onFetch(() => ({ status: 400, body: { code: 'reserved_name', message: 'workflow name "runs" is reserved' } }));
    expect(createOutcome(await workflowCreateApi('runs', R1).create(DEF))).toMatchObject({ k: 'refused', code: 'reserved_name' });
    onFetch(env({ output: 'paused', is_error: true, code: 'daemon_paused' }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toMatchObject({ k: 'refused', code: 'daemon_paused' });
    onFetch(env({ output: 'Validation failed (not saved): step "a": no type\nTip: x', is_error: true, code: 'invalid_definition' }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toEqual({ k: 'refused', code: 'invalid_definition', reason: 'step "a": no type' });
  });
  it('a 2xx without the affirmative envelope (empty, no is_error, no output) proves nothing: unknown, never created', async () => {
    for (const body of [undefined, {}, { status: 'ok', output: 'created' }, { status: 'ok', is_error: false }, { status: 'ok', output: 'created', is_error: 'false' }]) {
      onFetch(() => ({ status: 200, body }));
      expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF)), JSON.stringify(body)).toEqual({ k: 'unknown' });
    }
    expect(createOutcome({ ok: true, body: {} })).toEqual({ k: 'unknown' });
    expect(createOutcome({ ok: true, body: { output: 'created', is_error: false } })).toEqual({ k: 'created' });
  });
  it('a lost answer, or an is_error with no listed code, is unknown, never a refusal or a success', async () => {
    onFetch(() => ({ status: 200, network: true }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toEqual({ k: 'unknown' });
    onFetch(env({ output: 'Validation failed (not saved)', is_error: true }));
    expect(createOutcome(await workflowCreateApi('mine', R1).create(DEF))).toEqual({ k: 'unknown' });
  });
  it('a body core did not send is a refusal named by core', () => {
    const notSent: Settled = { ok: false, err: { kind: 'not_sent', code: '', status: 0, notApplied: false } };
    expect(createOutcome(notSent)).toEqual({ k: 'refused', code: 'not_sent' });
  });
});

describe('Check again only reads, and proves only what was sent', () => {
  const read = (content: string): Settled => ({ ok: true, body: { output: `revision: r1:ab\n${content}`, is_error: false } });
  const stored = JSON.stringify({ name: 'mine', entry_point: { id: 'a' }, steps: { a: { type: 'bash', command: 'true' } }, created_at: 't', updated_at: 't' });
  it('a workflow holding exactly what was sent proves it', () => {
    expect(checkCreate(read(stored), DEF)).toEqual({ k: 'created' });
  });
  it('another workflow of that name, none yet, or a failed or odd read prove nothing', () => {
    expect(checkCreate(read(JSON.stringify({ entry_point: { id: 'b' }, steps: { b: { type: 'bash', command: 'true' } } })), DEF)).toEqual({ k: 'unknown', seen: 'other' });
    expect(checkCreate({ ok: false, err: { kind: 'failed', code: 'not_found', status: 404, notApplied: false } }, DEF)).toEqual({ k: 'unknown', seen: 'none' });
    expect(checkCreate({ ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false } }, DEF)).toEqual({ k: 'unknown', seen: 'unread' });
    expect(checkCreate({ ok: true, body: { output: 'no revision line', is_error: false } }, DEF)).toEqual({ k: 'unknown', seen: 'unread' });
  });
  it('the read is a GET with its revision, never the create', async () => {
    onFetch(() => ({ status: 200, body: { output: `revision: r1:ab\n${stored}`, is_error: false } }));
    await workflowCreateApi('mine', R1).get();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('GET');
    expect(at(calls[0]!).searchParams.get('include_revision')).toBe('true');
  });
});

describe('names', () => {
  it('refuses blank, edge spaces, too long, controls, path characters, dot names and exactly "runs"', () => {
    expect(nameProblem('')).toBe('empty');
    expect(nameProblem('   ')).toBe('empty');
    expect(nameProblem(' mine')).toBe('spaces');
    expect(nameProblem('mine ')).toBe('spaces');
    expect(nameProblem('x'.repeat(NAME_MAX))).toBeNull();
    expect(nameProblem('x'.repeat(NAME_MAX + 1))).toBe('long');
    expect(nameProblem('a\u0007b')).toBe('control');
    expect(nameProblem('a\u0085b')).toBe('control');
    for (const n of ['a/b', 'a\\b', '50%']) expect(nameProblem(n)).toBe('chars');
    expect(nameProblem('.')).toBe('dots');
    expect(nameProblem('..')).toBe('dots');
    expect(nameProblem('runs')).toBe('reserved');
    expect(nameProblem('Runs')).toBeNull();
    expect(nameProblem('Ship fix · 2')).toBeNull();
  });
  it('a listed name is advice only, and a case-only match is told apart', () => {
    expect(nameTaken('Plan', ['Plan', 'dev'])).toBe('same');
    expect(nameTaken('plan', ['Plan'])).toBe('case');
    expect(nameTaken('new', ['Plan'])).toBeNull();
  });
});
