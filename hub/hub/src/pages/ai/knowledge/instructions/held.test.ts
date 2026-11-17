// The kept instructions edits. Keyed by what the edit is about (account, project, computer id and
// server, realm), never by an object; one holding work outlives its page and is named to a switch or sign-out; one holding none is
// dropped with its page; a bump core's changes do not keep (sign-out, log-out, another account) drops them all, one they keep (a realm
// switch, a fallback, a suspension) keeps them.
import { bootFixtureCore, switchLosses, type Target } from '@core';
import { bump } from '@core/ctx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstructionsApi, Settled } from './api';
import { createEditStore, type EditStore } from './edit';
import { editFor, editKey, gone, holdsWork, isKept, setLossWords, showing } from './held';

const T = (id = 'c1', server = 'sv1', project = 'p1'): Target => ({ project: { id: project }, container: { id, server_name: server } });
const R = 'f1f1f1f1f1f1f1f1f1f1f1f1';
function fake() {
  const gets: ((s: Settled) => void)[] = [];
  const puts: ((s: Settled) => void)[] = [];
  const api: InstructionsApi = { get: () => new Promise((r) => gets.push(r)), put: () => new Promise((r) => puts.push(r)) };
  return { api, gets, puts };
}
async function ready(): Promise<{ st: EditStore; f: ReturnType<typeof fake> }> {
  const f = fake();
  const st = createEditStore(f.api);
  const p = st.load();
  f.gets[0]!({ ok: true, body: { text: 'Be brief.', enabled: true, revision: 'r1' } });
  await p;
  return { st, f };
}

beforeEach(() => {
  bootFixtureCore({});
  setLossWords((n) => `held ${n}`);
});
afterEach(() => { bump('signout'); });

describe('editKey', () => {
  it('names account, project, computer id and server, and realm; a new Target object with the same ids is the same key', () => {
    const k = editKey(T(), R);
    expect(k).not.toBe('');
    expect(editKey(T(), R)).toBe(k);
    expect(editKey(T('c2'), R)).not.toBe(k);
    expect(editKey(T('c1', 'sv2'), R)).not.toBe(k);
    expect(editKey(T('c1', 'sv1', 'p2'), R)).not.toBe(k);
    expect(editKey(T(), 'global')).not.toBe(k);
  });
});

describe('keeping', () => {
  it('an edit with a draft outlives its page and is found again; it is named to a switch or sign-out', async () => {
    const k = editKey(T(), R);
    const { st } = await ready();
    expect(editFor(k, () => st)).toBe(st);
    showing(k, st);
    st.setText('mine');
    gone(k, st);
    expect(isKept(k)).toBe(true);
    expect(editFor(k, () => createEditStore(fake().api))).toBe(st);
    expect(switchLosses()).toContain('held 1');
  });

  it('an edit holding nothing is dropped with its page, its answers ignored, and names nothing', async () => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    const r = st.reload();
    gone(k, st);
    expect(isKept(k)).toBe(false);
    expect(switchLosses()).not.toContain('held 1');
    f.gets[1]!({ ok: true, body: { text: 'late', enabled: true, revision: 'r9' } });
    await r;
    expect(st.view().base?.revision).toBe('r1');
  });

  it.each(['saving', 'unsure', 'conflict'] as const)('a save %s is work: kept', async (phase) => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    st.setText('mine');
    const p = st.save();
    if (phase === 'unsure') { f.puts[0]!({ ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false, currentRevision: null, fields: null } }); await p; }
    if (phase === 'conflict') { f.puts[0]!({ ok: false, err: { kind: 'failed', code: 'revision_conflict', status: 409, notApplied: true, currentRevision: 'r2', fields: null } }); await p; }
    expect(st.view().save).toBe(phase);
    expect(holdsWork(st.view())).toBe(true);
    gone(k, st);
    expect(isKept(k)).toBe(true);
  });

  it('a save out while away lands on the kept edit: answered lost it stays (unsure), answered saved it is dropped (nothing left to keep)', async () => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    st.setText('mine');
    const p = st.save();
    gone(k, st);
    f.puts[0]!({ ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false, currentRevision: null, fields: null } });
    await p;
    expect(editFor(k, () => createEditStore(fake().api))).toBe(st);
    expect(st.view().save).toBe('unsure');

    const k2 = editKey(T('c2'), R);
    const two = await ready();
    showing(k2, two.st);
    two.st.setText('mine');
    const p2 = two.st.save();
    gone(k2, two.st);
    two.f.puts[0]!({ ok: true, body: { text: 'mine', enabled: true, revision: 'r2' } });
    await p2;
    expect(isKept(k2)).toBe(false);
    expect(switchLosses()).toEqual(expect.not.arrayContaining(['held 2']));
  });

  it('shown again before it settles, it is not dropped when it stops holding work', async () => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    st.setText('mine');
    const p = st.save();
    gone(k, st);
    showing(k, st);
    f.puts[0]!({ ok: true, body: { text: 'mine', enabled: true, revision: 'r2' } });
    await p;
    expect(isKept(k)).toBe(true);
    expect(st.view()).toMatchObject({ save: 'saved', base: { revision: 'r2' } });
  });

  it('the guard counts only what holds work when it is read', async () => {
    const a = await ready();
    const b = await ready();
    const ka = editKey(T('c1'), R);
    const kb = editKey(T('c2'), R);
    showing(ka, a.st);
    showing(kb, b.st);
    a.st.setText('x');
    b.st.setText('y');
    expect(switchLosses()).toContain('held 2');
    b.st.discard();
    expect(switchLosses()).toContain('held 1');
    a.st.discard();
    expect(switchLosses().filter((s) => s.startsWith('held'))).toEqual([]);
  });
});

describe('bumps', () => {
  it.each(['signout', 'logout', 'account'])('%s drops every kept edit and ignores their answers', async (reason) => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    st.setText('mine');
    const p = st.save();
    gone(k, st);
    bump(reason);
    expect(isKept(k)).toBe(false);
    expect(switchLosses().filter((s) => s.startsWith('held'))).toEqual([]);
    f.puts[0]!({ ok: true, body: { text: 'mine', enabled: true, revision: 'r2' } });
    await p;
    expect(st.view().save).toBe('saving');
  });

  it.each(['switch', 'fallback', 'suspended'])('%s keeps them', async (reason) => {
    const k = editKey(T(), R);
    const { st } = await ready();
    showing(k, st);
    st.setText('mine');
    gone(k, st);
    bump(reason);
    expect(isKept(k)).toBe(true);
    expect(editFor(k, () => createEditStore(fake().api))).toBe(st);
  });
});

// A kept edit lives in memory only, so while any holds work, shown or not, closing or reloading
// the tab asks first; once none does, nothing asks.
describe('closing or reloading the tab', () => {
  const asks = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

  it('asks while a draft or an unsure save is kept away from its page, and stops once nothing holds work', async () => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    expect(asks()).toBe(false);
    st.setText('mine');
    expect(asks()).toBe(true);
    const p = st.save();
    gone(k, st);
    f.puts[0]!({ ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false, currentRevision: null, fields: null } });
    await p;
    expect(st.view().save).toBe('unsure');
    expect(asks()).toBe(true);
    showing(k, st);
    st.abandon();
    st.discard();
    expect(asks()).toBe(false);
  });

  it('the listener itself goes once nothing holds work (the browser keeps its back-forward cache)', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const k = editKey(T(), R);
      const { st } = await ready();
      showing(k, st);
      st.setText('mine');
      const fn = add.mock.calls.find(([type]) => type === 'beforeunload')?.[1];
      expect(fn).toBeDefined();
      st.discard();
      expect(remove.mock.calls.some(([type, f]) => type === 'beforeunload' && f === fn)).toBe(true);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('a kept edit that settles away, or a sign-out, ends the asking', async () => {
    const k = editKey(T(), R);
    const { st, f } = await ready();
    showing(k, st);
    st.setText('mine');
    const p = st.save();
    gone(k, st);
    expect(asks()).toBe(true);
    f.puts[0]!({ ok: true, body: { text: 'mine', enabled: true, revision: 'r2' } });
    await p;
    expect(asks()).toBe(false);
    const two = await ready();
    showing(k, two.st);
    two.st.setText('again');
    gone(k, two.st);
    expect(asks()).toBe(true);
    bump('signout');
    expect(asks()).toBe(false);
  });
});

