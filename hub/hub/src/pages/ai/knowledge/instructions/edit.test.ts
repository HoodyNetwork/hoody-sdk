// The instructions edit store over fake requests. A save sends text and on/off together with the revision read, once; a
// conflict is resolved by the person (Compare, Keep mine, Load theirs); a local-file refusal names its fields; a lost answer is never
// resent and only a read-back holding what was sent settles it; answers after reset change nothing.
import { describe, expect, it } from 'vitest';
import type { InstructionsApi, Refusal, Settled } from './api';
import type { InstructionsDraft } from './logic';
import { createEditStore } from './edit';

type Pending = (s: Settled) => void;
function fake() {
  const gets: Pending[] = [];
  const puts: { d: InstructionsDraft; rev: string; answer: Pending }[] = [];
  const api: InstructionsApi = {
    get: () => new Promise((r) => gets.push(r)),
    put: (d, rev) => new Promise((r) => puts.push({ d, rev, answer: r })),
  };
  return { api, gets, puts };
}
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const ok = (text: string, enabled: boolean, revision: string): Settled => ({ ok: true, body: { text, enabled, revision } });
const err = (p: Partial<Refusal>): Settled => ({ ok: false, err: { kind: 'failed', code: '', status: 0, notApplied: false, currentRevision: null, fields: null, ...p } });

async function loaded(text = 'Be brief.', enabled = true, revision = 'r1') {
  const f = fake();
  const st = createEditStore(f.api);
  const p = st.load();
  f.gets[0]!(ok(text, enabled, revision));
  await p;
  return { f, st };
}

describe('load', () => {
  it('reads text, switch and revision; a read of another shape is a failed load, never blank', async () => {
    const { st } = await loaded();
    expect(st.view()).toMatchObject({ load: 'ready', base: { text: 'Be brief.', enabled: true, revision: 'r1' }, draft: { text: 'Be brief.', enabled: true }, dirty: false });
    const f = fake();
    const s2 = createEditStore(f.api);
    const p = s2.load();
    f.gets[0]!({ ok: true, body: { text: 'x', enabled: true } });
    await p;
    expect(s2.view()).toMatchObject({ load: 'failed', loadError: { code: 'unreadable' } });
  });
});

describe('save', () => {
  it('sends text and switch together with the revision read, once; the answer is the new base', async () => {
    const { f, st } = await loaded();
    st.setEnabled(false);
    expect(st.view().dirty).toBe(true);
    const p = st.save();
    void st.save();
    expect(f.puts).toHaveLength(1);
    expect(f.puts[0]).toMatchObject({ d: { text: 'Be brief.', enabled: false }, rev: 'r1' });
    expect(st.view().save).toBe('saving');
    st.setText('changed while saving');
    expect(st.view().draft.text).toBe('Be brief.');
    f.puts[0]!.answer(ok('Be brief.', false, 'r2'));
    await p;
    expect(st.view()).toMatchObject({ save: 'saved', base: { revision: 'r2', enabled: false }, dirty: false });
  });

  it('a text-only edit still sends the switch as it is', async () => {
    const { f, st } = await loaded('a', false);
    st.setText('b');
    void st.save();
    expect(f.puts[0]!.d).toEqual({ text: 'b', enabled: false });
  });

  it('nothing to save sends nothing', async () => {
    const { f, st } = await loaded();
    await st.save();
    expect(f.puts).toHaveLength(0);
  });

  it('409 revision_conflict: draft kept and held; Compare reads theirs; Keep mine bases the next save on their revision', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const p = st.save();
    f.puts[0]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true, currentRevision: 'r5' }));
    await p;
    expect(st.view()).toMatchObject({ save: 'conflict', draft: { text: 'mine' } });
    st.setText('typed during the conflict');
    expect(st.view().draft.text).toBe('mine');
    st.keepMine(); // not before Compare has read theirs
    expect(st.view().save).toBe('conflict');
    const c = st.compare();
    f.gets[1]!(ok('theirs', false, 'r5'));
    await c;
    expect(st.view().theirs).toEqual({ phase: 'read', i: { text: 'theirs', enabled: false, revision: 'r5' } });
    st.keepMine();
    expect(st.view()).toMatchObject({ save: 'idle', base: { revision: 'r5' }, draft: { text: 'mine', enabled: true }, dirty: true });
    void st.save();
    expect(f.puts[1]).toMatchObject({ d: { text: 'mine', enabled: true }, rev: 'r5' });
  });

  it('Load theirs drops the draft for their instructions', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const p = st.save();
    f.puts[0]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true }));
    await p;
    const r = st.reload();
    f.gets[1]!(ok('theirs', true, 'r7'));
    await r;
    expect(st.view()).toMatchObject({ save: 'idle', base: { text: 'theirs', revision: 'r7' }, draft: { text: 'theirs' }, dirty: false, theirs: null });
  });

  it('409 instructions_overridden: names the fields, writes nothing, the draft stays editable', async () => {
    const { f, st } = await loaded();
    st.setEnabled(false);
    const p = st.save();
    f.puts[0]!.answer(err({ code: 'instructions_overridden', status: 409, notApplied: true, fields: ['enabled'] }));
    await p;
    expect(st.view()).toMatchObject({ save: 'overridden', refusal: { fields: ['enabled'] }, base: { revision: 'r1' } });
    st.setEnabled(true);
    expect(st.view()).toMatchObject({ save: 'idle', refusal: null, dirty: false });
  });

  it('any other definite refusal (400, 403) is refused (nothing written), the draft editable', async () => {
    for (const [code, status] of [['bad_request', 400], ['forbidden', 403]] as const) {
      const { f, st } = await loaded();
      st.setText('x');
      const p = st.save();
      f.puts[0]!.answer(err({ code, status }));
      await p;
      expect(st.view()).toMatchObject({ save: 'refused', refusal: { code, status }, base: { revision: 'r1' } });
      st.setText('y');
      expect(st.view()).toMatchObject({ save: 'idle', draft: { text: 'y' } });
    }
  });

  it('Keep mine does nothing while Load theirs reads, so their answer cannot replace what was compared', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const p = st.save();
    f.puts[0]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true }));
    await p;
    const c = st.compare();
    f.gets[1]!(ok('theirs', false, 'r5'));
    await c;
    const r = st.reload();
    st.keepMine();
    expect(st.view()).toMatchObject({ save: 'conflict', base: { revision: 'r1' }, reading: true });
    f.gets[2]!(ok('theirs again', true, 'r6'));
    await r;
    expect(st.view()).toMatchObject({ save: 'idle', base: { text: 'theirs again', revision: 'r6' }, dirty: false });
  });
});

describe('a lost answer', () => {
  async function lost() {
    const l = await loaded();
    l.st.setText('sent text');
    const p = l.st.save();
    l.f.puts[0]!.answer(err({ kind: 'pending', status: 0 }));
    await p;
    return l;
  }

  it('is unsure: nothing resent, the draft held', async () => {
    const { f, st } = await lost();
    expect(st.view()).toMatchObject({ save: 'unsure', sent: { text: 'sent text', enabled: true } });
    await st.save();
    st.setText('other');
    expect(f.puts).toHaveLength(1);
    expect(st.view().draft.text).toBe('sent text');
  });

  it('a 200 that cannot be read is unsure too', async () => {
    const { f, st } = await loaded();
    st.setText('y');
    const p = st.save();
    f.puts[0]!.answer({ ok: true, body: { text: 'y', enabled: true } });
    await p;
    expect(st.view().save).toBe('unsure');
  });

  it('Check: a read holding what was sent settles it as saved', async () => {
    const { f, st } = await lost();
    const c = st.check();
    f.gets[1]!(ok('sent text', true, 'r9'));
    await c;
    expect(st.view()).toMatchObject({ save: 'saved', base: { revision: 'r9' }, dirty: false, sent: null });
  });

  it('Check: the same switch with other text, or the old instructions, stay unsure', async () => {
    const { f, st } = await lost();
    const c = st.check();
    f.gets[1]!(ok('Be brief.', true, 'r1'));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'same' });
    const c2 = st.check();
    f.gets[2]!(ok('sent text', false, 'r3'));
    await c2;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'changed', observed: { revision: 'r3' } });
    const c3 = st.check();
    f.gets[3]!(err({ code: 'store_failed', status: 500 }));
    await c3;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'failed' });
    expect(f.puts).toHaveLength(1);
  });

  it('Stop tracking sends nothing and keeps the draft on the revision first read: the next Save meets any change since', async () => {
    const { f, st } = await lost();
    const c = st.check();
    f.gets[1]!(ok('someone else', true, 'r4'));
    await c;
    st.abandon();
    expect(f.puts).toHaveLength(1);
    expect(st.view()).toMatchObject({ save: 'idle', base: { revision: 'r1' }, draft: { text: 'sent text' }, dirty: true, observed: null });
    const p = st.save();
    expect(f.puts[1]!.rev).toBe('r1');
    f.puts[1]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true, currentRevision: 'r4' }));
    await p;
    expect(st.view().save).toBe('conflict');
  });
});

it('answers after reset change nothing', async () => {
  const { f, st } = await loaded();
  st.setText('x');
  const p = st.save();
  st.reset();
  f.puts[0]!.answer(ok('x', true, 'r2'));
  await p;
  await flush();
  expect(st.view().save).toBe('saving');
  expect(st.view().base?.revision).toBe('r1');
});

describe('Read again', () => {
  it('a failed read says so and changes nothing shown; a read that works clears it', async () => {
    const { f, st } = await loaded();
    const r = st.reload();
    f.gets[1]!(err({ code: 'unavailable', status: 503, kind: 'pending' }));
    await r;
    expect(st.view()).toMatchObject({ refreshFailed: { code: 'unavailable', status: 503 }, base: { revision: 'r1' }, reading: false });
    const r2 = st.reload();
    f.gets[2]!(ok('new', true, 'r2'));
    await r2;
    expect(st.view()).toMatchObject({ refreshFailed: null, base: { text: 'new', revision: 'r2' } });
  });

  it('a failed read keeps a draft', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const r = st.reload();
    f.gets[1]!(err({ code: 'forbidden', status: 403 }));
    await r;
    expect(st.view()).toMatchObject({ refreshFailed: { code: 'forbidden', status: 403 }, draft: { text: 'mine' }, dirty: true, base: { revision: 'r1' } });
  });
});

// An edit is kept while its page is away (held.ts), so a read can come back 'stale' (core dropped it: the top bar moved
// while it was out). That read did not happen: nothing it would have set is set, and the action can be pressed again.
describe('a read core dropped (stale)', () => {
  const stale = () => err({ kind: 'stale', code: '', status: 0 });

  it('Read again: no failure shown, nothing changed, reading over', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const r = st.reload();
    f.gets[1]!(stale());
    await r;
    expect(st.view()).toMatchObject({ refreshFailed: null, reading: false, draft: { text: 'mine' }, base: { revision: 'r1' } });
  });

  it('Compare: back to not compared, Compare offered again', async () => {
    const { f, st } = await loaded();
    st.setText('mine');
    const p = st.save();
    f.puts[0]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true }));
    await p;
    const c = st.compare();
    f.gets[1]!(stale());
    await c;
    expect(st.view()).toMatchObject({ save: 'conflict', theirs: null, reading: false });
  });

  it('Check: what the last check said stays, still unsure', async () => {
    const { f, st } = await loaded();
    st.setText('sent');
    const p = st.save();
    f.puts[0]!.answer(err({ kind: 'pending', status: 0 }));
    await p;
    const c = st.check();
    f.gets[1]!(ok('Be brief.', true, 'r1'));
    await c;
    const c2 = st.check();
    f.gets[2]!(stale());
    await c2;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'same', reading: false });
  });
});

it('a save that works and a check that settles clear a failed Read again', async () => {
  const { f, st } = await loaded();
  const r = st.reload();
  f.gets[1]!(err({ code: 'forbidden', status: 403 }));
  await r;
  st.setText('x');
  const p = st.save();
  f.puts[0]!.answer(ok('x', true, 'r2'));
  await p;
  expect(st.view()).toMatchObject({ save: 'saved', refreshFailed: null });
});

it('a Compare that reads ends an earlier failed Read again', async () => {
  const { f, st } = await loaded();
  const r = st.reload();
  f.gets[1]!(err({ code: 'forbidden', status: 403 }));
  await r;
  st.setText('mine');
  const p = st.save();
  f.puts[0]!.answer(err({ code: 'revision_conflict', status: 409, notApplied: true }));
  await p;
  expect(st.view().refreshFailed).not.toBeNull();
  const c = st.compare();
  f.gets[2]!(ok('theirs', true, 'r5'));
  await c;
  expect(st.view()).toMatchObject({ refreshFailed: null, theirs: { phase: 'read' } });
});

