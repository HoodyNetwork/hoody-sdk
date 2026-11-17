// The agent source editor's state: a save only lands on the revision it was read at, a lost answer is "may
// have been saved" until the file is read back (never done, never failed, never resent), a conflict is the person's to
// resolve (Compare, Keep mine, Reload), the text is kept verbatim.
import { describe, expect, it } from 'vitest';
import { bytesOf, createSourceStore, MAX_SOURCE_BYTES, savedOf, sourceOf } from './source';
import type { Refusal, Settled } from './sourceApi';

const doc = (content: string, revision: string, path = '/home/agents/helper.md') => ({ path, content, revision });
const ok = (b: unknown): Settled => ({ ok: true, body: b });
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null, ...o } });
const conflict = (cur = 'r2'): Settled => err('failed', { code: 'revision_conflict', status: 409, notApplied: true, currentRevision: cur });

function fake() {
  const gets: Array<(s: Settled) => void> = [];
  const puts: Array<{ content: string; expected: string; answer: (s: Settled) => void }> = [];
  return {
    gets, puts,
    api: {
      get: () => new Promise<Settled>((r) => gets.push(r)),
      put: (content: string, expected: string) => new Promise<Settled>((r) => puts.push({ content, expected, answer: r })),
    },
  };
}
async function loaded(content = 'a\nb', revision = 'r1') {
  const f = fake();
  const s = createSourceStore({ api: f.api });
  const p = s.load();
  f.gets[0]!(ok(doc(content, revision)));
  await p;
  return { f, s };
}

describe('readings', () => {
  it('sourceOf needs path, content and a revision; path "" is allowed (an embedded default)', () => {
    expect(sourceOf({ path: '', content: 'x', revision: 'r1' })).toEqual({ path: '', content: 'x', revision: 'r1' });
    for (const bad of [null, [], {}, { path: 'p', content: 'x' }, { path: 'p', content: 'x', revision: '' }, { path: 1, content: 'x', revision: 'r' }, { path: 'p', content: 2, revision: 'r' }]) expect(sourceOf(bad)).toBeNull();
  });
  it('savedOf needs a path string and a revision', () => {
    expect(savedOf({ path: '', revision: 'r2' })).toEqual({ path: '', revision: 'r2' });
    for (const bad of [null, {}, { path: 'p' }, { revision: 'r' }, { path: 'p', revision: 7 }]) expect(savedOf(bad)).toBeNull();
  });
});

describe('load', () => {
  it('reads the file: the draft is the text, based on its revision, not dirty', async () => {
    const { s } = await loaded('---\nmodel: x\ntools: none\n---\nhi', 'r1');
    expect(s.view()).toMatchObject({ load: 'ready', path: '/home/agents/helper.md', revision: 'r1', base: '---\nmodel: x\ntools: none\n---\nhi', dirty: false, save: 'idle' });
    expect(s.view().draft).toBe(s.view().base);
  });
  it('an embedded default has no file yet: path null', async () => {
    const f = fake();
    const s = createSourceStore({ api: f.api });
    const p = s.load();
    f.gets[0]!(ok(doc('x', 'r1', '')));
    await p;
    expect(s.view().path).toBeNull();
  });
  it('an unreadable answer is a failed read, never an empty file; a 404 is gone; a refusal says why', async () => {
    for (const [a, want] of [[ok({}), { load: 'failed', loadError: { code: 'unreadable', status: 0 } }], [err('failed', { status: 404, code: 'not_found' }), { load: 'gone' }], [err('failed', { status: 403, code: 'forbidden' }), { load: 'failed', loadError: { code: 'forbidden', status: 403 } }]] as const) {
      const f = fake();
      const s = createSourceStore({ api: f.api });
      const p = s.load();
      f.gets[0]!(a);
      await p;
      expect(s.view()).toMatchObject(want);
      expect(s.view().base).toBeNull();
    }
  });
  it('load never replaces an open draft; reload does, on purpose', async () => {
    const { f, s } = await loaded('one', 'r1');
    s.setDraft('mine');
    await s.load();
    expect(f.gets.length).toBe(1);
    const p = s.reload();
    f.gets[1]!(ok(doc('two', 'r2')));
    await p;
    expect(s.view()).toMatchObject({ draft: 'two', base: 'two', revision: 'r2', dirty: false });
  });
});

describe('save', () => {
  it('sends the draft verbatim with the revision it was read at, once; the answer is the new base', async () => {
    const text = '---\ntools: none\n---\n  body  \n';
    const { f, s } = await loaded(text, 'r1');
    s.setDraft(text.replace('body', 'BODY'));
    const p = s.save();
    void s.save();
    expect(f.puts.length).toBe(1);
    expect(f.puts[0]).toMatchObject({ content: '---\ntools: none\n---\n  BODY  \n', expected: 'r1' });
    expect(s.view().save).toBe('saving');
    f.puts[0]!.answer(ok({ path: '/home/agents/helper.md', revision: 'r2' }));
    await p;
    expect(s.view()).toMatchObject({ save: 'saved', revision: 'r2', base: '---\ntools: none\n---\n  BODY  \n', dirty: false });
  });
  it('an unchanged draft sends nothing; a draft over the agent\'s 1 MiB cap sends nothing', async () => {
    const { f, s } = await loaded('x', 'r1');
    await s.save();
    s.setDraft('é'.repeat(MAX_SOURCE_BYTES / 2 + 1));
    expect(bytesOf(s.view().draft)).toBeGreaterThan(MAX_SOURCE_BYTES);
    expect(s.view().tooBig).toBe(true);
    await s.save();
    expect(f.puts.length).toBe(0);
  });
  it('text typed while the save is out stays a draft on the new base', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('ab');
    const p = s.save();
    s.setDraft('abc');
    f.puts[0]!.answer(ok({ path: 'p', revision: 'r2' }));
    await p;
    expect(s.view()).toMatchObject({ base: 'ab', draft: 'abc', dirty: true, revision: 'r2' });
  });
  it('a refusal (400) wrote nothing: the draft and revision stay, Save works again after an edit', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.save();
    f.puts[0]!.answer(err('failed', { status: 400, code: 'bad_request' }));
    await p;
    expect(s.view()).toMatchObject({ save: 'refused', refusal: { code: 'bad_request', status: 400, unsent: false }, draft: 'b', revision: 'r1', dirty: true });
    s.setDraft('c');
    expect(s.view().save).toBe('idle');
    const p2 = s.save();
    expect(f.puts[1]).toMatchObject({ content: 'c', expected: 'r1' });
    f.puts[1]!.answer(ok({ path: 'p', revision: 'r2' }));
    await p2;
  });
  it('a request core did not send says so (unsent)', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.save();
    f.puts[0]!.answer(err('not_sent', { code: 'cas_required' }));
    await p;
    expect(s.view()).toMatchObject({ save: 'refused', refusal: { unsent: true } });
  });
  it('a dropped (stale) answer changes nothing', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.save();
    f.puts[0]!.answer(err('stale'));
    await p;
    expect(s.view()).toMatchObject({ save: 'idle', dirty: true });
  });
});

describe('a save whose answer is lost', () => {
  async function lost(answer: Settled = err('pending')) {
    const r = await loaded('a', 'r1');
    r.s.setDraft('b');
    const p = r.s.save();
    r.f.puts[0]!.answer(answer);
    await p;
    return r;
  }
  it('is "may have been saved": never done, never failed; Save is held and nothing is sent again', async () => {
    for (const a of [err('pending'), ok({ path: 'p' }), ok('junk')]) {
      const { f, s } = await lost(a);
      expect(s.view()).toMatchObject({ save: 'unsure', sent: 'b', revision: 'r1' });
      await s.save();
      expect(f.puts.length).toBe(1);
    }
  });
  it('check: the file holds what was sent, so it was saved (the draft keeps what was typed since)', async () => {
    const { f, s } = await lost();
    s.setDraft('bc');
    const p = s.check();
    expect(s.view().reading).toBe(true);
    f.gets[1]!(ok(doc('b', 'r2')));
    await p;
    expect(s.view()).toMatchObject({ save: 'saved', revision: 'r2', base: 'b', draft: 'bc', dirty: true, sent: null });
  });
  it('check: the file looks as before the send, which proves nothing: still unsure, Save held, nothing sent', async () => {
    const { f, s } = await lost();
    const p = s.check();
    f.gets[1]!(ok(doc('a', 'r1')));
    await p;
    expect(s.view()).toMatchObject({ save: 'unsure', checked: 'same', draft: 'b', sent: 'b', observed: { revision: 'r1' } });
    await s.save();
    expect(f.puts.length).toBe(1);
  });
  it('check: a different file proves nothing either: still unsure (no conflict, nothing forgotten), Save held', async () => {
    const { f, s } = await lost();
    const p = s.check();
    f.gets[1]!(ok(doc('other', 'r9')));
    await p;
    expect(s.view()).toMatchObject({ save: 'unsure', checked: 'changed', sent: 'b', draft: 'b', revision: 'r1', theirs: null });
    await s.save();
    expect(f.puts.length).toBe(1);
  });
  it('abandon (the informed way out) sends nothing, keeps the draft and bases it on the file last seen; the next Save is checked against it', async () => {
    const { f, s } = await lost();
    const p = s.check();
    f.gets[1]!(ok(doc('other', 'r9')));
    await p;
    s.abandon();
    expect(s.view()).toMatchObject({ save: 'idle', revision: 'r9', base: 'other', draft: 'b', dirty: true, sent: null, checked: null });
    expect(f.puts.length).toBe(1);
    const p2 = s.save();
    expect(f.puts[1]).toMatchObject({ content: 'b', expected: 'r9' });
    f.puts[1]!.answer(ok({ path: 'p', revision: 'r10' }));
    await p2;
    expect(s.view().save).toBe('saved');
  });
  it('abandon with no sight of the file keeps the revision from before the send', async () => {
    const { f, s } = await lost();
    s.abandon();
    expect(s.view()).toMatchObject({ save: 'idle', revision: 'r1', base: 'a', draft: 'b', dirty: true });
    void s.save();
    expect(f.puts[1]).toMatchObject({ expected: 'r1' });
  });
  it('abandon after a check that failed or found the file gone also works (the way out of a permanent 404)', async () => {
    const { f, s } = await lost();
    const p = s.check();
    f.gets[1]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    s.abandon();
    expect(s.view()).toMatchObject({ save: 'idle', draft: 'b', load: 'ready' });
  });
  it('abandon leaves a conflict alone', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.save();
    f.puts[0]!.answer(conflict('r2'));
    await p;
    s.abandon();
    expect(s.view().save).toBe('conflict');
  });
  it('abandon does nothing unless a save is unsure, or while a check is reading', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    s.abandon();
    expect(s.view()).toMatchObject({ save: 'idle', dirty: true });
    const r = await lost();
    const p = r.s.check();
    r.s.abandon();
    expect(r.s.view().save).toBe('unsure');
    r.f.gets[1]!(ok(doc('a', 'r1')));
    await p;
    void f;
  });
  it('check: a read that fails, or finds the file gone, settles nothing; the draft and the unknown outcome stay', async () => {
    const { f, s } = await lost();
    let p = s.check();
    f.gets[1]!(err('pending'));
    await p;
    expect(s.view()).toMatchObject({ save: 'unsure', checked: 'failed' });
    p = s.check();
    f.gets[2]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view()).toMatchObject({ load: 'ready', save: 'unsure', checked: 'gone', draft: 'b', sent: 'b' });
  });
  it('a later check that fails withdraws the earlier sight: abandon then returns to the revision from before the send', async () => {
    const { f, s } = await lost();
    let p = s.check();
    f.gets[1]!(ok(doc('other', 'r9')));
    await p;
    p = s.check();
    f.gets[2]!(err('pending'));
    await p;
    s.abandon();
    expect(s.view()).toMatchObject({ revision: 'r1', base: 'a' });
  });
  it('check does nothing unless a save is unsure', async () => {
    const { f, s } = await loaded('a', 'r1');
    await s.check();
    expect(f.gets.length).toBe(1);
  });
});

describe('a conflict', () => {
  async function conflicted() {
    const r = await loaded('a', 'r1');
    r.s.setDraft('mine');
    const p = r.s.save();
    r.f.puts[0]!.answer(conflict('r2'));
    await p;
    return r;
  }
  it('wrote nothing: the draft is kept, saving is held until the person picks Compare, Keep mine or Reload', async () => {
    const { f, s } = await conflicted();
    expect(s.view()).toMatchObject({ save: 'conflict', draft: 'mine', revision: 'r1', theirs: null });
    await s.save();
    expect(f.puts.length).toBe(1);
  });
  it('Compare reads the file as it is now', async () => {
    const { f, s } = await conflicted();
    const p = s.compare();
    expect(s.view().theirs).toEqual({ phase: 'reading' });
    f.gets[1]!(ok(doc('theirs', 'r2')));
    await p;
    expect(s.view().theirs).toEqual({ phase: 'read', content: 'theirs', revision: 'r2', path: '/home/agents/helper.md' });
  });
  it('Compare: a failed read says so; a file that is gone says so', async () => {
    const { f, s } = await conflicted();
    let p = s.compare();
    f.gets[1]!(err('failed', { status: 500, code: 'internal' }));
    await p;
    expect(s.view().theirs).toEqual({ phase: 'failed', code: 'internal', status: 500 });
    p = s.compare();
    f.gets[2]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view().theirs).toEqual({ phase: 'gone' });
  });
  it('Keep mine rebases the draft on their revision (nothing is sent); the next Save is checked against it', async () => {
    const { f, s } = await conflicted();
    const p = s.compare();
    f.gets[1]!(ok(doc('theirs', 'r2')));
    await p;
    s.keepMine();
    expect(s.view()).toMatchObject({ save: 'idle', revision: 'r2', base: 'theirs', draft: 'mine', dirty: true, theirs: null });
    expect(f.puts.length).toBe(1);
    const p2 = s.save();
    expect(f.puts[1]).toMatchObject({ content: 'mine', expected: 'r2' });
    f.puts[1]!.answer(ok({ path: 'p', revision: 'r3' }));
    await p2;
    expect(s.view().save).toBe('saved');
  });
  it('Keep mine needs their file read first', async () => {
    const { s } = await conflicted();
    s.keepMine();
    expect(s.view().save).toBe('conflict');
  });
  it('Keep mine does nothing while their file is still being read, or when it could not be read', async () => {
    const { f, s } = await conflicted();
    const p = s.compare();
    s.keepMine();
    expect(s.view()).toMatchObject({ save: 'conflict', revision: 'r1' });
    f.gets[1]!(err('failed', { status: 500, code: 'internal' }));
    await p;
    s.keepMine();
    expect(s.view()).toMatchObject({ save: 'conflict', revision: 'r1' });
  });
  it('Reload takes their file and drops the draft (reading it when Compare has not)', async () => {
    const { f, s } = await conflicted();
    const p = s.reload();
    f.gets[1]!(ok(doc('theirs', 'r2')));
    await p;
    expect(s.view()).toMatchObject({ save: 'idle', draft: 'theirs', base: 'theirs', revision: 'r2', dirty: false, theirs: null });
  });
  it('Reload after Compare uses the file already read (no second read)', async () => {
    const { f, s } = await conflicted();
    const p = s.compare();
    f.gets[1]!(ok(doc('theirs', 'r2')));
    await p;
    await s.reload();
    expect(f.gets.length).toBe(2);
    expect(s.view().draft).toBe('theirs');
  });
});

describe('blocked by a destructive run', () => {
  it('save sends nothing while blocked', async () => {
    const f = fake();
    let blocked = true;
    const s = createSourceStore({ api: f.api, blocked: () => blocked });
    const l = s.load();
    f.gets[0]!(ok(doc('a', 'r1')));
    await l;
    s.setDraft('b');
    await s.save();
    expect(f.puts.length).toBe(0);
    blocked = false;
    void s.save();
    expect(f.puts.length).toBe(1);
  });
});

describe('refresh after a reset', () => {
  it('reads the file fresh even when Compare read it before, and replaces the draft', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('mine');
    const pc = s.save();
    f.puts[0]!.answer(conflict('r2'));
    await pc;
    const p0 = s.compare();
    f.gets[1]!(ok(doc('old custom', 'r2')));
    await p0;
    const p = s.refresh();
    expect(f.gets.length).toBe(3);
    f.gets[2]!(ok(doc('shipped', 'r9')));
    await p;
    expect(s.view()).toMatchObject({ draft: 'shipped', base: 'shipped', revision: 'r9', save: 'idle', theirs: null, stale: false, dirty: false });
  });
  it('waits for a read in flight, then reads again', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const pc = s.save();
    f.puts[0]!.answer(conflict('r2'));
    await pc;
    const slow = s.compare();
    const p = s.refresh();
    expect(f.gets.length).toBe(2);
    f.gets[1]!(ok(doc('older', 'r2')));
    await slow;
    await Promise.resolve();
    await Promise.resolve();
    expect(f.gets.length).toBe(3);
    f.gets[2]!(ok(doc('shipped', 'r9')));
    await p;
    expect(s.view()).toMatchObject({ draft: 'shipped', revision: 'r9' });
  });
  it('a read whose answer was dropped also leaves it marked stale', async () => {
    const { f, s } = await loaded('a', 'r1');
    const p = s.refresh();
    f.gets[1]!(err('stale'));
    await p;
    expect(s.view()).toMatchObject({ stale: true, draft: 'a' });
  });
  it('a read that fails leaves the old text marked stale, not trusted', async () => {
    const { f, s } = await loaded('a', 'r1');
    const p = s.refresh();
    expect(s.view().stale).toBe(true);
    f.gets[1]!(err('failed', { status: 500, code: 'internal' }));
    await p;
    expect(s.view()).toMatchObject({ stale: true, draft: 'a', load: 'ready' });
    const p2 = s.refresh();
    f.gets[2]!(ok(doc('z', 'r3')));
    await p2;
    expect(s.view()).toMatchObject({ stale: false, draft: 'z' });
  });
  it('a file that is gone shows as gone', async () => {
    const { f, s } = await loaded('a', 'r1');
    const p = s.refresh();
    f.gets[1]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view().load).toBe('gone');
  });
});

describe('refresh keeps the editor and an unknown save safe', () => {
  it('while it reads, the editor takes no edits and Save sends nothing', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.refresh();
    expect(s.view().refreshing).toBe(true);
    s.setDraft('typed during the read');
    expect(s.view().draft).toBe('b');
    await s.save();
    expect(f.puts.length).toBe(0);
    f.gets[1]!(ok(doc('shipped', 'r9')));
    await p;
    expect(s.view()).toMatchObject({ refreshing: false, draft: 'shipped' });
  });
  it('a failed refresh also ends the lock', async () => {
    const { f, s } = await loaded('a', 'r1');
    const p = s.refresh();
    f.gets[1]!(err('failed', { status: 500, code: 'internal' }));
    await p;
    expect(s.view()).toMatchObject({ refreshing: false, stale: true });
    s.setDraft('x');
    expect(s.view().draft).toBe('x');
  });
  it('refresh never touches a save that is running or unknown (a stale band cannot clear it)', async () => {
    const { f, s } = await loaded('a', 'r1');
    const p0 = s.refresh();
    f.gets[1]!(err('failed', { status: 500, code: 'internal' }));
    await p0;
    s.setDraft('b');
    const ps = s.save();
    f.puts[0]!.answer(err('pending'));
    await ps;
    await s.refresh();
    expect(f.gets.length).toBe(2);
    expect(s.view()).toMatchObject({ save: 'unsure', sent: 'b', draft: 'b' });
  });
});

describe('reload finding the file gone', () => {
  it('in a conflict it is their side that is gone: the draft and the conflict stay', async () => {
    const f = fake();
    const s = createSourceStore({ api: f.api });
    const l = s.load();
    f.gets[0]!(ok(doc('a', 'r1')));
    await l;
    s.setDraft('b');
    const ps = s.save();
    f.puts[0]!.answer(conflict('r2'));
    await ps;
    const p = s.reload();
    f.gets[1]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view()).toMatchObject({ load: 'ready', save: 'conflict', draft: 'b', theirs: { phase: 'gone' } });
  });
});

describe('reset', () => {
  it('forgets everything; answers still on their way change nothing and free nothing', async () => {
    const { f, s } = await loaded('a', 'r1');
    s.setDraft('b');
    const p = s.save();
    s.reset();
    expect(s.view().load).toBe('idle');
    f.puts[0]!.answer(ok({ path: 'p', revision: 'r2' }));
    await p;
    expect(s.view()).toMatchObject({ load: 'idle', save: 'idle', revision: null });
    const l = s.load();
    f.gets[1]!(ok(doc('z', 'r5')));
    await l;
    expect(s.view()).toMatchObject({ draft: 'z', revision: 'r5', save: 'idle' });
  });
});
