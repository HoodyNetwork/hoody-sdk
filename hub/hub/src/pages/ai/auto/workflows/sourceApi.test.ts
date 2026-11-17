// The workflow source editor's requests through the real core over a fake fetch: the wire shapes, the
// compare-and-swap token in the body, and the tool envelope's answers settled (a 200 revision_conflict is a refusal that
// wrote nothing, never success; any other is_error may have run; a lost answer is pending).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capture, queryClient } from '@core';
import { setTarget } from '@core/ctx';
import { AGENT, boot, calls, onFetch, R1 } from '@core/test/env';
import { workflowSourceApi, cleanReason, diagnosticOf, refusalOf } from './sourceApi';

const at = (c: (typeof calls)[number]) => new URL(c.url);
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const DEF = { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } };

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); });
afterEach(() => { queryClient.clear(); });

describe('getWorkflow with its revision', () => {
  it('GET /workflows/{name}?include_revision=true in the realm the workflow was listed in', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'revision: r1:ab\n{}', is_error: false } }));
    const r = await workflowSourceApi('ship-fix', R2).get();
    expect(r).toMatchObject({ ok: true, body: { output: 'revision: r1:ab\n{}' } });
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url.startsWith(`${AGENT}/workflows/ship-fix`)).toBe(true);
    expect(at(calls[0]!).searchParams.get('include_revision')).toBe('true');
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R2);
  });
  it('no listed realm: the realm shown', async () => {
    onFetch(() => ({ status: 200, body: { output: 'revision: r\n{}', is_error: false } }));
    await workflowSourceApi('ship-fix', null).get();
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R1);
  });
  it('paused: a 200 envelope daemon_paused is a refusal before anything ran', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'paused', is_error: true, code: 'daemon_paused' } }));
    expect(await workflowSourceApi('ship-fix', null).get()).toMatchObject({ ok: false, err: { code: 'daemon_paused', notApplied: true } });
  });
  it('a 404 is a failed read with its code', async () => {
    onFetch(() => ({ status: 404, body: { code: 'not_found', message: 'workflow not found' } }));
    expect(await workflowSourceApi('ship-fix', null).get()).toMatchObject({ ok: false, err: { kind: 'failed', status: 404, code: 'not_found' } });
  });
});

describe('putWorkflow', () => {
  it('PUT {definition, expected_revision}', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'updated workflow "ship-fix"', is_error: false } }));
    const r = await workflowSourceApi('ship-fix', R2).put(DEF, 'r1:ab');
    expect(r).toMatchObject({ ok: true });
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ definition: DEF, expected_revision: 'r1:ab' });
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R2);
  });
  it('core never sends a save without its revision', async () => {
    const r = await workflowSourceApi('ship-fix', null).put(DEF, '');
    expect(calls.length).toBe(0);
    expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
  });
  it('a 200 {is_error, code: revision_conflict} is a conflict that wrote nothing, never a success', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'Error [revision_conflict]: modified', is_error: true, code: 'revision_conflict', current_revision: 'r1:cd' } }));
    expect(await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab')).toMatchObject({ ok: false, err: { code: 'revision_conflict', notApplied: true, status: 200 } });
  });
  it('a 200 {is_error, code: invalid_definition} is a refusal that wrote nothing, with the agent\'s reason, cleaned', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: '  \u001b[31mstep "check": unknown next target "nope"\u001b[0m\u0007\n', is_error: true, code: 'invalid_definition' } }));
    const r = await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab');
    expect(r).toMatchObject({ ok: false, err: { kind: 'failed', code: 'invalid_definition', notApplied: true, status: 200, reason: 'step "check": unknown next target "nope"' } });
  });
  it('a refusal reason loses OSC links, bidi and C1 controls and line breaks', () => {
    expect(cleanReason('\u001b]8;;https://x\u0007step\u001b]8;;\u0007 \u202ebad\u202c\u0085\n  next')).toBe('step bad   next');
    expect(cleanReason('\u0000\u001b')).toBe('');
  });
  it('a refusal shows the agent\'s diagnostic, never the recovery hints it writes for a model', () => {
    const tip = '\nTip: run read_workflow \"Plan\" (or \"Dev Pipeline\") to see a complete, valid workflow you can mirror.';
    const shape = '\nExpected: definition = {"entry_point":{"id":"<step>"},"steps":[...]}. steps is a NON-EMPTY array of step objects.' + tip;
    const rows: Array<[string, string]> = [
      ['Validation failed (not saved): step "check": unknown next target "nope"' + tip, 'step "check": unknown next target "nope"'],
      ['Validation failed (not saved):\nstep 1: missing "id"\nstep 2: missing "type"' + shape, 'step 1: missing "id"; step 2: missing "type"'],
      ["Error: 'definition' must be a JSON object." + shape, "'definition' must be a JSON object."],
      ['Validation failed (not saved): your \'steps\' list is EMPTY — a workflow needs at least one real step. steps is a NON-EMPTY array. Fill in the steps you want and call upsert_workflow again — for example:\ndefinition = {"entry_point":{"id":"a"}}' + tip,
        "your 'steps' list is EMPTY — a workflow needs at least one real step. steps is a NON-EMPTY array."],
      ["Validation failed (not saved): step 'Deploy! prod': missing type" + tip, "step 'Deploy! prod': missing type"],
      ['Error: step "a": inner "id" b does not match its key — in the object form the key IS the step id, so drop the inner "id"' + shape,
        'step "a": inner "id" b does not match its key — in the object form the key IS the step id, so drop the inner "id"'],
      // a tool's name inside a diagnostic value is the person's data, never cut
      ['Error: step "read_workflow": inner "id" b does not match its key' + shape, 'step "read_workflow": inner "id" b does not match its key'],
      ['Validation failed (not saved): step "Deploy! read_workflow prod": missing type' + tip, 'step "Deploy! read_workflow prod": missing type'],
      ['Tip: only a hint', ''],
      ['bad\u2028Tip: hidden after a line separator', 'bad'],
    ];
    for (const [out, want] of rows) expect(diagnosticOf(out)).toBe(want);
    expect(cleanReason('bad\u2028next\u2029end')).toBe('bad next end');
  });
  it('a refused save carries only the diagnostic as its reason', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'Validation failed (not saved): step "a": no type\nTip: run read_workflow "Plan"', is_error: true, code: 'invalid_definition' } }));
    const r = await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab');
    expect(!r.ok && r.err.reason).toBe('step "a": no type');
  });
  it('a refusal reason is bounded, and only a refusal carries one', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'x'.repeat(5000), is_error: true, code: 'invalid_definition' } }));
    const r = await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab');
    expect(!r.ok && r.err.reason?.length).toBe(2000);
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'Validation failed', is_error: true } }));
    const u = await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab');
    expect(!u.ok && u.err.reason).toBeUndefined();
    // An answer that may have run keeps no agent words, even when its envelope carries output (C9: never a refusal).
    expect(refusalOf({ kind: 'unavailable', status: 200, notApplied: false, data: { output: 'saved, then failed' } }, true).reason).toBeUndefined();
    expect(refusalOf({ kind: 'refused', status: 200, notApplied: true, data: { output: 'bad step' } }, true).reason).toBe('bad step');
  });
  it('a 200 is_error without a listed code (a validation error) may have run: pending', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'Validation failed (not saved)', is_error: true } }));
    expect(await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab')).toMatchObject({ ok: false, err: { kind: 'pending', notApplied: false } });
  });
  it('a lost answer is pending, never failed', async () => {
    onFetch(() => ({ status: 200, network: true }));
    expect(await workflowSourceApi('ship-fix', null).put(DEF, 'r1:ab')).toMatchObject({ ok: false, err: { kind: 'pending' } });
  });
});

describe('deleteWorkflow, hideWorkflow, the list', () => {
  it('DELETE with no body; a daemon_paused envelope wrote nothing', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', output: 'paused', is_error: true, code: 'daemon_paused' } }));
    const r = await workflowSourceApi('mine', R2).remove();
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url.startsWith(`${AGENT}/workflows/mine`)).toBe(true);
    expect(r).toMatchObject({ ok: false, err: { code: 'daemon_paused', notApplied: true } });
  });
  it('POST /workflows/{name}/hide {hidden}', async () => {
    onFetch(() => ({ status: 200, body: { status: 'ok', name: 'plan', hidden: false, hidden_workflows: [] } }));
    await workflowSourceApi('plan', R2).hide(false);
    expect(calls[0]!.method).toBe('POST');
    expect(at(calls[0]!).pathname).toBe('/api/v1/agent/workflows/plan/hide');
    expect(calls[0]!.body).toEqual({ hidden: false });
  });
  it('the list is read whole (limit 0) in the realm', async () => {
    onFetch(() => ({ status: 200, body: { items: [], meta: { total: 0 } } }));
    await workflowSourceApi('plan', R2).list();
    expect(at(calls[0]!).pathname).toBe('/api/v1/agent/workflows');
    expect(at(calls[0]!).searchParams.get('limit')).toBe('0');
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R2);
  });
});

describe('one editor, one computer', () => {
  it('calls carry the context captured when the editor was made: a follow-up still goes to that computer', async () => {
    onFetch(() => ({ status: 200, body: { output: 'revision: r\n{}', is_error: false } }));
    const sources = workflowSourceApi('ship-fix', null, capture());
    setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } });
    await sources.get();
    await workflowSourceApi('ship-fix', null).get();
    expect(calls[0]!.url.startsWith(`${AGENT}/workflows/ship-fix`)).toBe(true);
    expect(calls[1]!.url.startsWith(`${AGENT}/workflows/ship-fix`)).toBe(false);
    expect(new URL(calls[1]!.url).host).toContain('c2');
  });
});
