// core agent approval: the mode read (Default, Strict, locked by policy), one change sent once
// and not decided (busy, policy refusals, a raced revision, a lost answer), never a mode change without a revision, and
// the one parser of the approval read, also behind the conversation settings' Auto-approve value.
import { describe, expect, it, vi } from 'vitest';
import { approvalOf, sendApproval, shows, type ApprovalApi } from './approval';
import { settingsOf } from './api';

const calls = vi.hoisted(() => [] as Array<{ path: string; method: string; body: unknown; ifMatch: unknown; write: boolean; realm?: unknown }>);
vi.mock('../providers/call', () => ({
  call: (route: { path: string; method: string }, input: { body?: unknown; ifMatch?: unknown; realm?: unknown }, write: boolean) => {
    calls.push({ path: route.path, method: route.method, body: input.body, ifMatch: input.ifMatch, write, ...(input.realm !== undefined ? { realm: input.realm } : {}) });
    return Promise.resolve({ ok: true, body: { status: 'ok' } });
  },
}));

type S = Parameters<typeof approvalOf>[0];
const ok = (body: unknown): S => ({ ok: true, body });
const err = (kind: 'failed' | 'pending' | 'stale', code = '', status = 409): S => ({ ok: false, err: { kind, code, status: kind === 'failed' ? status : 0, retryAfter: null, details: {} } });

function api(answer: S, seen: string[] = []): ApprovalApi {
  return {
    approval: () => Promise.resolve(ok({ mode: 'default', revision: 3 })),
    setMode: (_id, m, rev) => {
      seen.push(`mode=${m}@${rev}`);
      return Promise.resolve(answer);
    },
    setYolo: (_id, on) => {
      seen.push(`yolo=${on}`);
      return Promise.resolve(answer);
    },
  };
}

describe('approvalOf', () => {
  it('Default and Strict as read; a lock wins as locked whatever the mode, and Strict still says strict', () => {
    expect(approvalOf(ok({ mode: 'default', locked: false, revision: 4, yolo: true }))).toEqual({ mode: 'default', strict: false, revision: 4, yolo: true });
    expect(approvalOf(ok({ mode: 'always', locked: false, revision: 0 }))).toEqual({ mode: 'always', strict: true, revision: 0, yolo: null });
    expect(approvalOf(ok({ mode: 'always', locked: true, revision: 9 }))).toEqual({ mode: 'locked', strict: true, revision: 9, yolo: null });
    expect(approvalOf(ok({ mode: 'default', locked: true, revision: 9 }))!.strict).toBe(false);
  });

  it('an unknown mode, a failed read or a bad revision: unknown mode, or no revision', () => {
    expect(approvalOf(ok({ mode: 'ask' }))).toBeNull();
    expect(approvalOf(err('failed'))).toBeNull();
    expect(approvalOf(ok({ mode: 'default', locked: false, revision: '3' }))!.revision).toBeNull();
    expect(approvalOf(ok({ mode: 'default', locked: false, revision: -1 }))!.revision).toBeNull();
  });
});

describe('sendApproval', () => {
  it('a mode change carries the read revision; with none it is never sent', async () => {
    const seen: string[] = [];
    expect(await sendApproval(api(ok({ status: 'ok' }), seen), 's1', { field: 'mode', value: 'always' }, 7)).toEqual({ state: 'sent' });
    const r = await sendApproval(api(ok({ status: 'ok' }), seen), 's1', { field: 'mode', value: 'default' }, null);
    expect(r.state).toBe('failed');
    expect(seen).toEqual(['mode=always@7']);
  });

  it('busy, policy refusals and a raced revision are definite and named; a lost answer is unknown', async () => {
    const m = { field: 'mode' as const, value: 'always' as const };
    expect(await sendApproval(api(err('failed', 'session_busy')), 's1', m, 1)).toEqual({ state: 'busy' });
    expect(await sendApproval(api(err('failed', 'approval_policy_locked')), 's1', m, 1)).toEqual({ state: 'refused', code: 'approval_policy_locked' });
    expect(await sendApproval(api(err('failed', 'approval_policy_active')), 's1', { field: 'yolo', value: true }, null)).toEqual({ state: 'refused', code: 'approval_policy_active' });
    expect(await sendApproval(api(err('failed', 'precondition_failed', 412)), 's1', m, 1)).toEqual({ state: 'conflict' });
    expect(await sendApproval(api(err('pending')), 's1', m, 1)).toEqual({ state: 'unknown' });
    expect(await sendApproval(api(err('stale')), 's1', m, 1)).toEqual({ state: 'stale' });
    expect((await sendApproval(api(err('failed', 'boom', 500)), 's1', m, 1)).state).toBe('failed');
  });

  it('the read-back decides: a locked policy never shows a mode change', () => {
    expect(shows(approvalOf(ok({ mode: 'always', locked: false, revision: 2 })), { field: 'mode', value: 'always' })).toBe(true);
    expect(shows(approvalOf(ok({ mode: 'always', locked: true, revision: 2 })), { field: 'mode', value: 'always' })).toBe(false);
    expect(shows(approvalOf(ok({ mode: 'default', locked: false, yolo: true })), { field: 'yolo', value: true })).toBe(true);
    expect(shows(null, { field: 'yolo', value: false })).toBe(false);
  });
});

describe('the wire', () => {
  it('PUT /approval with the mode and If-Match "<revision>"; YOLO is PATCH /yolo {enabled}', async () => {
    calls.length = 0;
    vi.resetModules();
    const live = (await import('./approval')).approvalApi();
    await live.setMode('s1', 'always', 12);
    await live.setYolo('s1', true);
    expect(calls).toEqual([
      { path: '/sessions/:id/approval', method: 'PUT', body: { mode: 'always' }, ifMatch: '"12"', write: true },
      { path: '/sessions/:id/yolo', method: 'PATCH', body: { enabled: true }, ifMatch: undefined, write: true },
    ]);
  });

  it('an attempt\'s realm rides every call (read, change, YOLO), so a late read-back reads the same conversation', async () => {
    calls.length = 0;
    vi.resetModules();
    const live = (await import('./approval')).approvalApi(undefined, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    await live.approval('s1');
    await live.setMode('s1', 'always', 1);
    await live.setYolo('s1', false);
    expect(calls.map((c) => c.realm)).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaa']);
  });

});

describe('the approval read is parsed at the boundary', () => {
  // Real agent shapes: the gateway flattens the daemon's approval resource (mode, locked, revision, yolo, yolo_origin,
  // rules, capabilities, lease, ...); the HTTP status is 200 with the revision as the ETag.
  const real = { mode: 'default', locked: false, revision: 4, yolo: false, yolo_origin: '', rules: [], capabilities: { always: true } };
  it.each([
    ['a real Default read', real, { mode: 'default', strict: false, revision: 4, yolo: false }],
    ['a real Strict read', { ...real, mode: 'always', revision: 0 }, { mode: 'always', strict: true, revision: 0, yolo: false }],
    ['a real locked Strict read', { ...real, mode: 'always', locked: true }, { mode: 'locked', strict: true, revision: 4, yolo: false }],
    ['YOLO armed under Default', { ...real, yolo: true }, { mode: 'default', strict: false, revision: 4, yolo: true }],
    ['malformed mode', { ...real, mode: 'Always' }, null],
    ['no mode', { ...real, mode: undefined }, null],
    ['malformed lock', { ...real, locked: 'false' }, null],
    ['no lock', { ...real, locked: undefined }, null],
    ['malformed revision: no change can be sent', { ...real, revision: 4.5 }, { mode: 'default', strict: false, revision: null, yolo: false }],
    ['malformed YOLO: unknown', { ...real, yolo: 'yes' }, { mode: 'default', strict: false, revision: 4, yolo: null }],
    ['contradiction: YOLO armed under Strict (the agent disarms it there)', { ...real, mode: 'always', yolo: true }, null],
    ['not an object', [real], null],
  ])('A8 %s', (_n, body, want) => {
    expect(approvalOf({ ok: true, body })).toEqual(want);
  });
});

describe('the conversation settings read Auto-approve through the same parser', () => {
  const session = { ok: true as const, body: { session: { id: 's1', model: 'hoody-ai/hoody-free', verbosity: 'normal' } } };
  it.each([
    ['a real Default read with YOLO armed', { mode: 'default', locked: false, revision: 2, yolo: true }, true],
    ['malformed YOLO', { mode: 'default', locked: false, revision: 2, yolo: 'on' }, null],
    ['malformed lock', { mode: 'default', locked: 1, revision: 2, yolo: true }, null],
    ['contradiction: YOLO armed under Strict', { mode: 'always', locked: false, revision: 2, yolo: true }, null],
  ])('A9 %s', (_n, body, yolo) => {
    expect(settingsOf('s1', session, { ok: true, body })!.yolo).toBe(yolo);
  });
});

