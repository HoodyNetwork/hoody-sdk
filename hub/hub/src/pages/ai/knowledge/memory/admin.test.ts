// The pure parts of memory administration: the intent a mint answers, the tidy-up block, the erase answer and the
// proofs a lost answer is judged by. A proof needs positive evidence; nothing here frees a hold on absence alone.
import { describe, expect, it } from 'vitest';
import { outcomeOf } from '@core';
import { adminProjectsOf, assignedOf, consolidateProved, consolidationOf, eraseProved, erasedOf, hostFactsOf, hostProved, nonceOf, queuedOf } from './admin';

describe('nonceOf', () => {
  const ok = { status: 'ok', nonce: 'n1', op: 'consolidate', project: 'p', expires_in: 60 };
  it('takes the nonce of an intent bound to the op and project asked for', () => {
    expect(nonceOf(ok, 'consolidate', 'p')).toBe('n1');
  });
  it.each([
    ['another op', { ...ok, op: 'wipe_project' }],
    ['another project', { ...ok, project: 'q' }],
    ['no status ok', { ...ok, status: 'error' }],
    ['no nonce', { ...ok, nonce: undefined }],
    ['an empty nonce', { ...ok, nonce: '' }],
    ['an over-long nonce', { ...ok, nonce: 'x'.repeat(513) }],
    ['a non-string nonce', { ...ok, nonce: 5 }],
    ['not an object', 'ok'],
    ['null', null],
  ])('refuses %s', (_n, raw) => {
    expect(nonceOf(raw, 'consolidate', 'p')).toBeNull();
  });
});

describe('consolidationOf', () => {
  it('is null when the agent reports no block', () => {
    expect(consolidationOf({ enabled: true })).toBeNull();
  });
  it('reads the three states', () => {
    expect(consolidationOf({ consolidation: { state: 'queued', project: 'p', queued_at_ms: 5 } })).toMatchObject({ state: 'queued', project: 'p', queuedAtMs: 5 });
    expect(consolidationOf({ consolidation: { state: 'running', project: 'p' } })).toMatchObject({ state: 'running' });
    expect(consolidationOf({ consolidation: { state: 'idle', last_done_ms: 9, last_result: 'failed' } })).toMatchObject({ state: 'idle', lastDoneMs: 9, lastResult: 'failed', project: '' });
  });
  it('a block it cannot read is unreadable, never idle', () => {
    expect(consolidationOf({ consolidation: { state: 'busy' } })).toBe('unreadable');
    expect(consolidationOf({ consolidation: 'idle' })).toBe('unreadable');
    expect(consolidationOf('x')).toBe('unreadable');
  });
  it('drops numbers that are not times', () => {
    expect(consolidationOf({ consolidation: { state: 'idle', last_done_ms: -1, queued_at_ms: 'x' } })).toMatchObject({ lastDoneMs: null, queuedAtMs: null });
  });
});

describe('consolidateProved', () => {
  const id = { project: 'p' };
  const c = (state: string, project: string) => ({ state, project, queuedAtMs: null, lastDoneMs: null, lastResult: null });
  it('a queued or running pass for the project proves it', () => {
    expect(consolidateProved(id, [[c('queued', 'p')]])).toBe('applied');
    expect(consolidateProved(id, [[c('running', 'p')]])).toBe('applied');
  });
  it.each([
    ['another project', [[c('queued', 'q')]]],
    ['idle', [[c('idle', 'p')]]],
    ['no block', [[null]]],
    ['an unreadable block', [['unreadable']]],
    ['no answer', [[]]],
    ['no reads', []],
  ])('%s proves nothing', (_n, answers) => {
    expect(consolidateProved(id, answers as never)).toBeUndefined();
  });
  it('an identity without a project proves nothing', () => {
    expect(consolidateProved({}, [[c('queued', '')]])).toBeUndefined();
    expect(consolidateProved({ project: '' }, [[c('queued', '')]])).toBeUndefined();
  });
});

describe('adminProjectsOf', () => {
  const item = (key: string) => ({ key, root: '/r/' + key, memories: 1 });
  it('a list is complete only when meta.total equals the rows sent, the realm-wide row included', () => {
    expect(adminProjectsOf({ items: [item('p'), { key: '' }], meta: { total: 2 } })).toMatchObject({ complete: true, rows: [{ key: 'p' }] });
    expect(adminProjectsOf({ items: [], meta: { total: 0 } }).complete).toBe(true);
  });
  it.each([
    ['more than it sent', { items: [], meta: { total: 42 } }],
    ['fewer than it sent', { items: [item('p')], meta: { total: 0 } }],
    ['no meta', { items: [] }],
    ['a non-numeric total', { items: [], meta: { total: '0' } }],
    ['a fractional total', { items: [], meta: { total: 0.5 } }],
    ['a repeated project key', { items: [item('q'), item('q')], meta: { total: 2 } }],
    ['a repeated realm-wide row', { items: [{ key: '' }, { key: '' }], meta: { total: 2 } }],
  ])('%s is not complete', (_n, raw) => {
    expect(adminProjectsOf(raw).complete).toBe(false);
  });
});

describe('eraseProved', () => {
  const id = { project: 'p' };
  const store = { enabled: true, available: true, degraded: false };
  const list = (...keys: string[]) => ({ rows: keys.map((key) => ({ key })), complete: true });
  it('the project gone from a complete list while a store answers proves it', () => {
    expect(eraseProved(id, [[list('q')], [store]])).toBe('applied');
    expect(eraseProved(id, [[list()], [store]])).toBe('applied');
  });
  it.each([
    ['still listed', [[list('p')], [store]]],
    ['listed in one of several answers', [[list('q'), list('p')], [store]]],
    ['no status answered', [[list()], []]],
    ['no list answered', [[], [store]]],
    ['a list that is not the whole list', [[{ rows: [], complete: false }], [store]]],
    ['one of several lists incomplete', [[list(), { rows: [], complete: false }], [store]]],
    ['a list with no completeness at all', [[{ rows: [] }], [store]]],
    ['the realm has no store (an off realm lists nothing)', [[list()], [{ ...store, available: false }]]],
    ['a store that is not enabled', [[list()], [{ ...store, enabled: false }]]],
    ['a degraded store', [[list()], [{ ...store, degraded: true }]]],
  ])('%s proves nothing', (_n, answers) => {
    expect(eraseProved(id, answers as never)).toBeUndefined();
  });
  it('an identity without a project proves nothing', () => {
    expect(eraseProved({}, [[list()], [store]])).toBeUndefined();
  });
});

describe('hostProved', () => {
  const host = (hosts: unknown[], realm = 'r1') => ({ realm, state: 'leader', host: 'c1', hosts });
  const id = { computer: 'c1', realm: 'r1' };
  it('this computer named as the current host of the held realm proves it', () => {
    expect(hostProved(id, [[host([{ id: 'c1', self: true, current: true }])]])).toBe('applied');
    expect(hostProved(id, [[host([{ id: 'c1', self: true, current: true }, { id: 'c2', self: false, current: false }])]])).toBe('applied');
  });
  it.each([
    ['this computer present but not current', [[host([{ id: 'c1', self: true, current: false }])]]],
    ['another computer current', [[host([{ id: 'c1', self: true, current: false }, { id: 'c2', self: false, current: true }])]]],
    ['no hosts', [[host([])]]],
    ['no answer', [[]]],
    ['an answer about another realm', [[host([{ id: 'c1', self: true, current: true }], 'r2')]]],
    ['an answer about no realm', [[host([{ id: 'c1', self: true, current: true }], '')]]],
    ['the current row is another computer that says self', [[{ ...host([{ id: 'c2', self: true, current: true }]), host: 'c2' }]]],
    ['a pointer that names this computer while the state is stuck', [[{ ...host([{ id: 'c1', self: true, current: true }]), state: 'stuck' }]]],
    ['the state unavailable', [[{ ...host([{ id: 'c1', self: true, current: true }]), state: 'unavailable' }]]],
    ['the state follower with this computer named', [[{ ...host([{ id: 'c1', self: true, current: true }]), state: 'follower' }]]],
    ['the state electing', [[{ ...host([{ id: 'c1', self: true, current: true }]), state: 'electing' }]]],
    ['no state', [[{ realm: 'r1', host: 'c1', hosts: [{ id: 'c1', self: true, current: true }] }]]],
    ['the answer names no host', [[{ ...host([{ id: 'c1', self: true, current: true }]), host: '' }]]],
    ['the answer names another computer, the row says this one', [[{ ...host([{ id: 'c1', self: true, current: true }]), host: 'c2' }]]],
    ['the answer names this computer, the current row is another one', [[host([{ id: 'c2', self: true, current: true }])]]],
    ['the same id twice, current and not', [[host([{ id: 'c1', self: true, current: true }, { id: 'c1', self: true, current: false }])]]],
    ['another row also says self', [[host([{ id: 'c1', self: true, current: true }, { id: 'c2', self: true, current: false }])]]],
    ['a row without an id', [[host([{ id: 'c1', self: true, current: true }, { self: false, current: false }])]]],
    ['a row with a non-boolean flag', [[host([{ id: 'c1', self: true, current: true }, { id: 'c2', self: 'no', current: false }])]]],
    ['two rows both marked current', [[host([{ id: 'c1', self: true, current: true }, { id: 'c2', self: false, current: true }])]]],
    ['this computer current but not its own row', [[host([{ id: 'c1', self: false, current: true }])]]],
    ['the answer names another host than the row', [[{ ...host([{ id: 'c1', self: true, current: true }]), host: 'c2' }]]],
  ])('%s proves nothing', (_n, answers) => {
    expect(hostProved(id, answers as never)).toBeUndefined();
  });
  it('an identity without a realm or a computer proves nothing', () => {
    expect(hostProved({}, [[host([{ id: 'c1', self: true, current: true }])]])).toBeUndefined();
    expect(hostProved({ realm: 'r1' }, [[host([{ id: 'c1', self: true, current: true }])]])).toBeUndefined();
  });
});

describe('hostFactsOf', () => {
  const ok = (hosts: unknown[]) => ({ datahost: { realm: 'r1', state: 'leader', host: 'c1', hosts } });
  it('keeps the flags as sent', () => {
    expect(hostFactsOf(ok([{ id: 'c1', is_self: true, is_current: true }, { id: 'c2', is_self: false, is_current: false }]))).toEqual({
      realm: 'r1', state: 'leader', host: 'c1', hosts: [{ id: 'c1', self: true, current: true }, { id: 'c2', self: false, current: false }],
    });
  });
  it.each([
    ['a non-boolean self', { id: 'c2', is_self: 'yes', is_current: false }],
    ['a non-boolean current', { id: 'c2', is_self: false, is_current: 1 }],
    ['a missing self', { id: 'c2', is_current: false }],
    ['a missing current', { id: 'c2', is_self: false }],
    ['no id', { is_self: false, is_current: false }],
    ['an empty id', { id: '', is_self: false, is_current: false }],
    ['a row that is not an object', 'c2'],
  ])('is null for a row with %s', (_n, row) => {
    expect(hostFactsOf(ok([{ id: 'c1', is_self: true, is_current: true }, row]))).toBeNull();
  });
  it.each([['no datahost', {}], ['no hosts', { datahost: { realm: 'r1', state: 'leader', host: 'c1' } }], ['no realm', { datahost: { state: 'leader', host: 'c1', hosts: [] } }], ['null', null]])('is null for %s', (_n, raw) => {
    expect(hostFactsOf(raw)).toBeNull();
  });
});

describe('queuedOf', () => {
  it('queued for this project', () => {
    expect(queuedOf({ status: 'ok', queued: true, project: 'p' }, 'p')).toEqual({ queued: true });
  });
  it.each([
    ['another project', { status: 'ok', queued: true, project: 'other' }],
    ['a non-string project', { status: 'ok', queued: true, project: 5 }],
    ['no project named (omission)', { status: 'ok', queued: true }],
    ['no status (omission)', { queued: true, project: 'p' }],
    ['nothing but queued (omission)', { queued: true }],
    ['not queued', { status: 'ok', queued: false }],
    ['a status that is not ok', { status: 'error', queued: true }],
    ['null', null],
    ['text', 'ok'],
  ])('%s may have gone through: it throws a pending error', (_n, raw) => {
    expect(() => queuedOf(raw, 'p')).toThrow();
    try { queuedOf(raw, 'p'); } catch (e) { expect((e as { pending?: boolean }).pending).toBe(true); }
  });
});

describe('assignedOf', () => {
  it('ok, outcome won, naming this computer as host', () => {
    expect(assignedOf({ status: 'ok', outcome: 'won', host: 'c1' }, 'c1')).toEqual({ assigned: true });
  });
  // The coordinator's definite "not this computer" is failed, never a hold that only
  // Stop waiting ends (hostProved can prove only this computer leading).
  it.each([
    ['refused_healthy_host, naming the healthy peer', { status: 'ok', outcome: 'refused_healthy_host', host: 'c2' }],
    ['refused_healthy_host, naming no host', { status: 'ok', outcome: 'refused_healthy_host', host: '' }],
    ['adopted, naming the peer that won the race', { status: 'ok', outcome: 'adopted', host: 'c2' }],
  ])('%s is a definite refusal (failed, not pending)', (_n, raw) => {
    let err: unknown;
    try { assignedOf(raw, 'c1'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect((err as { pending?: unknown }).pending).toBeUndefined();
    expect((err as { kind?: unknown }).kind).toBeUndefined();
    expect(outcomeOf(err, true)).toBe('failed');
    expect((err as { code?: unknown }).code).toBe((raw as { outcome: string }).outcome);
  });
  it.each([
    ['another computer as host', { status: 'ok', host: 'other-computer' }],
    ['a non-string host', { status: 'ok', host: 5 }],
    ['adopted naming no host', { status: 'ok', outcome: 'adopted', host: '' }],
    // The coordinator only follows the newer pointer (becomeFollower): nothing proves this computer serves.
    ['adopted naming this computer', { status: 'ok', outcome: 'adopted', host: 'c1' }],
    ['won naming another computer', { status: 'ok', outcome: 'won', host: 'c2' }],
    // A self pointer was published, not yet stamped: this computer may still become the host once recovery ends.
    ['not_ready_recovering', { status: 'ok', outcome: 'not_ready_recovering', host: 'c1' }],
    ...['stopped', 'unknown'].map((o): [string, unknown] => [`the coordinator outcome ${o}`, { status: 'ok', outcome: o, host: 'c1' }]),
    ['no status ok', { host: 'c1' }],
    ['a refusal outcome without status ok', { outcome: 'refused_healthy_host', host: 'c2' }],
    ['a refusal outcome without a host', { status: 'ok', outcome: 'refused_healthy_host' }],
    ['no outcome (omission)', { status: 'ok', host: 'c1' }],
    ['no host (omission)', { status: 'ok', outcome: 'won' }],
    ['nothing but ok (omission)', { status: 'ok' }],
    ['null', null],
  ])('%s may have gone through: it throws a pending error', (_n, raw) => {
    expect(() => assignedOf(raw, 'c1')).toThrow();
    try { assignedOf(raw, 'c1'); } catch (e) { expect((e as { pending?: boolean }).pending).toBe(true); }
  });
});

describe('erasedOf', () => {
  it('a clean erasure', () => {
    expect(erasedOf({ status: 'ok', project: 'p', wiped: true, deleted: 3 }, 'p')).toEqual({ incomplete: null });
  });
  it('an erasure with unconfirmed follow-up steps keeps them, bounded', () => {
    const ok = { status: 'ok', project: 'p', wiped: true };
    const r = erasedOf({ ...ok, incomplete_erasure: true, incomplete_steps: ['a', '', 'b', 5, 'x'.repeat(201)] }, 'p');
    expect(r.incomplete).toEqual(['a', 'b']);
    expect(erasedOf({ ...ok, incomplete_erasure: true }, 'p').incomplete).toEqual([]);
    expect(erasedOf({ ...ok, incomplete_erasure: true, incomplete_steps: Array.from({ length: 20 }, (_, i) => `s${i}`) }, 'p').incomplete).toHaveLength(8);
  });
  it.each([
    ['no wiped', { status: 'ok' }],
    ['only wiped (omission)', { wiped: true }],
    ['no project named (omission)', { status: 'ok', wiped: true }],
    ['no status (omission)', { project: 'p', wiped: true }],
    ['wiped false', { wiped: false }],
    ['another project', { wiped: true, project: 'q' }],
    ['a non-string project', { wiped: true, project: 5 }],
    ['a status that is not ok', { wiped: true, status: 'error' }],
    ['a malformed incomplete_erasure', { wiped: true, incomplete_erasure: 'yes' }],
    ['cleanup steps without the flag', { wiped: true, incomplete_steps: ['profile_invalidate'] }],
    ['cleanup steps with the flag false', { wiped: true, incomplete_erasure: false, incomplete_steps: ['profile_invalidate'] }],
    ['not an object', 'ok'],
  ])('%s may have gone through: it throws a pending error', (_n, raw) => {
    expect(() => erasedOf(raw, 'p')).toThrow();
    try { erasedOf(raw, 'p'); } catch (e) { expect((e as { pending?: boolean }).pending).toBe(true); }
  });
});
